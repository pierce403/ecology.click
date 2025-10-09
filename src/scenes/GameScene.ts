
import Phaser from 'phaser';
import type { WorldState } from '../ecs/components';
import { hydraulicsSystem, craftingSystem } from '../ecs/systems';
import { techTree } from '../data/techTree';

type ResourceKind = 'soil' | 'sand' | 'clay' | 'wood' | 'scrap_metal' | 'water';

export class GameScene extends Phaser.Scene {
  state: WorldState = {
    gridSize: 32,
    width: 16,
    height: 16,
    bounds: { minX: 0, minY: 0, maxX: 15, maxY: 15 },
    placed: [],
    player: { pos: { x: 15, y: 10 }, health: 100, thirst: 100, energy: 100 },
    resources: [],
    inventory: {
      brick_ceb: 0,
      soil: 0,
      sand: 0,
      clay: 0,
      wood: 0,
      scrap_metal: 0,
      water: 0
    },
    selected: 'power_cube',
    buildables: [
      {
        id: 'power_cube',
        name: 'Power Cube',
        description: 'Provides hydraulic power to adjacent machines',
        requirements: { scrap_metal: 10, clay: 8, wood: 6 },
        buildTime: 30,
        unlocked: true
      },
      {
        id: 'ceb_press',
        name: 'CEB Press',
        description: 'Compresses earth into building blocks',
        requirements: { scrap_metal: 25, clay: 20, sand: 12 },
        buildTime: 120,
        unlocked: false
      },
      {
        id: 'water_well',
        name: 'Water Well',
        description: 'Extracts water from underground',
        requirements: { wood: 12, soil: 18, scrap_metal: 6 },
        buildTime: 60,
        unlocked: true
      },
      {
        id: 'storage_shed',
        name: 'Storage Shed',
        description: 'Increases inventory capacity',
        requirements: { wood: 24, soil: 20, sand: 14 },
        buildTime: 90,
        unlocked: true
      }
    ],
    buildQueue: []
  };

  private hotbar!: HTMLDivElement;
  private eventLog!: HTMLDivElement;
  private buildablesList!: HTMLDivElement;
  private buildQueue!: HTMLDivElement;
  private inventoryList!: HTMLDivElement;
  private techTreePanel?: HTMLDivElement;
  private gridGraphics?: Phaser.GameObjects.Graphics;
  private generatedChunks = new Set<string>();
  private ensuredSpawnResources = false;
  private readonly chunkSize = 16;
  private overlayToggles: { button: HTMLButtonElement; element: HTMLElement; name: string }[] = [];
  private modeToggleButton?: HTMLButtonElement;
  private hudHealthValue?: HTMLSpanElement;
  private hudThirstValue?: HTMLSpanElement;
  private hudAboutSection?: HTMLDivElement;
  private hudAboutToggle?: HTMLButtonElement;
  private interactionMode: 'build' | 'move' = 'build';
  private movementPath: { x: number; y: number }[] = [];
  private movementAccum = 0;
  private playerSprite?: Phaser.GameObjects.Container;
  private playerDirection: 'up' | 'down' | 'left' | 'right' = 'right';

  private worldToPixelX(tileX: number) {
    return (tileX - this.state.bounds.minX) * this.state.gridSize;
  }

  private worldToPixelY(tileY: number) {
    return (tileY - this.state.bounds.minY) * this.state.gridSize;
  }

  private worldToPixelCenterX(tileX: number) {
    return this.worldToPixelX(tileX) + this.state.gridSize / 2;
  }

  private worldToPixelCenterY(tileY: number) {
    return this.worldToPixelY(tileY) + this.state.gridSize / 2;
  }

  private pixelToTileX(pixelX: number) {
    return Math.floor(pixelX / this.state.gridSize) + this.state.bounds.minX;
  }

  private pixelToTileY(pixelY: number) {
    return Math.floor(pixelY / this.state.gridSize) + this.state.bounds.minY;
  }

  constructor() {
    super('game');
  }

  preload() {
    this.load.image('tiles', '/tilesets/placeholder-tiles.png');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x0b0f12);
    this.cameras.main.setZoom(1.5);
    this.cameras.main.centerOn(
      this.worldToPixelCenterX(this.state.player.pos.x),
      this.worldToPixelCenterY(this.state.player.pos.y)
    );

    this.gridGraphics = this.add.graphics();
    this.gridGraphics.setDepth(-1);
    this.gridGraphics.lineStyle(1, 0x28323a, 1);

    this.initializeWorld();

    this.setupPointerInput();

    this.setupHud();
    // Player movement
    this.input.keyboard?.on('keydown-W', () => this.movePlayer(0, -1));
    this.input.keyboard?.on('keydown-S', () => this.movePlayer(0, 1));
    this.input.keyboard?.on('keydown-A', () => this.movePlayer(-1, 0));
    this.input.keyboard?.on('keydown-D', () => this.movePlayer(1, 0));
    
    // Resource collection
    this.input.keyboard?.on('keydown-SPACE', () => this.collectResource());
    
    // Drink water to restore thirst
    this.input.keyboard?.on('keydown-E', () => this.drinkWater());

