import type { Position } from '../ecs/components';

const MAX_STEPS = 80;
const MAX_NODES = 5000;
const SEARCH_RADIUS = 90;
const DIRECTIONS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const key = (position: Position) => `${position.x},${position.y}`;
const distance = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

type SearchNode = Position & { cost: number; estimate: number; order: number };
const comesFirst = (a: SearchNode, b: SearchNode) =>
  a.cost + a.estimate < b.cost + b.estimate ||
  (a.cost + a.estimate === b.cost + b.estimate &&
    (a.estimate < b.estimate || (a.estimate === b.estimate && a.order < b.order)));

/** A small priority queue keeps distant clicks from exploring every nearby tile. */
class Frontier {
  private nodes: SearchNode[] = [];

  push(node: SearchNode) {
    this.nodes.push(node);
    let index = this.nodes.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!comesFirst(this.nodes[index], this.nodes[parent])) break;
      [this.nodes[index], this.nodes[parent]] = [this.nodes[parent], this.nodes[index]];
      index = parent;
    }
  }

  pop(): SearchNode | undefined {
    const first = this.nodes[0];
    const last = this.nodes.pop();
    if (last && this.nodes.length) {
      this.nodes[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let next = index;
        if (left < this.nodes.length && comesFirst(this.nodes[left], this.nodes[next])) next = left;
        if (right < this.nodes.length && comesFirst(this.nodes[right], this.nodes[next])) next = right;
        if (next === index) break;
        [this.nodes[index], this.nodes[next]] = [this.nodes[next], this.nodes[index]];
        index = next;
      }
    }
    return first;
  }
}

/**
 * Find a shortest cardinal route around occupied grid tiles, excluding the start.
 * Search is deterministic and bounded: at most 80 steps, 5,000 expanded tiles,
 * and 90 tiles from the start. An unavailable route returns an empty array.
 * A blocked start is permitted so a player can leave a newly occupied tile.
 */
export function findPath(start: Position, target: Position, blocked: ReadonlySet<string>, maxSteps = MAX_STEPS): Position[] {
  if (![start.x, start.y, target.x, target.y].every(Number.isSafeInteger) || !Number.isFinite(maxSteps)) return [];
  const limit = Math.min(MAX_STEPS, Math.max(0, Math.floor(maxSteps)));
  const startKey = key(start);
  const targetKey = key(target);
  if (startKey === targetKey || blocked.has(targetKey) || distance(start, target) > limit) return [];

  const frontier = new Frontier();
  const costs = new Map<string, number>([[startKey, 0]]);
  const parents = new Map<string, Position>();
  let order = 0;
  frontier.push({ ...start, cost: 0, estimate: distance(start, target), order: order++ });

  let expanded = 0;
  let current: SearchNode | undefined;
  while ((current = frontier.pop()) && expanded < MAX_NODES) {
    const currentKey = key(current);
    if (costs.get(currentKey) !== current.cost) continue;
    expanded++;
    if (currentKey === targetKey) {
      const path: Position[] = [];
      let step: Position = current;
      while (key(step) !== startKey) {
        path.push({ x: step.x, y: step.y });
        step = parents.get(key(step))!;
      }
      return path.reverse();
    }

    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (!Number.isSafeInteger(next.x) || !Number.isSafeInteger(next.y)) continue;
      const nextKey = key(next);
      const cost = current.cost + 1;
      const estimate = distance(next, target);
      if (cost + estimate > limit || distance(start, next) > SEARCH_RADIUS || blocked.has(nextKey)) continue;
      if ((costs.get(nextKey) ?? Infinity) <= cost) continue;
      costs.set(nextKey, cost);
      parents.set(nextKey, current);
      frontier.push({ ...next, cost, estimate, order: order++ });
    }
  }
  return [];
}
