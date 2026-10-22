// 第 7 章第 1 场七段共用的声音：只用游戏原声（src/音效/），听者是镜头。整场的事件按场时刻 t 排一张表，各段取落在自己那一截里的
// （开头之前就响起、还没放完的照样从中间接着放：帧是负的）。台词配音（src/配音/，工具/配音/生成台词.py）按 时间线.ts 的 台词 开口时刻挂台词轨，各段放 `segmentLines`（本段开口的和上一段说进来的）。
// - 黑暗：原版放黑暗本身没有声音；监守者生气（怒气 ≥ 80）时的叫声 entity.warden.angry 当「黑暗低吼」（音量 3）。
// - 召唤恼鬼：entity.evoker.prepare_summon（开始施法）→ entity.evoker.cast_spell（恼鬼出来）；冲锋 entity.vex.charge；死 entity.vex.death。
// - 监守者拍：entity.warden.attack_impact（挥臂打中，攻击动画第 0.15 秒）。
// - 鼓风机：每一箭弓前化出鼓风机虚影都有风声 item.elytra.flying（同 6-4-3、7-4-1：音高 2、音量 0.4；照亮的火把箭风开得小，音量 0.2）。
// - 火把箭：entity.arrow.shoot（放）→ block.wood.place（落地变成火把）。
// - 风矢（7-1-5、7-1-7）：命中 entity.arrow.hit + entity.warden.hurt 在前，弓弦声 entity.arrow.shoot 在后（原文「击中敌人之后，弓箭出鞘的声音方才刚刚在手边响起」）。
// - 护盾：entity.illusioner.cast_spell（瞬发）；被拍 irons_spellbooks:force_impact。
// - 召唤骏马：entity.illusioner.prepare_mirror → entity.illusioner.mirror_move；起跳 entity.horse.jump、落地 entity.horse.land。
// - 二人每次落地放落脚方块的声音（幽匿块 block.sculk.step / 深板岩 block.deepslate.fall，音量 0.5、音高 0.75 同原版 playBlockFallSound），
//   监守者 0.25 秒后收到这下振动、触角咔嗒（entity.warden.tendril_clicks）。拍恼鬼的时刻是 戏.ts 逐刻推出来的 `swingTs`。
// 不放：监守者脚步（交给 AI 生成，chapter6-sound-mix 的规矩）、心跳（生气时间隔随怒气变，简单版没算）。
import React from 'react';
import { rng, type V3 } from '@engine/model/parts.tsx';
import { GameSoundTrack, randomPitch, type SoundCue } from '@engine/audio/游戏音效.tsx';
import type { 音效档 } from '@engine/audio/混音.ts';
import { LineTrack } from '../../../配音/台词轨.tsx';
import type { Cam } from '../6-4-1/古城画面.tsx';
import * as K649 from '../6-4-9/编排.ts';
import { roarCue as roar649 } from '../6-4-9/声音.tsx';
import * as play from './戏.ts';
import * as timeline from './时间线.ts';

