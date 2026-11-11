// 第 4、5 幕的快慢、连放和声音卡点（用户 11-11 嫌「人物动作怎么这么慢」「飞行速度也很慢」「为什么没有声音」，看完七版又要「每个法术是一直放」
// 「大招要落到他身上」「短短几秒内就死去」）：她每一下冲峰值 20～30 格/秒、2～3 帧到全速、到位前刹住；打击停顿只停索命；
// 每种法术按游戏里戴晋升之环连放的间隔一直放到他死（用户 11-11「晋升之环有 4 倍施法速度」），11 个大招都在他死前打到他；
// 第一人称的受伤晃动照原版 bobHurt（用户 11-11「我记得原版受伤是屏幕是会抖的」）；声音 cue 落在 齐放拍.ts、击败拍.ts 导出的时刻上。
// 量出来的数打在日志里（交片自查要用）。纯模块，不要模型。
import { describe, expect, it } from 'vitest';
import type { 段定义, 资产cue } from '@engine/段/段定义.ts';
import 段4 from '../../段/4-齐放/段.ts';
import 段5 from '../../段/5-击败/段.ts';
import * as 五 from './击败拍.ts';
import * as 四 from './齐放拍.ts';
import 线 from './时间线.ts';

const 帧 = 1 / 60;
const 距 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** 每一帧的速度（格/秒，前后各半帧的差分），幕内第 f 帧 */
const 帧速 = (位: (t: number) => readonly number[], 幕起: number, 幕长: number): number[] =>
  Array.from({ length: Math.round(幕长 * 60) + 1 }, (_, f) => 距(位(幕起 + (f + 0.5) * 帧), 位(幕起 + (f - 0.5) * 帧)) / 帧);
/** [起, 止] 这一段（幕内秒）里的峰值速度、几帧从「冲之前的速度 + 2 格/秒」以下加到峰值的 90%（第 4 幕两下冲之间还带着约 1.6 格/秒的漂） */
const 一段 = (速: readonly number[], 起: number, 止: number) => {
  const 段 = 速.slice(Math.floor(起 * 60), Math.ceil(止 * 60) + 1);
  const 峰 = Math.max(...段);
  const 开 = 段.findIndex((v) => v > 段[0]! + 2);
  const 到 = 段.findIndex((v) => v >= 0.9 * 峰);
  return { 峰, 加速帧: 到 - 开 + 1 };
};
const cue们 = (段: 段定义) => (段.声音 ?? []).filter((c): c is 资产cue => c.资产 !== undefined);
const 在 = (段: 段定义, 名: string) => {
  const c = cue们(段).find((x) => x.名 === 名);
  if (!c) throw new Error(`没有 cue「${名}」`);
  return c.秒;
};

