import { describe, expect, it, vi } from 'vitest';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import segment from '../../段/6-结算舞/段.ts';
import { animSkeletonTable, GirlYaBoLunCreature } from '../娘化亚波伦.tsx';
import { bindFrontBands } from '../前襟让裙摆.ts';
import { bindDanceEyeRing } from '../舞时眼形环.ts';
import { hemYieldLeg } from '../袍摆让腿.ts';
import { composeDanceLayers, settlementAct, settlementRig } from '../结算舞姿势.ts';
import { noodleDancePose } from './忘情牛肉面.ts';
import { danceFormat, parseDanceRevision, sampleDanceRevision } from './Blender舞轨.ts';

vi.mock('./Blender修订.json', () => ({ default: { version: 1, fps: 60, frameCount: 846, bones: {
  RightArm: { rot: [[0, 0, 0, 170], [20, 0, 0, -170]] }, Head: { rot: [[0, -20, 8, 15]] },
} } }));

const model = GirlYaBoLunCreature.getModel();
const names = new Set(model.bones.map(bone => bone.name));
const read = (bones: unknown) => parseDanceRevision({ ...danceFormat, bones }, names);
const empty = read({});
const poseAt = (sec: number, revision?: typeof empty) => {
  const rig = settlementRig(sec, revision);
  return composeDanceLayers(rig.animation, rig.bonePose);
};

describe('Blender v1 舞轨', () => {
  it.each([
    null, [], { ...danceFormat }, { ...danceFormat, bones: [] },
    { ...danceFormat, bones: {}, note: true }, { ...danceFormat, fps: '60', bones: {} },
    { ...danceFormat, version: 2, bones: {} }, { ...danceFormat, frameCount: 845, bones: {} },
  ])('拒绝缺失或不匹配的文件头 %#', value => expect(() => parseDanceRevision(value, names)).toThrow(/Blender 舞轨/));

  it.each([
    { NotABone: { rot: [[0, 0, 0, 0]] } }, JSON.parse('{"__proto__":{"pos":[[0,0,0,0]]}}'),
    { RightArm: {} }, { RightArm: null }, { RightArm: { angle: [[0, 0, 0, 0]] } },
    { RightArm: { rot: [] } }, { RightArm: { pos: [[0, 1, 2]] } }, { RightArm: { scale: [[0, 1, 2, 3, 4]] } },
    ...[-1, 846, 1.2, null, '3'].map(frame => ({ RightArm: { rot: [[frame, 1, 2, 3]] } })),
    ...[Infinity, -Infinity, NaN, null, '1'].map(value => ({ RightArm: { scale: [[0, 1, value, 1]] } })),
    ...[1, 2].map(frame => ({ RightArm: { pos: [[2, 1, 2, 3], [frame, 1, 2, 3]] } })),
  ])('拒绝未知骨、错误通道、非有限数据或重复/乱序键 %#', bones => expect(() => read(bones)).toThrow(/Blender 舞轨/));

  it('绝对键值：键外保持端值，位置和缩放线性，欧拉各轴走最短弧', () => {
    const track = read({ RightArm: { rot: [[5, 179, -179, 720], [15, -179, 179, 740]],
      pos: [[5, -2, 8, 0], [15, 2, 0, 1]], scale: [[5, 0, 0, 0], [15, 1, 1, 1]] } });
    expect(sampleDanceRevision(track, 0).RightArm.rot).toEqual([179, -179, 720]);
    expect(sampleDanceRevision(track, 10).RightArm).toEqual({ rot: [180, -180, 730], pos: [0, 4, 0.5], scale: [0.5, 0.5, 0.5] });
    expect(sampleDanceRevision(track, 15 - 2e-14).RightArm.rot).toEqual([-179, 179, 740]);
    expect(sampleDanceRevision(track, 845).RightArm.pos).toEqual([2, 0, 1]);
    expect(sampleDanceRevision(empty, 0)).toEqual({});
  });

  it('空修订逐通道等于改动前正片：idle、裙摆、前襟、眼环和隐藏道具', () => {
    expect(segment.eventSec.danceStart).toBe(0);
    expect(Math.round(segment.sec * danceFormat.fps)).toBe(danceFormat.frameCount);
    const front = bindFrontBands(model), ring = bindDanceEyeRing(model);
    for (const frame of [0, 211, 423, 634, 845]) {
      const sec = frame / danceFormat.fps;
      const animation = animSkeletonTable(sec, settlementAct), dance = noodleDancePose(sec);
      const posed = composeDanceLayers(animation, dance), hem = hemYieldLeg(model, posed).bonePose;
      const original = composeDanceLayers(animation, { ...dance, ...hem, ...front({ ...posed, ...hem }), ...ring(posed) });
      const actual = poseAt(sec, empty);
      expect(actual).toEqual(original);
      for (const name of ['SheathLocator', 'BladeLocator']) expect(actual[name].scale).toEqual([0, 0, 0]);
    }
  });

  it('正片共享 rig 默认读取修订：改上臂影响掌点，改头先于眼环跟随，其余保持', () => {
    const sec = 10 / danceFormat.fps;
    const base = poseAt(sec, empty), edited = poseAt(sec);
    expect(edited.RightArm.rot).toEqual([0, 0, 180]);
    expect(edited.RightArm.pos).toEqual(base.RightArm.pos);
    expect(edited.LeftArm).toEqual(base.LeftArm);
    expect(skeletonMatrix(model, 'RightHand', base).equals(skeletonMatrix(model, 'RightHand', edited))).toBe(false);
    expect(edited.ysmGlowbone24).not.toEqual(base.ysmGlowbone24);
    const relativeRing = (pose: typeof base) => skeletonMatrix(model, 'Head', pose).invert().multiply(skeletonMatrix(model, 'ysmGlowbone24', pose));
    const before = relativeRing(base), after = relativeRing(edited);
    for (const [index, value] of before.elements.entries()) expect(after.elements[index]).toBeCloseTo(value, 10);
  });

  it('显式修订附件只覆盖所给通道，保留其跟随求出的其他通道', () => {
    const sec = 3.5;
    const base = poseAt(sec, empty);
    const edited = poseAt(sec, read({ ysmGlowbone24: { pos: [[0, 7, 8, 9]] } }));
    expect(edited.ysmGlowbone24).toEqual({ ...base.ysmGlowbone24, pos: [7, 8, 9] });
  });
});
