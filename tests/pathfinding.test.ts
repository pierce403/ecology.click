import assert from 'node:assert/strict';
import type { Position } from '../src/ecs/components';
import { findPath } from '../src/utils/pathfinding';

const key = (position: Position) => `${position.x},${position.y}`;
function check(name: string, run: () => void) { run(); console.log(`✓ ${name}`); }
function assertRoute(start: Position, target: Position, blocked: ReadonlySet<string>, path: Position[]) {
  assert(path.length > 0);
  assert(path.length <= 80);
  assert.deepEqual(path[path.length - 1], target);
  let previous = start;
  for (const step of path) {
    assert.equal(Math.abs(step.x - previous.x) + Math.abs(step.y - previous.y), 1, 'Each movement must cross one cardinal edge');
    assert(!blocked.has(key(step)), `Route crosses an installed building at ${key(step)}`);
    previous = step;
  }
}

check('Walking follows a shortest deterministic cardinal route without the starting tile', () => {
  const start = { x: 0, y: 0 };
  const target = { x: 3, y: 2 };
  const path = findPath(start, target, new Set());
  assert.equal(path.length, 5);
  assertRoute(start, target, new Set(), path);
  assert.deepEqual(path, findPath(start, target, new Set()));
  assert(!path.some(position => key(position) === key(start)));
});

check('Installed buildings force a real detour and diagonal gaps cannot be crossed', () => {
  const start = { x: 0, y: 0 };
  const target = { x: 2, y: 0 };
  const blocked = new Set(['1,0', '0,1']);
  const path = findPath(start, target, blocked);
  assert.equal(path.length, 4);
  assertRoute(start, target, blocked, path);
  assert.deepEqual(path[0], { x: 0, y: -1 });
});

check('Negative map coordinates and an occupied starting tile remain walkable', () => {
  const start = { x: -5, y: -4 };
  const target = { x: -2, y: -6 };
  const blocked = new Set(['-5,-4', '-4,-4', '-4,-5']);
  const original = new Set(blocked);
  const path = findPath(start, target, blocked);
  assertRoute(start, target, blocked, path);
  assert.deepEqual(blocked, original, 'Routing must not mutate occupancy');
  assert.deepEqual(start, { x: -5, y: -4 });
  assert.deepEqual(target, { x: -2, y: -6 });
});

check('A wide wall can be routed around within the walking budget', () => {
  const start = { x: 0, y: 0 };
  const target = { x: 2, y: 0 };
  const blocked = new Set(Array.from({ length: 41 }, (_, index) => `1,${index - 20}`));
  const path = findPath(start, target, blocked);
  assert.equal(path.length, 44);
  assertRoute(start, target, blocked, path);
});

check('Blocked destinations and an enclosed player return no route', () => {
  const start = { x: 0, y: 0 };
  const target = { x: 2, y: 0 };
  assert.deepEqual(findPath(start, target, new Set(['2,0'])), []);
  assert.deepEqual(findPath(start, target, new Set(['1,0', '0,1', '-1,0', '0,-1'])), []);
  assert.deepEqual(findPath(start, start, new Set()), []);
});

check('Distance and obstacle detours respect both the requested and hard walking limits', () => {
  const start = { x: -40, y: 0 };
  const target = { x: 40, y: 0 };
  const path = findPath(start, target, new Set());
  assert.equal(path.length, 80);
  assertRoute(start, target, new Set(), path);
  assert.deepEqual(findPath(start, { x: 41, y: 0 }, new Set()), []);
  assert.deepEqual(findPath(start, { x: 41, y: 0 }, new Set(), 1000), []);
  assert.deepEqual(findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, new Set(['1,0']), 3), []);
  assert.equal(findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, new Set(['1,0']), 4).length, 4);
});

check('Invalid coordinates or walking limits do not create unbounded searches', () => {
  assert.deepEqual(findPath({ x: 0.5, y: 0 }, { x: 2, y: 0 }, new Set()), []);
  assert.deepEqual(findPath({ x: 0, y: 0 }, { x: Infinity, y: 0 }, new Set()), []);
  assert.deepEqual(findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, new Set(), NaN), []);
  assert.deepEqual(findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, new Set(), -2), []);
});
