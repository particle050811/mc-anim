// 关键帧插值（anim.ts）的金样测试：各种插值方式在一批帧上的值存在 金样/插值.json，改了插值代码这里就对不上（旧段都靠它出画面）。
// 金样只在这里用，不进渲染包、不进段指纹。真要改插值，先想清楚哪些段会变，再用 `npx vitest run -u` 重写金样。
import { describe, expect, it } from 'vitest';
import { holdTime, sample, sampleLag, sampleV, track, type Key, type VKey } from './anim.ts';

/** 金样里的数取 12 位有效数字：不同机器上末位舍入不一样时也对得上 */
const roundSig = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(12)) + 0 : String(x));
const times = Array.from({ length: 49 }, (_, i) => -2 + i * 0.75);

const keyGroups: Record<string, Key[]> = {
  smooth: [[0, 0], [10, 5], [20, 2], [30, 2.5]],
  linear: [[0, 0, 'linear'], [10, 5, 'linear'], [20, 2]],
  const: [[0, 1, 'const'], [12, 3, 'const'], [24, -1]],
  back: [[0, 0], [10, 4, 'back'], [20, 10], [30, 0]],
  混合: [[0, 0, 'linear'], [6, 2], [14, 8, 'back'], [22, 3, 'const'], [28, 6]],
  单键: [[5, 7]],
};

describe('anim.ts 插值', () => {
  it('各插值方式在一批帧上的值（金样）', async () => {
    const sampleTable = Object.fromEntries(Object.entries(keyGroups).map(([groupName, keys]) => [groupName, times.map((f) => roundSig(sample(keys, f)))]));
    const v: VKey[] = [[0, [0, 1, 2]], [8, [4, -1, 2], 'linear'], [16, [0, 0, 10]]];
    sampleTable.sampleV = times.map((f) => sampleV(v, f).map(roundSig)) as never;
    sampleTable.track = times.map((f) => roundSig(track([[0, 0], [10, 1], [20, -2]], f)));
    const holdMap = holdTime([10, 5], [20, 3]);
    sampleTable.holdTime = times.map((f) => roundSig(holdMap(f)));
    sampleTable.sampleLag = times.map((f) => roundSig(sampleLag(keyGroups.smooth!, f, 3, holdMap)));
    const dumpText = `{\n${Object.entries(sampleTable).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;
    await expect(dumpText).toMatchFileSnapshot('./金样/插值.json');
  });

  it('端点和关键帧上取关键帧的值，两头之外停住', () => {
    for (const keys of Object.values(keyGroups)) {
      expect(sample(keys, keys[0]![0] - 100)).toBe(keys[0]![1]);
      expect(sample(keys, keys.at(-1)![0] + 100)).toBe(keys.at(-1)![1]);
      // 前一段是 const 的关键帧除外：见下一条
      keys.forEach(([f, v], i) => i > 0 && keys[i - 1]![2] === 'const' ? undefined : expect(sample(keys, f)).toBeCloseTo(v, 12));
    }
    // const 段正好在下一个关键帧那一帧还是起点的值，过了才跳（现状如此，旧段的刀刃开关靠它对帧）
    expect(sample(keyGroups.const!, 12)).toBe(1);
    expect(sample(keyGroups.const!, 12.001)).toBe(3);
  });

  it('smooth 不冲过关键帧（单调的段保单调）、const 段内停在起点、linear 匀速', () => {
    const keys = keyGroups.smooth!;
    for (let f = 0; f <= 30; f += 0.1) {
      const i = keys.findIndex((k, j) => j < keys.length - 1 && f >= k[0] && f <= keys[j + 1]![0]);
      const [lo, hi] = [Math.min(keys[i]![1], keys[i + 1]![1]), Math.max(keys[i]![1], keys[i + 1]![1])];
      const v = sample(keys, f);
      expect(v).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(v).toBeLessThanOrEqual(hi + 1e-9);
    }
    expect(sample(keyGroups.const!, 11.99)).toBe(1);
    expect(sample(keyGroups.linear!, 2.5)).toBeCloseTo(1.25, 12);
  });

  it('back：段内 3/4 处冲过终值约 12%，段尾停稳', () => {
    const keys: Key[] = [[0, 0, 'back'], [10, 1]];
    let maxValue = -Infinity;
    for (let f = 0; f <= 10; f += 0.01) maxValue = Math.max(maxValue, sample(keys, f));
    expect(maxValue).toBeGreaterThan(1.1);
    expect(maxValue).toBeLessThan(1.16);
    expect(sample(keys, 10 - 1e-4)).toBeCloseTo(1, 3);
  });

  it('holdTime：在 at 处停 len 帧，之后整体顺延', () => {
    const holdMap = holdTime([98, 12]);
    expect([90, 98, 104, 110, 120].map(holdMap)).toEqual([90, 98, 98, 98, 108]);
  });
});
