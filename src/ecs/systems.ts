
import type { WorldState, PlacedEntity } from './components';

function neighbors(a: PlacedEntity, b: PlacedEntity) {
  const dx = Math.abs(a.pos.x - b.pos.x);
  const dy = Math.abs(a.pos.y - b.pos.y);
  return (dx + dy) === 1;
}

// v0: simple adjacency rule
export function hydraulicsSystem(state: WorldState) {
  const cubes = state.placed.filter(p => p.id === 'power_cube');
  const consumers = state.placed.filter(p => p.id !== 'power_cube');
  for (const c of consumers) {
    c.powered = cubes.some(pc => neighbors(pc, c));
  }
}

// v0: demo crafting — if CEB press is powered, generate bricks slowly
export function craftingSystem(state: WorldState, dt: number) {
  // simplistic tick counter stored on the entity (dynamic property)
  for (const e of state.placed) {
    if (e.id === 'ceb_press' && e.powered) {
      (e as any)._t = ((e as any)._t ?? 0) + dt;
      if ((e as any)._t > 1.5) { // every 1.5s produce 1 brick
        (e as any)._t = 0;
        state.inventory['brick_ceb'] = (state.inventory['brick_ceb'] ?? 0) + 1;
      }
    }
  }
}
