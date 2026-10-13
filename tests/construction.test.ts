import assert from 'node:assert/strict';
import type { WorldState } from '../src/ecs/components';
import { createBuildables } from '../src/data/machines';
import { getAssemblyError, getPlacementError } from '../src/utils/construction';

function world(inventory: Record<string, number> = {}): WorldState {
  return {
    gridSize: 48, width: 100, height: 100, bounds: { minX: -50, minY: -50, maxX: 49, maxY: 49 },
    placed: [], player: { pos: { x: 0, y: 0 }, health: 100, thirst: 100, energy: 100 },
    resources: [], inventory: { ...inventory }, selected: 'power_cube', buildables: createBuildables(),
    buildQueue: [], production: {}, researched: []
  };
}
function check(name: string, run: () => void) { run(); console.log(`✓ ${name}`); }

check('An assembled Power Cube can be placed on clear ground without additional materials', () => {
  const state = world({ power_cube: 1 });
  const before = JSON.stringify(state);
  assert.equal(getPlacementError(state, 1, 0), null);
  assert.equal(JSON.stringify(state), before, 'Placement checks must not change the world');
  state.buildQueue.push({ id: 'power_cube', name: 'Power Cube', timeRemaining: 7, totalTime: 7 });
  assert.equal(getPlacementError(state, 1, 0), null, 'A ready copy can be placed while another assembles');
});

check('A Power Cube under assembly reports its actual wait instead of suggesting terrain changes', () => {
  const state = world();
  state.buildQueue = [{ id: 'power_cube', name: 'Power Cube', timeRemaining: 7, totalTime: 7 }];
  assert.match(getPlacementError(state, 1, 0)!, /Power Cube is still assembling \(7s remaining\)/);
  state.buildQueue.unshift({ id: 'workbench', name: 'Workbench', timeRemaining: 2.3, totalTime: 3 });
  assert.match(getPlacementError(state, 1, 0)!, /Power Cube is queued \(10s until ready\)/);
});

check('Unavailable assembled machines identify research, missing materials or assembly as the next action', () => {
  const state = world();
  assert.match(getPlacementError(state, 1, 0)!, /No assembled Power Cube in inventory/);
  assert.match(getAssemblyError(state, 'power_cube')!, /Research Tier 2/);
  assert.match(getAssemblyError(state, 'power_cube')!, /Produce six steel plates/);
  state.buildables.find(item => item.id === 'power_cube')!.unlocked = true;
  state.inventory = { steel_plate: 2, fastener_pack: 3, wood: 6 };
  assert.match(getAssemblyError(state, 'power_cube')!, /Missing 4 Steel Plate, 1 Fastener Pack/);
  assert.match(getPlacementError(state, 1, 0)!, /Missing 4 Steel Plate/);
  state.inventory.steel_plate = 6;
  state.inventory.fastener_pack = 4;
  assert.equal(getAssemblyError(state, 'power_cube'), null);
  assert.match(getPlacementError(state, 1, 0)!, /Choose its blueprint to assemble one first/);
  state.selected = 'unknown_machine';
  assert.match(getPlacementError(state, 1, 0)!, /Unknown machine/);
  assert.match(getAssemblyError(state, 'unknown_machine')!, /Unknown blueprint/);
  assert.match(getAssemblyError(state, 'constructor')!, /Unknown blueprint/);
});

check('Machinery cannot overlap placed entities or the supply truck; hoses can cross the truck tile', () => {
  const state = world({ power_cube: 1, hydraulic_hose: 1 });
  state.placed.push({ id: 'kiln', pos: { x: 1, y: 0 } });
  assert.match(getPlacementError(state, 1, 0)!, /Kiln already occupies this tile/);
  assert.match(getPlacementError(state, 0, 0)!, /supply truck occupies this tile/);
  state.selected = 'hydraulic_hose';
  assert.equal(getPlacementError(state, 0, 0), null);
  assert.match(getPlacementError(state, 1, 0)!, /already occupies/);
});

check('Live trees, water and salvage block machinery; cleared deposits and loose earth allow placement', () => {
  const state = world({ power_cube: 1 });
  for (const type of ['wood', 'water', 'scrap_metal']) {
    state.resources = [{ type, pos: { x: 1, y: 0 }, amount: 10, maxAmount: 10 }];
    const message = getPlacementError(state, 1, 0);
    assert(message, `${type} must block placement`);
    assert.match(message, type === 'wood' ? /Collect the wood/ : type === 'water' ? /dry, open ground/ : /Collect its scrap/);
    state.resources[0].amount = 0;
    assert.equal(getPlacementError(state, 1, 0), null, 'Cleared deposits are open ground');
  }
  for (const type of ['soil', 'sand', 'clay']) {
    state.resources = [{ type, pos: { x: 1, y: 0 }, amount: 10, maxAmount: 10 }];
    assert.equal(getPlacementError(state, 1, 0), null, `${type} is buildable ground`);
  }
});

check('Salvage Drills require live scrap at their exact tile and reject exhausted deposits', () => {
  const state = world({ scrap_drill: 1 });
  state.selected = 'scrap_drill';
  assert.match(getPlacementError(state, 1, 0)!, /directly on a live scrap deposit/);
  state.resources = [{ type: 'scrap_metal', pos: { x: 2, y: 0 }, amount: 10, maxAmount: 10 }];
  assert.match(getPlacementError(state, 1, 0)!, /directly on a live scrap deposit/);
  assert.equal(getPlacementError(state, 2, 0), null);
  state.resources[0].amount = 0;
  assert.match(getPlacementError(state, 2, 0)!, /deposit is depleted/);
  state.resources[0].type = 'soil';
  state.resources[0].amount = 10;
  assert.match(getPlacementError(state, 2, 0)!, /directly on a live scrap deposit/);
});
