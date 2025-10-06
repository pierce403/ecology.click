
export type Position = { x: number; y: number };
export type PlacedEntity = {
  id: string;            // machine id (e.g., 'power_cube', 'ceb_press')
  pos: Position;
  powered?: boolean;
};

export type WorldState = {
  gridSize: number;
  width: number;
  height: number;
  placed: PlacedEntity[];
  inventory: Record<string, number>;
  selected: string; // current placement id
};
