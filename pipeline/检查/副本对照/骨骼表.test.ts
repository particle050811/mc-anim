// 骨骼表正本和旧副本（2-空床、2-收集快乐、2-末地 的 插骨，一镜到底 的 mixBones）比「画出来的值」：
// 每根骨骼的 rot、pos、scale 补上缺省值（0、0、1）以后一样（副本从源码里单独取出来编，副本识别.ts）。正本自身的测试在 库/角色/骨骼表.test.ts。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFunction } from '../副本识别.ts';
import { lerp, lerpV } from '../../../engine/core/数学.ts';
import { mergeSkeleton, lerpBonePose, type SkeletonTable } from '../../../库/角色/骨骼表.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const copyFn = (file: string, fnName: string) => getFunction(file, fs.readFileSync(path.join(root, file), 'utf8'), fnName, { extra: { lerp, lerpV } }) as (...a: unknown[]) => SkeletonTable;
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
const sampleTimes = [0, 0.25, 0.5, 1, 1.5];

describe('骨骼表正本和旧副本画出来一样', () => {
  it('2-空床 的 插骨（三种字段都插）', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/段/2-空床/编排.ts', 'lerpBonePose');
    for (const t of sampleTimes) expect(snapshot(legacyFn(first, secondBones, t))).toEqual(snapshot(lerpBonePose(first, secondBones, t)));
  });
  it('2-收集快乐 的 插骨（只插 rot）', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/段/2-收集快乐/编排.ts', 'lerpBonePose');
    for (const t of sampleTimes) expect(snapshot(legacyFn(first, secondBones, t))).toEqual(snapshot(lerpBonePose(first, secondBones, t, ['rot'])));
  });
  it('2-末地 的 插骨（插 rot、pos，别的字段照抄 b）= 合并(a, b, 插骨 rot pos)', () => {
    const legacyFn = copyFn('作品/把回忆拼好给你/场/2-末地/编排.ts', 'lerpBonePose');
    for (const t of sampleTimes) expect(snapshot(legacyFn(first, secondBones, t))).toEqual(snapshot(mergeSkeleton(first, secondBones, lerpBonePose(first, secondBones, t, ['rot', 'pos']))));
  });
  it('一镜到底 的 mixBones（只插 rot，别的字段照抄 from）= 合并(from, 插骨 rot)', () => {
    const legacyFn = copyFn('作品/应力转动/场/6-暮色森林/一镜到底/画面.tsx', 'mixBones');
    for (const t of sampleTimes) expect(snapshot(legacyFn(first, secondBones, t))).toEqual(snapshot(mergeSkeleton(first, lerpBonePose(first, secondBones, t, ['rot']))));
  });
});
