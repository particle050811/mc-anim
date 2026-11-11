// 第 4、5 幕的快慢和声音卡点（用户 11-11 嫌「人物动作怎么这么慢」「飞行速度也很慢」「为什么没有声音」）：
// 她每一下冲峰值 20～30 格/秒、2～3 帧到全速、到位前刹住；打击停顿只停最重的两下、停的时候她和他真定住；
// 声音 cue 落在 齐放拍.ts、击败拍.ts 导出的时刻上。量出来的数打在日志里（交片自查要用）。纯模块，不要模型。
import { describe, expect, it } from 'vitest';
import type { 段定义, 资产cue } from '@engine/段/段定义.ts';
import 段4 from '../../段/4-齐放/段.ts';
import 段5 from '../../段/5-击败/段.ts';
import * as 五 from './击败拍.ts';
import * as 四 from './齐放拍.ts';

const 帧 = 1 / 60;
const 距 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** 每一帧的速度（格/秒，前后各半帧的差分），幕内第 f 帧 */
const 帧速 = (位: (t: number) => readonly number[], 幕起: number, 幕长: number): number[] =>
  Array.from({ length: Math.round(幕长 * 60) + 1 }, (_, f) => 距(位(幕起 + (f + 0.5) * 帧), 位(幕起 + (f - 0.5) * 帧)) / 帧);
/** [起, 止] 这一段（幕内秒）里的峰值速度、几帧从 2 格/秒以下加到峰值的 90% */
const 一段 = (速: readonly number[], 起: number, 止: number) => {
  const 段 = 速.slice(Math.floor(起 * 60), Math.ceil(止 * 60) + 1);
  const 峰 = Math.max(...段);
  const 开 = 段.findIndex((v) => v > 2);
  const 到 = 段.findIndex((v) => v >= 0.9 * 峰);
  return { 峰, 加速帧: 到 - 开 + 1 };
};
const cue们 = (段: 段定义) => (段.声音 ?? []).filter((c): c is 资产cue => c.资产 !== undefined);
const 在 = (段: 段定义, 名: string) => {
  const c = cue们(段).find((x) => x.名 === 名);
  if (!c) throw new Error(`没有 cue「${名}」`);
  return c.秒;
};

describe('第 4 幕 齐放', () => {
  const 速 = 帧速(四.亚波伦位, 四.幕起, 四.幕长);

  it('她每一下冲峰值 20～30 格/秒、3 帧内到全速，冲完刹到 3 格/秒以下', () => {
    const 表 = 四.冲们.map((c) => ({ 起: c.起, ...一段(速, c.起 - 0.05, c.起 + c.秒 + 0.05), 刹完: 速[Math.round((c.起 + c.秒) * 60)]! }));
    console.log('第 4 幕她的冲（幕内秒、峰值格/秒、几帧到全速、冲完那帧格/秒）', 表.map((x) => `${x.起.toFixed(2)}s ${x.峰.toFixed(1)} ${x.加速帧}帧 ${x.刹完.toFixed(1)}`).join('；'));
    for (const x of 表) {
      expect(x.峰).toBeGreaterThanOrEqual(20);
      expect(x.峰).toBeLessThanOrEqual(30);
      expect(x.加速帧).toBeLessThanOrEqual(3);
      expect(x.刹完).toBeLessThan(3);
    }
  });

  it('出手的后坐力：挥到位那一帧还在原地，之后 2 帧内崩到峰值', () => {
    const 崩 = 一段(速, 四.拍.放, 四.拍.放 + 0.3);
    console.log(`出手后坐力峰值 ${崩.峰.toFixed(1)} 格/秒、${崩.加速帧} 帧到`);
    expect(速[Math.round(四.拍.放 * 60) - 1]).toBeLessThan(0.5);
    expect(崩.加速帧).toBeLessThanOrEqual(3);
  });

  it('静止占比（不到 0.05 格/秒的帧）：只有出手前的蓄势、索命那 16 帧和幕末刹停', () => {
    const 静 = 速.filter((v) => v < 0.05).length / 速.length;
    const 慢 = 速.filter((v) => v < 1).length / 速.length;
    console.log(`第 4 幕她：静止 ${(静 * 100).toFixed(1)}%、慢于 1 格/秒 ${(慢 * 100).toFixed(1)}%、平均 ${(速.reduce((a, b) => a + b) / 速.length).toFixed(2)} 格/秒`);
    expect(静).toBeLessThan(0.15);
  });

  it('打击停顿只停索命（重 16 帧）和冰川砸中（中 10 帧）；停的那几帧她（索命）和他的钟不走', () => {
    expect(四.停索命.秒 * 60).toBeCloseTo(16, 9);
    expect(四.停冰砸.秒 * 60).toBeCloseTo(10, 9);
    const 定 = 四.亚波伦位(四.秒在(四.拍.索命));
    for (let f = 1; f <= 16; f++) expect(距(四.亚波伦位(四.秒在(四.拍.索命 + f * 帧)), 定)).toBeLessThan(1e-9);
    expect(距(四.亚波伦位(四.秒在(四.拍.索命 + 17 * 帧)), 定)).toBeGreaterThan(0);
    for (const p of [四.停索命, 四.停冰砸]) {
      expect(四.他钟(p.起 + p.秒) - 四.他钟(p.起)).toBeCloseTo(0, 9);
      expect(四.他回世界(四.他钟(p.起 + p.秒 + 0.1))).toBeCloseTo(p.起 + p.秒 + 0.1, 9);
    }
    // 冰砸她不停
    expect(四.她钟(四.停冰砸.起 + 0.1) - 四.她钟(四.停冰砸.起)).toBeCloseTo(0.1, 9);
  });

  it('声音：卡在导出的时刻上，都在段里', () => {
    const 段长 = 段4.秒;
    expect(段长).toBeCloseTo(四.幕长, 2);
    expect(在(段4, '齐放')).toBe(四.拍.放);
    expect(在(段4, '收缩')).toBe(四.拍.收缩);
    expect(在(段4, '索命')).toBeCloseTo(四.拍.索命, 9);
    expect(在(段4, '图腾')).toBeCloseTo(四.图腾秒 - 四.幕起, 9);
    expect(在(段4, '冰川-砸中')).toBe(四.停冰砸.起);
    expect(在(段4, '结界火')).toBe(四.拍.罩严);
    expect(在(段4, '焚烧火')).toBe(四.拍.收缩);
    四.挨打世界们.forEach((h, i) => expect(在(段4, `挨打${i + 1}`)).toBe(h.秒));
    四.挥剑世界们.forEach((c, i) => expect(在(段4, `挥剑${i + 1}`)).toBe(c));
    四.焚伤们.forEach((x, i) => expect(在(段4, `焚伤${i + 1}`)).toBe(x));
    四.冲们.forEach((c, i) => expect(在(段4, `冲${i + 1}`)).toBe(c.起));
    const 自己的 = cue们(段4).filter((c) => !['战斗曲-齐放', '战斗曲'].includes(c.名));
    for (const c of 自己的) {
      expect(c.秒).toBeGreaterThanOrEqual(0);
      expect(c.秒).toBeLessThan(段长);
    }
    console.log('第 4 幕声音', [...cue们(段4)].sort((a, b) => a.秒 - b.秒).map((c) => `${c.秒.toFixed(2)} ${c.名}`).join('；'));
  });
});

