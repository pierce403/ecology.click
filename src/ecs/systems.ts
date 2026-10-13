import type { WorldState, PlacedEntity } from './components';
import { machineDefinitions, type MachineDefinition } from '../data/machines';

const EPSILON = 1e-8;
const tileKey = (entity: PlacedEntity) => `${entity.pos.x},${entity.pos.y}`;
function neighbors(a: PlacedEntity, b: PlacedEntity) {
  return Math.abs(a.pos.x - b.pos.x) + Math.abs(a.pos.y - b.pos.y) === 1;
}
function hasInputs(state: WorldState, inputs: Record<string, number>) {
  return Object.entries(inputs).every(([id, amount]) => (state.inventory[id] ?? 0) + EPSILON >= amount);
}
function hasOutputRoom(state: WorldState, definition: MachineDefinition) {
  return !definition.outputLimit || Object.entries(definition.operate.outputs).some(
    ([id]) => (state.inventory[id] ?? 0) < definition.outputLimit!);
}
function sourceCanRun(state: WorldState, entity: PlacedEntity) {
  const definition = machineDefinitions[entity.id];
  return !definition?.fuel || (entity.fuelRemaining ?? 0) > EPSILON ||
    (state.inventory[definition.fuel.item] ?? 0) >= 1;
}

/** Cardinal hose networks carry hydraulic flow; buildings never act as invisible hoses.
 * Connected pumps add flow. When demand exceeds supply, all consumers slow proportionally.
 * Rated pressure stays constant in this simplified steady-state hydraulic model. */
export function hydraulicsSystem(state: WorldState) {
  const conduits = state.placed.filter(entity => entity.id === 'hydraulic_hose' ||
    machineDefinitions[entity.id]?.provides?.hydraulic).sort((a, b) => {
      const score = (entity: PlacedEntity) => machineDefinitions[entity.id]?.provides?.hydraulic
        ? sourceCanRun(state, entity) ? 2 : 1 : 0;
      return score(b) - score(a);
    });
  for (const entity of state.placed) {
    const definition = machineDefinitions[entity.id];
    entity.powered = definition?.power.kind !== 'hydraulic' && entity.id !== 'hydraulic_hose';
    entity.powerScale = entity.powered ? 1 : 0;
    entity.pressurePsi = 0;
    entity.powerSource = undefined;
  }
  const visited = new Set<PlacedEntity>();
  for (const start of conduits) {
    if (visited.has(start)) continue;
    const network: PlacedEntity[] = [];
    const frontier = [start];
    visited.add(start);
    while (frontier.length) {
      const current = frontier.pop()!;
      network.push(current);
      for (const candidate of conduits) {
        if (!visited.has(candidate) && neighbors(current, candidate)) {
          visited.add(candidate);
          frontier.push(candidate);
        }
      }
    }
    const sources = network.filter(entity => machineDefinitions[entity.id]?.provides?.hydraulic);
    const runningSources = sources.filter(source => sourceCanRun(state, source));
    const key = sources.length ? tileKey(sources[0]) : tileKey(start);
    const flow = runningSources.reduce((sum, entity) => sum +
      (machineDefinitions[entity.id].power.flow_gpm ?? 20), 0);
    const pressure = runningSources.reduce((max, entity) => Math.max(max,
      machineDefinitions[entity.id].power.pressure_psi ?? 2300), 0);
    const consumers = state.placed.filter(entity => {
      const definition = machineDefinitions[entity.id];
      return definition?.power.kind === 'hydraulic' && !definition.provides?.hydraulic &&
        !entity.powerSource && network.some(conduit => neighbors(entity, conduit));
    });
    const demand = consumers.reduce((sum, entity) => {
      const definition = machineDefinitions[entity.id];
      const wantsFlow = !!entity.activeInputs ||
        (hasOutputRoom(state, definition) && hasInputs(state, definition.operate.inputs) &&
          (!definition.resource || !!nodeFor(state, entity, definition)));
      return sum + (wantsFlow ? definition.power.flow_gpm ?? 4 : 0);
    }, 0);
    const scale = demand ? Math.min(1, flow / demand) : 1;
    for (const entity of network) {
      entity.powerSource = key;
      entity.pressurePsi = pressure;
      entity.powered = flow > 0;
      entity.powerScale = entity.powered ? 1 : 0;
    }
    for (const entity of consumers) {
      entity.powerSource = key;
      const definition = machineDefinitions[entity.id];
      const requiredPressure = definition.quality?.min_pressure_psi ?? definition.power.pressure_psi ?? 2000;
      entity.pressurePsi = pressure;
      entity.powered = flow > 0 && pressure >= requiredPressure;
      entity.powerScale = entity.powered ? scale : 0;
    }
  }
}

