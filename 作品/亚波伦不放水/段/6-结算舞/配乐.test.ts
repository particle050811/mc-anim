import { expect, it } from 'vitest';
import { segPlayPlan } from '@engine/段/放法.ts';
import settlement from './段.ts';
import soundTable from './声音表.生成.ts';

const plan = segPlayPlan(settlement, soundTable, { lineGain: 1 });
const body = plan[0]!;

it('完整歌曲与参考舞对齐：只用一个不循环的片段，按原速顺播到原舞结束', () => {
  expect(plan).toHaveLength(1);
  expect(body).toMatchObject({ asset: '配乐/结算舞/DreamFunk忘情牛肉面', startSec: 0, 入点秒: 0.2355, durSec: 14.1, 速率: 1, 循环: false });
  expect(body.入点秒 + body.durSec).toBeCloseTo(14.3355, 6);
});

it('846 帧全程有音乐，39 秒附近不重起，只在原舞最后 0.24 秒淡出', () => {
  expect(settlement.sec * 60).toBe(846);
  expect(body.startSec + body.durSec).toBeCloseTo(settlement.sec, 9);
  const gain = 10 ** ((-18 - soundTable.asset[body.asset]!.loudness!) / 20);
  for (const level of [body.增益(0), body.增益(12.45), body.增益(body.durSec - 0.24)]) {
    expect(level).toBeCloseTo(gain, 6);
  }
  expect(body.增益(body.durSec - 0.12)).toBeCloseTo(gain / 2, 5);
  expect(body.增益(body.durSec)).toBe(0);
});