// 止t：到这一场时刻淡完（各段换成 止帧），给切到不相干镜头的余音用
export type SceneSound = Omit<SoundCue, '帧'> & { t: number; 止t?: number };
export const sceneSounds: SceneSound[] = (() => {
  const rand = rng(7100);
  const out: SceneSound[] = [];
  const voicePitch = () => randomPitch.voice(rand(), rand());
  const push = (t: number, s: Omit<SceneSound, 't'>) => out.push({ ...s, t });
  const wardenSrc = (t: number): V3 => play.wardenChest(t);
  const liuSrc = (t: number): V3 => {
    const feet = play.liuXinzhongPos(t);
    return [feet[0], feet[1], feet[2] + 1.5];
  };
  // 6-4-9 吼到一半切过来：同一声接着放完（文件、音高照 6-4-9 那一声，不另取随机数）
  const { 帧: roarFrame649, ...roar } = roar649;
  push((roarFrame649 - K649.END + 1) / timeline.FPS, { ...roar, 名: '吼（接 6-4-9）' });
  push(timeline.darknessT, { 名: '黑暗低吼', 事件: 'entity.warden.angry', 位置: wardenSrc(timeline.darknessT), 音量: 3, 音高: voicePitch(), 选: rand() });
  // 越来越响的施法声，恼鬼出来（cast_spell）就收掉，不拖进 7-1-2 后面黄叛射火把的镜头（用户 10-18）
  push(timeline.raiseStaffT, { 名: '召唤恼鬼', 事件: 'entity.evoker.prepare_summon', 位置: liuSrc(timeline.raiseStaffT), 音量: 1, 音高: 1, 选: rand(), 止t: timeline.vexSpawnT + 5 / timeline.FPS });
  push(timeline.vexSpawnT, { 名: '恼鬼出', 事件: 'entity.evoker.cast_spell', 位置: liuSrc(timeline.vexSpawnT), 音量: 1, 音高: 1, 选: rand() });
  for (let i = 0; i < play.vexCount; i++) {
    const chargeT = timeline.vexChargeT + play.chargeDelays[i];
    push(chargeT, { 名: `恼鬼冲${i}`, 事件: 'entity.vex.charge', 位置: play.vexState(i, chargeT).p, 音量: 1, 音高: voicePitch(), 选: rand() });
  }
  // 拍恼鬼：拍t 是攻击动画起点，打中（attack_impact）在 0.1 秒后、恼鬼同一刻死
  play.swingTs.forEach((t, j) => {
    const i = play.vexDeathTs.findIndex((d) => Math.abs(d - (t + 0.1)) < 1e-6);
    push(t + 0.1, { 名: `拍${j}`, 事件: 'entity.warden.attack_impact', 位置: wardenSrc(t), 音量: 1, 音高: voicePitch(), 选: rand() });
    // 主声是监守者那一拍（重），恼鬼死垫在下面
    if (i >= 0) push(play.vexDeathTs[i], { 名: `恼鬼死${i}`, 事件: 'entity.vex.death', 位置: play.vexState(i, play.vexDeathTs[i]).p, 音量: 1, 音高: voicePitch(), 选: rand(), 档: '中' });
  });
  // 二人落地：落在什么方块上就是什么方块的声音（原版 playBlockFallSound：fall 声、音量 0.5、音高 0.75；幽匿块没有单独的 fall 声，用 step）
  // 落、触角：补给这一声的字段（档、止t…）；null = 不放（随机数照取，别的声音挑的文件和音高不变）。
  // 落地、触角都按「中」（用户 10-18 合成两档，镜头里看不到监守者的触角原来压到 −36 也归中）
  type Extra = Partial<Omit<SceneSound, 't'>> | null;
  const offscreenClicks: Extra = {};
  const landing = (name: string, t: number, pos: V3, onSculk: boolean, extra: { 落?: Extra; 触角?: Extra } = {}) => {
    const fall = { 名: name, 事件: onSculk ? 'block.sculk.step' : 'block.deepslate.fall', 位置: pos, 音量: 0.5, 音高: 0.75, 选: rand(), 档: '中' as 音效档 };
    if (extra.落 !== null) push(t, { ...fall, ...extra.落 });
    if (t + 0.25 >= play.wallLandT) return;
    const clicks = { 名: `${name}·触角`, 事件: 'entity.warden.tendril_clicks', 位置: wardenSrc(t + 0.25), 音量: 5, 音高: voicePitch(), 选: rand() };
    if (extra.触角 !== null) push(t + 0.25, { ...clicks, ...extra.触角 });
  };
  // 刘落丘顶离镜头二十多米、黄叛落台都在画外，照理听不见的删掉（用户 10-18）
  landing('刘落丘顶', play.landT(play.liuLeaps.J1), play.liuLeaps.J1.p1, true, { 落: null, 触角: offscreenClicks });
  landing('黄落黄台', play.landT(play.huangLeaps.H1), play.huangLeaps.H1.p1, true, { 落: null, 触角: offscreenClicks });
  // 触角咔嗒删（落在黄叛「怪物受死！」的镜头里、压着台词，用户 10-18）
  landing('刘落东墙', play.landT(play.liuLeaps.J2), play.liuLeaps.J2.p1, false, { 触角: null });
  landing('黄落南台', play.landT(play.huangLeaps.H2), play.huangLeaps.H2.p1, true, { 落: null });
  landing('刘落C1', play.landT(play.liuLeaps.J3), play.liuLeaps.J3.p1, true);
  landing('黄落高台', play.landT(play.huangLeaps.H3), play.huangLeaps.H3.p1, true);
  // F1 贴地镜头里没有监守者
  landing('刘落C2', play.landT(play.liuLeaps.J4), play.liuLeaps.J4.p1, true, { 触角: offscreenClicks });
  landing('刘闪避落', play.landT(play.liuLeaps.闪), play.liuLeaps.闪.p1, false);
  play.torchArrows.forEach((arrow, i) => {
    push(arrow.放, { 名: `火把箭${i}`, 事件: 'entity.arrow.shoot', 位置: arrow.起, 音量: 1, 音高: 1 / (rand() * 0.4 + 1.2) + 0.5, 选: rand() });
    push(arrow.中, { 名: `火把${i}`, 事件: 'block.wood.place', 位置: arrow.落, 音量: 1, 音高: 0.8, 选: rand() });
  });
  // 风矢：命中在前、弦声在后（黄叛在半空放）
  const windArrow = play.windArrowShot;
  push(windArrow.放 - 0.6, { 名: '哄', 事件: 'item.elytra.flying', 位置: windArrow.起, 音量: 0.4, 音高: 2, 选: rand(), stopSec: 0.9 });
  // 别的箭的鼓风机风声（另用一个随机数，别的声音挑的文件和音高不变）
  const fanRand = rng(7102);
  [...play.torchArrows, ...play.huangFollowArrows].forEach((arrow, i) => {
    const lead = Math.min(0.6, arrow.drawSec);
    push(arrow.放 - lead, { 名: `哄${i}`, 事件: 'item.elytra.flying', 位置: arrow.起, 音量: arrow.风矢 ? 0.4 : 0.2, 音高: 2, 选: fanRand(), stopSec: lead + 0.3 });
  });
  // 黄叛这一招是 7-1-5 的主戏：命中按「重」，监守者受伤垫在「中」
  push(windArrow.中, { 名: '风矢命中', 事件: 'entity.arrow.hit', 位置: windArrow.落, 音量: 1, 音高: 1.2 / (rand() * 0.2 + 0.9), 选: rand(), 档: '重' });
  push(windArrow.中, { 名: '监守者受伤', 事件: 'entity.warden.hurt', 位置: windArrow.落, 音量: 3, 音高: voicePitch(), 选: rand() });
  push(windArrow.放 + 0.3, { 名: '风矢弦声', 事件: 'entity.arrow.shoot', 位置: windArrow.起, 音量: 1, 音高: 1 / (rand() * 0.4 + 1.2) + 0.5, 选: rand() });
  // 7-1-7：扑空的那一下没打中，没有 impact 声，只有挥臂（监守者攻击没有挥空的声音）；护盾挨两拍，第二拍碎
  push(timeline.shieldT, { 名: '护盾', 事件: 'entity.illusioner.cast_spell', 位置: liuSrc(timeline.shieldT), 音量: 1, 音高: 1, 选: rand() });
  play.shieldSwingTs.forEach((t, i) => {
    push(t + 0.1, { 名: `拍护盾${i}`, 事件: 'irons_spellbooks:force_impact', 位置: play.shieldState(t)!.at, 音量: 1, 音高: 1, 选: rand() });
  });
  push(timeline.summonHorseT, { 名: '召马', 事件: 'entity.illusioner.prepare_mirror', 位置: liuSrc(timeline.summonHorseT), 音量: 1, 音高: 1, 选: rand() });
  push(timeline.horseSpawnT, { 名: '马出', 事件: 'entity.illusioner.mirror_move', 位置: liuSrc(timeline.horseSpawnT), 音量: 1, 音高: 1, 选: rand() });
  // 一跃上北墙头是出逃的那一下：跳、落按「中」
  push(play.horseLeap.f0 / timeline.FPS, { 名: '马跳', 事件: 'entity.horse.jump', 位置: play.horseLeap.p0, 音量: 0.4, 音高: 1, 选: rand(), 档: '中' });
  push(play.wallLandT, { 名: '马落', 事件: 'entity.horse.land', 位置: play.horseLeap.p1, 音量: 0.4, 音高: 1, 选: rand(), 档: '中' });
  // 落上墙头就切到第 3 场，之后的马蹄在 ../7-3/声音.tsx
  play.huangFollowArrows.forEach((arrow, i) => {
    push(arrow.放 + 0.3, { 名: `跟箭${i}`, 事件: 'entity.arrow.shoot', 位置: arrow.起, 音量: 1, 音高: 1 / (rand() * 0.4 + 1.2) + 0.5, 选: rand() });
    push(arrow.中, { 名: `跟箭中${i}`, 事件: 'entity.arrow.hit', 位置: arrow.落, 音量: 1, 音高: 1.2 / (rand() * 0.2 + 0.9), 选: rand() });
    // 7-1-7 的主戏是护盾和召马，这两箭的受伤吼垫在底下，比 7-1-5 风矢那声小一档
    push(arrow.中, { 名: `跟箭伤${i}`, 事件: 'entity.warden.hurt', 位置: arrow.落, 音量: 3, 音高: voicePitch(), 选: rand() });
  });
  return out;
})();

