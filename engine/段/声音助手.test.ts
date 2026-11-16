import { afterEach, describe, expect, it } from 'vitest';
import { dbToGain, makeSoundHelper, startCollect, endCollect, MissingSoundError, type SoundTable } from './声音助手.ts';

const soundTable: SoundTable = {
  asset: { '音效/炸': { duration: 1.5, peakDb: -2, loudness: -20 }, '音效/静': { duration: 1 } },
  lines: {},
};
const { 放: play, 说: say, continueLine } = makeSoundHelper({ sec: 2, 表: soundTable, segmentName: '测试段' });

afterEach(() => {
  endCollect();
});

describe('放：一条音效 cue 只写一次，时长、峰值取声音表', () => {
  it('一个数 = 目标峰值：增益 = 10^((目标 − 峰值)/20)；默认放到文件完，名取 id 最后一节', () => {
    expect(play('音效/炸', 0.25, -8)).toEqual({ sec: 0.25, asset: '音效/炸', name: '炸', 长秒: 1.5, 增益: dbToGain(-6) });
    expect(dbToGain(-6)).toBe(0.501187);
  });
  it('截到段尾；入点秒、速率算进默认长秒；响度目标；直接给增益', () => {
    expect(play('音效/炸', 1.25).长秒).toBe(0.75);
    expect(play('音效/炸', 0, { 入点秒: 0.5 }).长秒).toBe(1);
    expect(play('音效/炸', 0, { 速率: 2 }).长秒).toBe(0.75);
    expect(play('音效/炸', 0, { loudness: -26 }).增益).toBe(dbToGain(-6));
    expect(play('音效/炸', 0, { 增益: 0.3, fadeOutSec: 0.2, 档: '中 -20', name: '大炸' })).toMatchObject({ 增益: 0.3, fadeOutSec: 0.2, 档: '中 -20', name: '大炸' });
    expect(play('音效/炸', 0, { 循环: true }).长秒).toBe(2);
    expect('增益' in play('音效/炸', 0)).toBe(false);
  });
  it('表里没有：报错说跑 anim cues；量不出峰值、峰值增益同时给都报错', () => {
    expect(() => play('音效/没有', 0)).toThrow(MissingSoundError);
    expect(() => play('音效/没有', 0)).toThrow(/测试段 的声音表里没有「音效\/没有」.*anim cues/);
    expect(() => play('音效/静', 0, -10)).toThrow(/量不出峰值/);
    expect(() => play('音效/炸', 0, { peakDb: -1, 增益: 1 })).toThrow(/只能给一个/);
  });
  it('收集模式：要过的 id 都记下来（表里有的也记，免得生成的表来回翻），缺的给很短的占位，不报错', () => {
    const collected = startCollect();
    expect(play('音效/新', 0.5, -10)).toEqual({ sec: 0.5, asset: '音效/新', name: '新', 长秒: 0.001 });
    play('音效/炸', 0);
    expect([...collected]).toEqual(['音效/新', '音效/炸']);
    endCollect();
    expect(() => play('音效/新', 0.5)).toThrow(MissingSoundError);
  });
});

describe('说、接着说', () => {
  it('台词 cue 不要数（开口、时长在画面那头用）', () => {
    expect(say('6-李樱-出征', 0.15)).toEqual({ sec: 0.15, lines: '6-李樱-出征' });
    expect(continueLine('6-李樱-出征', 0, { 长秒: 0.4 })).toEqual({ sec: 0, lines: '6-李樱-出征', 接上段: true, 长秒: 0.4 });
  });
});
