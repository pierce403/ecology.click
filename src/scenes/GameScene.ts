
import Phaser from 'phaser';
import type { WorldState } from '../ecs/components';
import { hydraulicsSystem, craftingSystem } from '../ecs/systems';

export class GameScene extends Phaser.Scene {
  state: WorldState = {
    gridSize: 32,
    width: 20,
    height: 12,
    placed: [],
    player: { pos: { x: 15, y: 10 }, health: 100, thirst: 100, energy: 100 },
    resources: [],
    inventory: { brick_ceb: 0, clay: 0, water: 0, stone: 0 },
    selected: 'power_cube',
    buildables: [
      {
        id: 'power_cube',
        name: 'Power Cube',
        description: 'Provides hydraulic power to adjacent machines',
        requirements: { stone: 10, clay: 5 },
        buildTime: 30,
        unlocked: true
      },
      {
        id: 'ceb_press',
        name: 'CEB Press',
        description: 'Compresses earth into building blocks',
        requirements: { stone: 20, clay: 15, brick_ceb: 5 },
        buildTime: 120,
        unlocked: false
      },
      {
        id: 'water_well',
        name: 'Water Well',
        description: 'Extracts water from underground',
        requirements: { stone: 15, clay: 10 },
        buildTime: 60,
        unlocked: true
      },
      {
        id: 'storage_shed',
        name: 'Storage Shed',
        description: 'Increases inventory capacity',
        requirements: { stone: 25, clay: 20 },
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
  private overlaysCollapsed = false;
  private overlayElements: HTMLElement[] = [];
  private overlayToggleButton?: HTMLButtonElement;
  private modeToggleButton?: HTMLButtonElement;
  private interactionMode: 'build' | 'move' = 'build';
  private movementPath: { x: number; y: number }[] = [];
  private movementAccum = 0;
  private playerSprite?: Phaser.GameObjects.Container;

  constructor() {
    super('game');
  }

  preload() {
    this.load.image('tiles', '/tilesets/placeholder-tiles.png');
    this.load.json('map', '/maps/desert-map.json');
  }

  create() {
    const map = this.cache.json.get('map') as { width:number; height:number; tileSize:number; };
    this.state.width = map.width;
    this.state.height = map.height;
    this.state.gridSize = map.tileSize;

    this.cameras.main.setBackgroundColor(0x0b0f12);
    this.cameras.main.setZoom(1.5);
    this.cameras.main.centerOn(map.width * map.tileSize / 2, map.height * map.tileSize / 2);

    // draw simple grid
    const g = this.add.graphics();
    g.lineStyle(1, 0x28323a, 1);
    for (let x = 0; x <= map.width; x++) {
      g.lineBetween(x * map.tileSize, 0, x * map.tileSize, map.height * map.tileSize);
    }
    for (let y = 0; y <= map.height; y++) {
      g.lineBetween(0, y * map.tileSize, map.width * map.tileSize, y * map.tileSize);
    }

    this.setupPointerInput();

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

    this.setupOverlayToggle();
    this.setupInteractionModeToggle();

    // entity visuals container
    this.add.layer();
    this.initializeResources();
    this.redrawEntities();
    this.redrawPlayer();
    
    // Add initial event
    this.addEvent('Welcome to the desert! Collect resources and survive.');
  }

  private buildHotbar() {
    this.hotbar = document.getElementById('hotbar') as HTMLDivElement;
    this.updateHotbar();
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
      const gx = Math.floor(world.x / this.state.gridSize);
      const gy = Math.floor(world.y / this.state.gridSize);
      if (!this.isWithinBounds(gx, gy)) return;

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
        .map(([resource, amount]) => `${resource}: ${amount}`)
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
      { id: 'clay', name: 'Clay', type: 'resource' },
      { id: 'water', name: 'Water', type: 'resource' },
      { id: 'stone', name: 'Stone', type: 'resource' },
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

  private initializeResources() {
    const map = this.cache.json.get('map') as any;
    const resourceLayer = map.layers.find((l: any) => l.name === 'resources');
    
    if (resourceLayer) {
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const resourceType = resourceLayer.data[y][x];
          if (resourceType > 0) {
            const resourceTypes = ['', 'clay', 'stone', 'water'];
            this.state.resources.push({
              pos: { x, y },
              type: resourceTypes[resourceType],
              amount: 50, // Start with 50 units
              maxAmount: 50
            });
          }
        }
      }
    }
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
        e.pos.x * this.state.gridSize + 16,
        e.pos.y * this.state.gridSize + 16,
        12,
        color
      );
      (entitySprite as any).isEntity = true;
    }

    // Draw resources
    for (const resource of this.state.resources) {
      if (resource.amount > 0) {
        const colors = { clay: 0x8B4513, stone: 0x696969, water: 0x4169E1 };
        const color = colors[resource.type as keyof typeof colors] || 0xFFFFFF;
        const size = Math.max(4, (resource.amount / resource.maxAmount) * 12);
        
        const resourceSprite = this.add.circle(
          resource.pos.x * this.state.gridSize + 16,
          resource.pos.y * this.state.gridSize + 16,
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

    // Check bounds
    if (newX >= 0 && newX < this.state.width && newY >= 0 && newY < this.state.height) {
      this.state.player.pos.x = newX;
      this.state.player.pos.y = newY;
      this.redrawPlayer();
      this.collectResource();
    }
  }

  private findResourceAt(x: number, y: number) {
    return this.state.resources.find(r => r.pos.x === x && r.pos.y === y && r.amount > 0);
  }

  private collectResource() {
    const playerPos = this.state.player.pos;
    const resource = this.findResourceAt(playerPos.x, playerPos.y);

    if (!resource) return false;

    const collected = Math.min(5, resource.amount); // Collect up to 5 units
    resource.amount -= collected;
    this.state.inventory[resource.type] = (this.state.inventory[resource.type] || 0) + collected;

    this.addEvent(`Collected ${collected} ${resource.type} (${resource.amount} remaining)`);

    // If resource is depleted, remove it
    if (resource.amount <= 0) {
      this.state.resources = this.state.resources.filter(r => r !== resource);
      this.addEvent(`${resource.type} deposit depleted`);
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
    const x = this.state.player.pos.x * this.state.gridSize + this.state.gridSize / 2;
    const y = this.state.player.pos.y * this.state.gridSize + this.state.gridSize / 2;

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
  }

  private updateHUD() {
    const hud = document.querySelector('.hud') as HTMLDivElement;
    const bricks = this.state.inventory['brick_ceb'] ?? 0;
    const clay = this.state.inventory['clay'] ?? 0;
    const water = this.state.inventory['water'] ?? 0;
    const stone = this.state.inventory['stone'] ?? 0;
    const health = Math.round(this.state.player.health);
    const thirst = Math.round(this.state.player.thirst);
    
    hud.textContent = `ecology.click — Health: ${health} | Thirst: ${thirst} | Clay: ${clay} | Water: ${water} | Stone: ${stone} | Bricks: ${bricks}`;
    
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
    if (!this.isWithinBounds(tileX, tileY)) return;

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
      path.push({ x: cx, y: cy });
    }

    while (cy !== tileY) {
      cy += stepY;
      path.push({ x: cx, y: cy });
    }

    this.movementPath = path.filter(pos => this.isWithinBounds(pos.x, pos.y));
    this.movementAccum = 0;
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
      this.state.player.pos.x = next.x;
      this.state.player.pos.y = next.y;
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

  private setupOverlayToggle() {
    this.overlayElements = [
      document.querySelector('.hud'),
      this.hotbar,
      this.eventLog,
      this.buildablesList,
      this.buildQueue,
      this.inventoryList
    ].filter((el): el is HTMLElement => !!el);

    const button = document.getElementById('overlay-toggle');
    this.overlayToggleButton = button instanceof HTMLButtonElement ? button : undefined;

    this.applyOverlayVisibility();

    if (!this.overlayToggleButton) return;

    this.overlayToggleButton.addEventListener('click', () => {
      this.overlaysCollapsed = !this.overlaysCollapsed;
      this.applyOverlayVisibility();
    });
  }

  private applyOverlayVisibility() {
    for (const el of this.overlayElements) {
      if (this.overlaysCollapsed) {
        el.classList.add('overlay-hidden');
      } else {
        el.classList.remove('overlay-hidden');
      }
    }

    if (this.overlayToggleButton) {
      this.overlayToggleButton.textContent = this.overlaysCollapsed ? 'Show UI' : 'Hide UI';
      this.overlayToggleButton.setAttribute('aria-expanded', (!this.overlaysCollapsed).toString());
    }
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

  private isWithinBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.state.width && y < this.state.height;
  }
}
