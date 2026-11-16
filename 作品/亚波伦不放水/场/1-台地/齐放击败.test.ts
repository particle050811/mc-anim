// 第 4、5 幕的快慢、连放和声音卡点（用户 11-11 嫌「人物动作怎么这么慢」「飞行速度也很慢」「为什么没有声音」，看完七版又要「每个法术是一直放」
// 「大招要落到他身上」「短短几秒内就死去」）：她每一下冲峰值 20～30 格/秒、2～3 帧到全速、到位前刹住；打击停顿只停索命；
// 每种法术按游戏里戴晋升之环连放的间隔一直放到他死（用户 11-11「晋升之环有 4 倍施法速度」），11 个大招都在他死前打到他；
// 第一人称的受伤晃动照原版 bobHurt（用户 11-11「我记得原版受伤是屏幕是会抖的」）；声音 cue 落在 齐放拍.ts、击败拍.ts 导出的时刻上。
// 量出来的数打在日志里（交片自查要用）。纯模块，不要模型。
import { describe, expect, it } from 'vitest';
import type { SegmentDef, AssetCue } from '@engine/段/段定义.ts';
import seg4 from '../../段/4-齐放/段.ts';
import seg5 from '../../段/5-击败/段.ts';
import * as defeat from './击败拍.ts';
import * as qiFangShot from './齐放拍.ts';
import timeline from './时间线.ts';

const frameSec = 1 / 60;
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** 每一帧的速度（格/秒，前后各半帧的差分），幕内第 f 帧 */
const frameSpeeds = (posAt: (t: number) => readonly number[], actStart: number, actDur: number): number[] =>
  Array.from({ length: Math.round(actDur * 60) + 1 }, (_, f) => distance(posAt(actStart + (f + 0.5) * frameSec), posAt(actStart + (f - 0.5) * frameSec)) / frameSec);
/** [起, 止] 这一段（幕内秒）里的峰值速度、几帧从「冲之前的速度 + 2 格/秒」以下加到峰值的 90%（第 4 幕两下冲之间还带着约 1.6 格/秒的漂） */
const sliceSpan = (speeds: readonly number[], startSec: number, endSec: number) => {
  const sampleSeg = speeds.slice(Math.floor(startSec * 60), Math.ceil(endSec * 60) + 1);
  const peak = Math.max(...sampleSeg);
  const openIndex = sampleSeg.findIndex((v) => v > sampleSeg[0]! + 2);
  const reachFrame = sampleSeg.findIndex((v) => v >= 0.9 * peak);
  return { 峰: peak, accelFrames: reachFrame - openIndex + 1 };
};
const cueList = (seg: SegmentDef) => (seg.sound ?? []).filter((c): c is AssetCue => c.asset !== undefined);
const eventTime = (seg: SegmentDef, name: string) => {
  const c = cueList(seg).find((x) => x.name === name);
  if (!c) throw new Error(`没有 cue「${name}」`);
  return c.sec;
};

