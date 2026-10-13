import Phaser from 'phaser';
import type { BuildableItem, PlacedEntity, Position, WorldState } from '../ecs/components';
import { hydraulicsSystem, craftingSystem, progressionSystem, getObjective, getMachineStatus, getCollectionAmount, refundMachineInputs } from '../ecs/systems';
import { machineDefinitions, createBuildables } from '../data/machines';
import { techTree } from '../data/techTree';
import { load, save } from '../utils/save';
import { findPath } from '../utils/pathfinding';

type ResourceKind = 'soil' | 'sand' | 'clay' | 'wood' | 'scrap_metal' | 'water';
const resourceKinds: ResourceKind[] = ['soil', 'sand', 'clay', 'wood', 'scrap_metal', 'water'];
const keyAt = (pos: Position) => `${pos.x}:${pos.y}`;
const escapeHTML = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

export class GameScene extends Phaser.Scene {
  state: WorldState = {
    gridSize: 48, width: 16, height: 16,
    bounds: { minX: 0, minY: 0, maxX: 15, maxY: 15 },
    placed: [], player: { pos: { x: 8, y: 8 }, health: 100, thirst: 100, energy: 100 },
    resources: [], inventory: { workbench: 1, wood: 18, scrap_metal: 14, soil: 20, sand: 10, clay: 10, water: 20 },
    selected: 'workbench', buildables: createBuildables(), buildQueue: [], production: {}, researched: [], elapsed: 0
  };

  private readonly chunkSize = 16;
  private generatedChunks = new Set<string>();
  private groundLayer!: Phaser.GameObjects.TileSprite;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private networkGraphics!: Phaser.GameObjects.Graphics;
  private statusGraphics!: Phaser.GameObjects.Graphics;
  private ghostGraphics!: Phaser.GameObjects.Graphics;
  private ghostSprite!: Phaser.GameObjects.Image;
  private playerSprite!: Phaser.GameObjects.Image;
  private destinationGraphics!: Phaser.GameObjects.Graphics;
  private entitySprites = new Map<PlacedEntity, Phaser.GameObjects.Image>();
  private resourceSprites = new Map<string, Phaser.GameObjects.Image>();
  private movementPath: Position[] = [];
  private movementAccum = 0;
  private gatherAccum = 0;
  private gatherTarget?: Position;
  private interactionMode: 'move' | 'build' = 'move';
  private paused = false;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private touchAction = '';
  private uiAccum = 0;
  private saveAccum = 0;
  private terrainDirty = true;
  private entitiesDirty = true;
  private groundWidth = 0;
  private groundHeight = 0;
  private inspectorEntity?: PlacedEntity;
  private htmlCache = new Map<string, string>();
  private log: string[] = [];
  private cleanup: (() => void)[] = [];

  constructor() { super('game'); }

  preload() {
    this.load.svg('desert-ground', '/images/desert-ground.svg', { width: 256, height: 256 });
    this.load.svg('supply-truck', '/images/items/supply_truck.svg', { width: 80, height: 80 });
    for (const id of resourceKinds) this.load.svg(`resource-${id}`, `/images/resources/${id}.svg`, { width: 64, height: 64 });
    for (const id of Object.keys(machineDefinitions)) this.load.svg(`item-${id}`, `/images/items/${id}.svg`, { width: 80, height: 80 });
  }

  create() {
    const snapshot = load();
    if (snapshot) { this.state = snapshot.state; this.generatedChunks = new Set(snapshot.chunks); }
    this.cameras.main.setBackgroundColor(0x302c22).setZoom(1.15).setRoundPixels(true);
    this.groundLayer = this.add.tileSprite(0, 0, 768, 768, 'desert-ground').setOrigin(0).setDepth(-3);
    this.gridGraphics = this.add.graphics().setDepth(-1).setVisible(false);
    this.networkGraphics = this.add.graphics().setDepth(0.4);
    this.statusGraphics = this.add.graphics().setDepth(5);
    this.ghostGraphics = this.add.graphics().setDepth(7);
    this.destinationGraphics = this.add.graphics().setDepth(6);
    this.ghostSprite = this.add.image(0, 0, 'item-workbench').setDisplaySize(46, 46).setDepth(7).setAlpha(0.65).setVisible(false);
    this.playerSprite = this.add.image(0, 0, 'supply-truck').setDisplaySize(48, 48).setDepth(10);
    this.ensureSurroundingChunks(this.state.player.pos.x, this.state.player.pos.y);
    if (!snapshot || snapshot.chunks.length === 0) this.seedSpawnResources();
    progressionSystem(this.state); hydraulicsSystem(this.state); this.redrawPlayer();
    this.cameras.main.startFollow(this.playerSprite, true, 0.18, 0.18);
    this.cameras.main.centerOn(this.playerSprite.x, this.playerSprite.y);
    this.setupInput(); this.setupUI(); this.redrawEntities(); this.updateHUD();
    this.addEvent(snapshot ? 'Factory restored. Your machines and deposits are exactly where you left them.' : 'Supply truck ready. Select the Workbench in the hotbar, then place it on open ground.');
    const saveOnExit = () => this.saveGame();
    const visibility = () => { if (document.hidden) this.saveGame(); };
    window.addEventListener('pagehide', saveOnExit); document.addEventListener('visibilitychange', visibility);
    this.cleanup.push(() => window.removeEventListener('pagehide', saveOnExit), () => document.removeEventListener('visibilitychange', visibility));
    this.events.once('shutdown', () => { this.saveGame(); this.cleanup.forEach(callback => callback()); });
    (window as unknown as { gameScene: GameScene }).gameScene = this;
  }

