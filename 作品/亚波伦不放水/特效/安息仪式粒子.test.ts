import { expect, test } from 'vitest';
import { sceneToGame } from '@engine/core/坐标.ts';
import { activatorPos, altarCenter, offeringCell, offerings } from './安息仪式时序.ts';
import { largeSmoke, offeringDebris, ritualParticlePos } from './安息仪式粒子.ts';

test('末日勋章的 GROUND 模型中心和完成光柱的出生点不是一个高度', () => {
  expect(sceneToGame(activatorPos, [898.5, 50, -299.5])).toEqual([898.5, 52.975, -299.5]);
  expect(altarCenter).toEqual([0, 0, 2.5]);
});

test('各件祭品从所在基座中心上方 1.5 格起飞；水平速度朝内，重力只沿场景 Z', () => {
  for (const index of offerings.keys()) {
    const [east, north] = offeringCell(index);
    const { path } = offeringDebris(index, 7920);
    const [start, first, second] = path;
    expect(start).toEqual([east, north, 1.5]);
    for (const axis of [0, 1]) {
      const delta = first[axis] - start[axis];
      expect(Math.abs(delta + 0.1 * start[axis])).toBeLessThan(0.019);
      expect(second[axis] - first[axis]).toBeCloseTo(delta * 0.98, 7);
    }
    expect(second[2] - first[2]).toBeCloseTo((first[2] - start[2]) * 0.98 - 0.04, 7);
  }
});

test('北侧第一个发射刻的碎片贴住祭坛侧面，继续下落到笼顶，不悬在前一刻', () => {
  const { path } = offeringDebris(0, 7920);
  expect(path[9][2]).toBeCloseTo(2.410732, 5);
  expect(path[10][1]).toBeCloseTo(7 / 16 + 0.1, 7);
  expect(path[10][2]).toBeLessThan(path[9][2]);
  expect(path[13][2]).toBe(2);
  expect(path.at(-1)).toEqual(path[13]);
  expect(ritualParticlePos(path, 10.5)?.[1]).toBeCloseTo((path[9][1] + path[10][1]) / 2, 8);
});

test('短寿命碎片在半空结束，最后一个物理步仍能被插值显示', () => {
  const { path } = offeringDebris(0, 3);
  expect(path).toHaveLength(5);
  expect(path[4][1]).toBeGreaterThan(1.8);
  expect(ritualParticlePos(path, -0.01)).toBeNull();
  expect(ritualParticlePos(path, 0.5)).toEqual(path[0]);
  expect(ritualParticlePos(path, 4.5)?.[2]).toBeCloseTo((path[3][2] + path[4][2]) / 2, 8);
  expect(ritualParticlePos(path, 5)).toBeNull();
});

test('完成的大烟从祭坛格中心上浮，寿命乘 2.5 后才取整，没有末日勋章终点', () => {
  const { path, lifetime } = largeSmoke(altarCenter, 31);
  expect(lifetime).toBe(66);
  expect(path[0]).toEqual(altarCenter);
  expect(path[2][2] - path[1][2]).toBeCloseTo((path[1][2] - path[0][2]) * 0.96 + 0.004, 7);
  expect(path.at(-1)![2]).toBeGreaterThan(activatorPos[2]);
  expect(ritualParticlePos(path, lifetime + 1)).toBeNull();
});
