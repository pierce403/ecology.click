
export type Position = { x: number; y: number };
export type PlacedEntity = {
  id: string;            // machine id (e.g., 'power_cube', 'ceb_press')
  pos: Position;
  powered?: boolean;
};

export type Player = {
  pos: Position;
  health: number;
  thirst: number;
  energy: number;
};

export type ResourceNode = {
  pos: Position;
  type: string; // 'clay', 'water', 'stone'
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
  placed: PlacedEntity[];
  player: Player;
  resources: ResourceNode[];
  inventory: Record<string, number>;
  selected: string; // current placement id
  buildables: BuildableItem[];
  buildQueue: BuildQueueItem[];
};
