import type { BuildableItem } from '../ecs/components';
import workbench from './machines/workbench.json';
import machineShop from './machines/machine_shop.json';
import kiln from './machines/kiln.json';
import powerCube from './machines/power_cube.json';
import waterWell from './machines/water_well.json';
import storageShed from './machines/storage_shed.json';
import hydraulicsBench from './machines/hydraulics_bench.json';
import hydraulicHose from './machines/hydraulic_hose.json';
import scrapDrill from './machines/scrap_drill.json';
import soilProcessor from './machines/soil_processor.json';
import cebPress from './machines/ceb_press.json';
import wheelShop from './machines/wheel_shop.json';
import lifeTrac from './machines/life_trac.json';
import cncTorch from './machines/cnc_torch.json';
import sawmill from './machines/sawmill.json';
import seedHome from './machines/seed_home.json';

export type MachineDefinition = {
  id: string;
  name: string;
  description: string;
  tier: number;
  buildTime: number;
  build: { parts: Record<string, number> };
  power: { kind: string; requires?: string; flow_gpm?: number; pressure_psi?: number };
  operate: { inputs: Record<string, number>; outputs: Record<string, number>; workTime: number };
  provides?: { hydraulic?: boolean };
  fuel?: { item: string; seconds: number };
  resource?: { type: string; amount: number };
  outputLimit?: number;
  quality?: { min_pressure_psi?: number; clay_pct?: number[]; moisture?: number[] };
};

const definitions: MachineDefinition[] = [
  workbench, waterWell, storageShed, machineShop, kiln, powerCube, hydraulicHose,
  hydraulicsBench, scrapDrill, soilProcessor, cebPress, wheelShop, lifeTrac,
  cncTorch, sawmill, seedHome
];

/** Content stays JSON-first; the renderer and simulation read the same catalog. */
export const machineDefinitions: Record<string, MachineDefinition> = Object.fromEntries(
  definitions.map(definition => [definition.id, definition])
);
export const machineIds = definitions.map(definition => definition.id);
export function getMachineDefinition(id: string) { return machineDefinitions[id]; }
export function createBuildables(): BuildableItem[] {
  return definitions.map(definition => ({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    requirements: { ...definition.build.parts },
    buildTime: definition.buildTime,
    unlocked: definition.tier === 0,
    tier: definition.tier
  }));
}