function nodeFor(state: WorldState, entity: PlacedEntity, definition: MachineDefinition) {
  return state.resources.find(node => node.type === definition.resource?.type &&
    node.pos.x === entity.pos.x && node.pos.y === entity.pos.y && node.amount > 0);
}
function workRate(state: WorldState, entity: PlacedEntity, definition: MachineDefinition) {
  let rate = definition.power.kind === 'hydraulic' ? entity.powerScale ?? 0 : 1;
  if (entity.id === 'water_well' && state.resources.some(node => node.type === 'water' && node.amount > 0 &&
      Math.abs(node.pos.x - entity.pos.x) + Math.abs(node.pos.y - entity.pos.y) <= 1)) rate *= 2;
  return rate;
}
function updateFuel(state: WorldState) {
  const activeSources: PlacedEntity[] = [];
  for (const source of state.placed) {
    const definition = machineDefinitions[source.id];
    if (!definition?.provides?.hydraulic) continue;
    const consumers = state.placed.filter(entity => entity !== source && entity.powerSource === source.powerSource &&
      machineDefinitions[entity.id]?.power.kind === 'hydraulic' &&
      !machineDefinitions[entity.id]?.provides?.hydraulic);
    const working = consumers.some(entity => {
      const consumer = machineDefinitions[entity.id];
      return !!entity.activeInputs || (hasOutputRoom(state, consumer) && hasInputs(state, consumer.operate.inputs) &&
        (!consumer.resource || !!nodeFor(state, entity, consumer)));
    });
    if (!definition.fuel) { source.status = working ? 'working' : 'idle'; continue; }
    if (working && (source.fuelRemaining ?? 0) <= EPSILON &&
        (state.inventory[definition.fuel.item] ?? 0) >= 1) {
      state.inventory[definition.fuel.item] -= 1;
      source.fuelRemaining = definition.fuel.seconds;
    }
    source.status = !sourceCanRun(state, source) ? 'no_fuel' : working ? 'working' : 'idle';
    if (working && (source.fuelRemaining ?? 0) > EPSILON) activeSources.push(source);
  }
  return activeSources;
}
function workBatch(state: WorldState, entity: PlacedEntity, dt: number) {
  const definition = machineDefinitions[entity.id];
  if (!definition || definition.provides?.hydraulic) return;
  const recipe = definition.operate;
  if (entity.id === 'seed_home') { entity.status = 'complete'; return; }
  if (!Object.keys(recipe.outputs).length) { entity.status = 'idle'; return; }
  if (!entity.activeInputs && !hasOutputRoom(state, definition)) { entity.status = 'idle'; return; }
  if (definition.power.kind === 'hydraulic' && !entity.powered) { entity.status = 'no_power'; return; }
  if (definition.resource && !entity.activeInputs && !nodeFor(state, entity, definition)) {
    entity.status = 'no_resource'; return;
  }
  if (!entity.activeInputs) {
    if (!hasInputs(state, recipe.inputs)) { entity.status = 'missing_inputs'; return; }
    const inputs = { ...recipe.inputs };
    for (const [id, amount] of Object.entries(inputs)) {
      state.inventory[id] = Math.max(0, (state.inventory[id] ?? 0) - amount);
    }
    if (definition.resource) {
      const node = nodeFor(state, entity, definition)!;
      const recovered = Math.min(definition.resource.amount, node.amount);
      node.amount -= recovered;
      inputs[`deposit:${definition.resource.type}`] = recovered;
    }
    entity.activeInputs = inputs;
    entity.progress ??= 0;
  }
  entity.status = 'working';
  const rate = workRate(state, entity, definition);
  entity.progress = (entity.progress ?? 0) + dt * rate;
  if (entity.progress + EPSILON < recipe.workTime) return;
  const recovered = definition.resource ? entity.activeInputs[`deposit:${definition.resource.type}`] : undefined;
  for (const [id, amount] of Object.entries(recipe.outputs)) {
    const output = recovered === undefined ? amount : amount * recovered / definition.resource!.amount;
    state.inventory[id] = (state.inventory[id] ?? 0) + output;
    state.production![id] = (state.production![id] ?? 0) + output;
    entity.produced ??= {};
    entity.produced[id] = (entity.produced[id] ?? 0) + output;
  }
  entity.activeInputs = undefined;
  // Keep surplus work so a 30 FPS frame and a 144 FPS frame produce at the same rate.
  entity.progress = Math.max(0, entity.progress - recipe.workTime);
}

