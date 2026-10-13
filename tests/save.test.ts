import assert from 'node:assert/strict';
import type { WorldState } from '../src/ecs/components';
import { createBuildables } from '../src/data/machines';
import { load, save, SAVE_KEY } from '../src/utils/save';
import { progressionSystem } from '../src/ecs/systems';
const records = new Map<string, string>();
const storage = {
  getItem: (key: string) => records.get(key) ?? null,
  setItem: (key: string, value: string) => { records.set(key, value); }
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
const state: WorldState = {
  gridSize: 48, width: 48, height: 48,
  bounds: { minX: -16, minY: -16, maxX: 31, maxY: 31 },
  player: { pos: { x: -3, y: 8 }, health: 90, thirst: 75, energy: 100 },
  placed: [{ id: 'power_cube', pos: { x: -2, y: 8 }, fuelRemaining: 17.4 },
    { id: 'ceb_press', pos: { x: -1, y: 8 }, progress: 1.2, activeInputs: { prepared_soil: 2 } }],
  resources: [{ type: 'scrap_metal', pos: { x: -4, y: 8 }, amount: 0, maxAmount: 12 }],
  inventory: { wood: 7, brick_ceb: 0 }, selected: 'ceb_press', buildables: createBuildables(),
  buildQueue: [{ id: 'hydraulic_hose', name: 'Hydraulic Hose', totalTime: 3, timeRemaining: 1.5 }],
  researched: ['tier1', 'tier2', 'tier3', 'tier4'], production: { brick_ceb: 14 }, elapsed: 123
};
assert.equal(save(state, ['-1:0', '0:0']), true);
const restored = load()!;
assert.deepEqual(restored.chunks, ['-1:0', '0:0']);
assert.deepEqual(restored.state.placed, state.placed);
assert.deepEqual(restored.state.resources, state.resources);
assert.deepEqual(restored.state.buildQueue, state.buildQueue);
assert.deepEqual(restored.state.inventory, state.inventory);
assert.deepEqual(restored.state.bounds, state.bounds);
assert.deepEqual(restored.state.player, state.player);
progressionSystem(restored.state);
assert.equal(restored.state.buildables.find(item => item.id === 'life_trac')!.unlocked, true);
assert.equal(restored.state.resources[0].amount, 0);
console.log('✓ Save/load preserves depleted deposits, negative coordinates, fuel, reserved batches, queues and spent research');
records.clear();
records.set('ecology.click/save', JSON.stringify({ placed: [{ id: 'power_cube', x: -3, y: 4 }], inventory: { wood: 3, scrap_metal: 8 } }));
const legacy = load()!;
assert.equal(legacy.version, 2);
assert.deepEqual(legacy.state.placed[0].pos, { x: -3, y: 4 });
assert.equal(legacy.state.inventory.scrap_metal, 8);
assert.equal(records.has(SAVE_KEY), false, 'Reading must not overwrite a previous save');
console.log('✓ Legacy saves migrate without overwriting the original record');
records.clear();
records.set(SAVE_KEY, '{invalid json');
assert.equal(load(), null);
Object.defineProperty(globalThis, 'localStorage', { get: () => { throw new Error('Storage blocked'); }, configurable: true });
assert.equal(save(state), false);
assert.equal(load(), null);
console.log('✓ Invalid or blocked browser storage does not crash game startup');
