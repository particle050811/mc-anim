// 骨骼表正本：插骨、合并、叠加，和旧副本（2-空床、2-收集快乐、2-末地 的 插骨，一镜到底 的 mixBones，魔法酒狐动作 的 合并）比「画出来的值」：
// 每根骨骼的 rot、pos、scale 补上缺省值（0、0、1）以后一样。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 取函数 } from '../../pipeline/检查/副本识别.ts';
import { 叠加骨骼表, 合并骨骼表, 插骨, type 骨骼表 } from './骨骼表.ts';

const 根 = path.resolve(import.meta.dirname, '../..');
const 副本 = (文件: string, 名: string) => 取函数(文件, fs.readFileSync(path.join(根, 文件), 'utf8'), 名) as (...a: unknown[]) => 骨骼表;
const 三 = (x: number | readonly number[] | undefined, 缺: number) => (x === undefined ? [缺, 缺, 缺] : typeof x === 'number' ? [x, x, x] : [...x]);
/** 画出来的值：每根骨骼补全三种字段（没出现的骨骼 = 全缺省，不列） */
const 画 = (表: 骨骼表) =>
  Object.fromEntries(
    Object.entries(表)
      .map(([k, v]) => [k, { rot: 三(v.rot, 0), pos: 三(v.pos, 0), scale: 三(v.scale, 1) }] as const)
      .filter(([, v]) => [...v.rot, ...v.pos].some((x) => Math.abs(x) > 1e-12) || v.scale.some((x) => Math.abs(x - 1) > 1e-12))
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
const 甲: 骨骼表 = { head: { rot: [10, 0, 0] }, arm: { rot: [0, 20, 0], pos: [0, 1, 0] }, tail: { scale: 2 } };
const 乙: 骨骼表 = { head: { rot: [-10, 5, 0], pos: [0, 0, 1] }, leg: { rot: [30, 0, 0], scale: [1, 0.5, 1] }, arm: {} };
const 时刻 = [0, 0.25, 0.5, 1, 1.5];

describe('骨骼表正本', () => {
  it('插骨：两头、并集、缺省值、两边都没写的字段不出现', () => {
    expect(画(插骨(甲, 乙, 0))).toEqual(画(甲));
    expect(画(插骨(甲, 乙, 1))).toEqual(画(乙));
    const 中 = 插骨(甲, 乙, 0.5);
    expect(中.head).toEqual({ rot: [0, 2.5, 0], pos: [0, 0, 0.5] });
    expect(中.tail).toEqual({ scale: [1.5, 1.5, 1.5] });
    expect(中.leg).toEqual({ rot: [15, 0, 0], scale: [1, 0.75, 1] });
    expect(Object.keys(插骨(甲, 乙, 0.5, ['rot']).tail!)).toEqual([]);
  });
  it('合并：后面的层只盖它写了的字段', () => {
    expect(合并骨骼表(甲, { arm: { rot: [1, 2, 3] } }, { head: { pos: [0, 1, 0] } })).toEqual({
      head: { rot: [10, 0, 0], pos: [0, 1, 0] },
      arm: { rot: [1, 2, 3], pos: [0, 1, 0] },
      tail: { scale: 2 },
    });
  });
  it('叠加：rot、pos 相加，scale 相乘', () => {
    expect(叠加骨骼表(甲, { head: { rot: [5, 5, 5] }, tail: { scale: [1, 2, 3] }, leg: { pos: [1, 0, 0] } })).toEqual({
      head: { rot: [15, 5, 5] },
      arm: { rot: [0, 20, 0], pos: [0, 1, 0] },
      tail: { scale: [2, 4, 6] },
      leg: { pos: [1, 0, 0] },
    });
  });
});

describe('骨骼表正本和旧副本画出来一样', () => {
  it('2-空床 的 插骨（三种字段都插）', () => {
    const 旧 = 副本('作品/把回忆拼好给你/段/2-空床/编排.ts', '插骨');
    for (const t of 时刻) expect(画(旧(甲, 乙, t))).toEqual(画(插骨(甲, 乙, t)));
  });
  it('2-收集快乐 的 插骨（只插 rot）', () => {
    const 旧 = 副本('作品/把回忆拼好给你/段/2-收集快乐/编排.ts', '插骨');
    for (const t of 时刻) expect(画(旧(甲, 乙, t))).toEqual(画(插骨(甲, 乙, t, ['rot'])));
  });
  it('2-末地 的 插骨（插 rot、pos，别的字段照抄 b）= 合并(a, b, 插骨 rot pos)', () => {
    const 旧 = 副本('作品/把回忆拼好给你/场/2-末地/编排.ts', '插骨');
    for (const t of 时刻) expect(画(旧(甲, 乙, t))).toEqual(画(合并骨骼表(甲, 乙, 插骨(甲, 乙, t, ['rot', 'pos']))));
  });
  it('一镜到底 的 mixBones（只插 rot，别的字段照抄 from）= 合并(from, 插骨 rot)', () => {
    const 旧 = 副本('作品/应力转动/场/6-暮色森林/一镜到底/画面.tsx', 'mixBones');
    for (const t of 时刻) expect(画(旧(甲, 乙, t))).toEqual(画(合并骨骼表(甲, 插骨(甲, 乙, t, ['rot']))));
  });
  it('魔法酒狐动作 的 合并', () => {
    const 旧 = 副本('库/角色/魔法酒狐动作.ts', '合并');
    expect(旧(甲, 乙, { head: { scale: 3 } })).toEqual(合并骨骼表(甲, 乙, { head: { scale: 3 } }));
  });
});