// 一段的声音：段内帧 = (t − 段起t) × FPS；开头前 3 秒内响起的也带上（帧为负，从中间接着放）
export const SegmentSound: React.FC<{ segId: timeline.SegmentId; camera: (frame: number) => Cam }> = ({ segId: segId, camera }) => {
  const startT = timeline.segmentStartT(segId);
  const endT = timeline.segmentEndT(segId);
  const sounds: SoundCue[] = sceneSounds
    .filter((s) => s.t >= startT - 3 && s.t <= endT)
    .map(({ t, 止t, ...sound }) => ({ ...sound, 帧: (t - startT) * timeline.FPS, ...(止t === undefined ? {} : { 止帧: (止t - startT) * timeline.FPS }) }));
  const frameCount = timeline.frameCountOf(segId);
  const listener = (f: number) => camera(Math.min(Math.max(Math.round(f), 0), frameCount - 1)).pos;
  // 本段开口的句子，和上一段开口、说进本段的后半截（帧是负的）
  const lines = timeline.segmentLines(segId).map((l) => ({ id: l.id, 帧: Math.round((l.t - startT) * timeline.FPS) }));
  return (
    <>
      <GameSoundTrack sounds={sounds} listener={listener} />
      <LineTrack 句们={lines} />
    </>
  );
};
