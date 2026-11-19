import { expect, it } from 'vitest';
import { segFps } from '@engine/段/段定义.ts';
import { afterAppear, actStart, yaBoLunFacing, yaBoLunPos, steveEye } from './编排-开盘.ts';
import { perform, secAt } from './编排-齐放.ts';
import { castStart, steveEye as trappedEye, yaBoLunPos as firingPosition } from './齐放拍.ts';
import { actDur, beats, toClipSec, toWorldSec } from './开盘拍.ts';
import { orbitBeat, orbitRig } from './绕拍.ts';
import timeline from './时间线.ts';

const wrap = (angle: number) => ((angle % 360 + 540) % 360) - 180;
const frameSamples = <Sample>(start: number, end: number, sample: (sec: number) => Sample) =>
  Array.from({ length: Math.floor(end * segFps) - Math.ceil(start * segFps) + 1 }, (_, index) => sample((Math.ceil(start * segFps) + index) / segFps));
const steps = (angles: number[]) => angles.slice(1).map((angle, index) => wrap(angle - angles[index]!));
const travel = (angles: number[]) => steps(angles).reduce((sum, delta) => sum + Math.abs(delta), 0);

it('土台上的转身按收拍朝向一次转到位，不先追着走动的史蒂夫往回拧', () => {
  const appear = timeline.events.yaBoLunAppears.sec;
  const angles = frameSamples(appear + 1, appear + 1.35, sceneSec => yaBoLunFacing(afterAppear(sceneSec)));
  expect(travel(angles)).toBeCloseTo(Math.abs(wrap(angles.at(-1)! - angles[0]!)), 6);
});

it('二冲穿身只转一次短弧，开盘后的小幅跟瞄也不把人物拽回大半圈', () => {
  const facing = (sec: number) => yaBoLunFacing(actStart + toWorldSec(sec));
  const angles = frameSamples(orbitBeat.start, toClipSec(beats.openWheelSec), facing);
  const shortest = wrap(angles.at(-1)! - angles[0]!);
  expect(shortest).toBeGreaterThan(0);
  expect(wrap(facing(actDur) - angles.at(-1)!)).toBeCloseTo(32, 3);
  expect(travel(angles)).toBeCloseTo(shortest, 4);
  const wholeShot = frameSamples(orbitBeat.start, actDur, facing);
  expect(travel(wholeShot)).toBeLessThan(120);
  expect(Math.max(...steps(wholeShot).map(Math.abs))).toBeLessThan(10);
});

it('亮盘前已经转向目标，第一轮离手前后不补转、不扭腰', () => {
  for (const sec of frameSamples(toClipSec(beats.aimSettleSec), actDur, sec => sec)) {
    const time = actStart + toWorldSec(sec), body = yaBoLunPos(time), eye = steveEye(time);
    const target = Math.atan2(body[0] - eye[0], eye[1] - body[1]) * 180 / Math.PI;
    expect(Math.abs(wrap(yaBoLunFacing(time) - target))).toBeLessThan(0.01);
  }
  for (const sec of frameSamples(0, castStart + 0.32, sec => sec)) {
    const {pose, bonePose} = perform.在(secAt(sec)).props;
    const body = firingPosition(secAt(sec));
    const target = Math.atan2(body[0] - trappedEye[0], trappedEye[1] - body[1]) * 180 / Math.PI;
    expect(Math.abs(wrap(pose.yaw - target))).toBeLessThan(0.01);
    for (const joint of ['Root', 'UpBody']) {
      const [pitch, yaw, roll] = bonePose[joint]!.rot!;
      expect(Math.abs(yaw!) + Math.abs(roll!)).toBeLessThan(1);
      expect(Math.abs(pitch!)).toBeLessThanOrEqual(sec <= castStart ? 0.01 : 2.51);
    }
  }
});

it('反绕保留半圈世界位移；正片 11 秒已看到侧面，前段不二次越过正背', () => {
  const sample = (sec: number) => {
    const time = actStart + toWorldSec(sec);
    const body = yaBoLunPos(time), camera = orbitRig(sec).pos;
    const azimuth = Math.atan2(camera[1] - body[1], camera[0] - body[0]) * 180 / Math.PI;
    return { azimuth, relative: wrap(azimuth - yaBoLunFacing(time) - 90) };
  };
  const samples = [sample(orbitBeat.start), ...frameSamples(orbitBeat.start, actDur, sample), sample(actDur)];
  const cameraSteps = steps(samples.map(({ azimuth }) => azimuth));
  expect(cameraSteps.reduce((sum, delta) => sum + delta, 0)).toBeCloseTo(180, 5);
  expect(Math.min(...cameraSteps)).toBeGreaterThanOrEqual(-1e-8);
  expect(Math.max(...samples.slice(1).map(({ relative }, index) => Math.abs(relative - samples[index]!.relative)))).toBeLessThan(10);
  expect(Math.max(...samples.map(({ relative }) => Math.abs(relative)))).toBeLessThan(175);
  expect(Math.abs(sample(11 - timeline.events.summonDone.sec).relative)).toBeLessThan(90);
});
