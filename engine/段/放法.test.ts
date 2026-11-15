import { describe, expect, it } from 'vitest';
import { lineTailSec, type SoundCue } from './段定义.ts';
import { segPlayPlan } from './放法.ts';
import type { SoundTable } from './声音助手.ts';

const soundTable: SoundTable = {
  资产: { '配音/甲': { 时长: 2 }, '音效/门': { 时长: 1 } },
  台词: { 甲: { 配音: '配音/甲', 开口: 0.03, 时长: 2 }, 乙: { 配音: '配音/甲', 开口: 0, 时长: 2, 上段开口秒: -1.25 } },
};
const makeSeg = (sounds: SoundCue[], durSec = 4) => ({ 声音: sounds, 秒: durSec });

describe('段放法：台词（同 台词落点.ts）', () => {
  it('文件头 = 开口 − 开口秒，从文件头那一刻放，放到文件完多 台词尾余秒', () => {
    const [x] = segPlayPlan(makeSeg([{ 秒: 0.5, 台词: '甲' }]), soundTable, { lineGain: 1 });
    expect(x).toMatchObject({ 资产: '配音/甲', 名: '甲', 入点秒: 0, 速率: 1, 循环: false });
    expect(x!.startSec).toBeCloseTo(0.47);
    expect(x!.durSec).toBeCloseTo(2 + lineTailSec);
    expect(x!.增益(0)).toBe(1);
  });
  it('开口在段头之前：从第 0 秒起、跳过前面那截；截到段尾、同一句的下一截', () => {
    const [x] = segPlayPlan(makeSeg([{ 秒: 0.01, 台词: '甲' }], 1), soundTable, { lineGain: 0.5 });
    expect(x!.startSec).toBe(0);
    expect(x!.入点秒).toBeCloseTo(0.02);
    expect(x!.durSec).toBeCloseTo(1);
    expect(x!.增益(0.1)).toBe(0.5);
    const twoPieces = segPlayPlan(makeSeg([{ 秒: 0.2, 台词: '甲' }, { 秒: 1.25, 台词: '甲', 接上段: true }]), soundTable, { lineGain: 1 });
    const rows = twoPieces.map((s) => [s.startSec, s.durSec, s.入点秒]);
    [
      [0.17, 1.08, 0],
      [1.25, 2 - 1.08 + lineTailSec, 1.08],
    ].forEach((row, i) => row.forEach((v, j) => expect(rows[i]![j]).toBeCloseTo(v)));
  });
  it('跨段的接上段按 上段开口秒 推文件头；没有就报错', () => {
    const [x] = segPlayPlan(makeSeg([{ 秒: 0, 台词: '乙', 接上段: true }], 1), soundTable, { lineGain: 1 });
    expect([x!.startSec, x!.入点秒, x!.durSec]).toEqual([0, 1.25, 0.75 + lineTailSec]);
    expect(() => segPlayPlan(makeSeg([{ 秒: 0, 台词: '甲', 接上段: true }]), soundTable, { lineGain: 1 })).toThrow(/接上段/);
    expect(() => segPlayPlan(makeSeg([{ 秒: 0, 台词: '丙' }]), soundTable, { lineGain: 1 })).toThrow(/anim cues/);
  });
});

describe('段放法：音效、配乐', () => {
  it('cue 原样换成放法；增益照 cue增益（淡出秒、逐格增益）', () => {
    const r = segPlayPlan(
      makeSeg([
        { 秒: 0.125, 资产: '音效/门', 名: '门', 长秒: 1, 速率: 1.5, 档: '中 -20' },
        { 秒: 0, 资产: '配乐/歌', 名: '歌', 长秒: 0.5, 入点秒: 4, 增益: 0.5, fadeOutSec: 0.25 },
        { 秒: 0, 资产: '音效/门', 名: '逐', 长秒: 0.125, 增益: { 每秒: 24, 值: [1, 0.5, 0] } },
      ]),
      soundTable,
      { lineGain: 1 },
    );
    expect(r[0]).toMatchObject({ startSec: 0.125, durSec: 1, 入点秒: 0, 速率: 1.5, 档: '中 -20' });
    expect(r[1]).toMatchObject({ 入点秒: 4, 循环: false });
    expect(r[1]!.增益(0)).toBe(0.5);
    expect(r[1]!.增益(0.4)).toBeCloseTo(0.2);
    // 逐格：每秒 24 个值，格之间线性插值
    expect(r[2]!.增益(1 / 48)).toBeCloseTo(0.75);
  });
  it('同一个文件叠着放：后一声加区分标记；不叠的不加', () => {
    const r = segPlayPlan(
      makeSeg([
        { 秒: 0, 资产: '音效/门', 名: 'a', 长秒: 0.5 },
        { 秒: 0.25, 资产: '音效/门', 名: 'b', 长秒: 0.5 },
        { 秒: 1, 资产: '音效/门', 名: 'c', 长秒: 0.5 },
      ]),
      soundTable,
      { lineGain: 1 },
    );
    expect(r.map((s) => s.distinctKey)).toEqual([undefined, '段声音1', undefined]);
  });
  it('循环又带入点秒：报错', () => {
    expect(() => segPlayPlan(makeSeg([{ 秒: 0, 资产: '音效/门', 名: 'a', 长秒: 0.5, 循环: true, 入点秒: 0.2 }]), soundTable, { lineGain: 1 })).toThrow(/循环/);
  });
});
