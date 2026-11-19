import type { V3 } from '@engine/core/坐标.ts';
import { mulberry32 } from '@engine/core/数学.ts';
import { interpPathPos } from '@库/特效/粒子物理.ts';
import { altarCell, baseCells, cageCell } from './安息仪式时序.ts';

// 只列本片弹道能碰到的实体方块。用粒子包围盒的底面中心扫过扩张后的方块；画面半边长不参与碰撞。
const particleWidth = Math.fround(0.2);
const expandedBox = (center: readonly number[], halfWidth: number, height: number): [V3, V3] => {
  const radius = halfWidth + particleWidth / 2;
  return [[center[0] - radius, center[1] - radius, center[2] - particleWidth], [center[0] + radius, center[1] + radius, center[2] + height]];
};
const obstacles = [expandedBox(altarCell, 7 / 16, 13 / 16), expandedBox(cageCell, 0.5, 1), expandedBox([0, 0, 0], 1.5, 1)];

const moveAxis = (pos: V3, axis: 0 | 1 | 2, wanted: number): number => {
  const second = (axis + 1) % 3;
  const third = (axis + 2) % 3;
  let delta = wanted;
  for (const [low, high] of obstacles) {
    if (pos[second] <= low[second] + 1e-7 || pos[second] >= high[second] - 1e-7 || pos[third] <= low[third] + 1e-7 || pos[third] >= high[third] - 1e-7) continue;
    if (delta > 0 && pos[axis] <= low[axis]) delta = Math.min(delta, low[axis] - pos[axis]);
    if (delta < 0 && pos[axis] >= high[axis]) delta = Math.max(delta, high[axis] - pos[axis]);
  }
  pos[axis] += delta;
  return delta;
};

const ritualPath = (start: V3, velocity: V3, lifetime: number, smoke: boolean): V3[] => {
  const path = [start];
  const pos: V3 = [...start];
  const friction = Math.fround(smoke ? 0.96 : 0.98);
  const gravity = smoke ? Math.fround(-0.1) : 1;
  let stopped = false;
  for (let tick = 0; tick < lifetime; tick++) {
    if (!stopped) {
      velocity[2] -= 0.04 * gravity;
      const up = moveAxis(pos, 2, velocity[2]);
      const first = Math.abs(velocity[0]) < Math.abs(velocity[1]) ? 1 : 0;
      const other = first === 1 ? 0 : 1;
      if (moveAxis(pos, first, velocity[first]) !== velocity[first]) velocity[first] = 0;
      if (moveAxis(pos, other, velocity[other]) !== velocity[other]) velocity[other] = 0;
      stopped = Math.abs(velocity[2]) >= 1e-5 && Math.abs(up) < 1e-5;
      const groundDrag = up !== velocity[2] && velocity[2] < 0 ? Math.fround(0.7) : 1;
      const sideDrag = (smoke && up === 0 ? 1.1 : 1) * friction * groundDrag;
      velocity[0] *= sideDrag;
      velocity[1] *= sideDrag;
      velocity[2] *= friction;
    }
    path.push([...pos]);
  }
  return path;
};

// 保留本片种子原有的随机轴顺序（东、北、上）；等价于原版各向同性随机速度，额外的 +0.1 只在竖轴。
const residualVelocity = (rand: () => number): V3 => {
  const east = rand() * 2 - 1, north = rand() * 2 - 1, up = rand() * 2 - 1;
  const scale = (rand() + rand() + 1) * 0.15 * 0.4 / (Math.hypot(east, north, up) || 1);
  const residual = Math.fround(0.1);
  return [east * scale * residual, north * scale * residual, (up * scale + 0.1) * residual];
};

export const offeringDebris = (index: number, seed: number) => {
  const rand = mulberry32(seed * 2654435761 + 31);
  const lifetime = Math.floor(Math.fround(4 / Math.fround(Math.fround(Math.fround(rand()) * Math.fround(0.9)) + Math.fround(0.1))));
  const [east, north, height] = baseCells[index];
  const velocity = residualVelocity(rand);
  velocity[0] += Math.fround(0.1 * (altarCell[0] - east));
  velocity[1] += Math.fround(0.1 * (altarCell[1] - north));
  velocity[2] += Math.fround(0.3);
  const half = 0.1 * (rand() * 0.5 + 0.5);
  const left = rand() * 0.75, top = rand() * 0.75;
  const uv: [number, number, number, number] = [left, top, left + 0.25, top + 0.25];
  return { path: ritualPath([east, north, height + 1.5], velocity, lifetime, false), half, uv };
};

export const largeSmoke = (start: V3, seed: number) => {
  const rand = mulberry32(seed * 2654435761 + 53);
  const velocity = residualVelocity(rand);
  const shade = rand() * 0.3;
  const half = 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75 * 2.5;
  const lifetime = Math.floor(8 / (rand() * 0.8 + 0.2) * 2.5);
  return { path: ritualPath(start, velocity, lifetime, true), half, shade, lifetime };
};

export const ritualParticlePos = (path: V3[], age: number): V3 | null => age >= 0 && age < path.length ? interpPathPos(path, age) : null;
