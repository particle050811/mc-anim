// 骨骼表正本：插骨、合并、叠加（和旧副本 2-空床、2-收集快乐、2-末地 的 插骨，一镜到底 的 mixBones 比「画出来的值」的在 pipeline/检查/副本对照/骨骼表.test.ts）。
import { describe, expect, it } from 'vitest';
import { overlaySkeleton, mergeSkeleton, lerpBonePose, type SkeletonTable } from './骨骼表.ts';

const toVec3 = (x: number | readonly number[] | undefined, missingVal: number) => (x === undefined ? [missingVal, missingVal, missingVal] : typeof x === 'number' ? [x, x, x] : [...x]);
/** 画出来的值：每根骨骼补全三种字段（没出现的骨骼 = 全缺省，不列） */
const snapshot = (boneTable: SkeletonTable) =>
  Object.fromEntries(
    Object.entries(boneTable)
      .map(([k, v]) => [k, { rot: toVec3(v.rot, 0), pos: toVec3(v.pos, 0), scale: toVec3(v.scale, 1) }] as const)
      .filter(([, v]) => [...v.rot, ...v.pos].some((x) => Math.abs(x) > 1e-12) || v.scale.some((x) => Math.abs(x - 1) > 1e-12))
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
const first: SkeletonTable = { head: { rot: [10, 0, 0] }, arm: { rot: [0, 20, 0], pos: [0, 1, 0] }, tail: { scale: 2 } };
const secondBones: SkeletonTable = { head: { rot: [-10, 5, 0], pos: [0, 0, 1] }, leg: { rot: [30, 0, 0], scale: [1, 0.5, 1] }, arm: {} };

describe('骨骼表正本', () => {
  it('插骨：两头、并集、缺省值、两边都没写的字段不出现', () => {
    expect(snapshot(lerpBonePose(first, secondBones, 0))).toEqual(snapshot(first));
    expect(snapshot(lerpBonePose(first, secondBones, 1))).toEqual(snapshot(secondBones));
    const midBone = lerpBonePose(first, secondBones, 0.5);
    expect(midBone.head).toEqual({ rot: [0, 2.5, 0], pos: [0, 0, 0.5] });
    expect(midBone.tail).toEqual({ scale: [1.5, 1.5, 1.5] });
    expect(midBone.leg).toEqual({ rot: [15, 0, 0], scale: [1, 0.75, 1] });
    expect(Object.keys(lerpBonePose(first, secondBones, 0.5, ['rot']).tail!)).toEqual([]);
  });
  it('合并：后面的层只盖它写了的字段', () => {
    expect(mergeSkeleton(first, { arm: { rot: [1, 2, 3] } }, { head: { pos: [0, 1, 0] } })).toEqual({
      head: { rot: [10, 0, 0], pos: [0, 1, 0] },
      arm: { rot: [1, 2, 3], pos: [0, 1, 0] },
      tail: { scale: 2 },
    });
  });
  it('叠加：rot、pos 相加，scale 相乘', () => {
    expect(overlaySkeleton(first, { head: { rot: [5, 5, 5] }, tail: { scale: [1, 2, 3] }, leg: { pos: [1, 0, 0] } })).toEqual({
      head: { rot: [15, 5, 5] },
      arm: { rot: [0, 20, 0], pos: [0, 1, 0] },
      tail: { scale: [2, 4, 6] },
      leg: { pos: [1, 0, 0] },
    });
  });
});
