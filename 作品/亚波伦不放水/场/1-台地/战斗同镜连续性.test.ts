import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeCamera, projectToPicture } from '@engine/core/three换算.ts';
import { vanillaToppleAngle } from '@库/特效/原版死亡.tsx';
import { rightHandCenter } from '../../角色/娘化亚波伦.tsx';
import { steveReaction } from '../../角色/史蒂夫反应.ts';
import { actTwoShotTable } from '../../段/2-开盘/机位.ts';
import { actFiveShotTable } from '../../段/5-击败/机位.ts';
import { pickShot } from './台地机位.ts';
import { actDur as openingDuration, beats, toWorldSec } from './开盘拍.ts';
import { actStart as openingStart, perform, steveStateAt, yaBoLunFacing } from './编排-开盘.ts';
import { steveStateAt as volleySteve, steveViewAt } from './编排-齐放.ts';
import { cutoffSec, secAt as volleySec, takenHitsWorld } from './齐放拍.ts';
import { defeatedSteveAt, performAt } from './编排-击败.ts';
import { actDur as defeatDuration, secAt as defeatSec, shotStart, yaBoLunBeats } from './击败拍.ts';

const wrap = (degrees: number) => ((degrees % 360 + 540) % 360) - 180;
const openAt = (frame: number) => openingStart + toWorldSec(frame / 60);

it('瞬移落在真切点；两次冲刺前身体先横过来，收势不倒放已经转完的整圈', () => {
  const cut = Math.ceil(beats.移 * 60);
  const shot = (frame: number) => pickShot(actTwoShotTable, frame / 60, openingDuration).shot;
  expect(shot(cut - 1)).not.toBe(shot(cut));
  let lastPhase = 0, lastWeight = 0;
  for (let frame = 0; frame <= 218; frame++) {
    const world = toWorldSec(frame / 60), { surge } = steveStateAt(openingStart + world, world);
    const weight = surge?.weight ?? 0, phase = -75 * (surge?.刻 ?? 0) * weight;
    if (weight === 1) expect(surge!.刻).toBeGreaterThanOrEqual(0);
    expect(Math.abs(weight - lastWeight), `横躺 ${frame}`).toBeLessThan(0.24);
    expect(Math.abs(wrap(phase - lastPhase)), `轴转 ${frame}`).toBeLessThan(45);
    if (frame > cut && frame < beats.sinkSec * 60) expect(Math.abs(wrap(yaBoLunFacing(openAt(frame)) - yaBoLunFacing(openAt(frame - 1))))).toBeLessThan(9);
    lastPhase = phase;
    lastWeight = weight;
  }
});

it('升指过程中肩关节解不换边：减去飞行根位后的真右掌逐帧前送', () => {
  const palm = (frame: number) => {
    const { props } = perform.在(openAt(frame));
    return new Vector3(...rightHandCenter(props)).sub(new Vector3(...props.pose.loc));
  };
  for (let frame = 110; frame <= 204; frame++) expect(palm(frame).distanceTo(palm(frame - 1)), `右掌 ${frame}`).toBeLessThan(0.065);
});

it('齐放找退路时转视线而非穿过近焦点，伤害倾斜仍由受击钟叠加', () => {
  const yaw = (frame: number) => {
    const { eye, look } = steveViewAt(volleySec(frame / 60));
    return Math.atan2(look[1] - eye[1], look[0] - eye[0]) * 180 / Math.PI;
  };
  for (let frame = Math.ceil((cutoffSec - 1) * 60); frame < (cutoffSec - 0.28) * 60; frame++) expect(Math.abs(wrap(yaw(frame) - yaw(frame - 1)))).toBeLessThan(6);
});

it('第一记重击当帧见红，持剑肘随后才逐帧折起', () => {
  const first = Math.ceil(takenHitsWorld.find((hit) => hit.重)!.sec * 60 - 1e-8);
  const reaction = (frame: number) => steveReaction(volleySteve(volleySec(frame / 60)));
  const elbow = (frame: number) => reaction(frame).pose.elbowR!;
  expect(reaction(first).hurt).toBe(1);
  expect(elbow(first + 5) - elbow(first - 1)).toBeGreaterThan(12);
  for (let frame = first; frame <= first + 7; frame++) expect(Math.abs(elbow(frame) - elbow(frame - 1))).toBeLessThan(10);
});

it('死亡首拍不猛折，化烟时钟不推迟；5-02 固定，5-03 用真机位跟落地手掌', () => {
  const topple = (frame: number) => vanillaToppleAngle(defeatedSteveAt(defeatSec(frame / 60)).afterDeathSec);
  for (let frame = 1; frame < 40; frame++) expect(topple(frame) - topple(frame - 1)).toBeLessThan(7 * Math.PI / 180);
  expect(defeatedSteveAt(defeatSec(1)).afterDeathSec).toBeCloseTo(1, 9);
  const cameraAt = (sec: number) => pickShot(actFiveShotTable, sec, defeatDuration).cameraRig;
  expect(cameraAt(shotStart.deathScreen)).toEqual(cameraAt(shotStart.landing - 1 / 60));
  const picturePalm = (frame: number) => {
    const sec = frame / 60, { props } = performAt(defeatSec(sec));
    const { x, y } = projectToPicture(makeCamera(cameraAt(sec), 3840, 2160), rightHandCenter(props), 3840, 2160);
    return new Vector3(x, y, 0);
  };
  for (let frame = Math.ceil(yaBoLunBeats.descendStart * 60); frame <= (yaBoLunBeats.descendStart + yaBoLunBeats.descendSec) * 60; frame++) {
    expect(picturePalm(frame).distanceTo(picturePalm(frame - 1)), `落地手掌 ${frame}`).toBeLessThan(65);
  }
});
