// 数学正本和代表性的旧副本在同一批输入上逐个对（副本从源码里单独取出来编，不执行它所在的模块）。正本自身的测试在 engine/core/数学.test.ts。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFunction, canonicalValue, type CompileOptions } from '../副本识别.ts';
import * as M from '../../../engine/core/数学.ts';

const root = path.resolve(import.meta.dirname, '../../..');
type AnyFn = (...a: never[]) => unknown;
const copyFn = (file: string, fnName: string, options?: CompileOptions) => getFunction(file, fs.readFileSync(path.join(root, file), 'utf8'), fnName, options) as AnyFn;
const sameOutputs = (fnFirst: AnyFn, secondFn: AnyFn, argsList: readonly (readonly unknown[])[]) => {
  for (const x of argsList) expect(canonicalValue((fnFirst as (...a: unknown[]) => unknown)(...x)), JSON.stringify(x)).toEqual(canonicalValue((secondFn as (...a: unknown[]) => unknown)(...x)));
};
const gridPoints = (lo: number, hi: number, n: number) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
const unitGrid = gridPoints(0, 1, 20).map((t) => [t]);

describe('数学正本和旧副本对得上', () => {
  // 逐字等价的副本已换成 import 正本（11-15 清理），这里只留还在的、和正本有差别的副本
  it('smoothstep01：0～1 里和不夹 t 的副本一样', () => {
    sameOutputs(M.smoothstep01, copyFn('作品/把回忆拼好给你/场/2-门口/归隐她.ts', 'smoothstep'), unitGrid);
    sameOutputs(M.smoothstep01, copyFn('engine/light/大气/云.ts', 'cubicSmooth'), unitGrid);
  });
  it('hermite：把回忆的 埃尔米特（切线按帧给、另传段长）', () => {
    const hermiteFn = copyFn('作品/把回忆拼好给你/场/2-海上/编排.ts', 'hermite') as (...a: number[]) => number;
    for (const [p0, p1, m0, m1, h, s] of [[0, 2, 1, 0, 3, 0.3], [1, 4, -2, 3, 1.5, 0.75]] as const)
      expect(hermiteFn(p0, p1, m0, m1, h, s)).toBeCloseTo(M.hermite(p0, m0 * h, p1, m1 * h, s), 12);
  });
  it('mulberry32：边城的 mulberry（| 0 存状态）出的序列一样', () => {
    for (const seed of [0, 1, 42, 123456789, -5, 2 ** 32 - 1]) {
      const a = M.mulberry32(seed);
      const b = (copyFn('作品/应力转动/地点/边城/布局/共用.ts', 'mulberry') as (s: number) => () => number)(seed);
      for (let i = 0; i < 50; i++) expect(b()).toBe(a());
    }
  });
});
