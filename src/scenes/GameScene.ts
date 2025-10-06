
import Phaser from 'phaser';
import type { WorldState } from '../ecs/components';
import { hydraulicsSystem, craftingSystem } from '../ecs/systems';

export class GameScene extends Phaser.Scene {
  state: WorldState = {
    gridSize: 32,
    width: 20,
    height: 12,
    placed: [],
    inventory: { brick_ceb: 0 },
    selected: 'power_cube'
  };

  private hotbar!: HTMLDivElement;

  constructor() {
    super('game');
  }

  preload() {
    this.load.image('tiles', '/tilesets/placeholder-tiles.png');
    this.load.json('map', '/maps/demo-map.json');
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
      } else {
        this.state.placed.push({ id: this.state.selected, pos: { x: gx, y: gy }, powered: false });
      }
      this.redrawEntities();
    });

    // WASD pan
    this.input.keyboard?.on('keydown-W', () => this.cameras.main.scrollY -= 20);
    this.input.keyboard?.on('keydown-S', () => this.cameras.main.scrollY += 20);
    this.input.keyboard?.on('keydown-A', () => this.cameras.main.scrollX -= 20);
    this.input.keyboard?.on('keydown-D', () => this.cameras.main.scrollX += 20);

    // simple HUD redraw loop
    this.time.addEvent({
      loop: true, delay: 250, callback: () => this.updateHUD()
    });

    // hotbar
    this.buildHotbar();

    // entity visuals container
    this.add.layer();
    this.redrawEntities();
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

  private redrawEntities() {
    // clear old sprites
    this.children.list.filter(o => (o as any).isEntity).forEach(o => o.destroy());

    for (const e of this.state.placed) {
      const tileIndex = e.id === 'power_cube' ? 2 : 3; // arbitrary color slot
      const frameX = tileIndex * 32;
      const s = this.add.image(e.pos.x * this.state.gridSize + 16, e.pos.y * this.state.gridSize + 16, 'tiles');
      s.setCrop(frameX, 0, 32, 32);
      (s as any).isEntity = True;
    }
  }

  private updateHUD() {
    const hud = document.querySelector('.hud') as HTMLDivElement;
    const bricks = this.state.inventory['brick_ceb'] ?? 0;
    hud.textContent = `ecology.click — bricks: ${bricks} — selected: ${this.state.selected}`;
  }

  update(t: number, dtMs: number) {
    hydraulicsSystem(this.state);
    craftingSystem(this.state, dtMs / 1000);
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
}