describe('第 4 幕 轰炸', () => {
  const 速 = 帧速(四.亚波伦位, 四.幕起, 四.幕长);

  it('她每一下冲峰值 20～30 格/秒、3 帧内到全速，冲完刹到 3 格/秒以下', () => {
    const 表 = 四.冲们.map((c) => ({ 起: c.起, ...一段(速, c.起 - 0.05, c.止 + 0.05), 刹完: 速[Math.round(c.止 * 60)]! }));
    console.log('第 4 幕她的冲（幕内秒、峰值格/秒、几帧到全速、冲完那帧格/秒）', 表.map((x) => `${x.起.toFixed(2)}s ${x.峰.toFixed(1)} ${x.加速帧}帧 ${x.刹完.toFixed(1)}`).join('；'));
    expect(表.length).toBeGreaterThanOrEqual(3);
    for (const x of 表) {
      expect(x.峰).toBeGreaterThanOrEqual(20);
      expect(x.峰).toBeLessThanOrEqual(30);
      expect(x.加速帧).toBeLessThanOrEqual(3);
      expect(x.刹完).toBeLessThan(3);
    }
  });

  it('不悬着不动：静止（不到 0.05 格/秒）的帧只有索命那 16 帧和幕末刹停', () => {
    const 静 = 速.filter((v) => v < 0.05).length / 速.length;
    const 慢 = 速.filter((v) => v < 1).length / 速.length;
    console.log(`第 4 幕她：静止 ${(静 * 100).toFixed(1)}%、慢于 1 格/秒 ${(慢 * 100).toFixed(1)}%、平均 ${(速.reduce((a, b) => a + b) / 速.length).toFixed(2)} 格/秒`);
    expect(静).toBeLessThan(0.15);
  });

  it('打击停顿只停索命（16 帧）；停的那几帧她和他的钟不走', () => {
    expect(四.停索命.秒 * 60).toBeCloseTo(16, 9);
    const 定 = 四.亚波伦位(四.秒在(四.索命秒));
    for (let f = 1; f <= 16; f++) expect(距(四.亚波伦位(四.秒在(四.索命秒 + f * 帧)), 定)).toBeLessThan(1e-9);
    expect(距(四.亚波伦位(四.秒在(四.索命秒 + 17 * 帧)), 定)).toBeGreaterThan(0);
    const p = 四.停索命;
    expect(四.他钟(p.起 + p.秒) - 四.他钟(p.起)).toBeCloseTo(0, 9);
    expect(四.他回世界(四.他钟(p.起 + p.秒 + 0.1))).toBeCloseTo(p.起 + p.秒 + 0.1, 9);
  });

  it('连放：每种按游戏里戴晋升之环的间隔（周期刻）一直放到他死，第一轮在开幕 8 帧里；满附魔高速 5', () => {
    const 表: string[] = [];
    for (const 项 of 四.连放表) {
      const 发们 = 四.出手表.filter((x) => x.id === 项.id).map((x) => x.秒 - 四.幕起);
      expect(发们.length).toBeGreaterThan(0);
      for (const 发 of 四.出手表.filter((x) => x.id === 项.id)) expect(发.选项?.高速).toBe(5);
      if (项.id === 'killing') {
        expect(发们).toHaveLength(1);
        expect(发们[0]!).toBeCloseTo(四.索命秒, 9);
        continue;
      }
      expect(发们[0]!).toBeGreaterThanOrEqual(四.出手起 - 1e-9);
      expect(发们[0]!).toBeLessThanOrEqual(四.出手起 + 8 / 60 + 1e-9);
      for (let k = 1; k < 发们.length; k++) expect(发们[k]! - 发们[k - 1]!).toBeCloseTo(四.隔(项.id), 9);
      // 最后一发在他死前、再隔一发就过了
      expect(发们[发们.length - 1]!).toBeLessThan(四.死 - 1e-6);
      expect(发们[发们.length - 1]! + 四.隔(项.id)).toBeGreaterThanOrEqual(四.死 - 1e-9);
      expect(四.隔(项.id)).toBeCloseTo(项.周期刻 / 20, 9);
      expect(项.周期刻).toBeGreaterThanOrEqual(4);
      表.push(`${项.id} ${四.隔(项.id).toFixed(2)}s×${发们.length}`);
    }
    console.log(`第 4 幕连放 ${四.出手表.length} 发、打到他 ${四.命中们.length} 下：`, 表.join('；'));
    // 演出里画了蓄力的两个照晋升之环缩过的施法刻；雷暴不画预警圈（用户 11-11「雷暴预警圈全部删掉」）
    expect(四.出手表.find((x) => x.id === 'prisma_beam')!.选项?.施法刻).toBe(20);
    expect(四.出手表.find((x) => x.id === 'rupture')!.选项?.施法刻).toBe(30);
    expect(四.出手表.filter((x) => x.id === 'thunderstorm').every((x) => x.选项?.无预警圈)).toBe(true);
  });

  it('11 个大招都在他死之前打到他；他死在幕末（大招齐了以后头一束卫射照满），晋升之环在第一人称那一镜开头炸开', () => {
    expect(四.大招们).toHaveLength(11);
    for (const id of 四.大招们) {
      expect(四.大招落[id]).toBeDefined();
      expect(四.大招落[id]!).toBeLessThan(四.死);
    }
    expect(四.死).toBeCloseTo(四.幕长, 9);
    const 齐 = Math.max(...Object.values(四.大招落).map((x) => x!));
    const 卫射结算 = 四.命中们.filter((h) => h.id === 'prisma_beam').map((h) => h.秒);
    expect(卫射结算.every((x) => x < 齐)).toBe(true);
    expect(Object.keys(四.镜起)).toEqual(['侧', '第一人称']);
    expect(四.图腾秒 - 四.幕起).toBeGreaterThan(四.镜起.第一人称 + 0.2 - 1e-9);
    expect(四.图腾秒 - 四.幕起 + 2).toBeLessThan(四.死);
    console.log('大招第一下打到他（幕内秒）', Object.entries(四.大招落).map(([id, s]) => `${id} ${s!.toFixed(2)}`).join('；'), `；图腾 ${(四.图腾秒 - 四.幕起).toFixed(2)}；死 ${四.死.toFixed(2)}`);
  });

  it('他挨打最多 0.5 秒一下，挥剑至少隔 0.45 秒、死前 0.15 秒起不挥', () => {
    for (let i = 1; i < 四.挨打们.length; i++) expect(四.挨打们[i]!.秒 - 四.挨打们[i - 1]!.秒).toBeGreaterThanOrEqual(0.5 - 1e-9);
    for (let i = 1; i < 四.挥剑们.length; i++) expect(四.挥剑们[i]! - 四.挥剑们[i - 1]!).toBeGreaterThanOrEqual(0.45 - 1e-9);
    expect(四.挥剑们[四.挥剑们.length - 1]!).toBeLessThan(四.他钟(四.死) - 0.15);
  });

  it('幕末她停在第 5 幕开头她在的地方，第 5 幕从那儿接', () => {
    expect(距(四.亚波伦位(四.秒在(四.幕长)), 四.第五幕起位)).toBeLessThan(1e-9);
    expect(距(五.亚波伦位(五.幕起), 四.第五幕起位)).toBeLessThan(1e-9);
    expect(五.幕起).toBeCloseTo(四.秒在(四.幕长), 9);
  });

  it('声音：卡在导出的时刻上，都在段里；每一发（索命除外）离手那一帧有施放声', () => {
    const 段长 = 段4.秒;
    expect(段长).toBeCloseTo(四.幕长, 2);
    expect(在(段4, '齐放')).toBe(四.出手起);
    expect(在(段4, '索命')).toBeCloseTo(四.停索命.起, 9);
    expect(在(段4, '图腾')).toBeCloseTo(四.图腾秒 - 四.幕起, 9);
    expect(在(段4, '结界火')).toBeCloseTo(四.罩严秒, 9);
    四.挨打世界们.forEach((h, i) => expect(在(段4, `挨打${i + 1}`)).toBe(h.秒));
    四.挥剑世界们.forEach((c, i) => expect(在(段4, `挥剑${i + 1}`)).toBe(c));
    四.冲们.forEach((c, i) => expect(在(段4, `冲${i + 1}`)).toBe(c.起));
    // 施放声：同一个声音事件 0.1 秒里只留一个，所以按「有」查，不按条数
    const 施放 = cue们(段4).filter((c) => c.名.startsWith('施放-'));
    for (const 发 of 四.出手表) {
      if (发.id === 'killing') continue;
      const 离 = 发.秒 - 四.幕起;
      expect(施放.some((c) => c.名.startsWith(`施放-${发.id}-`) && Math.abs(c.秒 - 离) < 1e-9) || 施放.some((c) => Math.abs(c.秒 - 离) < 0.1)).toBe(true);
    }
    const 自己的 = cue们(段4).filter((c) => !['战斗曲-齐放', '战斗曲'].includes(c.名));
    for (const c of 自己的) {
      expect(c.秒).toBeGreaterThanOrEqual(0);
      expect(c.秒).toBeLessThan(段长);
    }
    console.log(`第 4 幕 ${cue们(段4).length} 条 cue，施放声 ${施放.length} 条`);
  });

  it('受伤晃动（原版 bobHurt）：罩严之前照无敌帧，罩严以后每刻都重来，一直歪着、一帧一帧地颤；打击停顿里定住', () => {
    const 罩刻 = Math.ceil(四.他钟(四.罩严秒) * 20);
    const 前 = 四.受伤们.filter((e) => e.刻 < 罩刻);
    const 后 = 四.受伤们.filter((e) => e.刻 >= 罩刻).map((e) => e.刻);
    expect(前.length).toBeGreaterThan(0);
    expect(后).toEqual(Array.from({ length: 后.length }, (_, i) => 罩刻 + i));
    expect(后[后.length - 1]!).toBe(Math.ceil(四.他钟(四.死) * 20) - 1);
    // 第一下打到他之前不歪
    expect(四.受伤倾(Math.min(...四.命中们.map((h) => h.秒)) - 帧).度).toBe(0);
    // 罩严以后（第一人称那一镜）每一帧 7～14 度，挨着的三帧不一样
    const 度们 = Array.from({ length: Math.floor((四.死 - 四.镜起.第一人称) * 60) }, (_, f) => 四.受伤倾(四.镜起.第一人称 + f * 帧).度);
    console.log(`第一人称受伤晃动：${Math.min(...度们).toFixed(1)}～${Math.max(...度们).toFixed(1)} 度，罩严前完整受伤 ${前.length} 下`);
    for (const d of 度们) {
      expect(d).toBeGreaterThan(7);
      expect(d).toBeLessThanOrEqual(14);
    }
    const 停 = 四.停索命;
    const 停中 = Array.from({ length: 16 }, (_, f) => 四.受伤倾(停.起 + f * 帧).度);
    expect(new Set(停中.map((d) => d.toFixed(9))).size).toBe(1);
    expect(new Set(度们.slice(0, 3).map((d) => d.toFixed(6))).size).toBe(3);
    // 她在他正前方附近：hurtDir 在 90 度上下（往下点头为主）
    for (const e of 四.受伤们) expect(Math.abs(e.向 - 90)).toBeLessThan(60);
  });

  it('战斗曲 27.0 秒那一下砸在第一轮出手那一刻：两条在 齐放出手 首尾接上，前一条的入点跟着第 2 幕长短走', () => {
    const 事 = 线.事件;
    expect(事.齐放出手.秒 - 事.开盘完.秒).toBeCloseTo(四.出手起, 9);
    const 前 = 线.声音!.find((x) => x.名 === '战斗曲')!;
    const 后 = 线.声音!.find((x) => x.名 === '战斗曲-齐放')!;
    expect(前.起秒).toBe(事.现身.秒);
    expect(前.止秒).toBe(事.齐放出手.秒);
    expect(前.入点秒! + 前.止秒! - 前.起秒).toBeCloseTo(27, 9);
    expect(后.起秒).toBe(事.齐放出手.秒);
    expect(后.入点秒).toBe(27);
    console.log(`战斗曲：现身 ${事.现身.秒.toFixed(3)} 秒起从 ${前.入点秒!.toFixed(3)} 秒放，${事.齐放出手.秒.toFixed(3)} 秒（齐放出手）接后一条`);
  });
});