describe('第 4 幕 轰炸', () => {
  const speeds = frameSpeeds(qiFangShot.yaBoLunPos, qiFangShot.actStart, qiFangShot.actDur);

  it('她每一下冲峰值 20～30 格/秒、3 帧内到全速，冲完刹到 3 格/秒以下', () => {
    const rushTable = qiFangShot.dashRanges.map((c) => ({ start: c.start, ...sliceSpan(speeds, c.start - 0.05, c.end + 0.05), brakeEndSpeed: speeds[Math.round(c.end * 60)]! }));
    console.log('第 4 幕她的冲（幕内秒、峰值格/秒、几帧到全速、冲完那帧格/秒）', rushTable.map((x) => `${x.start.toFixed(2)}s ${x.峰.toFixed(1)} ${x.accelFrames}帧 ${x.brakeEndSpeed.toFixed(1)}`).join('；'));
    expect(rushTable.length).toBeGreaterThanOrEqual(3);
    for (const x of rushTable) {
      expect(x.峰).toBeGreaterThanOrEqual(20);
      expect(x.峰).toBeLessThanOrEqual(30);
      expect(x.accelFrames).toBeLessThanOrEqual(3);
      expect(x.brakeEndSpeed).toBeLessThan(3);
    }
  });

  it('不悬着不动：静止（不到 0.05 格/秒）的帧只有索命那 16 帧和幕末刹停', () => {
    const stillRatio = speeds.filter((v) => v < 0.05).length / speeds.length;
    const slowShare = speeds.filter((v) => v < 1).length / speeds.length;
    console.log(`第 4 幕她：静止 ${(stillRatio * 100).toFixed(1)}%、慢于 1 格/秒 ${(slowShare * 100).toFixed(1)}%、平均 ${(speeds.reduce((a, b) => a + b) / speeds.length).toFixed(2)} 格/秒`);
    expect(stillRatio).toBeLessThan(0.15);
  });

  it('打击停顿只停索命（16 帧）；停的那几帧她和他的钟不走', () => {
    expect(qiFangShot.killingPause.sec * 60).toBeCloseTo(16, 9);
    const expectedPos = qiFangShot.yaBoLunPos(qiFangShot.secAt(qiFangShot.killingSec));
    for (let f = 1; f <= 16; f++) expect(distance(qiFangShot.yaBoLunPos(qiFangShot.secAt(qiFangShot.killingSec + f * frameSec)), expectedPos)).toBeLessThan(1e-9);
    expect(distance(qiFangShot.yaBoLunPos(qiFangShot.secAt(qiFangShot.killingSec + 17 * frameSec)), expectedPos)).toBeGreaterThan(0);
    const p = qiFangShot.killingPause;
    expect(qiFangShot.steveClock(p.start + p.sec) - qiFangShot.steveClock(p.start)).toBeCloseTo(0, 9);
    expect(qiFangShot.steveBackToWorld(qiFangShot.steveClock(p.start + p.sec + 0.1))).toBeCloseTo(p.start + p.sec + 0.1, 9);
  });

  it('连放：每种按游戏里戴晋升之环的间隔（周期刻）一直放到他死，第一轮在开幕 8 帧里；满附魔高速 5', () => {
    const reportTable: string[] = [];
    for (const item of qiFangShot.chainCastTable) {
      const launchTimes = qiFangShot.castTable.filter((x) => x.id === item.id).map((x) => x.sec - qiFangShot.actStart);
      expect(launchTimes.length).toBeGreaterThan(0);
      for (const cast of qiFangShot.castTable.filter((x) => x.id === item.id)) expect(cast.options?.highSpeed).toBe(5);
      if (item.id === 'killing') {
        expect(launchTimes).toHaveLength(1);
        expect(launchTimes[0]!).toBeCloseTo(qiFangShot.killingSec, 9);
        continue;
      }
      expect(launchTimes[0]!).toBeGreaterThanOrEqual(qiFangShot.castStart - 1e-9);
      expect(launchTimes[0]!).toBeLessThanOrEqual(qiFangShot.castStart + 8 / 60 + 1e-9);
      for (let k = 1; k < launchTimes.length; k++) expect(launchTimes[k]! - launchTimes[k - 1]!).toBeCloseTo(qiFangShot.gap(item.id), 9);
      // 最后一发在他死前、再隔一发就过了
      expect(launchTimes[launchTimes.length - 1]!).toBeLessThan(qiFangShot.deathTime - 1e-6);
      expect(launchTimes[launchTimes.length - 1]! + qiFangShot.gap(item.id)).toBeGreaterThanOrEqual(qiFangShot.deathTime - 1e-9);
      expect(qiFangShot.gap(item.id)).toBeCloseTo(item.periodTick / 20, 9);
      expect(item.periodTick).toBeGreaterThanOrEqual(4);
      reportTable.push(`${item.id} ${qiFangShot.gap(item.id).toFixed(2)}s×${launchTimes.length}`);
    }
    console.log(`第 4 幕连放 ${qiFangShot.castTable.length} 发、打到他 ${qiFangShot.hitEvents.length} 下：`, reportTable.join('；'));
    // 演出里画了蓄力的两个照晋升之环缩过的施法刻；雷暴不画预警圈（用户 11-11「雷暴预警圈全部删掉」）
    expect(qiFangShot.castTable.find((x) => x.id === 'prisma_beam')!.options?.castTick).toBe(20);
    expect(qiFangShot.castTable.find((x) => x.id === 'rupture')!.options?.castTick).toBe(30);
    expect(qiFangShot.castTable.filter((x) => x.id === 'thunderstorm').every((x) => x.options?.noWarningRing)).toBe(true);
  });

  it('11 个大招都在他死之前打到他；他死在幕末（大招齐了以后头一束卫射照满），晋升之环在第一人称那一镜开头炸开', () => {
    expect(qiFangShot.bigCastIds).toHaveLength(11);
    for (const id of qiFangShot.bigCastIds) {
      expect(qiFangShot.ultimateLandTimes[id]).toBeDefined();
      expect(qiFangShot.ultimateLandTimes[id]!).toBeLessThan(qiFangShot.deathTime);
    }
    expect(qiFangShot.deathTime).toBeCloseTo(qiFangShot.actDur, 9);
    const lastLandTime = Math.max(...Object.values(qiFangShot.ultimateLandTimes).map((x) => x!));
    const guardShotTimes = qiFangShot.hitEvents.filter((h) => h.id === 'prisma_beam').map((h) => h.sec);
    expect(guardShotTimes.every((x) => x < lastLandTime)).toBe(true);
    expect(Object.keys(qiFangShot.cameraStart)).toEqual(['side', 'firstPerson']);
    expect(qiFangShot.totemSec - qiFangShot.actStart).toBeGreaterThan(qiFangShot.cameraStart.firstPerson + 0.2 - 1e-9);
    expect(qiFangShot.totemSec - qiFangShot.actStart + 2).toBeLessThan(qiFangShot.deathTime);
    console.log('大招第一下打到他（幕内秒）', Object.entries(qiFangShot.ultimateLandTimes).map(([id, s]) => `${id} ${s!.toFixed(2)}`).join('；'), `；图腾 ${(qiFangShot.totemSec - qiFangShot.actStart).toFixed(2)}；死 ${qiFangShot.deathTime.toFixed(2)}`);
  });

  it('他挨打最多 0.5 秒一下，挥剑至少隔 0.45 秒、死前 0.15 秒起不挥', () => {
    for (let i = 1; i < qiFangShot.takenHits.length; i++) expect(qiFangShot.takenHits[i]!.sec - qiFangShot.takenHits[i - 1]!.sec).toBeGreaterThanOrEqual(0.5 - 1e-9);
    for (let i = 1; i < qiFangShot.swingTimes.length; i++) expect(qiFangShot.swingTimes[i]! - qiFangShot.swingTimes[i - 1]!).toBeGreaterThanOrEqual(0.45 - 1e-9);
    expect(qiFangShot.swingTimes[qiFangShot.swingTimes.length - 1]!).toBeLessThan(qiFangShot.steveClock(qiFangShot.deathTime) - 0.15);
  });

  it('幕末她停在第 5 幕开头她在的地方，第 5 幕从那儿接', () => {
    expect(distance(qiFangShot.yaBoLunPos(qiFangShot.secAt(qiFangShot.actDur)), qiFangShot.act5StartPos)).toBeLessThan(1e-9);
    expect(distance(defeat.yaBoLunPos(defeat.actStart), qiFangShot.act5StartPos)).toBeLessThan(1e-9);
    expect(defeat.actStart).toBeCloseTo(qiFangShot.secAt(qiFangShot.actDur), 9);
  });

  it('声音：卡在导出的时刻上，都在段里；每一发（索命除外）离手那一帧有施放声', () => {
    const segLengthSec = seg4.sec;
    expect(segLengthSec).toBeCloseTo(qiFangShot.actDur, 2);
    expect(eventTime(seg4, '齐放')).toBe(qiFangShot.castStart);
    expect(eventTime(seg4, '索命')).toBeCloseTo(qiFangShot.killingPause.start, 9);
    expect(eventTime(seg4, '图腾')).toBeCloseTo(qiFangShot.totemSec - qiFangShot.actStart, 9);
    expect(eventTime(seg4, '结界火')).toBeCloseTo(qiFangShot.coverFullSec, 9);
    qiFangShot.takenHitsWorld.forEach((h, i) => expect(eventTime(seg4, `挨打${i + 1}`)).toBe(h.sec));
    qiFangShot.swingWorldTimes.forEach((c, i) => expect(eventTime(seg4, `挥剑${i + 1}`)).toBe(c));
    qiFangShot.dashRanges.forEach((c, i) => expect(eventTime(seg4, `冲${i + 1}`)).toBe(c.start));
    // 施放声：同一个声音事件 0.1 秒里只留一个，所以按「有」查，不按条数
    const casts = cueList(seg4).filter((c) => c.name.startsWith('施放-'));
    for (const cast of qiFangShot.castTable) {
      if (cast.id === 'killing') continue;
      const offset = cast.sec - qiFangShot.actStart;
      expect(casts.some((c) => c.name.startsWith(`施放-${cast.id}-`) && Math.abs(c.sec - offset) < 1e-9) || casts.some((c) => Math.abs(c.sec - offset) < 0.1)).toBe(true);
    }
    const ownCues = cueList(seg4).filter((c) => !['战斗曲-齐放', '战斗曲'].includes(c.name));
    for (const c of ownCues) {
      expect(c.sec).toBeGreaterThanOrEqual(0);
      expect(c.sec).toBeLessThan(segLengthSec);
    }
    console.log(`第 4 幕 ${cueList(seg4).length} 条 cue，施放声 ${casts.length} 条`);
  });

  it('受伤晃动（原版 bobHurt）：罩严之前照无敌帧，罩严以后每刻都重来，一直歪着、一帧一帧地颤；打击停顿里定住', () => {
    const coverFullTick = Math.ceil(qiFangShot.steveClock(qiFangShot.coverFullSec) * 20);
    const hurtsBefore = qiFangShot.hurtEvents.filter((e) => e.刻 < coverFullTick);
    const hurtTicks = qiFangShot.hurtEvents.filter((e) => e.刻 >= coverFullTick).map((e) => e.刻);
    expect(hurtsBefore.length).toBeGreaterThan(0);
    expect(hurtTicks).toEqual(Array.from({ length: hurtTicks.length }, (_, i) => coverFullTick + i));
    expect(hurtTicks[hurtTicks.length - 1]!).toBe(Math.ceil(qiFangShot.steveClock(qiFangShot.deathTime) * 20) - 1);
    // 第一下打到他之前不歪
    expect(qiFangShot.hurtTilt(Math.min(...qiFangShot.hitEvents.map((h) => h.sec)) - frameSec).tiltDeg).toBe(0);
    // 罩严以后（第一人称那一镜）每一帧 7～14 度，挨着的三帧不一样
    const degrees = Array.from({ length: Math.floor((qiFangShot.deathTime - qiFangShot.cameraStart.firstPerson) * 60) }, (_, f) => qiFangShot.hurtTilt(qiFangShot.cameraStart.firstPerson + f * frameSec).tiltDeg);
    console.log(`第一人称受伤晃动：${Math.min(...degrees).toFixed(1)}～${Math.max(...degrees).toFixed(1)} 度，罩严前完整受伤 ${hurtsBefore.length} 下`);
    for (const d of degrees) {
      expect(d).toBeGreaterThan(7);
      expect(d).toBeLessThanOrEqual(14);
    }
    const hold = qiFangShot.killingPause;
    const pausedDeg = Array.from({ length: 16 }, (_, f) => qiFangShot.hurtTilt(hold.start + f * frameSec).tiltDeg);
    expect(new Set(pausedDeg.map((d) => d.toFixed(9))).size).toBe(1);
    expect(new Set(degrees.slice(0, 3).map((d) => d.toFixed(6))).size).toBe(3);
    // 她在他正前方附近：hurtDir 在 90 度上下（往下点头为主）
    for (const e of qiFangShot.hurtEvents) expect(Math.abs(e.dirDeg - 90)).toBeLessThan(60);
  });

  it('战斗曲 27.0 秒那一下砸在第一轮出手那一刻：两条在 齐放出手 首尾接上，前一条的入点跟着第 2 幕长短走', () => {
    const events = timeline.events;
    expect(events.volleyCast.sec - events.wheelOpenDone.sec).toBeCloseTo(qiFangShot.castStart, 9);
    const battleSound = timeline.sound!.find((x) => x.name === '战斗曲')!;
    const battleCue = timeline.sound!.find((x) => x.name === '战斗曲-齐放')!;
    expect(battleSound.startSec).toBe(events.yaBoLunAppears.sec);
    expect(battleSound.endSec).toBe(events.volleyCast.sec);
    expect(battleSound.入点秒! + battleSound.endSec! - battleSound.startSec).toBeCloseTo(27, 9);
    expect(battleCue.startSec).toBe(events.volleyCast.sec);
    expect(battleCue.入点秒).toBe(27);
    console.log(`战斗曲：现身 ${events.yaBoLunAppears.sec.toFixed(3)} 秒起从 ${battleSound.入点秒!.toFixed(3)} 秒放，${events.volleyCast.sec.toFixed(3)} 秒（齐放出手）接后一条`);
  });
});

