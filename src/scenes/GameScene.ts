
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
    selected: 'power_cube'
  };

  private hotbar!: HTMLDivElement;
  private eventLog!: HTMLDivElement;

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

    // input for placement
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const gx = Math.floor(world.x / this.state.gridSize);
      const gy = Math.floor(world.y / this.state.gridSize);
      if (gx < 0 || gy < 0 || gx >= this.state.width || gy >= this.state.height) return;
      // toggle place/remove
      const existing = this.state.placed.find(e => e.pos.x === gx && e.pos.y === gy);
      if (existing) {
        this.state.placed = this.state.placed.filter(e => e !== existing);
        this.addEvent(`Removed ${existing.id} at (${gx}, ${gy})`);
      } else {
        this.state.placed.push({ id: this.state.selected, pos: { x: gx, y: gy }, powered: false });
        this.addEvent(`Placed ${this.state.selected} at (${gx}, ${gy})`);
      }
      this.redrawEntities();
    });

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
    const items = [
      { id: 'power_cube', label: 'PC' },
      { id: 'ceb_press', label: 'CEB' }
    ];
    const mk = (item:any) => {
      const d = document.createElement('div');
      d.className = 'slot' + (this.state.selected === item.id ? ' active' : '');
      d.textContent = item.label;
      d.onclick = () => {
        this.state.selected = item.id;
        for (const child of Array.from(this.hotbar.children)) child.classList.remove('active');
        d.classList.add('active');
      };
      return d;
    };
    this.hotbar.replaceChildren(...items.map(mk));
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
      const tileIndex = e.id === 'power_cube' ? 2 : 3; // arbitrary color slot
      const frameX = tileIndex * 32;
      const s = this.add.image(e.pos.x * this.state.gridSize + 16, e.pos.y * this.state.gridSize + 16, 'tiles');
      s.setCrop(frameX, 0, 32, 32);
      (s as any).isEntity = true;
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
    const newX = this.state.player.pos.x + dx;
    const newY = this.state.player.pos.y + dy;
    
    // Check bounds
    if (newX >= 0 && newX < this.state.width && newY >= 0 && newY < this.state.height) {
      this.state.player.pos.x = newX;
      this.state.player.pos.y = newY;
      this.redrawPlayer();
    }
  }

  private collectResource() {
    const playerPos = this.state.player.pos;
    const resource = this.state.resources.find(r => 
      r.pos.x === playerPos.x && r.pos.y === playerPos.y && r.amount > 0
    );
    
    if (resource) {
      const collected = Math.min(5, resource.amount); // Collect up to 5 units
      resource.amount -= collected;
      this.state.inventory[resource.type] = (this.state.inventory[resource.type] || 0) + collected;
      
      this.addEvent(`Collected ${collected} ${resource.type} (${resource.amount} remaining)`);
      
      // If resource is depleted, remove it
      if (resource.amount <= 0) {
        this.state.resources = this.state.resources.filter(r => r !== resource);
        this.addEvent(`${resource.type} deposit depleted`);
      }
    }
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
    // Remove old player sprite
    this.children.list.filter(o => (o as any).isPlayer).forEach(o => o.destroy());
    
    // Draw player
    const playerSprite = this.add.circle(
      this.state.player.pos.x * this.state.gridSize + 16,
      this.state.player.pos.y * this.state.gridSize + 16,
      8,
      0x00ff00
    );
    (playerSprite as any).isPlayer = true;
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
  }

  update(t: number, dtMs: number) {
    hydraulicsSystem(this.state);
    craftingSystem(this.state, dtMs / 1000, (message) => this.addEvent(message));
    this.updateSurvival(dtMs / 1000);
    
    // reflect powered state by tinting
    for (const s of this.children.list) {
      if ((s as any).isEntity) {
        const spr = s as Phaser.GameObjects.Image;
        const gx = Math.floor(spr.x / this.state.gridSize);
        const gy = Math.floor(spr.y / this.state.gridSize);
        const ent = this.state.placed.find(e => e.pos.x === gx && e.pos.y === gy);
        if (ent) spr.setTint(ent.powered ? 0xa8d0ff : 0xffffff);
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
}
