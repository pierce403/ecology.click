import type { WorldState } from '../ecs/components';
import { machineDefinitions } from '../data/machines';
import { techTree } from '../data/techTree';

const definitionFor = (id: string) => Object.prototype.hasOwnProperty.call(machineDefinitions, id) ? machineDefinitions[id] : undefined;
const labelFor = (id: string) => definitionFor(id)?.name ?? id.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
const quantity = (amount: number) => `${Math.round(amount * 100) / 100}`;

/** Explains the same blueprint unlock and stockpile requirements used by assembly. */
export function getAssemblyError(state: WorldState, id: string): string | null {
  const definition = definitionFor(id);
  const item = state.buildables.find(buildable => buildable.id === id);
  if (!definition || !item) return 'Unknown blueprint. Select a machine from the blueprints panel.';
  if (!item.unlocked) {
    const milestone = techTree.find(tier => tier.id === `tier${definition.tier - 1}`)?.notes?.find(note => note.label === 'Milestone')?.text;
    return `Research Tier ${definition.tier} before assembling ${definition.name}.${milestone ? ` ${milestone}` : ' Check the tech tree for its unlock milestone.'}`;
  }
  const missing = Object.entries(item.requirements)
    .filter(([part, required]) => (state.inventory[part] ?? 0) + 1e-8 < required)
    .map(([part, required]) => `${quantity(required - (state.inventory[part] ?? 0))} ${labelFor(part)}`);
  if (missing.length) return `Missing ${missing.join(', ')} to assemble ${definition.name}. Gather or produce these materials first.`;
  return null;
}

/** Returns the first placement blocker without changing inventory, queue or terrain. */
export function getPlacementError(state: WorldState, x: number, y: number): string | null {
  const definition = definitionFor(state.selected);
  if (!definition) return 'Unknown machine. Select an assembled machine from the hotbar.';
  if ((state.inventory[state.selected] ?? 0) < 1) {
    const queueIndex = state.buildQueue.findIndex(item => item.id === state.selected);
    if (queueIndex !== -1) {
      const seconds = Math.ceil(state.buildQueue.slice(0, queueIndex + 1).reduce((total, item) => total + item.timeRemaining, 0));
      return queueIndex === 0
        ? `${definition.name} is still assembling (${seconds}s remaining). Wait until it is ready before placing.`
        : `${definition.name} is queued (${seconds}s until ready). Wait until it is ready before placing.`;
    }
    const assemblyError = getAssemblyError(state, state.selected);
    return `No assembled ${definition.name} in inventory. ${assemblyError ?? 'Choose its blueprint to assemble one first.'}`;
  }
  const occupied = state.placed.find(entity => entity.pos.x === x && entity.pos.y === y);
  if (occupied) return `${labelFor(occupied.id)} already occupies this tile. Choose another tile or pack it up.`;
  if (state.selected !== 'hydraulic_hose' && state.player.pos.x === x && state.player.pos.y === y) {
    return 'The supply truck occupies this tile. Move the truck or choose another tile.';
  }
  const node = state.resources.find(resource => resource.pos.x === x && resource.pos.y === y && resource.amount > 0);
  if (definition.resource) {
    if (node?.type === definition.resource.type) return null;
    const depleted = state.resources.some(resource => resource.pos.x === x && resource.pos.y === y && resource.type === definition.resource!.type && resource.amount <= 0);
    return depleted
      ? `This scrap deposit is depleted. Place ${definition.name} on a scrap deposit with material remaining.`
      : `Place ${definition.name} directly on a live scrap deposit. Choose a marked scrap tile with material remaining.`;
  }
  if (!node || ['soil', 'sand', 'clay'].includes(node.type)) return null;
  if (node.type === 'wood') return 'Trees occupy this tile. Collect the wood first or choose open ground.';
  if (node.type === 'water') return `Cannot place ${definition.name} on water. Choose dry, open ground.`;
  if (node.type === 'scrap_metal') return 'A scrap deposit occupies this tile. Collect its scrap first or choose open ground.';
  return `A ${labelFor(node.type)} deposit occupies this tile. Clear it first or choose open ground.`;
}
