// 原版关键帧动画（关键帧动画.ts，照 1.20.1 KeyframeAnimations）的边界：时刻在第一帧前、正好在关键帧上、过了最后一帧、只有一帧、
// catmullrom 两头下标夹住、循环动画正好一个周期、模型里没有的骨骼。一段示例动画在一批时刻上的姿态存在 金样/关键帧动画.json。
import { describe, expect, it } from 'vitest';
import { applyAnimation, catmullrom, mthCos, mthSin, restPose, sampleChannel, toPartPoses, type AnimDef, type AnimKeyframe, type MutablePose } from './关键帧动画.ts';
import type { EntityPart } from '../model/实体模型.tsx';

const roundSig = (x: number) => Number(x.toPrecision(12)) + 0;
const keyframes: AnimKeyframe[] = [
  { t: 0, v: [0, 0, 0], interp: 'linear' },
  { t: 0.5, v: [10, -2, 4], interp: 'linear' },
  { t: 1, v: [0, 6, 0], interp: 'linear' },
];
const curve: AnimKeyframe[] = [
  { t: 0.2, v: [1, 1, 1], interp: 'catmullrom' },
  { t: 0.6, v: [3, -1, 0], interp: 'catmullrom' },
  { t: 1.0, v: [0, 2, 5], interp: 'catmullrom' },
  { t: 1.4, v: [4, 4, 4], interp: 'catmullrom' },
];
const animation: AnimDef = {
  length: 1.5,
  looping: true,
  bones: {
    head: [{ target: 'rotation', keyframes: curve }],
    body: [{ target: 'position', keyframes: keyframes }, { target: 'scale', keyframes: [{ t: 0, v: [0, 0, 0], interp: 'linear' }, { t: 1.5, v: [0.5, 0.5, 0.5], interp: 'linear' }] }],
    right_ear: [{ target: 'rotation', keyframes: keyframes }],
  },
};
const makePart = (name: string, children: EntityPart[] = []): EntityPart => ({ name, pose: { offset: [0, name === 'head' ? 24 : 12, 0], rot: [0.1, 0, 0] }, cubes: [], children }) as unknown as EntityPart;
const modelTree = makePart('root', [makePart('body', [makePart('head')])]);

describe('关键帧动画', () => {
  it('sampleChannel：第一帧前取第一帧、关键帧上取关键帧、过了最后一帧停在最后一帧', () => {
    expect(sampleChannel(keyframes, -1)).toEqual([0, 0, 0]);
    expect(sampleChannel(keyframes, 0)).toEqual([0, 0, 0]);
    expect(sampleChannel(keyframes, 0.5)).toEqual([10, -2, 4]);
    expect(sampleChannel(keyframes, 0.25)).toEqual([5, -1, 2]);
    expect(sampleChannel(keyframes, 9)).toEqual([0, 6, 0]);
    expect(sampleChannel([{ t: 0.3, v: [1, 2, 3], interp: 'linear' }], 5)).toEqual([1, 2, 3]);
    // 第一帧不在 0：之前取第一帧（catmullrom 的 p0 夹到第一帧）
    expect(sampleChannel(curve, 0)).toEqual([1, 1, 1]);
    expect(sampleChannel(curve, 1.4)).toEqual([4, 4, 4]);
  });
  it('catmullrom 两头下标夹住：第一段 p0 = 第一帧，最后一段 p3 = 最后一帧', () => {
    const firstSample = sampleChannel(curve, 0.4);
    expect(firstSample[0]).toBeCloseTo(catmullrom(0.5, 1, 1, 3, 0), 12);
    const sampled = sampleChannel(curve, 1.2);
    expect(sampled[2]).toBeCloseTo(catmullrom(0.5, 0, 5, 4, 4), 12);
  });
  it('Mth 查表的 sin、cos', () => {
    expect(mthSin(0)).toBe(0);
    expect(mthSin(Math.PI / 2)).toBeCloseTo(1, 6);
    expect(mthCos(0)).toBe(1);
    expect(mthSin(-Math.PI / 2)).toBeCloseTo(-1, 6);
    expect(Math.abs(mthSin(1.234) - Math.sin(1.234))).toBeLessThan(1e-4);
  });
  it('applyAnimation：加在静止姿态上；循环动画按长度取余；模型里没有的骨骼跳过', () => {
    const rest = restPose(modelTree);
    expect(Object.keys(rest)).toEqual(['root', 'body', 'head']);
    const pose = structuredClone(rest) as MutablePose;
    applyAnimation(pose, animation, 0.25);
    expect(pose.body!.offset).toEqual([5, 11, 2]);
    expect(pose.root).toEqual(rest.root);
    const poseCopy = structuredClone(rest) as MutablePose;
    applyAnimation(poseCopy, animation, 1.5 + 0.25);
    expect(poseCopy.body!.offset.map(roundSig)).toEqual([5, 11, 2]);
    const noLoop = structuredClone(rest) as MutablePose;
    applyAnimation(noLoop, { ...animation, looping: false }, 99);
    expect(noLoop.body!.offset).toEqual([0, 18, 0]);
    expect(toPartPoses(rest).body).toEqual({ offset: [0, 12, 0], rot: [0.1, 0, 0] });
    expect(toPartPoses(pose).body!.scale!.map(roundSig)).toEqual([1 + 0.25 / 3, 1 + 0.25 / 3, 1 + 0.25 / 3].map(roundSig));
  });
  it('一段示例动画在一批时刻上的姿态（金样）', async () => {
    const sampleTimes = Array.from({ length: 31 }, (_, i) => -0.1 + i * 0.1);
    const frameTable = sampleTimes.map((s) => {
      const p = restPose(modelTree);
      applyAnimation(p, animation, s);
      return { s: roundSig(s), ...Object.fromEntries(Object.entries(toPartPoses(p)).map(([k, v]) => [k, { offset: v.offset?.map(roundSig), rot: v.rot?.map(roundSig), scale: v.scale?.map(roundSig) }])) };
    });
    await expect(`[\n${frameTable.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`).toMatchFileSnapshot('./金样/关键帧动画.json');
  });
});