  // Pixel coordinates stay fixed as the bounds expand, including into negative tiles.
  private worldToPixelCenterX(x: number) { return (x + 0.5) * this.state.gridSize; }
  private worldToPixelCenterY(y: number) { return (y + 0.5) * this.state.gridSize; }
  private pixelToTileX(x: number) { return Math.floor(x / this.state.gridSize); }
  private pixelToTileY(y: number) { return Math.floor(y / this.state.gridSize); }

  private setupInput() {
    this.input.mouse?.disableContextMenu();
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key> ?? {};
    this.input.keyboard?.on('keydown-B', () => this.setMode(this.interactionMode === 'move' ? 'build' : 'move'));
    this.input.keyboard?.on('keydown-ESC', () => { this.setMode('move'); this.movementPath = []; this.gatherTarget = undefined; this.closeInspector(); });
    this.input.keyboard?.on('keydown-E', () => this.drinkWater());
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-G', () => this.gridGraphics.setVisible(!this.gridGraphics.visible));
    for (let i = 1; i <= 9; i++) this.input.keyboard?.on(`keydown-${i}`, () => {
      const item = this.state.buildables.filter(item => item.unlocked || (this.state.inventory[item.id] ?? 0) > 0)[i - 1];
      if (item) this.selectBlueprint(item.id);
    });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom - Math.sign(dy) * 0.1, 0.55, 2));
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.paused) return;
      const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const x = this.pixelToTileX(world.x), y = this.pixelToTileY(world.y);
      this.ensureSurroundingChunks(x, y);
      const existing = this.state.placed.find(entity => entity.pos.x === x && entity.pos.y === y);
      if (existing && !pointer.rightButtonDown()) {
        if (this.keys.SHIFT?.isDown) this.removeMachine(existing);
        else { this.inspectorEntity = existing; document.getElementById('machine-inspector')?.classList.remove('overlay-hidden'); this.updateInspector(); }
        return;
      }
      if (this.interactionMode === 'build' && !pointer.rightButtonDown()) { this.placeMachine(x, y); return; }
      this.closeInspector(); this.gatherTarget = this.findResourceAt(x, y) ? { x, y } : undefined; this.setMovementTarget(x, y);
    });
  }

  private setupUI() {
    const on = (id: string, action: () => void) => {
      const element = document.getElementById(id); if (!element) return;
      element.addEventListener('click', action); this.cleanup.push(() => element.removeEventListener('click', action));
    };
    on('mode-toggle', () => this.setMode(this.interactionMode === 'move' ? 'build' : 'move'));
    on('pause-button', () => this.togglePause());
    on('inspector-remove', () => { if (this.inspectorEntity) this.removeMachine(this.inspectorEntity); });
    on('inspector-close', () => this.closeInspector());
    on('hud-about-toggle', () => {
      const about = document.getElementById('hud-about'); if (!about) return; about.hidden = !about.hidden;
      document.getElementById('hud-about-toggle')?.setAttribute('aria-expanded', `${!about.hidden}`);
    });
    if (window.matchMedia('(max-width: 640px)').matches) document.getElementById('buildables-list')?.classList.add('overlay-hidden');
    for (const [id, target] of Object.entries({ 'toggle-buildables': 'buildables-list', 'toggle-inventory': 'inventory-list', 'toggle-tech-tree': 'tech-tree', 'toggle-event-log': 'event-log', 'toggle-build-queue': 'build-queue' })) {
      const button = document.getElementById(id), panel = document.getElementById(target); if (!button || !panel) continue;
      const update = () => { const visible = !panel.classList.contains('overlay-hidden'); button.dataset.active = `${visible}`; button.setAttribute('aria-pressed', `${visible}`); button.setAttribute('aria-expanded', `${visible}`); };
      on(id, () => { panel.classList.toggle('overlay-hidden'); update(); }); update();
    }
    for (const id of ['hotbar', 'buildables-list', 'inventory-list', 'build-queue']) {
      const element = document.getElementById(id); if (!element) continue;
      const listener = (event: MouseEvent) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-machine], button[data-cancel]');
        if (!button || button.disabled) return;
        if (button.dataset.cancel !== undefined) this.cancelBuild(Number(button.dataset.cancel));
        else if (button.dataset.machine) id === 'buildables-list' ? this.startBuilding(this.state.buildables.find(item => item.id === button.dataset.machine)!) : this.selectBlueprint(button.dataset.machine);
      };
      element.addEventListener('click', listener); this.cleanup.push(() => element.removeEventListener('click', listener));
    }
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('#touch-controls [data-action]'))) {
      const down = (event: PointerEvent) => { event.preventDefault(); button.setPointerCapture(event.pointerId); if (button.dataset.action === 'drink') this.drinkWater(); else this.touchAction = button.dataset.action ?? ''; };
      const up = () => { this.touchAction = ''; };
      button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up);
      this.cleanup.push(() => { button.removeEventListener('pointerdown', down); button.removeEventListener('pointerup', up); button.removeEventListener('pointercancel', up); });
    }
    this.setMode('move');
  }
  private setMode(mode: 'move' | 'build') {
    this.interactionMode = mode; this.gatherTarget = undefined;
    const button = document.getElementById('mode-toggle');
    if (button) { button.dataset.mode = mode; button.textContent = mode === 'move' ? 'Move · B' : 'Place · B'; button.setAttribute('aria-pressed', `${mode === 'build'}`); }
    this.updateHotbar();
  }
  private togglePause() {
    this.paused = !this.paused; const button = document.getElementById('pause-button');
    if (button) { button.textContent = this.paused ? 'Resume · P' : 'Pause · P'; button.setAttribute('aria-pressed', `${this.paused}`); }
  }
  private selectBlueprint(id: string) {
    this.state.selected = id;
    if ((this.state.inventory[id] ?? 0) > 0) this.setMode('build');
    else { const item = this.state.buildables.find(item => item.id === id); if (item) this.startBuilding(item); }
    this.updateHUD();
  }
  private canBuildItem(item: BuildableItem) { return item.unlocked && Object.entries(item.requirements).every(([id, amount]) => (this.state.inventory[id] ?? 0) + 1e-8 >= amount); }
  private startBuilding(item: BuildableItem) {
    if (!item || !this.canBuildItem(item)) { this.addEvent('Gather the missing materials before assembling this blueprint.'); return; }
    for (const [id, amount] of Object.entries(item.requirements)) this.state.inventory[id] -= amount;
    this.state.selected = item.id; this.state.buildQueue.push({ id: item.id, name: item.name, totalTime: item.buildTime, timeRemaining: item.buildTime });
    this.addEvent(`${item.name} queued for assembly.`); this.updateHUD();
  }
  cancelBuild(index: number) {
    const queued = this.state.buildQueue[index]; if (!queued) return;
    for (const [id, amount] of Object.entries(machineDefinitions[queued.id]?.build.parts ?? {})) this.state.inventory[id] = (this.state.inventory[id] ?? 0) + amount;
    this.state.buildQueue.splice(index, 1); this.addEvent(`${queued.name} cancelled; materials returned.`); this.updateHUD();
  }
  private placementValid(x: number, y: number) {
    if (!machineDefinitions[this.state.selected]) return false;
    if ((this.state.inventory[this.state.selected] ?? 0) < 1 || this.state.placed.some(entity => entity.pos.x === x && entity.pos.y === y)) return false;
    if (this.state.selected !== 'hydraulic_hose' && this.state.player.pos.x === x && this.state.player.pos.y === y) return false;
    const node = this.findResourceAt(x, y);
    if (machineDefinitions[this.state.selected]?.resource) return node?.type === machineDefinitions[this.state.selected].resource!.type;
    return !node || ['soil', 'sand', 'clay'].includes(node.type);
  }
  private placeMachine(x: number, y: number) {
    if (!this.placementValid(x, y)) { this.addEvent(this.state.selected === 'scrap_drill' ? 'Place the drill directly on a scrap deposit.' : 'Choose open ground and an assembled machine.'); return; }
    this.state.placed.push({ id: this.state.selected, pos: { x, y }, powered: false, progress: 0 }); this.state.inventory[this.state.selected] -= 1;
    this.movementPath = []; this.gatherTarget = undefined; this.entitiesDirty = true;
    progressionSystem(this.state, message => this.addEvent(message)); hydraulicsSystem(this.state);
    this.addEvent(`${machineDefinitions[this.state.selected].name} placed.`);
    if ((this.state.inventory[this.state.selected] ?? 0) === 0) this.setMode('move'); this.updateHUD();
  }
  private removeMachine(entity: PlacedEntity) {
    if (!this.state.placed.includes(entity)) return;
    refundMachineInputs(this.state, entity); this.state.placed.splice(this.state.placed.indexOf(entity), 1);
    this.state.inventory[entity.id] = (this.state.inventory[entity.id] ?? 0) + 1;
    this.entitiesDirty = true; this.closeInspector(); hydraulicsSystem(this.state);
    this.addEvent(`${machineDefinitions[entity.id]?.name ?? entity.id} packed into inventory.`); this.updateHUD();
  }
  private closeInspector() { this.inspectorEntity = undefined; document.getElementById('machine-inspector')?.classList.add('overlay-hidden'); }

  private writeHTML(id: string, html: string) {
    if (this.htmlCache.get(id) === html) return; const element = document.getElementById(id); if (!element) return;
    element.innerHTML = html; this.htmlCache.set(id, html);
  }
  private setText(id: string, text: string) { const element = document.getElementById(id); if (element && element.textContent !== text) element.textContent = text; }
  private formatResourceLabel(id: string) { return machineDefinitions[id]?.name ?? id.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }
  private getIconPath(id: string) {
    if (machineDefinitions[id]) return `/images/items/${id}.svg`;
    const illustrated: string[] = [...resourceKinds, 'brick_ceb', 'steel_plate', 'frame_beam', 'fastener_pack', 'lumber', 'prepared_soil', 'fired_brick', 'hydraulic_pack', 'wheel_unit', 'cut_parts'];
    return `/images/resources/${illustrated.includes(id) ? id : 'steel_plate'}.svg`;
  }
  private quantity(amount: number) { return Number.isInteger(amount) ? `${amount}` : `${Math.round(amount * 10) / 10}`; }
  private recipeText(recipe: Record<string, number>) { return Object.entries(recipe).map(([id, amount]) => `${this.quantity(amount)} ${this.formatResourceLabel(id)}`).join(' + ') || 'No input'; }
  private updateHotbar() {
    const items = this.state.buildables.filter(item => item.unlocked || (this.state.inventory[item.id] ?? 0) > 0);
    this.writeHTML('hotbar', items.map((item, index) => {
      const count = Math.floor(this.state.inventory[item.id] ?? 0), available = count > 0;
      return `<button type="button" class="slot${this.state.selected === item.id && this.interactionMode === 'build' ? ' active' : ''}${available ? '' : ' blueprint'}" data-machine="${item.id}" title="${escapeHTML(item.name)} · ${available ? `${count} ready · click to place` : 'click to assemble'}"><span class="slot-key">${index < 9 ? index + 1 : ''}</span><img class="slot-icon" src="${this.getIconPath(item.id)}" alt=""/><span class="slot-label">${escapeHTML(item.name.replace(/ \(.+\)/, ''))}</span><span class="slot-count">${available ? count : '+'}</span></button>`;
    }).join(''));
  }
  private updateBuildablesList() {
    this.writeHTML('buildables-list', `<div class="panel-heading">Assembly <span>Shared stockpile</span></div>` + this.state.buildables.map(item => {
      const available = this.canBuildItem(item);
      const requirements = Object.entries(item.requirements).map(([id, amount]) => `<span class="buildable-req-item${(this.state.inventory[id] ?? 0) < amount ? ' missing' : ''}" title="${escapeHTML(this.formatResourceLabel(id))}"><img src="${this.getIconPath(id)}" alt=""/><span>${amount}</span></span>`).join('');
      return `<button type="button" class="buildable-item ${available ? 'available' : 'unavailable'}${item.unlocked ? '' : ' locked'}" data-machine="${item.id}" ${available ? '' : 'disabled'} title="${escapeHTML(item.description)}"><span class="buildable-header"><img class="buildable-icon" src="${this.getIconPath(item.id)}" alt=""/><span><span class="buildable-name">${escapeHTML(item.name)}</span><span class="buildable-desc">${escapeHTML(item.description)}</span></span></span><span class="buildable-req">${requirements}</span><span class="buildable-time">${item.unlocked ? `${item.buildTime}s · assemble` : `Research tier ${item.tier}`}</span></button>`;
    }).join(''));
  }
  private updateInventoryList() {
    this.writeHTML('inventory-list', `<div class="panel-heading">Stockpile <span>Materials & machines</span></div>` + Object.entries(this.state.inventory).filter(([, amount]) => amount > 0.001).map(([id, amount]) => {
      const machine = !!machineDefinitions[id], tag = machine ? 'button' : 'div';
      return `<${tag} ${machine ? `type="button" data-machine="${id}"` : ''} class="inventory-item ${machine ? 'item' : 'resource'}"><span class="inventory-info"><img class="inventory-icon" src="${this.getIconPath(id)}" alt=""/><span class="inventory-name">${escapeHTML(this.formatResourceLabel(id))}</span></span><span class="inventory-count">${this.quantity(amount)}</span></${tag}>`;
    }).join(''));
  }
  private updateBuildQueue() {
    this.writeHTML('build-queue', `<div class="panel-heading">Assembly queue <span>${this.state.buildQueue.length} pending</span></div>` + (this.state.buildQueue.length ? this.state.buildQueue.map((item, index) => {
      const progress = Math.max(0, (1 - item.timeRemaining / item.totalTime) * 100);
      return `<div class="queue-item ${index === 0 ? 'building' : 'queued'}"><div class="queue-header"><img class="queue-icon" src="${this.getIconPath(item.id)}" alt=""/><span class="queue-name">${escapeHTML(item.name)}</span><button type="button" class="cancel-btn" data-cancel="${index}" aria-label="Cancel ${escapeHTML(item.name)}">×</button></div><div class="queue-progress"><div class="progress-bar"><div class="progress-fill" style="width:${progress.toFixed(1)}%"></div></div><span class="queue-time">${Math.ceil(item.timeRemaining)}s</span></div></div>`;
    }).join('') : '<div class="queue-empty">Choose a blueprint to assemble.</div>'));
  }
  private renderTechTree() {
    const researched = new Set(this.state.researched ?? []); researched.add('tier0');
    const firstIncomplete = techTree.find(tier => !researched.has(tier.id))?.id;
    this.writeHTML('tech-tree', '<div class="panel-heading">Research <span>Open Source Ecology</span></div>' + techTree.map(tier => {
      const status = researched.has(tier.id) ? 'complete' : tier.id === firstIncomplete ? 'current' : 'locked';
      return `<section class="tech-tier ${status}"><header class="tech-tier-header"><span class="tech-tier-rank">${escapeHTML(tier.tier)} · ${status === 'complete' ? 'Complete' : status === 'current' ? 'In progress' : 'Locked'}</span><h3 class="tech-tier-title">${escapeHTML(tier.name)}</h3></header>${tier.sections.map(section => `<div class="tech-tier-section"><h4 class="tech-tier-section-title">${escapeHTML(section.label)}</h4><ul class="tech-tier-list">${section.items.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul></div>`).join('')}${(tier.notes ?? []).map(note => `<p class="tech-tier-note"><strong>${escapeHTML(note.label)}:</strong> ${escapeHTML(note.text)}</p>`).join('')}</section>`;
    }).join(''));
  }
  private updateInspector() {
    const entity = this.inspectorEntity; if (!entity) return; const definition = machineDefinitions[entity.id]; if (!definition) return;
    this.setText('inspector-title', definition.name);
    const progress = Math.min(100, (entity.progress ?? 0) / definition.operate.workTime * 100);
    this.writeHTML('inspector-body', `<p class="machine-status">${escapeHTML(getMachineStatus(this.state, entity))}</p><div class="progress-bar"><div class="progress-fill" style="width:${progress.toFixed(1)}%"></div></div><p>${escapeHTML(definition.description)}</p><dl><dt>Inputs / batch</dt><dd>${escapeHTML(this.recipeText(definition.operate.inputs))}</dd><dt>Outputs / ${definition.operate.workTime}s</dt><dd>${escapeHTML(this.recipeText(definition.operate.outputs))}</dd><dt>Power</dt><dd>${definition.power.kind === 'hydraulic' ? `${definition.power.flow_gpm ?? 0} GPM demand · ${Math.round(entity.pressurePsi ?? 0)} PSI supplied` : definition.power.kind === 'manual' ? 'Hand powered' : 'No hydraulic connection needed'}</dd></dl>${entity.produced ? `<p class="machine-total">Produced: ${escapeHTML(this.recipeText(entity.produced))}</p>` : ''}`);
  }
  private updateHUD() {
    for (const [selector, value] of [['[data-hud-health]', this.state.player.health], ['[data-hud-thirst]', this.state.player.thirst]] as const) {
      const element = document.querySelector(selector); if (element) element.textContent = `${Math.round(value)}`;
    }
    const objective = getObjective(this.state);
    this.setText('objective-title', objective.title); this.setText('objective-detail', objective.detail);
    const progress = document.getElementById('objective-progress'); if (progress) { progress.style.width = `${Math.min(100, objective.progress / objective.target * 100)}%`; progress.setAttribute('aria-valuenow', `${Math.round(objective.progress)}`); }
    const working = this.state.placed.filter(entity => entity.status === 'working').length;
    this.setText('production-summary', `${working}/${this.state.placed.filter(entity => entity.id !== 'hydraulic_hose').length} running · ${this.quantity(this.state.inventory.brick_ceb ?? 0)} earth bricks`);
    this.updateHotbar(); this.updateBuildablesList(); this.updateInventoryList(); this.updateBuildQueue(); this.renderTechTree(); this.updateInspector();
  }
  private addEvent(message: string) {
    this.log.push(message); if (this.log.length > 30) this.log.shift();
    this.writeHTML('event-log', `<div class="panel-heading">Activity</div><div class="event-log-content">${this.log.slice().reverse().map(event => `<div class="event-item">${escapeHTML(event)}</div>`).join('')}</div>`);
  }
  private saveGame() { const success = save(this.state, [...this.generatedChunks]); this.setText('save-status', success ? 'Autosaved' : 'Save unavailable'); return success; }

  private ensureSurroundingChunks(x: number, y: number) {
    const cx = Math.floor(x / this.chunkSize), cy = Math.floor(y / this.chunkSize); let changed = false;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const chunkX = cx + dx, chunkY = cy + dy, key = `${chunkX}:${chunkY}`; if (this.generatedChunks.has(key)) continue;
      this.generatedChunks.add(key); this.generateChunk(chunkX, chunkY); changed = true;
      const minX = chunkX * this.chunkSize, minY = chunkY * this.chunkSize;
      this.state.bounds.minX = Math.min(this.state.bounds.minX, minX); this.state.bounds.minY = Math.min(this.state.bounds.minY, minY);
      this.state.bounds.maxX = Math.max(this.state.bounds.maxX, minX + this.chunkSize - 1); this.state.bounds.maxY = Math.max(this.state.bounds.maxY, minY + this.chunkSize - 1);
    }
    if (changed) { this.state.width = this.state.bounds.maxX - this.state.bounds.minX + 1; this.state.height = this.state.bounds.maxY - this.state.bounds.minY + 1; this.terrainDirty = true; this.entitiesDirty = true; }
  }
  private generateChunk(chunkX: number, chunkY: number) {
    const random = this.createChunkRandom(chunkX, chunkY);
    // Coherent veins and groves make the terrain legible, rather than scattering icons on every tile.
    for (let patch = 0; patch < 5; patch++) {
      const type = resourceKinds[Math.floor(random() * resourceKinds.length)], centerX = 2 + Math.floor(random() * 12), centerY = 2 + Math.floor(random() * 12);
      const radius = type === 'water' ? 1.8 : type === 'wood' ? 2.4 : 2;
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
        if (Math.hypot(dx, dy) > radius || random() > 0.78) continue;
        const x = chunkX * this.chunkSize + centerX + dx, y = chunkY * this.chunkSize + centerY + dy;
        if (Math.abs(x - 8) + Math.abs(y - 8) < 2) continue; this.addResourceNode(x, y, type, 75 + Math.floor(random() * 125));
      }
    }
  }
  private seedSpawnResources() {
    const spawn = this.state.player.pos;
    const nodes: [ResourceKind, number, number][] = [['wood', -3, -2], ['wood', -4, -2], ['scrap_metal', 4, 0], ['scrap_metal', 4, 1], ['soil', -3, 3], ['sand', 1, 4], ['clay', 3, -3], ['water', -5, 2], ['water', -5, 3]];
    this.state.resources = this.state.resources.filter(node => Math.abs(node.pos.x - spawn.x) + Math.abs(node.pos.y - spawn.y) > 2);
    for (const [type, dx, dy] of nodes) this.addResourceNode(spawn.x + dx, spawn.y + dy, type, 180, true);
  }
  private addResourceNode(x: number, y: number, type: ResourceKind, amount: number, overwrite = false) {
    const existing = this.state.resources.find(node => node.pos.x === x && node.pos.y === y);
    if (existing) { if (overwrite) { existing.type = type; existing.amount = amount; existing.maxAmount = amount; } return; }
    this.state.resources.push({ type, amount, maxAmount: amount, pos: { x, y } });
  }
  private createChunkRandom(chunkX: number, chunkY: number) {
    let seed = (Math.imul(chunkX, 374761393) ^ Math.imul(chunkY, 668265263) ^ 0x9e3779b9) >>> 0;
    return () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  private redrawGrid() {
    const { bounds, gridSize } = this.state;
    const view = this.cameras.main.worldView;
    const minX = Math.max(bounds.minX, Math.floor(view.x / gridSize) - 2), minY = Math.max(bounds.minY, Math.floor(view.y / gridSize) - 2);
    const maxX = Math.min(bounds.maxX + 1, Math.ceil(view.right / gridSize) + 2), maxY = Math.min(bounds.maxY + 1, Math.ceil(view.bottom / gridSize) + 2);
    const x = minX * gridSize, y = minY * gridSize;
    this.gridGraphics.clear().lineStyle(1, 0x89816d, 0.17);
    for (let gx = minX; gx <= maxX; gx++) this.gridGraphics.lineBetween(gx * gridSize, y, gx * gridSize, maxY * gridSize);
    for (let gy = minY; gy <= maxY; gy++) this.gridGraphics.lineBetween(x, gy * gridSize, maxX * gridSize, gy * gridSize);
    this.terrainDirty = false;
  }
  private updateGround() {
    const view = this.cameras.main.worldView;
    const width = Math.ceil(view.width + 256), height = Math.ceil(view.height + 256);
    // The repeated terrain is viewport-sized, so exploring never allocates a map-sized canvas.
    if (width !== this.groundWidth || height !== this.groundHeight) {
      this.groundLayer.setSize(width, height); this.groundWidth = width; this.groundHeight = height;
    }
    const x = Math.floor(view.x - 128), y = Math.floor(view.y - 128);
    this.groundLayer.setPosition(x, y).setTilePosition(x, y);
    if (this.gridGraphics.visible) this.redrawGrid();
  }
  private redrawEntities() {
    for (const [entity, sprite] of this.entitySprites) if (!this.state.placed.includes(entity)) { sprite.destroy(); this.entitySprites.delete(entity); }
    for (const entity of this.state.placed) if (!this.entitySprites.has(entity)) {
      this.entitySprites.set(entity, this.add.image(this.worldToPixelCenterX(entity.pos.x), this.worldToPixelCenterY(entity.pos.y), `item-${entity.id}`).setDisplaySize(46, 46).setDepth(2));
    }
    const live = new Set<string>();
    for (const node of this.state.resources) {
      if (node.amount <= 0) continue; const key = keyAt(node.pos); live.add(key); let sprite = this.resourceSprites.get(key);
      if (!sprite) { sprite = this.add.image(this.worldToPixelCenterX(node.pos.x), this.worldToPixelCenterY(node.pos.y), `resource-${node.type}`).setDepth(0); this.resourceSprites.set(key, sprite); }
      sprite.setTexture(`resource-${node.type}`);
      const size = node.type === 'wood' || node.type === 'water' ? 48 : 34 + 10 * Math.min(1, node.amount / node.maxAmount);
      sprite.setDisplaySize(size, size).setAlpha(0.65 + 0.35 * Math.min(1, node.amount / node.maxAmount));
    }
    for (const [key, sprite] of this.resourceSprites) if (!live.has(key)) { sprite.destroy(); this.resourceSprites.delete(key); }
    this.entitiesDirty = false;
  }
  private drawMachineStatus() {
    this.statusGraphics.clear(); this.networkGraphics.clear();
    for (const entity of this.state.placed) {
      const definition = machineDefinitions[entity.id]; if (!definition) continue;
      const x = this.worldToPixelCenterX(entity.pos.x), y = this.worldToPixelCenterY(entity.pos.y);
      if (entity.powerSource && (definition.power.kind === 'hydraulic' || entity.id === 'hydraulic_hose' || definition.provides?.hydraulic)) {
        for (const other of this.state.placed) {
          if (other === entity || other.powerSource !== entity.powerSource || Math.abs(entity.pos.x - other.pos.x) + Math.abs(entity.pos.y - other.pos.y) !== 1) continue;
          if (entity.id !== 'hydraulic_hose' && other.id !== 'hydraulic_hose' && !definition.provides?.hydraulic && !machineDefinitions[other.id]?.provides?.hydraulic) continue;
          this.networkGraphics.lineStyle(3, entity.powered ? 0xe4b55d : 0x696558, 0.85).lineBetween(x, y, this.worldToPixelCenterX(other.pos.x), this.worldToPixelCenterY(other.pos.y));
        }
      }
      if (entity.id === 'hydraulic_hose') continue;
      const color = entity.status === 'working' ? 0xaad35b : entity.status === 'complete' ? 0x72cabc : entity.status === 'no_power' || entity.status === 'no_fuel' ? 0xd75e42 : entity.status === 'missing_inputs' || entity.status === 'no_resource' ? 0xe4b55d : 0x859788;
      this.statusGraphics.fillStyle(0x17201b).fillCircle(x + 17, y - 18, 4.5).fillStyle(color).fillCircle(x + 17, y - 18, 3);
      if (entity.status === 'working' && definition.operate.workTime > 0) {
        this.statusGraphics.fillStyle(0x192119, 0.9).fillRoundedRect(x - 19, y + 18, 38, 4, 1);
        this.statusGraphics.fillStyle(0xaad35b).fillRect(x - 18, y + 19, Math.min(36, 36 * (entity.progress ?? 0) / definition.operate.workTime), 2);
        const phase = ((this.state.elapsed ?? 0) * 1.8 + entity.pos.x * 0.31) % 1;
        if (entity.id === 'kiln' || entity.id === 'power_cube') {
          this.statusGraphics.fillStyle(0xd8d3be, 0.22 * (1 - phase)).fillCircle(x + 10, y - 23 - phase * 12, 2 + phase * 3);
          if (entity.id === 'kiln') this.statusGraphics.fillStyle(0xf2a346, 0.5 + 0.4 * Math.sin(phase * Math.PI)).fillRect(x - 7, y + 6, 12, 3);
        } else if (['machine_shop', 'cnc_torch', 'hydraulics_bench'].includes(entity.id)) {
          this.statusGraphics.lineStyle(1, 0xffd77d, 0.7 * (1 - phase)).lineBetween(x + 1, y + 1, x + 5 + phase * 5, y + 3 + phase * 3);
          this.statusGraphics.lineBetween(x + 1, y + 1, x - 3 - phase * 4, y - 2 - phase * 4);
        } else {
          const rotation = phase * Math.PI * 2;
          this.statusGraphics.lineStyle(2, 0xc2c7a1, 0.8).lineBetween(x - 4, y + 2, x - 4 + Math.cos(rotation) * 5, y + 2 + Math.sin(rotation) * 5);
        }
      }
    }
  }
  private updateGhost() {
    this.ghostGraphics.clear(); this.ghostSprite.setVisible(false); this.destinationGraphics.clear();
    if (this.gatherTarget || this.movementPath.length) {
      const target = this.gatherTarget ?? this.movementPath[this.movementPath.length - 1];
      this.destinationGraphics.lineStyle(2, this.gatherTarget ? 0xe4b55d : 0xaad35b, 0.9).strokeCircle(this.worldToPixelCenterX(target.x), this.worldToPixelCenterY(target.y), 18);
    }
    if (this.interactionMode !== 'build' || this.paused) return;
    const pointer = this.input.activePointer, world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const x = this.pixelToTileX(world.x), y = this.pixelToTileY(world.y), valid = this.placementValid(x, y), px = this.worldToPixelCenterX(x), py = this.worldToPixelCenterY(y);
    this.ghostSprite.setTexture(`item-${this.state.selected}`).setDisplaySize(46, 46).setPosition(px, py).setVisible(true).setTint(valid ? 0xffffff : 0xff8675);
    this.ghostGraphics.lineStyle(2, valid ? 0xaad35b : 0xe57053, 0.95).strokeRect(px - 23, py - 23, 46, 46);
    this.ghostGraphics.fillStyle(valid ? 0xaad35b : 0xe57053, 0.12).fillRect(px - 23, py - 23, 46, 46);
  }
  private redrawPlayer() { this.playerSprite.setPosition(this.worldToPixelCenterX(this.state.player.pos.x), this.worldToPixelCenterY(this.state.player.pos.y)); }
  private findResourceAt(x: number, y: number) { return this.state.resources.find(node => node.pos.x === x && node.pos.y === y && node.amount > 0); }
  private collectResource() {
    const node = this.findResourceAt(this.state.player.pos.x, this.state.player.pos.y); if (!node) { this.gatherTarget = undefined; return; }
    const collected = Math.min(getCollectionAmount(this.state), node.amount); node.amount -= collected;
    this.state.inventory[node.type] = (this.state.inventory[node.type] ?? 0) + collected; this.entitiesDirty = true;
    if (node.amount <= 0) { this.addEvent(`${this.formatResourceLabel(node.type)} deposit depleted.`); this.gatherTarget = undefined; }
  }
  private drinkWater() {
    if ((this.state.inventory.water ?? 0) < 1) { this.addEvent('The stockpile needs water. Gather from a pond or build a Water Well.'); return; }
    this.state.inventory.water -= 1; this.state.player.thirst = Math.min(100, this.state.player.thirst + 25); this.updateHUD();
  }
  private setMovementTarget(x: number, y: number) {
    const blocked = new Set(this.state.placed.filter(entity => entity.id !== 'hydraulic_hose').map(entity => `${entity.pos.x},${entity.pos.y}`));
    this.movementAccum = 0; this.movementPath = findPath(this.state.player.pos, { x, y }, blocked);
    if (!this.movementPath.length && (this.state.player.pos.x !== x || this.state.player.pos.y !== y)) { this.gatherTarget = undefined; this.addEvent('No clear route. Drive around the installed machines.'); }
  }
  private updateMovement(dt: number) {
    const down = (key: string, touch: string) => this.keys[key]?.isDown || this.touchAction === touch;
    const dx = down('D', 'right') || down('RIGHT', 'right') ? 1 : down('A', 'left') || down('LEFT', 'left') ? -1 : 0;
    const dy = down('S', 'down') || down('DOWN', 'down') ? 1 : down('W', 'up') || down('UP', 'up') ? -1 : 0;
    if (dx || dy) { this.movementPath = []; this.gatherTarget = undefined; }
    if (!dx && !dy && !this.movementPath.length) { this.movementAccum = 0; return; }
    this.movementAccum += dt;
    while (this.movementAccum >= 1 / 6) {
      this.movementAccum -= 1 / 6;
      const next = dx || dy ? { x: this.state.player.pos.x + dx, y: this.state.player.pos.y + (dx ? 0 : dy) } : this.movementPath.shift(); if (!next) break;
      if (this.state.placed.some(entity => entity.id !== 'hydraulic_hose' && entity.pos.x === next.x && entity.pos.y === next.y)) { this.movementPath = []; this.gatherTarget = undefined; this.movementAccum = 0; break; }
      const old = this.state.player.pos; this.playerSprite.setAngle(next.x > old.x ? 0 : next.x < old.x ? 180 : next.y > old.y ? 90 : -90);
      this.state.player.pos = next; this.ensureSurroundingChunks(next.x, next.y); this.redrawPlayer();
    }
  }
  private processBuildQueue(dt: number) {
    let remaining = dt;
    while (remaining > 0 && this.state.buildQueue.length) {
      const item = this.state.buildQueue[0], step = Math.min(item.timeRemaining, remaining); item.timeRemaining -= step; remaining -= step;
      if (item.timeRemaining > 0) break;
      this.state.inventory[item.id] = (this.state.inventory[item.id] ?? 0) + 1; this.state.buildQueue.shift(); this.addEvent(`${item.name} assembled. Select it in the hotbar to place.`);
    }
  }
  private updateSurvival(dt: number) {
    this.state.player.thirst = Math.max(0, this.state.player.thirst - dt * 0.045);
    if (this.state.player.thirst < 50 && (this.state.inventory.water ?? 0) >= 1) this.drinkWater();
    this.state.player.health = this.state.player.thirst < 10 ? Math.max(0, this.state.player.health - dt * 0.1) : Math.min(100, this.state.player.health + dt * 0.15);
  }
  update(_time: number, dtMs: number) {
    const dt = Math.min(dtMs / 1000, 0.25);
    if (!this.paused) {
      craftingSystem(this.state, dt, message => this.addEvent(message));
      this.processBuildQueue(dt); this.updateSurvival(dt); this.updateMovement(dt);
      const onTarget = this.gatherTarget && !this.movementPath.length && keyAt(this.gatherTarget) === keyAt(this.state.player.pos);
      if (onTarget || this.keys.SPACE?.isDown || this.touchAction === 'gather') { this.gatherAccum += dt; if (this.gatherAccum >= 0.5) { this.gatherAccum = 0; this.collectResource(); } } else this.gatherAccum = 0;
    }
    this.uiAccum += dt; this.saveAccum += dt;
    if (this.uiAccum >= 0.3) { this.uiAccum = 0; this.updateHUD(); this.redrawEntities(); }
    if (this.saveAccum >= 10) { this.saveAccum = 0; this.saveGame(); }
    this.updateGround();
    if (this.terrainDirty) this.redrawGrid(); if (this.entitiesDirty) this.redrawEntities();
    this.drawMachineStatus(); this.updateGhost();
  }
}