    // simple HUD redraw loop
    this.time.addEvent({
      loop: true, delay: 250, callback: () => this.updateHUD()
    });

    // hotbar
    this.buildHotbar();
    
    // event log
    this.buildEventLog();
    
    // buildables list
    this.buildBuildablesList();
    
    // build queue
    this.buildBuildQueue();

    // inventory list
    this.buildInventoryList();

    // tech tree panel
    this.buildTechTreePanel();

    this.setupOverlayToggles();
    this.setupInteractionModeToggle();

    this.updateHUD();

    // entity visuals container
    this.add.layer();
    this.redrawEntities();
    this.redrawPlayer();
    
    // Add initial event
    this.addEvent('Welcome to the desert! Collect resources and survive.');
  }

  private buildHotbar() {
    this.hotbar = document.getElementById('hotbar') as HTMLDivElement;
    this.updateHotbar();
  }

  private setupHud() {
    const hud = document.querySelector('.hud');
    if (!(hud instanceof HTMLDivElement)) return;

    const healthEl = hud.querySelector('[data-hud-health]');
    this.hudHealthValue = healthEl instanceof HTMLSpanElement ? healthEl : undefined;
    const thirstEl = hud.querySelector('[data-hud-thirst]');
    this.hudThirstValue = thirstEl instanceof HTMLSpanElement ? thirstEl : undefined;

    const aboutSection = hud.querySelector('#hud-about');
    this.hudAboutSection = aboutSection instanceof HTMLDivElement ? aboutSection : undefined;

    const aboutToggle = hud.querySelector('.hud-about-toggle');
    this.hudAboutToggle = aboutToggle instanceof HTMLButtonElement ? aboutToggle : undefined;

    if (this.hudAboutToggle && this.hudAboutSection) {
      const initialExpanded = !this.hudAboutSection.hasAttribute('hidden');
      this.hudAboutToggle.setAttribute('aria-expanded', initialExpanded.toString());
      this.hudAboutToggle.title = 'Read the ecology.click prologue';
      this.hudAboutToggle.addEventListener('click', () => {
        const willShow = this.hudAboutSection?.hasAttribute('hidden') ?? true;
        if (!this.hudAboutSection) return;
        if (willShow) {
          this.hudAboutSection.removeAttribute('hidden');
        } else {
          this.hudAboutSection.setAttribute('hidden', '');
        }
        this.hudAboutToggle?.setAttribute('aria-expanded', willShow ? 'true' : 'false');
      });
    }
  }

  private updateHotbar() {
    // Get all placeable items from inventory
    const placeableItems = [
      { id: 'power_cube', label: 'PC', name: 'Power Cube' },
      { id: 'ceb_press', label: 'CEB', name: 'CEB Press' },
      { id: 'water_well', label: 'WW', name: 'Water Well' },
      { id: 'storage_shed', label: 'SS', name: 'Storage Shed' }
    ].filter(item => (this.state.inventory[item.id] || 0) > 0);

    const mk = (item: any) => {
      const d = document.createElement('div');
      d.className = 'slot' + (this.state.selected === item.id ? ' active' : '');
      d.innerHTML = `
        <div class="slot-label">${item.label}</div>
        <div class="slot-count">${this.state.inventory[item.id] || 0}</div>
      `;
      d.title = `${item.name} (${this.state.inventory[item.id] || 0} available)`;
      d.onclick = () => {
        this.state.selected = item.id;
        for (const child of Array.from(this.hotbar.children)) child.classList.remove('active');
        d.classList.add('active');
      };
      return d;
    };
    this.hotbar.replaceChildren(...placeableItems.map(mk));
  }

  private buildEventLog() {
    this.eventLog = document.getElementById('event-log') as HTMLDivElement;
    this.eventLog.innerHTML = '<div class="event-log-content"></div>';
  }

  private addEvent(message: string) {
    const content = this.eventLog.querySelector('.event-log-content') as HTMLDivElement;
    const eventDiv = document.createElement('div');
    eventDiv.className = 'event-item';
    eventDiv.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

    content.appendChild(eventDiv);

    // Keep only last 20 events
    while (content.children.length > 20) {
      content.removeChild(content.firstChild!);
    }

    // Scroll to bottom
    content.scrollTop = content.scrollHeight;
  }

  private setupPointerInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const gx = this.pixelToTileX(world.x);
      const gy = this.pixelToTileY(world.y);
      if (!this.ensureTileInWorld(gx, gy)) return;
      this.ensureSurroundingChunks(gx, gy, 1);

      const isPlayerTile =
        gx === this.state.player.pos.x && gy === this.state.player.pos.y;
      if (isPlayerTile && this.findResourceAt(gx, gy)) {
        this.collectResource();
        return;
      }

      if (this.shouldMoveOnPointer(p)) {
        this.setMovementTarget(gx, gy);
        return;
      }

      this.handleTileInteraction(gx, gy);
    });
  }

  private shouldMoveOnPointer(p: Phaser.Input.Pointer) {
    if (this.interactionMode === 'move') return true;
    if (p.rightButtonDown()) return true;

    const pointerType = p.pointerType;
    if ((pointerType === 'touch' || pointerType === 'pen') && this.interactionMode === 'move') {
      return true;
    }

    return false;
  }

  private handleTileInteraction(gx: number, gy: number) {
    this.movementPath = [];
    this.movementAccum = 0;

    const existing = this.state.placed.find(e => e.pos.x === gx && e.pos.y === gy);
    if (existing) {
      this.state.placed = this.state.placed.filter(e => e !== existing);
      this.state.inventory[existing.id] = (this.state.inventory[existing.id] || 0) + 1;
      this.addEvent(`Removed ${existing.id} at (${gx}, ${gy}) and returned it to inventory`);
      this.redrawEntities();
      this.updateAllUI();
      return;
    }

    if ((this.state.inventory[this.state.selected] || 0) > 0) {
      this.state.placed.push({ id: this.state.selected, pos: { x: gx, y: gy }, powered: false });
      this.state.inventory[this.state.selected] = (this.state.inventory[this.state.selected] || 0) - 1;
      this.addEvent(`Placed ${this.state.selected} at (${gx}, ${gy})`);
      this.redrawEntities();
      this.updateAllUI();
    } else {
      this.addEvent(`Cannot place ${this.state.selected} - not in inventory`);
    }
  }

  private buildBuildablesList() {
    this.buildablesList = document.getElementById('buildables-list') as HTMLDivElement;
    this.updateBuildablesList();
  }

  private updateBuildablesList() {
    // Check for unlocks
    this.checkUnlocks();
    
    this.buildablesList.innerHTML = '';
    
    for (const item of this.state.buildables) {
      const canBuild = this.canBuildItem(item);
      const itemDiv = document.createElement('div');
      itemDiv.className = `buildable-item ${canBuild ? 'available' : 'unavailable'}`;
      
      const requirements = Object.entries(item.requirements)
        .map(([resource, amount]) => `${this.formatResourceLabel(resource)}: ${amount}`)
        .join(', ');
      
      itemDiv.innerHTML = `
        <div class="buildable-name">${item.name}</div>
        <div class="buildable-desc">${item.description}</div>
        <div class="buildable-req">${requirements}</div>
        <div class="buildable-time">${item.buildTime}s</div>
      `;
      
      if (canBuild) {
        itemDiv.onclick = () => this.startBuilding(item);
      }
      
      this.buildablesList.appendChild(itemDiv);
    }
  }

  private checkUnlocks() {
    // Unlock CEB Press when player has 5 bricks
    const cebPress = this.state.buildables.find(item => item.id === 'ceb_press');
    if (cebPress && !cebPress.unlocked && (this.state.inventory.brick_ceb || 0) >= 5) {
      cebPress.unlocked = true;
      this.addEvent('CEB Press blueprint unlocked!');
    }
  }

  private canBuildItem(item: any): boolean {
    if (!item.unlocked) return false;
    
    for (const [resource, amount] of Object.entries(item.requirements)) {
      if ((this.state.inventory[resource] || 0) < amount) {
        return false;
      }
    }
    return true;
  }

  private startBuilding(item: any) {
    // Check if we can still build it
    if (!this.canBuildItem(item)) {
      this.addEvent(`Cannot build ${item.name} - insufficient resources`);
      return;
    }
    
    // Consume resources
    for (const [resource, amount] of Object.entries(item.requirements)) {
      this.state.inventory[resource] = (this.state.inventory[resource] || 0) - amount;
    }
    
    // Add to build queue
    this.state.buildQueue.push({
      id: item.id,
      name: item.name,
      timeRemaining: item.buildTime,
      totalTime: item.buildTime
    });
    
    this.addEvent(`Queued ${item.name} for building (${item.buildTime}s)`);
    this.updateAllUI();
  }

  private buildBuildQueue() {
    this.buildQueue = document.getElementById('build-queue') as HTMLDivElement;
    this.updateBuildQueue();
  }

  private buildTechTreePanel() {
    const panel = document.getElementById('tech-tree');
    if (panel instanceof HTMLDivElement) {
      this.techTreePanel = panel;
      this.renderTechTree();
    }
  }

  private renderTechTree() {
    if (!this.techTreePanel) return;

    this.techTreePanel.innerHTML = '';

    for (const tier of techTree) {
      const tierSection = document.createElement('section');
      tierSection.className = 'tech-tier';

      const header = document.createElement('header');
      header.className = 'tech-tier-header';

      const tierLabel = document.createElement('span');
      tierLabel.className = 'tech-tier-rank';
      tierLabel.textContent = tier.tier;
      header.appendChild(tierLabel);

      const title = document.createElement('h3');
      title.className = 'tech-tier-title';
      title.textContent = tier.name;
      header.appendChild(title);

      if (tier.tagline) {
        const tagline = document.createElement('p');
        tagline.className = 'tech-tier-tagline';
        tagline.textContent = tier.tagline;
        header.appendChild(tagline);
      }

      tierSection.appendChild(header);

      for (const section of tier.sections) {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'tech-tier-section';

        const sectionTitle = document.createElement('h4');
        sectionTitle.className = 'tech-tier-section-title';
        sectionTitle.textContent = section.label;
        sectionEl.appendChild(sectionTitle);

        const list = document.createElement('ul');
        list.className = 'tech-tier-list';
        for (const item of section.items) {
          const listItem = document.createElement('li');
          listItem.textContent = item;
          list.appendChild(listItem);
        }
        sectionEl.appendChild(list);

        tierSection.appendChild(sectionEl);
      }

      if (tier.notes && tier.notes.length > 0) {
        const notesWrapper = document.createElement('div');
        notesWrapper.className = 'tech-tier-notes';

        for (const note of tier.notes) {
          const noteEl = document.createElement('p');
          noteEl.className = 'tech-tier-note';

          const noteLabel = document.createElement('span');
          noteLabel.className = 'tech-tier-note-label';
          noteLabel.textContent = `${note.label}:`;
          noteEl.appendChild(noteLabel);

          const noteText = document.createElement('span');
          noteText.className = 'tech-tier-note-text';
          noteText.textContent = ` ${note.text}`;
          noteEl.appendChild(noteText);

          notesWrapper.appendChild(noteEl);
        }

        tierSection.appendChild(notesWrapper);
      }

      this.techTreePanel.appendChild(tierSection);
    }
  }

  private updateBuildQueue() {
    this.buildQueue.innerHTML = '';
    
    if (this.state.buildQueue.length === 0) {
      this.buildQueue.innerHTML = '<div class="queue-empty">No items building</div>';
      return;
    }
    
    for (let i = 0; i < this.state.buildQueue.length; i++) {
      const item = this.state.buildQueue[i];
      const itemDiv = document.createElement('div');
      const isBuilding = i === 0; // First item is being built
      itemDiv.className = `queue-item ${isBuilding ? 'building' : 'queued'}`;
      
      const progress = ((item.totalTime - item.timeRemaining) / item.totalTime) * 100;
      
      itemDiv.innerHTML = `
        <div class="queue-name">${isBuilding ? '🔨 ' : '⏳ '}${item.name}</div>
        <div class="queue-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="queue-time">${Math.ceil(item.timeRemaining)}s</div>
          <button class="cancel-btn" onclick="window.gameScene?.cancelBuilding(${i})">×</button>
        </div>
      `;
      
      this.buildQueue.appendChild(itemDiv);
    }
  }

  private buildInventoryList() {
    this.inventoryList = document.getElementById('inventory-list') as HTMLDivElement;
    this.updateInventoryList();
  }

  private updateInventoryList() {
    this.inventoryList.innerHTML = '';
    
    const allItems = [
      { id: 'soil', name: 'Soil', type: 'resource' },
      { id: 'sand', name: 'Sand', type: 'resource' },
      { id: 'clay', name: 'Clay', type: 'resource' },
      { id: 'wood', name: 'Wood', type: 'resource' },
      { id: 'scrap_metal', name: 'Scrap Metal', type: 'resource' },
      { id: 'water', name: 'Water', type: 'resource' },
      { id: 'brick_ceb', name: 'Bricks', type: 'resource' },
      { id: 'power_cube', name: 'Power Cube', type: 'item' },
      { id: 'ceb_press', name: 'CEB Press', type: 'item' },
      { id: 'water_well', name: 'Water Well', type: 'item' },
      { id: 'storage_shed', name: 'Storage Shed', type: 'item' }
    ];

    for (const item of allItems) {
      const count = this.state.inventory[item.id] || 0;
      if (count > 0) {
        const itemDiv = document.createElement('div');
        itemDiv.className = `inventory-item ${item.type}`;
        itemDiv.innerHTML = `
          <div class="inventory-name">${item.name}</div>
          <div class="inventory-count">${count}</div>
        `;
        this.inventoryList.appendChild(itemDiv);
      }
    }
  }

  private cancelBuilding(index: number) {
    if (index >= 0 && index < this.state.buildQueue.length) {
      const item = this.state.buildQueue[index];

      // Refund resources
      const buildable = this.state.buildables.find(b => b.id === item.id);
      if (buildable) {
        for (const [resource, amount] of Object.entries(buildable.requirements)) {
          this.state.inventory[resource] = (this.state.inventory[resource] || 0) + amount;
        }
      }

      this.state.buildQueue.splice(index, 1);
      this.addEvent(`Cancelled building ${item.name}`);
      this.updateAllUI();
    }
  }

  private initializeWorld() {
    this.generatedChunks.clear();
    this.ensuredSpawnResources = false;
    this.state.resources = [];
    this.state.width = this.chunkSize;
    this.state.height = this.chunkSize;
    this.state.bounds = {
      minX: 0,
      minY: 0,
      maxX: this.chunkSize - 1,
      maxY: this.chunkSize - 1
    };

    this.ensureSurroundingChunks(this.state.player.pos.x, this.state.player.pos.y, 1);
    this.redrawGrid();
  }

  private ensureSurroundingChunks(tileX: number, tileY: number, chunkRadius: number) {
    const centerChunkX = Math.floor(tileX / this.chunkSize);
    const centerChunkY = Math.floor(tileY / this.chunkSize);

    for (let cx = centerChunkX - chunkRadius; cx <= centerChunkX + chunkRadius; cx++) {
      for (let cy = centerChunkY - chunkRadius; cy <= centerChunkY + chunkRadius; cy++) {
        this.ensureChunk(cx, cy);
      }
    }
  }

  private ensureTileInWorld(x: number, y: number) {
    this.ensureChunkForTile(x, y);
    return this.isWithinBounds(x, y);
  }

  private ensureChunkForTile(tileX: number, tileY: number) {
    const chunkX = Math.floor(tileX / this.chunkSize);
    const chunkY = Math.floor(tileY / this.chunkSize);
    this.ensureChunk(chunkX, chunkY);
  }

  private ensureChunk(chunkX: number, chunkY: number) {
    const key = this.getChunkKey(chunkX, chunkY);
    if (this.generatedChunks.has(key)) return;

    this.generatedChunks.add(key);
    const minTileX = chunkX * this.chunkSize;
    const minTileY = chunkY * this.chunkSize;
    const maxTileX = minTileX + this.chunkSize - 1;
    const maxTileY = minTileY + this.chunkSize - 1;
    const boundsChanged = this.expandWorldToIncludeArea(minTileX, minTileY, maxTileX, maxTileY);
    this.generateChunk(chunkX, chunkY);
    this.redrawEntities();
    if (boundsChanged) {
      this.redrawPlayer();
    }
  }

  private expandWorldToIncludeArea(minX: number, minY: number, maxX: number, maxY: number) {
    const bounds = this.state.bounds;
    const newMinX = Math.min(bounds.minX, minX);
    const newMinY = Math.min(bounds.minY, minY);
    const newMaxX = Math.max(bounds.maxX, maxX);
    const newMaxY = Math.max(bounds.maxY, maxY);

    if (
      newMinX === bounds.minX &&
      newMinY === bounds.minY &&
      newMaxX === bounds.maxX &&
      newMaxY === bounds.maxY
    ) {
      return false;
    }

    this.state.bounds = { minX: newMinX, minY: newMinY, maxX: newMaxX, maxY: newMaxY };
    this.state.width = newMaxX - newMinX + 1;
    this.state.height = newMaxY - newMinY + 1;
    this.redrawGrid();
    return true;
  }

  private redrawGrid() {
    if (!this.gridGraphics) return;

    const widthPx = this.state.width * this.state.gridSize;
    const heightPx = this.state.height * this.state.gridSize;

    this.gridGraphics.clear();
    this.gridGraphics.lineStyle(1, 0x28323a, 1);

    for (let x = 0; x <= this.state.width; x++) {
      const px = x * this.state.gridSize;
      this.gridGraphics.lineBetween(px, 0, px, heightPx);
    }

    for (let y = 0; y <= this.state.height; y++) {
      const py = y * this.state.gridSize;
      this.gridGraphics.lineBetween(0, py, widthPx, py);
    }
  }

  private generateChunk(chunkX: number, chunkY: number) {
    const resourcePool: ResourceKind[] = [
      'soil', 'soil', 'soil',
      'sand', 'sand',
      'clay', 'clay',
      'wood', 'wood',
      'scrap_metal',
      'water'
    ];

    const rng = this.createChunkRandom(chunkX, chunkY);
    const startX = chunkX * this.chunkSize;
    const startY = chunkY * this.chunkSize;

    for (let lx = 0; lx < this.chunkSize; lx++) {
      for (let ly = 0; ly < this.chunkSize; ly++) {
        const worldX = startX + lx;
        const worldY = startY + ly;
        const roll = rng();

        if (roll < 0.25) {
          const resourceType = resourcePool[Math.floor(rng() * resourcePool.length)];
          const richness = 35 + Math.floor(rng() * 55);
          this.addResourceNode(worldX, worldY, resourceType, richness);
        } else if (roll < 0.32) {
          // Low chance to sprinkle extra soil pockets for building
          const richness = 45 + Math.floor(rng() * 40);
          this.addResourceNode(worldX, worldY, 'soil', richness);
        }
      }
    }

    const spawnChunkX = Math.floor(this.state.player.pos.x / this.chunkSize);
    const spawnChunkY = Math.floor(this.state.player.pos.y / this.chunkSize);

    if (!this.ensuredSpawnResources && chunkX === spawnChunkX && chunkY === spawnChunkY) {
      this.seedSpawnResources();
      this.ensuredSpawnResources = true;
    }
  }

  private seedSpawnResources() {
    const spawn = this.state.player.pos;
    const guaranteed: { type: ResourceKind; dx: number; dy: number; richness: number }[] = [
      { type: 'soil', dx: -1, dy: 0, richness: 80 },
      { type: 'sand', dx: 1, dy: 0, richness: 70 },
      { type: 'clay', dx: 0, dy: -1, richness: 70 },
      { type: 'wood', dx: 0, dy: 1, richness: 65 },
      { type: 'scrap_metal', dx: 2, dy: 0, richness: 60 },
      { type: 'water', dx: 0, dy: 2, richness: 60 }
    ];

    for (const { type, dx, dy, richness } of guaranteed) {
      const tileX = spawn.x + dx;
      const tileY = spawn.y + dy;
      this.addResourceNode(tileX, tileY, type, richness, true);
    }
  }

  private addResourceNode(
    tileX: number,
    tileY: number,
    type: ResourceKind,
    amount: number,
    overwrite = false
  ) {
    const existing = this.state.resources.find(r => r.pos.x === tileX && r.pos.y === tileY);

    if (existing) {
      if (overwrite) {
        existing.type = type;
        existing.amount = amount;
        existing.maxAmount = Math.max(existing.maxAmount, amount);
      }
      return;
    }

    this.state.resources.push({
      pos: { x: tileX, y: tileY },
      type,
      amount,
      maxAmount: amount
    });
  }

  private getChunkKey(x: number, y: number) {
    return `${x}:${y}`;
  }

  private createChunkRandom(chunkX: number, chunkY: number) {
    const x = chunkX | 0;
    const y = chunkY | 0;
    let seed = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    if (seed === 0) {
      seed = 0x9e3779b9;
    }
    let state = seed;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private redrawEntities() {
    // clear old sprites
    this.children.list.filter(o => (o as any).isEntity).forEach(o => o.destroy());
    this.children.list.filter(o => (o as any).isResource).forEach(o => o.destroy());

    // Draw placed entities
    for (const e of this.state.placed) {
      const colors = {
        power_cube: 0x4a6,      // Green
        ceb_press: 0x46a,       // Blue  
        water_well: 0x69f,      // Light blue
        storage_shed: 0x8a6     // Orange
      };
      const color = colors[e.id as keyof typeof colors] || 0x666;

      const entitySprite = this.add.circle(
        this.worldToPixelCenterX(e.pos.x),
        this.worldToPixelCenterY(e.pos.y),
        12,
        color
      );
      (entitySprite as any).isEntity = true;
    }

    // Draw resources
    for (const resource of this.state.resources) {
      if (resource.amount > 0) {
        const colors = {
          soil: 0x8B5A2B,
          sand: 0xC2B280,
          clay: 0xA0522D,
          wood: 0x4F7942,
          scrap_metal: 0x7A8A99,
          water: 0x4169E1
        };
        const color = colors[resource.type as keyof typeof colors] || 0xFFFFFF;
        const size = Math.max(4, (resource.amount / resource.maxAmount) * 12);

        const resourceSprite = this.add.circle(
          this.worldToPixelCenterX(resource.pos.x),
          this.worldToPixelCenterY(resource.pos.y),
          size,
          color
        );
        (resourceSprite as any).isResource = true;
      }
    }
  }

  private movePlayer(dx: number, dy: number) {
    this.movementPath = [];
    this.movementAccum = 0;
    const newX = this.state.player.pos.x + dx;
    const newY = this.state.player.pos.y + dy;

    if (!this.ensureTileInWorld(newX, newY)) return;

    this.updatePlayerDirection(dx, dy);
    this.state.player.pos.x = newX;
    this.state.player.pos.y = newY;
    this.ensureSurroundingChunks(newX, newY, 1);
    this.redrawPlayer();
    this.collectResource();
  }

  private findResourceAt(x: number, y: number) {
    return this.state.resources.find(r => r.pos.x === x && r.pos.y === y && r.amount > 0);
  }

  private collectResource() {
    const playerPos = this.state.player.pos;
    this.ensureChunkForTile(playerPos.x, playerPos.y);
    const resource = this.findResourceAt(playerPos.x, playerPos.y);

    if (!resource) return false;

    const collected = Math.min(5, resource.amount); // Collect up to 5 units
    resource.amount -= collected;
    this.state.inventory[resource.type] = (this.state.inventory[resource.type] || 0) + collected;

    const label = this.formatResourceLabel(resource.type);
    this.addEvent(`Collected ${collected} ${label} (${resource.amount} remaining)`);

    // If resource is depleted, remove it
    if (resource.amount <= 0) {
      this.state.resources = this.state.resources.filter(r => r !== resource);
      this.addEvent(`${label} deposit depleted`);
    }

    this.redrawEntities();
    this.updateAllUI();
    return true;
  }

  private drinkWater() {
    if (this.state.inventory.water > 0) {
      this.state.inventory.water--;
      this.state.player.thirst = Math.min(100, this.state.player.thirst + 25);
      this.addEvent(`Drank water! Thirst restored to ${Math.round(this.state.player.thirst)}%`);
    } else {
      this.addEvent('No water available!');
    }
  }

  private redrawPlayer() {
    const x = this.worldToPixelCenterX(this.state.player.pos.x);
    const y = this.worldToPixelCenterY(this.state.player.pos.y);

    if (!this.playerSprite) {
      const container = this.add.container(x, y);
      container.setDepth(10);

      const chassis = this.add.rectangle(0, 0, 24, 12, 0x3f9e58);
      const cargoBed = this.add.rectangle(-8, -2, 14, 10, 0x4bbf6d);
      const cabin = this.add.rectangle(8, -4, 10, 10, 0x2d7c3a);
      const window = this.add.rectangle(9, -6, 6, 4, 0xe8ffe9);
      const light = this.add.circle(14, 0, 2, 0xcdee8a);
      const frontWheel = this.add.circle(-8, 6, 4, 0x111111);
      const rearWheel = this.add.circle(8, 6, 4, 0x111111);

      container.add([chassis, cargoBed, cabin, window, light, frontWheel, rearWheel]);

      this.playerSprite = container;
      (container as any).isPlayer = true;

      this.cameras.main.startFollow(container, true, 0.2, 0.2);
      this.cameras.main.setRoundPixels(true);
      this.cameras.main.centerOn(x, y);
    }

    this.playerSprite!.setPosition(x, y);
    this.updatePlayerSpriteOrientation();
  }

  private updatePlayerDirection(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return;

    if (dx !== 0) {
      this.playerDirection = dx > 0 ? 'right' : 'left';
    } else {
      this.playerDirection = dy > 0 ? 'down' : 'up';
    }

    this.updatePlayerSpriteOrientation();
  }

  private updatePlayerSpriteOrientation() {
    if (!this.playerSprite) return;

    const sprite = this.playerSprite;
    sprite.setScale(1, 1);

    switch (this.playerDirection) {
      case 'left':
        sprite.setAngle(0);
        sprite.setScale(-1, 1);
        break;
      case 'right':
        sprite.setAngle(0);
        break;
      case 'up':
        sprite.setAngle(-90);
        break;
      case 'down':
        sprite.setAngle(90);
        break;
    }
  }

  private updateHUD() {
    const health = Math.round(this.state.player.health);
    const thirst = Math.round(this.state.player.thirst);

    if (this.hudHealthValue) {
      this.hudHealthValue.textContent = `${health}`;
    }

    if (this.hudThirstValue) {
      this.hudThirstValue.textContent = `${thirst}`;
    }

    // Update all UI elements
    this.updateAllUI();
  }

  private updateAllUI() {
    this.updateBuildablesList();
    this.updateBuildQueue();
    this.updateInventoryList();
    this.updateHotbar();
  }

  update(t: number, dtMs: number) {
    hydraulicsSystem(this.state);
    craftingSystem(this.state, dtMs / 1000, (message) => this.addEvent(message));
    this.updateSurvival(dtMs / 1000);
    this.processBuildQueue(dtMs / 1000);
    this.updateMovement(dtMs / 1000);

    // reflect powered state by tinting
    for (const s of this.children.list) {
      if ((s as any).isEntity) {
        const spr = s as Phaser.GameObjects.Circle;
        const gx = Math.floor(spr.x / this.state.gridSize);
        const gy = Math.floor(spr.y / this.state.gridSize);
        const ent = this.state.placed.find(e => e.pos.x === gx && e.pos.y === gy);
        if (ent) {
          // For circles, we change the fill color instead of tinting
          const baseColors = {
            power_cube: 0x4a6,
            ceb_press: 0x46a,
            water_well: 0x69f,
            storage_shed: 0x8a6
          };
          const baseColor = baseColors[ent.id as keyof typeof baseColors] || 0x666;
          spr.setFillStyle(ent.powered ? 0xa8d0ff : baseColor);
        }
      }
    }
  }

  private processBuildQueue(dt: number) {
    // Only process the first item in the queue (one at a time)
    if (this.state.buildQueue.length > 0) {
      const item = this.state.buildQueue[0];
      item.timeRemaining -= dt;
      
      if (item.timeRemaining <= 0) {
        // Building completed
        this.addEvent(`${item.name} construction completed!`);
        
        // Add to inventory or place in world
        if (item.id === 'power_cube' || item.id === 'ceb_press') {
          // These are placed items, add to inventory for manual placement
          this.state.inventory[item.id] = (this.state.inventory[item.id] || 0) + 1;
        } else {
          // Other items go directly to inventory
          this.state.inventory[item.id] = (this.state.inventory[item.id] || 0) + 1;
        }
        
        // Remove from queue
        this.state.buildQueue.shift();
        
        // Update UI
        this.updateAllUI();
      }
    }
  }

  private updateSurvival(dt: number) {
    // Thirst decreases much more gradually (about 3 drinks per day)
    // Assuming 1 day = 24 minutes of real time, thirst should drop from 100 to 0 in 8 minutes
    // So 100 points over 480 seconds = 0.208 points per second
    this.state.player.thirst = Math.max(0, this.state.player.thirst - dt * 0.2);
    
    // Auto-drink if thirst is below 50% and player has water
    if (this.state.player.thirst < 50 && this.state.inventory.water > 0) {
      this.state.inventory.water--;
      this.state.player.thirst = Math.min(100, this.state.player.thirst + 25);
      this.addEvent(`Auto-drank water! Thirst: ${Math.round(this.state.player.thirst)}%`);
    }
    
    // Health decreases if thirst is too low
    if (this.state.player.thirst < 20) {
      this.state.player.health = Math.max(0, this.state.player.health - dt * 5);
    }
    
    // Energy decreases over time
    this.state.player.energy = Math.max(0, this.state.player.energy - dt * 0.1);
    
    // Game over if health reaches 0
    if (this.state.player.health <= 0) {
      this.addEvent('Game Over! You died of thirst.');
      // Could restart or show game over screen
    }
  }

  private setMovementTarget(tileX: number, tileY: number) {
    if (!this.ensureTileInWorld(tileX, tileY)) return;

    const current = this.state.player.pos;
    if (current.x === tileX && current.y === tileY) {
      this.movementPath = [];
      this.movementAccum = 0;
      return;
    }

    const path: { x: number; y: number }[] = [];
    let cx = current.x;
    let cy = current.y;
    const stepX = Math.sign(tileX - cx);
    const stepY = Math.sign(tileY - cy);

    while (cx !== tileX) {
      cx += stepX;
      if (!this.ensureTileInWorld(cx, cy)) break;
      path.push({ x: cx, y: cy });
    }

    while (cy !== tileY) {
      cy += stepY;
      if (!this.ensureTileInWorld(cx, cy)) break;
      path.push({ x: cx, y: cy });
    }

    this.movementPath = path;
    this.movementAccum = 0;

    if (path.length > 0) {
      const last = path[path.length - 1];
      this.ensureSurroundingChunks(last.x, last.y, 1);
    }
  }

  private updateMovement(dt: number) {
    if (this.movementPath.length === 0) return;

    const tilesPerSecond = 4;
    const stepTime = 1 / tilesPerSecond;
    this.movementAccum += dt;

    let moved = false;
    while (this.movementAccum >= stepTime && this.movementPath.length > 0) {
      this.movementAccum -= stepTime;
      const next = this.movementPath.shift()!;
      const currentX = this.state.player.pos.x;
      const currentY = this.state.player.pos.y;
      this.updatePlayerDirection(next.x - currentX, next.y - currentY);
      this.state.player.pos.x = next.x;
      this.state.player.pos.y = next.y;
      this.ensureSurroundingChunks(next.x, next.y, 1);
      moved = true;
    }

    if (moved) {
      this.redrawPlayer();
    }

    if (this.movementPath.length === 0) {
      this.movementAccum = 0;
      this.collectResource();
    }
  }

  private setupOverlayToggles() {
    const configs: { name: string; buttonId: string; targetSelector: string }[] = [
      { name: 'Buildables', buttonId: 'toggle-buildables', targetSelector: '#buildables-list' },
      { name: 'Inventory', buttonId: 'toggle-inventory', targetSelector: '#inventory-list' },
      { name: 'Event Log', buttonId: 'toggle-event-log', targetSelector: '#event-log' },
      { name: 'Build Queue', buttonId: 'toggle-build-queue', targetSelector: '#build-queue' },
      { name: 'Tech Tree', buttonId: 'toggle-tech-tree', targetSelector: '#tech-tree' }
    ];

    this.overlayToggles = [];

    for (const config of configs) {
      const buttonEl = document.getElementById(config.buttonId);
      const targetEl = document.querySelector(config.targetSelector);

      if (!(buttonEl instanceof HTMLButtonElement) || !(targetEl instanceof HTMLElement)) {
        continue;
      }

      const toggle = { button: buttonEl, element: targetEl, name: config.name };
      buttonEl.textContent = config.name;
      buttonEl.setAttribute('aria-controls', targetEl.id);
      buttonEl.addEventListener('click', () => {
        toggle.element.classList.toggle('overlay-hidden');
        this.updateOverlayToggleButton(toggle);
      });

      this.overlayToggles.push(toggle);
      this.updateOverlayToggleButton(toggle);
    }
  }

  private updateOverlayToggleButton(toggle: { button: HTMLButtonElement; element: HTMLElement; name: string }) {
    const isHidden = toggle.element.classList.contains('overlay-hidden');
    toggle.button.dataset.active = (!isHidden).toString();
    toggle.button.setAttribute('aria-pressed', (!isHidden).toString());
    toggle.button.setAttribute('aria-expanded', (!isHidden).toString());
    toggle.button.title = `${isHidden ? 'Show' : 'Hide'} ${toggle.name}`;
  }

  private setupInteractionModeToggle() {
    const button = document.getElementById('mode-toggle');
    this.modeToggleButton = button instanceof HTMLButtonElement ? button : undefined;
    if (!this.modeToggleButton) return;

    const prefersTouch = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;

    this.interactionMode = prefersTouch ? 'move' : 'build';
    this.updateModeToggleButton();

    this.modeToggleButton.addEventListener('click', () => {
      this.interactionMode = this.interactionMode === 'move' ? 'build' : 'move';
      this.updateModeToggleButton();
    });
  }

  private updateModeToggleButton() {
    if (!this.modeToggleButton) return;

    this.modeToggleButton.dataset.mode = this.interactionMode;
    this.modeToggleButton.textContent = this.interactionMode === 'move' ? 'Move Mode' : 'Build Mode';
    this.modeToggleButton.setAttribute('aria-pressed', this.interactionMode === 'move' ? 'true' : 'false');
    this.modeToggleButton.title = this.interactionMode === 'move'
      ? 'Tap tiles to walk the player. Tap to switch back to building.'
      : 'Tap tiles to place or remove builds. Tap to switch back to movement.';
  }

  private formatResourceLabel(id: string) {
    return id
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private isWithinBounds(x: number, y: number) {
    return (
      x >= this.state.bounds.minX &&
      y >= this.state.bounds.minY &&
      x <= this.state.bounds.maxX &&
      y <= this.state.bounds.maxY
    );
  }
}
