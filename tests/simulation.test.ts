import assert from 'node:assert/strict';
import type { PlacedEntity, WorldState } from '../src/ecs/components';
import { createBuildables, machineDefinitions } from '../src/data/machines';
import { craftingSystem, getCollectionAmount, getObjective, hydraulicsSystem, progressionSystem, refundMachineInputs } from '../src/ecs/systems';

function world(inventory: Record<string, number> = {}): WorldState {
  return {
    gridSize: 48, width: 100, height: 100, bounds: { minX: -50, minY: -50, maxX: 49, maxY: 49 },
    placed: [], player: { pos: { x: 0, y: 0 }, health: 100, thirst: 100, energy: 100 },
    resources: [], inventory: { ...inventory }, selected: 'workbench', buildables: createBuildables(),
    buildQueue: [], production: {}, researched: []
  };
}
const entity = (id: string, x: number, y: number): PlacedEntity => ({ id, pos: { x, y } });
const close = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
function check(name: string, run: () => void) { run(); console.log(`✓ ${name}`); }

check('Earth bricks need real prepared material and fuel; no free powered production', () => {
  const s = world({ wood: 10, soil: 30 });
  s.placed = [entity('power_cube', 0, 0), entity('ceb_press', 1, 0)];
  craftingSystem(s, 20);
  assert.equal(s.inventory.brick_ceb ?? 0, 0);
  assert.equal(s.inventory.wood, 10);
  assert.equal(s.placed[1].status, 'missing_inputs');
  s.inventory.prepared_soil = 4;
  craftingSystem(s, 6);
  assert.equal(s.inventory.brick_ceb, 4);
  assert.equal(s.inventory.prepared_soil, 0);
  assert.equal(s.inventory.wood, 9);
  close(s.placed[0].fuelRemaining!, 39);
});

check('Partial batches reserve material once and teardown restores unworked inputs', () => {
  const s = world({ scrap_metal: 3 });
  const bench = entity('workbench', 0, 0);
  s.placed.push(bench);
  craftingSystem(s, 1);
  assert.equal(s.inventory.scrap_metal, 1);
  assert.equal(s.inventory.fastener_pack ?? 0, 0);
  craftingSystem(s, 1);
  assert.equal(s.inventory.scrap_metal, 1);
  refundMachineInputs(s, bench);
  assert.equal(s.inventory.scrap_metal, 3);
  refundMachineInputs(s, bench);
  assert.equal(s.inventory.scrap_metal, 3);
  const drill = entity('scrap_drill', 1, 0);
  s.placed = [entity('power_cube', 0, 0), drill];
  s.inventory.wood = 1;
  s.resources.push({ type: 'scrap_metal', pos: { x: 1, y: 0 }, amount: 7, maxAmount: 7 });
  craftingSystem(s, 1);
  assert.equal(s.resources[0].amount, 4);
  refundMachineInputs(s, drill);
  assert.equal(s.resources[0].amount, 7);
  assert.equal(s.inventory.scrap_metal, 3, 'Removing a drill must not bypass extraction time');
});

check('Hoses carry cardinal hydraulic flow; overload shares capacity and disconnection cuts power', () => {
  const s = world({ wood: 10, prepared_soil: 20, soil: 100, clay: 100, sand: 100, water: 100 });
  s.placed = [entity('power_cube', 0, 0), entity('hydraulic_hose', 1, 0), entity('hydraulic_hose', 2, 0),
    entity('ceb_press', 0, 1), entity('ceb_press', 1, 1), entity('ceb_press', 2, 1), entity('soil_processor', 3, 0),
    entity('ceb_press', -1, -1)];
  hydraulicsSystem(s);
  for (const machine of s.placed.slice(3, 7)) {
    assert.equal(machine.powered, true);
    close(machine.powerScale!, 20 / 28);
    assert.equal(machine.pressurePsi, 2300);
  }
  assert.equal(s.placed[7].powered, false, 'Diagonal tiles are not hydraulic connections');
  s.placed = s.placed.filter(machine => !(machine.id === 'hydraulic_hose' && machine.pos.x === 1));
  hydraulicsSystem(s);
  assert.equal(s.placed.find(machine => machine.pos.x === 0 && machine.pos.y === 1)!.powered, true);
  assert.equal(s.placed.find(machine => machine.pos.x === 2 && machine.pos.y === 1)!.powered, false);
  assert.equal(s.placed.find(machine => machine.id === 'soil_processor')!.powered, false);
  s.inventory.wood = 0;
  hydraulicsSystem(s);
  assert.equal(s.placed.find(machine => machine.pos.x === 0 && machine.pos.y === 1)!.powered, false);
});

check('Connected pumps add capacity; a consumer beside an empty hose network uses its live connection', () => {
  const s = world({ wood: 5, prepared_soil: 100 });
  s.placed = [entity('hydraulic_hose', 0, 2), entity('power_cube', 0, 0), entity('hydraulic_hose', 1, 0),
    entity('power_cube', 2, 0), entity('ceb_press', 0, 1), entity('ceb_press', 1, 1), entity('ceb_press', 2, 1)];
  hydraulicsSystem(s);
  for (const press of s.placed.filter(machine => machine.id === 'ceb_press')) {
    assert.equal(press.powered, true);
    assert.equal(press.powerScale, 1);
  }
});