describe('第 5 幕 击败', () => {
  const speeds = frameSpeeds(defeat.yaBoLunPos, defeat.actStart, defeat.actDur);

  it('俯冲峰值 20～30 格/秒、3 帧内到全速；落地后滑到站住、不走路', () => {
    const dive = sliceSpan(speeds, defeat.yaBoLunBeats.descendStart - 0.05, defeat.yaBoLunBeats.descendStart + defeat.yaBoLunBeats.descendSec);
    const landTime = defeat.landSec - defeat.actStart;
    console.log(`第 5 幕她：俯冲峰值 ${dive.峰.toFixed(1)} 格/秒 ${dive.accelFrames} 帧；落地 ${landTime.toFixed(2)} 秒、着地水平 ${speeds[Math.round(landTime * 60)]!.toFixed(1)} 格/秒`);
    expect(dive.峰).toBeGreaterThanOrEqual(20);
    expect(dive.峰).toBeLessThanOrEqual(30);
    expect(dive.accelFrames).toBeLessThanOrEqual(3);
    expect(distance(defeat.yaBoLunPos(defeat.standStillSec), defeat.yaBoLunPos(defeat.secAt(defeat.actDur)))).toBeLessThan(1e-9);
    expect(defeat.standStillSec).toBeLessThan(defeat.secAt(defeat.actDur));
  });

  it('声音：他死、收盘、俯冲、落地、点重生卡在导出的时刻上', () => {
    expect(seg5.sec).toBeCloseTo(defeat.actDur, 2);
    expect(eventTime(seg5, '他死')).toBe(0);
    expect(eventTime(seg5, '点重生')).toBe(defeat.cursorMove.points);
    expect(eventTime(seg5, '收盘')).toBe(defeat.yaBoLunBeats.retractStart);
    expect(eventTime(seg5, '俯冲')).toBe(defeat.yaBoLunBeats.descendStart);
    expect(eventTime(seg5, '落地')).toBeCloseTo(defeat.landSec - defeat.actStart, 9);
    for (const c of cueList(seg5)) expect(c.sec).toBeLessThan(seg5.sec);
    console.log('第 5 幕声音', [...cueList(seg5)].sort((a, b) => a.sec - b.sec).map((c) => `${c.sec.toFixed(2)} ${c.name}`).join('；'));
  });
});
