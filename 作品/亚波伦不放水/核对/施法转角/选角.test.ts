import { expect, it } from 'vitest';
import { deg } from '@engine/core/数学.ts';
import { releaseRig } from '../../场/1-台地/绕拍.ts';
import { perform, secAt } from '../../场/1-台地/编排-齐放.ts';
import { wheelPlace } from '../../场/1-台地/编排-开盘.ts';
import { staffTipPlatePose } from '../../界面/杖尖盘位姿.ts';
import { chestToDiscPx, replayStartSec, reviewCamera, reviewDuration, turnSample } from './选角.ts';

it('逐帧验向内绕的人盘投影间距单调缩短；方位角以北为零、顺时针为正，不调焦距或半径', () => {
  const camera = releaseRig(0);
  const pivot = perform.在(secAt(0)).props.pose.loc;
  const disc = staffTipPlatePose(perform.杖(secAt(0)), wheelPlace).心;
  const gap = (rig: typeof camera) => chestToDiscPx(rig, pivot, disc, { width: 1280, height: 720 });
  const bearing = (pos: typeof pivot) => deg(Math.atan2(pos[0] - pivot[0], pos[1] - pivot[1]));
  const radius = (pos: typeof pivot) => Math.hypot(pos[1] - pivot[1], pos[0] - pivot[0]);
  let lastDeg = 0;
  let lastGap = gap(camera);
  for (let frame = 0; frame < replayStartSec * 60; frame++) {
    const { orbitOffsetDeg } = turnSample(frame / 60);
    const { rig, measuredDeg } = reviewCamera(camera, pivot, orbitOffsetDeg);
    const actualDeg = (bearing(rig.pos) - bearing(camera.pos) + 540) % 360 - 180;
    expect(actualDeg).toBeCloseTo(orbitOffsetDeg, 9);
    expect(measuredDeg).toBeCloseTo(actualDeg, 9);
    expect(actualDeg).toBeLessThanOrEqual(lastDeg + 1e-9);
    expect(gap(rig)).toBeLessThanOrEqual(lastGap + 1e-9);
    expect(rig.pos[2]).toBe(camera.pos[2]);
    expect(radius(rig.pos)).toBeCloseTo(radius(camera.pos), 10);
    expect(rig.tgt).toBe(camera.tgt);
    expect(rig.lens).toBe(camera.lens);
    lastDeg = actualDeg;
    lastGap = gap(rig);
  }
  expect(lastDeg).toBeCloseTo(-30, 9);
  expect(lastGap).toBeLessThan(gap(camera) * 0.8);
  expect(gap(reviewCamera(camera, pivot, 30).rig)).toBeGreaterThan(gap(camera));
  expect(turnSample(reviewDuration - 1 / 60)).toEqual({ beforePeakSec: 0, orbitOffsetDeg: -30 });
});

it('四个选角点取同一亮盘时刻；每档读数是相对原机位的偏角', () => {
  for (const [sec, orbitOffsetDeg] of [[2.2, 0], [3.75, -10], [5.3, -20], [7, -30]] as const) {
    expect(turnSample(sec)).toEqual({ beforePeakSec: 0, orbitOffsetDeg });
  }
});