check('Finite extraction recovers exactly the deposit and consumes fuel through the final batch', () => {
  const s = world({ wood: 5 });
  s.placed = [entity('power_cube', 0, 0), entity('scrap_drill', 1, 0)];
  s.resources = [{ type: 'scrap_metal', pos: { x: 1, y: 0 }, amount: 7, maxAmount: 7 }];
  craftingSystem(s, 30);
  assert.equal(s.inventory.scrap_metal, 7);
  assert.equal(s.resources[0].amount, 0);
  assert.equal(s.placed[1].status, 'no_resource');
  assert.equal(s.inventory.wood, 4);
  close(s.placed[0].fuelRemaining!, 33);
  s.placed.push(entity('ceb_press', 0, 1));
  s.inventory.prepared_soil = 2;
  hydraulicsSystem(s);
  assert.equal(s.placed[2].powerScale, 1, 'Exhausted drills must not steal flow from productive machines');
  const empty = world({ wood: 2 });
  empty.placed = [entity('power_cube', 0, 0), entity('scrap_drill', 1, 0)];
  craftingSystem(empty, 10);
  assert.equal(empty.inventory.scrap_metal ?? 0, 0);
  assert.equal(empty.inventory.wood, 2);
});

check('Frame sizes preserve production, material reservation and engine fuel', () => {
  function run(frame: number) {
    const s = world({ wood: 10, prepared_soil: 100 });
    s.placed = [entity('power_cube', 0, 0), entity('ceb_press', 1, 0)];
    let time = 0;
    while (time < 30 - 1e-8) { const dt = Math.min(frame, 30 - time); craftingSystem(s, dt); time += dt; }
    return s;
  }
  const slow = run(1);
  const fast = run(1 / 144);
  assert.equal(slow.inventory.brick_ceb, 20);
  assert.deepEqual(slow.inventory, fast.inventory);
  close(slow.placed[0].fuelRemaining!, fast.placed[0].fuelRemaining!);
});

check('Every tech tier and the eco-home are reachable using only finite base-resource gathering', () => {
  const s = world({ wood: 16, scrap_metal: 12, water: 20, soil: 20 });
  const base = new Set(['soil', 'sand', 'clay', 'wood', 'scrap_metal', 'water']);
  const reserves = Object.fromEntries([...base].map(id => [id, 2000]));
  let elapsed = 0;
  let manualX = 0;
  let hydraulicX = 1;
  function gather(id: string, quantity: number) {
    assert(base.has(id), `No derived-material injection: ${id}`);
    assert(reserves[id] >= quantity, `Finite reserve exhausted: ${id}`);
    reserves[id] -= quantity;
    s.inventory[id] = (s.inventory[id] ?? 0) + quantity;
  }
  function tick() {
    for (const [id, quantity] of Object.entries({ wood: 4, scrap_metal: 6, soil: 7, clay: 3, sand: 1, water: 1 })) {
      if ((s.inventory[id] ?? 0) < quantity) gather(id, 30);
    }
    craftingSystem(s, 1); elapsed++;
  }
  function awaitStock(parts: Record<string, number>) {
    for (let time = 0; time < 2000; time++) {
      for (const [id, amount] of Object.entries(parts)) {
        if (base.has(id) && (s.inventory[id] ?? 0) < amount) gather(id, amount - (s.inventory[id] ?? 0));
      }
      if (Object.entries(parts).every(([id, amount]) => (s.inventory[id] ?? 0) + 1e-8 >= amount)) return;
      tick();
    }
    assert.fail(`Unreachable stock: ${JSON.stringify(parts)}`);
  }
  function build(id: string) {
    progressionSystem(s);
    assert(s.buildables.find(item => item.id === id)!.unlocked, `${id} must unlock through milestones`);
    const definition = machineDefinitions[id];
    awaitStock(definition.build.parts);
    for (const [part, amount] of Object.entries(definition.build.parts)) s.inventory[part] -= amount;
    // Construction time is real elapsed simulation time, including upstream factory work.
    for (let t = 0; t < definition.buildTime; t++) tick();
    const item = entity(id, manualX++, 10);
    if (definition.provides?.hydraulic) item.pos = { x: 0, y: 0 };
    else if (definition.power.kind === 'hydraulic') item.pos = { x: hydraulicX++, y: 1 };
    s.placed.push(item);
    progressionSystem(s);
    return item;
  }
  build('workbench'); build('machine_shop'); build('kiln');
  awaitStock({ steel_plate: 6 }); progressionSystem(s);
  build('power_cube'); build('hydraulics_bench');
  for (let x = 1; x <= 6; x++) build('hydraulic_hose').pos = { x, y: 0 };
  build('soil_processor'); build('ceb_press');
  awaitStock({ brick_ceb: 12 }); progressionSystem(s);
  build('wheel_shop'); build('life_trac'); build('cnc_torch');
  awaitStock({ cut_parts: 8 }); progressionSystem(s);
  build('sawmill'); build('seed_home');
  assert.equal(s.researched!.filter(id => /^tier/.test(id)).length, 6);
  assert(s.researched!.includes('settlement'));
  assert.equal(getObjective(s).complete, true);
  assert(elapsed < 600, `Starter settlement should be reachable in reasonable factory time: ${elapsed}s`);
  for (const amount of Object.values(s.inventory)) assert(amount >= -1e-8);
  for (const amount of Object.values(reserves)) assert(amount >= 0);
  const original = getCollectionAmount(world());
  assert(getCollectionAmount(s) >= original * 3, 'LifeTrac increases purposeful gathering');
  const tiers = [...s.researched!];
  s.inventory = {};
  progressionSystem(s);
  assert.deepEqual(s.researched, tiers, 'Spending stock never loses earned technology');
});
