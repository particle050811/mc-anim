// 关键帧插值（anim.ts）的金样测试：各种插值方式在一批帧上的值存在 金样/插值.json，改了插值代码这里就对不上（旧段都靠它出画面）。
// 金样只在这里用，不进渲染包、不进段指纹。真要改插值，先想清楚哪些段会变，再用 `npx vitest run -u` 重写金样。
import { describe, expect, it } from 'vitest';
import { holdTime, sample, sampleLag, sampleV, track, type Key, type VKey } from './anim.ts';

/** 金样里的数取 12 位有效数字：不同机器上末位舍入不一样时也对得上 */
const 约 = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(12)) + 0 : String(x));
const 帧们 = Array.from({ length: 49 }, (_, i) => -2 + i * 0.75);

const 键组: Record<string, Key[]> = {
  smooth: [[0, 0], [10, 5], [20, 2], [30, 2.5]],
  linear: [[0, 0, 'linear'], [10, 5, 'linear'], [20, 2]],
  const: [[0, 1, 'const'], [12, 3, 'const'], [24, -1]],
  back: [[0, 0], [10, 4, 'back'], [20, 10], [30, 0]],
  混合: [[0, 0, 'linear'], [6, 2], [14, 8, 'back'], [22, 3, 'const'], [28, 6]],
  单键: [[5, 7]],
};

describe('anim.ts 插值', () => {
  it('各插值方式在一批帧上的值（金样）', async () => {
    const 表 = Object.fromEntries(Object.entries(键组).map(([名, 键]) => [名, 帧们.map((f) => 约(sample(键, f)))]));
    const v: VKey[] = [[0, [0, 1, 2]], [8, [4, -1, 2], 'linear'], [16, [0, 0, 10]]];
    表.sampleV = 帧们.map((f) => sampleV(v, f).map(约)) as never;
    表.track = 帧们.map((f) => 约(track([[0, 0], [10, 1], [20, -2]], f)));
    const 停 = holdTime([10, 5], [20, 3]);
    表.holdTime = 帧们.map((f) => 约(停(f)));
    表.sampleLag = 帧们.map((f) => 约(sampleLag(键组.smooth!, f, 3, 停)));
    const 文 = `{\n${Object.entries(表).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;
    await expect(文).toMatchFileSnapshot('./金样/插值.json');
  });

  it('端点和关键帧上取关键帧的值，两头之外停住', () => {
    for (const 键 of Object.values(键组)) {
      expect(sample(键, 键[0]![0] - 100)).toBe(键[0]![1]);
      expect(sample(键, 键.at(-1)![0] + 100)).toBe(键.at(-1)![1]);
      // 前一段是 const 的关键帧除外：见下一条
      键.forEach(([f, v], i) => i > 0 && 键[i - 1]![2] === 'const' ? undefined : expect(sample(键, f)).toBeCloseTo(v, 12));
    }
    // const 段正好在下一个关键帧那一帧还是起点的值，过了才跳（现状如此，旧段的刀刃开关靠它对帧）
    expect(sample(键组.const!, 12)).toBe(1);
    expect(sample(键组.const!, 12.001)).toBe(3);
  });

  it('smooth 不冲过关键帧（单调的段保单调）、const 段内停在起点、linear 匀速', () => {
    const 键 = 键组.smooth!;
    for (let f = 0; f <= 30; f += 0.1) {
      const i = 键.findIndex((k, j) => j < 键.length - 1 && f >= k[0] && f <= 键[j + 1]![0]);
      const [lo, hi] = [Math.min(键[i]![1], 键[i + 1]![1]), Math.max(键[i]![1], 键[i + 1]![1])];
      const v = sample(键, f);
      expect(v).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(v).toBeLessThanOrEqual(hi + 1e-9);
    }
    expect(sample(键组.const!, 11.99)).toBe(1);
    expect(sample(键组.linear!, 2.5)).toBeCloseTo(1.25, 12);
  });

  it('back：段内 3/4 处冲过终值约 12%，段尾停稳', () => {
    const 键: Key[] = [[0, 0, 'back'], [10, 1]];
    let 最大 = -Infinity;
    for (let f = 0; f <= 10; f += 0.01) 最大 = Math.max(最大, sample(键, f));
    expect(最大).toBeGreaterThan(1.1);
    expect(最大).toBeLessThan(1.16);
    expect(sample(键, 10 - 1e-4)).toBeCloseTo(1, 3);
  });

  it('holdTime：在 at 处停 len 帧，之后整体顺延', () => {
    const 停 = holdTime([98, 12]);
    expect([90, 98, 104, 110, 120].map(停)).toEqual([90, 98, 98, 98, 108]);
  });
});
