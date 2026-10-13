
export type Position = { x: number; y: number };
export type MachineStatus = 'working' | 'no_power' | 'missing_inputs' | 'no_resource' | 'idle' | 'no_fuel' | 'complete';
export type PlacedEntity = {
  id: string;            // machine id (e.g., 'power_cube', 'ceb_press')
  pos: Position;
  powered?: boolean;
  /** Elapsed work in the current batch; inputs are reserved when a batch starts. */
  progress?: number;
  status?: MachineStatus;
  /** Fraction of requested hydraulic flow supplied by its connected power network. */
  powerScale?: number;
  pressurePsi?: number;
  powerSource?: string;
  fuelRemaining?: number;
  activeInputs?: Record<string, number>;
  produced?: Record<string, number>;
};

export type Player = {
  pos: Position;
  health: number;
  thirst: number;
  energy: number;
};

export type ResourceNode = {
  pos: Position;
  type: string; // 'soil', 'sand', 'clay', 'wood', 'scrap_metal', 'water'
  amount: number;
  maxAmount: number;
};

export type BuildableItem = {
  id: string;
  name: string;
  description: string;
  requirements: Record<string, number>; // resource requirements
  buildTime: number; // in seconds
  unlocked: boolean;
  tier?: number;
};

export type BuildQueueItem = {
  id: string;
  name: string;
  timeRemaining: number;
  totalTime: number;
};

export type WorldState = {
  gridSize: number;
  width: number;
  height: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  placed: PlacedEntity[];
  player: Player;
  resources: ResourceNode[];
  inventory: Record<string, number>;
  selected: string; // current placement id
  buildables: BuildableItem[];
  buildQueue: BuildQueueItem[];
  /** Cumulative output keeps milestones unlocked even after materials are spent. */
  production?: Record<string, number>;
  researched?: string[];
  elapsed?: number;
};