describe('第 5 幕 击败', () => {
  const 速 = 帧速(五.亚波伦位, 五.幕起, 五.幕长);

  it('5-01 冲、5-03 俯冲峰值 20～30 格/秒、3 帧内到全速；落地后滑到站住、不走路', () => {
    const 冲 = 一段(速, 五.她拍.冲起 - 0.05, 五.她拍.冲起 + 五.她拍.冲秒 + 0.05);
    const 降 = 一段(速, 五.她拍.降起 - 0.05, 五.她拍.降起 + 五.她拍.降秒);
    const 落 = 五.落地 - 五.幕起;
    console.log(`第 5 幕她：5-01 冲峰值 ${冲.峰.toFixed(1)} 格/秒 ${冲.加速帧} 帧；俯冲峰值 ${降.峰.toFixed(1)} 格/秒 ${降.加速帧} 帧；落地 ${落.toFixed(2)} 秒、着地水平 ${速[Math.round(落 * 60)]!.toFixed(1)} 格/秒`);
    for (const x of [冲, 降]) {
      expect(x.峰).toBeGreaterThanOrEqual(20);
      expect(x.峰).toBeLessThanOrEqual(30);
      expect(x.加速帧).toBeLessThanOrEqual(3);
    }
    // 站住以后不再挪
    expect(距(五.亚波伦位(五.站住), 五.亚波伦位(五.秒在(五.幕长)))).toBeLessThan(1e-9);
    expect(五.站住).toBeLessThan(五.秒在(五.幕长));
  });

  it('5-01 从第 4 幕末停的地方起', () => {
    expect(距(五.亚波伦位(五.幕起), 四.亚波伦位(四.秒在(四.幕长)))).toBeLessThan(1e-9);
    expect(五.幕起).toBeCloseTo(四.秒在(四.幕长), 9);
  });

  it('声音：他死、点重生、收盘、落地卡在导出的时刻上', () => {
    expect(段5.秒).toBeCloseTo(五.幕长, 2);
    expect(在(段5, '他死')).toBe(0);
    expect(在(段5, '点重生')).toBe(五.镜起.二 + 五.光标.点);
    expect(在(段5, '收盘')).toBe(五.她拍.收起);
    expect(在(段5, '俯冲')).toBe(五.她拍.降起);
    expect(在(段5, '落地')).toBeCloseTo(五.落地 - 五.幕起, 9);
    console.log('第 5 幕声音', [...cue们(段5)].sort((a, b) => a.秒 - b.秒).map((c) => `${c.秒.toFixed(2)} ${c.名}`).join('；'));
  });
});