/** Inputs are reserved once per batch; paused machinery resumes its batch when power returns.
 * Fixed maximum substeps keep production stable across long render frames. */
export function craftingSystem(state: WorldState, dt: number, onEvent?: (message: string) => void) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  state.production ??= {};
  let remaining = Math.min(dt, 60);
  while (remaining > EPSILON) {
    hydraulicsSystem(state);
    const activeSources = updateFuel(state);
    const step = Math.min(remaining, 0.1, ...activeSources.map(source => source.fuelRemaining!));
    hydraulicsSystem(state);
    for (const entity of state.placed) workBatch(state, entity, step);
    for (const source of activeSources) source.fuelRemaining = Math.max(0, (source.fuelRemaining ?? 0) - step);
    state.elapsed = (state.elapsed ?? 0) + step;
    remaining -= step;
  }
  progressionSystem(state, onEvent);
}
const cumulative = (state: WorldState, id: string) => Math.max(state.production?.[id] ?? 0, state.inventory[id] ?? 0);
const hasPlaced = (state: WorldState, id: string) => state.placed.some(entity => entity.id === id);
const tierChecks = [
  (state: WorldState) => hasPlaced(state, 'workbench') || cumulative(state, 'fastener_pack') >= 3,
  (state: WorldState) => cumulative(state, 'steel_plate') >= 6 || hasPlaced(state, 'power_cube'),
  (state: WorldState) => hasPlaced(state, 'power_cube'),
  (state: WorldState) => cumulative(state, 'brick_ceb') >= 12 || hasPlaced(state, 'life_trac'),
  (state: WorldState) => hasPlaced(state, 'life_trac') || hasPlaced(state, 'cnc_torch'),
  (state: WorldState) => cumulative(state, 'cut_parts') >= 8 || hasPlaced(state, 'sawmill')
];
const tierNames = ['Workshop', 'Power & Hydraulics', 'Earth & Habitat', 'Mobility & Handling', 'Metal Fabrication', 'Sawmill & Eco-Home'];
export function progressionSystem(state: WorldState, onEvent?: (message: string) => void) {
  state.researched ??= [];
  let legacyTier = 0;
  for (const entity of state.placed) legacyTier = Math.max(legacyTier, machineDefinitions[entity.id]?.tier ?? 0);
  for (let i = 0; i < tierChecks.length; i++) {
    const tier = i + 1;
    const key = `tier${tier}`;
    if (!state.researched.includes(key) && (tierChecks[i](state) || legacyTier >= tier)) {
      state.researched.push(key);
      onEvent?.(`Research complete: ${tierNames[i]}`);
    }
  }
  for (const item of state.buildables) {
    const tier = machineDefinitions[item.id]?.tier ?? item.tier ?? 0;
    item.unlocked = tier === 0 || state.researched.includes(`tier${tier}`);
  }
  if (hasPlaced(state, 'seed_home') && !state.researched.includes('settlement')) {
    state.researched.push('settlement');
    onEvent?.('Settlement established! Your Seed Eco-Home is complete. Keep expanding your factory.');
  }
}
export type FactoryObjective = { title: string; detail: string; progress: number; target: number; complete: boolean };
export function getObjective(state: WorldState): FactoryObjective {
  const stage = (state.researched ?? []).filter(id => /^tier[1-6]$/.test(id))
    .reduce((max, id) => Math.max(max, Number(id.slice(4))), 0);
  const goals: Omit<FactoryObjective, 'complete'>[] = [
    { title: 'Establish your workshop', detail: 'Build and place a Workbench. Gather wood and scrap from the marked deposits.', progress: hasPlaced(state, 'workbench') ? 1 : 0, target: 1 },
    { title: 'Fabricate hydraulic power', detail: 'Build a Machine Shop. Produce 6 steel plates to unlock the Power Cube.', progress: cumulative(state, 'steel_plate'), target: 6 },
    { title: 'Start the hydraulic network', detail: 'Place a Power Cube. Keep wood in the stockpile for its wood-gas engine.', progress: hasPlaced(state, 'power_cube') ? 1 : 0, target: 1 },
    { title: 'Press your first earth bricks', detail: 'Connect a Soil Processor and CEB Press to power. Soil + clay + sand + water make prepared soil.', progress: cumulative(state, 'brick_ceb'), target: 12 },
    { title: 'Build a LifeTrac', detail: 'Use the Wheel Shop and Hydraulics Bench to assemble and place your utility tractor.', progress: hasPlaced(state, 'life_trac') ? 1 : 0, target: 1 },
    { title: 'Precision metal fabrication', detail: 'Connect a CNC Torch Table. Produce 8 cut parts to unlock the Sawmill and Seed Eco-Home.', progress: cumulative(state, 'cut_parts'), target: 8 },
    { title: 'Build your Seed Eco-Home', detail: 'Produce 40 earth bricks, 24 lumber, 8 fired bricks and 6 fastener packs. Place your first home.', progress: hasPlaced(state, 'seed_home') ? 1 : 0, target: 1 }
  ];
  if (state.researched?.includes('settlement')) return { title: 'A settlement, powered by you', detail: 'Your starter home is complete. Expand your hydraulic network and production.', progress: 1, target: 1, complete: true };
  const goal = goals[Math.min(stage, goals.length - 1)];
  return { ...goal, progress: Math.min(goal.progress, goal.target), complete: false };
}
export function getMachineStatus(state: WorldState, entity: PlacedEntity): string {
  const definition = machineDefinitions[entity.id];
  if (!definition) return 'Unknown machine';
  if (entity.id === 'hydraulic_hose') return entity.powered ? 'Hydraulic line connected' : 'Connect to a Power Cube';
  if (entity.id === 'storage_shed') return '+2 resources per gathering batch';
  if (entity.id === 'life_trac') return 'Utility tractor: 3× gathering';
  if (entity.id === 'seed_home') return 'Livable starter home complete';
  if (definition.provides?.hydraulic) {
    return entity.status === 'no_fuel' ? 'Needs wood fuel' :
      `${definition.power.flow_gpm ?? 20} GPM · ${definition.power.pressure_psi ?? 2300} PSI · ${Math.ceil(entity.fuelRemaining ?? 0)}s fuel`;
  }
  if (entity.status === 'no_power') return entity.powerSource ? 'Network needs fuel or pressure' : 'Connect a Power Cube or hydraulic hose';
  if (entity.status === 'no_resource') return 'Place directly on a scrap deposit';
  if (entity.status === 'missing_inputs') {
    const missing = Object.entries(definition.operate.inputs).filter(([id, amount]) => (state.inventory[id] ?? 0) + EPSILON < amount)
      .map(([id]) => id.replace(/_/g, ' '));
    return `Needs ${missing.join(', ')}`;
  }
  if (entity.status === 'idle') return definition.outputLimit ? `Stockpile target: ${definition.outputLimit}` : 'Ready';
  const rate = workRate(state, entity, definition);
  const throughput = Object.entries(definition.operate.outputs).map(([id, amount]) =>
    `${Math.round(amount * rate * 60 / definition.operate.workTime)}/min ${id.replace(/_/g, ' ')}`).join(', ');
  const flow = definition.power.kind === 'hydraulic' ? ` · ${Math.round(rate * 100)}% flow` : '';
  return `${throughput}${flow} · ${Math.round(((entity.progress ?? 0) / definition.operate.workTime) * 100)}% batch`;
}
/** Recover reserved inputs once when a partly worked machine is removed. */
export function refundMachineInputs(state: WorldState, entity: PlacedEntity) {
  for (const [id, amount] of Object.entries(entity.activeInputs ?? {})) {
    if (id.startsWith('deposit:')) {
      const type = id.slice(8);
      const deposit = state.resources.find(node => node.type === type &&
        node.pos.x === entity.pos.x && node.pos.y === entity.pos.y);
      if (deposit) deposit.amount += amount;
      else state.resources.push({ type, pos: { ...entity.pos }, amount, maxAmount: amount });
    } else state.inventory[id] = (state.inventory[id] ?? 0) + amount;
  }
  entity.activeInputs = undefined;
  entity.progress = 0;
}
export function getCollectionAmount(state: WorldState) {
  const sheds = Math.min(5, state.placed.filter(entity => entity.id === 'storage_shed').length);
  return (5 + sheds * 2) * (hasPlaced(state, 'life_trac') ? 3 : 1);
}
