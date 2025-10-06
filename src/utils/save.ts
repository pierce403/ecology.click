
export type SaveState = {
  placed: Array<{ id: string; x: number; y: number }>;
  inventory: Record<string, number>;
};

const KEY = 'ecology.click/save';

export function save(state: SaveState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function load(): SaveState | null {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) as SaveState : null;
}