describe('第 5 幕 击败', () => {
  const 速 = 帧速(五.亚波伦位, 五.幕起, 五.幕长);

  it('俯冲峰值 20～30 格/秒、3 帧内到全速；落地后滑到站住、不走路', () => {
    const 降 = 一段(速, 五.她拍.降起 - 0.05, 五.她拍.降起 + 五.她拍.降秒);
    const 落 = 五.落地 - 五.幕起;
    console.log(`第 5 幕她：俯冲峰值 ${降.峰.toFixed(1)} 格/秒 ${降.加速帧} 帧；落地 ${落.toFixed(2)} 秒、着地水平 ${速[Math.round(落 * 60)]!.toFixed(1)} 格/秒`);
    expect(降.峰).toBeGreaterThanOrEqual(20);
    expect(降.峰).toBeLessThanOrEqual(30);
    expect(降.加速帧).toBeLessThanOrEqual(3);
    expect(距(五.亚波伦位(五.站住), 五.亚波伦位(五.秒在(五.幕长)))).toBeLessThan(1e-9);
    expect(五.站住).toBeLessThan(五.秒在(五.幕长));
  });

  it('声音：他死、收盘、俯冲、落地、点重生卡在导出的时刻上', () => {
    expect(段5.秒).toBeCloseTo(五.幕长, 2);
    expect(在(段5, '他死')).toBe(0);
    expect(在(段5, '点重生')).toBe(五.光标.点);
    expect(在(段5, '收盘')).toBe(五.她拍.收起);
    expect(在(段5, '俯冲')).toBe(五.她拍.降起);
    expect(在(段5, '落地')).toBeCloseTo(五.落地 - 五.幕起, 9);
    for (const c of cue们(段5)) expect(c.秒).toBeLessThan(段5.秒);
    console.log('第 5 幕声音', [...cue们(段5)].sort((a, b) => a.秒 - b.秒).map((c) => `${c.秒.toFixed(2)} ${c.名}`).join('；'));
  });
});
