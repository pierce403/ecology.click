
import type { WorldState } from '../ecs/components';
import { createBuildables, machineDefinitions } from '../data/machines';

export const SAVE_KEY = 'ecology.click/factory-v2';
const LEGACY_KEY = 'ecology.click/save';
export type SaveState = { version: 2; savedAt: number; state: WorldState; chunks: string[] };

/** Store the complete simulation, including spent deposits and reserved recipe inputs. */
export function save(state: WorldState, chunks: string[] = []): boolean {
  try {
    const snapshot: SaveState = { version: 2, savedAt: Date.now(), state, chunks };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch { return false; }
}

function validState(value: unknown): value is WorldState {
  if (!value || typeof value !== 'object') return false;
  const state = value as WorldState;
  const positionValid = (position: unknown): boolean => !!position && typeof position === 'object' &&
    ['x', 'y'].every(axis => Number.isSafeInteger((position as Record<string, number>)[axis]));
  const amountsValid = (amounts: unknown): boolean => !!amounts && typeof amounts === 'object' && !Array.isArray(amounts) &&
    Object.values(amounts).every(amount => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0);
  return !!state.bounds && !!state.player?.pos && amountsValid(state.inventory) &&
    Array.isArray(state.placed) && Array.isArray(state.resources) && Array.isArray(state.buildQueue) &&
    [state.bounds.minX, state.bounds.minY, state.bounds.maxX, state.bounds.maxY,
      state.player.pos.x, state.player.pos.y].every(Number.isSafeInteger) &&
    state.bounds.maxX >= state.bounds.minX && state.bounds.maxY >= state.bounds.minY &&
    state.width === state.bounds.maxX - state.bounds.minX + 1 && state.height === state.bounds.maxY - state.bounds.minY + 1 &&
    [state.player.health, state.player.thirst, state.player.energy].every(amount => Number.isFinite(amount) && amount >= 0 && amount <= 100) &&
    state.placed.every(entity => !!entity && !!machineDefinitions[entity.id] && positionValid(entity.pos) &&
      (entity.activeInputs === undefined || amountsValid(entity.activeInputs)) &&
      (entity.produced === undefined || amountsValid(entity.produced)) &&
      (entity.progress === undefined || Number.isFinite(entity.progress) && entity.progress >= 0)) &&
    state.resources.every(node => !!node && positionValid(node.pos) &&
      ['soil', 'sand', 'clay', 'wood', 'scrap_metal', 'water'].includes(node.type) &&
      Number.isFinite(node.amount) && node.amount >= 0 && Number.isFinite(node.maxAmount) && node.maxAmount > 0 && node.amount <= node.maxAmount) &&
    state.buildQueue.every(item => !!item && !!machineDefinitions[item.id] && typeof item.name === 'string' &&
      Number.isFinite(item.totalTime) && item.totalTime > 0 && Number.isFinite(item.timeRemaining) && item.timeRemaining >= 0 && item.timeRemaining <= item.totalTime) &&
    (state.production === undefined || amountsValid(state.production)) &&
    (state.researched === undefined || Array.isArray(state.researched) && state.researched.every(id => typeof id === 'string')) &&
    (state.elapsed === undefined || Number.isFinite(state.elapsed) && state.elapsed >= 0);
}

/** Bad or blocked browser storage never prevents a fresh game from starting. */
export function load(): SaveState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const snapshot = JSON.parse(raw) as SaveState;
      if (snapshot.version === 2 && validState(snapshot.state) && Array.isArray(snapshot.chunks) &&
          snapshot.chunks.every(key => typeof key === 'string' && /^-?\d+:-?\d+$/.test(key))) {
        snapshot.state.buildables = createBuildables();
        snapshot.state.gridSize = 48;
        if (!machineDefinitions[snapshot.state.selected]) snapshot.state.selected = 'workbench';
        return snapshot;
      }
    }
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return null;
    const legacy = JSON.parse(legacyRaw) as { placed?: { id: string; x: number; y: number; pos?: { x: number; y: number } }[]; inventory?: Record<string, number> };
    if (!Array.isArray(legacy.placed) || !legacy.inventory ||
        !Object.values(legacy.inventory).every(amount => Number.isFinite(amount) && amount >= 0)) return null;
    const placed = legacy.placed.map(entity => ({ id: entity.id, pos: entity.pos ?? { x: entity.x, y: entity.y } }))
      .filter(entity => !!machineDefinitions[entity.id] && Number.isSafeInteger(entity.pos.x) && Number.isSafeInteger(entity.pos.y));
    return {
      version: 2, savedAt: Date.now(), chunks: [],
      state: {
        gridSize: 48, width: 16, height: 16, bounds: { minX: 0, minY: 0, maxX: 15, maxY: 15 },
        placed, resources: [], inventory: legacy.inventory,
        player: { pos: { x: 8, y: 8 }, health: 100, thirst: 100, energy: 100 },
        selected: 'workbench', buildables: createBuildables(), buildQueue: [], production: {}, researched: [], elapsed: 0
      }
    };
  } catch { return null; }
}
