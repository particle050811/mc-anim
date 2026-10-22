// 第 7 章第 3 场三段共用的声音：只用游戏原声（第 7 章音效表，模型/第7章素材预览.tsx 的 第7章音效），听者是镜头。整场按场时刻 T 排一张表，各段取落在自己那一截里的
// （开头之前 3 秒内响起、还没放完的照样从中间接着放：帧是负的）。7-3-3 有慢放，同一张表按它的变速排（../7-1/变速段.tsx）。这一场没有台词（台词轨照旧挂着，空）。
// - 马：跑着的时候每个步子一声 entity.horse.gallop（原版音量 0.15；步子按 戏.ts 的腿相位，全速时一秒 5 步），每一跃起跳 entity.horse.jump、落地 entity.horse.land（原版 0.4）。
// - 风：镜头跟着人跑得快就是游戏里高速飞行的鞘翅风声（item.elytra.flying，ElytraOnPlayerSoundInstance：音量 = clamp(速度² / 4, 0, 1)，速度按格/刻，40 米/秒满；
//   音量过 0.8 音高 1 + (音量 − 0.8)），按镜头每帧的速度算，音高取满速那一档 1.2（一段里只能一个音高），归「中」（让着爆炸）。静止机位没风。
// - 苦力怕迫击炮（三发）：出手 entity.creeper.hurt（施法完成音）；炸 entity.generic.explode（音量 3、音高 0.9～1.1）+ 监守者受伤 entity.warden.hurt。
// - 音爆：开始 entity.warden.sonic_charge（音量 3）、第 34 刻 entity.warden.sonic_boom（音量 3）；刘心忠中招 entity.player.hurt。护盾术：entity.illusioner.cast_spell（瞬发）。
// - 黄叛那一箭：命中 entity.arrow.hit + entity.warden.hurt；放箭声在他手上、离镜头 30 格开外，游戏里听不见，不放；他跳走也不放。
// 不放：监守者脚步（交给 AI 生成，chapter6-sound-mix 的规矩）、心跳。
import React from 'react';
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { GameSoundTrack, LoopSound, randomPitch, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import { LineTrack } from '../../../../world/配音/台词轨.tsx';
import type { Cam } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import * as play from '../../../../world/地点/古城4x/7-3/戏.ts';
import * as timeline from '../../../../world/地点/古城4x/7-3/时间线.ts';

type SceneSound = Omit<SoundCue, '帧'> & { T: number };
export const sceneSounds: SceneSound[] = (() => {
  const out: SceneSound[] = [];
  const push = (T: number, s: Omit<SoundCue, '帧'>) => out.push({ ...s, T });
  const liuSrc = (T: number): V3 => play.liuEye(T);
  const horseRand = rng(7309);
  const rand = rng(7300);
  const voicePitch = () => randomPitch.voice(rand(), rand());
  // 腿相位每过一个周期（2π / 0.6662，幽灵马.tsx 的腿摆）落一个步子；腾空不响
  const strideCycle = (2 * Math.PI) / 0.6662;
  let lastStride = Math.floor(play.horseState(0).行走.相位 / strideCycle);
  for (let sceneT = 0; sceneT < play.endT; sceneT += 1 / 240) {
    const horse = play.horseState(sceneT);
    const stride = Math.floor(horse.行走.相位 / strideCycle);
    if (stride !== lastStride && horse.速度 > 1 && !horse.腾空) push(sceneT, { 名: '马蹄', 事件: 'entity.horse.gallop', 位置: horse.p, 音量: 0.15, 音高: 1, 选: horseRand() });
    lastStride = stride;
  }
  play.horseLeaps.forEach((leap, i) => {
    const t0 = leap.f0 / timeline.FPS;
    const t1 = leap.f1 / timeline.FPS;
    push(t0, { 名: `马跳${i}`, 事件: 'entity.horse.jump', 位置: play.horseState(t0).p, 音量: 0.4, 音高: 1, 选: horseRand() });
    push(t1, { 名: `马落${i}`, 事件: 'entity.horse.land', 位置: play.horseState(t1).p, 音量: 0.4, 音高: 1, 选: horseRand() });
  });
  play.mortars.forEach((mortar, i) => {
    push(mortar.出T, { 名: `出炮${i}`, 事件: 'entity.creeper.hurt', 位置: liuSrc(mortar.出T), 音量: 1, 音高: 1, 选: rand() });
    push(mortar.中T, { 名: `爆炸${i}`, 事件: 'entity.generic.explode', 位置: mortar.blastPos, 音量: 3, 音高: 0.9 + 0.2 * rand(), 选: rand() });
    push(mortar.中T, { 名: `监守者受伤${i}`, 事件: 'entity.warden.hurt', 位置: mortar.blastPos, 音量: 3, 音高: voicePitch(), 选: rand() });
  });
  push(timeline.sonicBoomStartT, { 名: '蓄力', 事件: 'entity.warden.sonic_charge', 位置: play.wardenChest(timeline.sonicBoomStartT), 音量: 3, 音高: 1, 选: rand() });
  push(timeline.shieldT, { 名: '护盾', 事件: 'entity.illusioner.cast_spell', 位置: liuSrc(timeline.shieldT), 音量: 1, 音高: 1, 选: rand() });
  push(timeline.sonicBoomFireT, { 名: '音爆', 事件: 'entity.warden.sonic_boom', 位置: play.wardenChest(timeline.sonicBoomFireT), 音量: 3, 音高: 1, 选: rand() });
  push(timeline.hitT + 0.01, { 名: '刘中', 事件: 'entity.player.hurt', 位置: liuSrc(timeline.hitT), 音量: 1, 音高: voicePitch(), 选: rand() });
  const arrowRand = rng(7338);
  play.huangArrows.forEach((arrow, i) => {
    push(arrow.中, { 名: `箭中${i}`, 事件: 'entity.arrow.hit', 位置: arrow.落, 音量: 1, 音高: 1.2 / (arrowRand() * 0.2 + 0.9), 选: arrowRand() });
    push(arrow.中, { 名: `箭伤${i}`, 事件: 'entity.warden.hurt', 位置: arrow.落, 音量: 3, 音高: randomPitch.voice(arrowRand(), arrowRand()), 选: arrowRand() });
  });
  return out;
})();

// 鞘翅风声的音量（原版公式，见文件头）：镜头这一帧的速度；切镜那一帧前后不是同一个镜头，只取同镜头那一边
export const flightWindVolume = (camera: (frame: number) => Cam, shotOf: (frame: number) => number, frameCount: number) => (f: number) => {
  const frame = Math.min(Math.max(Math.round(f), 0), frameCount - 1);
  const a = frame > 0 && shotOf(frame - 1) === shotOf(frame) ? frame - 1 : frame;
  const b = frame < frameCount - 1 && shotOf(frame + 1) === shotOf(frame) ? frame + 1 : frame;
  if (a === b) return 0;
  const p0 = camera(a).pos;
  const p1 = camera(b).pos;
  const blocksPerTick = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) / ((b - a) / timeline.FPS) / 20;
  return Math.min(1, (blocksPerTick * blocksPerTick) / 4);
};

export const SegmentSound: React.FC<{ segId: timeline.SegmentId; camera: (frame: number) => Cam; shotOf?: (frame: number) => number }> = ({ segId: segId, camera, shotOf }) => {
  const startT = timeline.segmentStartT(segId);
  const endT = timeline.segmentEndT(segId);
  const sounds: SoundCue[] = sceneSounds.filter((s) => s.T >= startT - 3 && s.T <= endT).map(({ T: sceneT, ...rest }) => ({ ...rest, 帧: (sceneT - startT) * timeline.FPS }));
  const frameCount = timeline.frameCountOf(segId);
  const listener = (f: number) => camera(Math.min(Math.max(Math.round(f), 0), frameCount - 1)).pos;
  const lines = (Object.keys(timeline.dialogue) as (keyof typeof timeline.dialogue)[]).filter((id) => timeline.dialogue[id].T >= startT && timeline.dialogue[id].T < endT).map((id) => ({ id, 帧: timeline.lineStartFrame(segId, id) }));
  return (
    <>
      <GameSoundTrack sounds={sounds} listener={listener} frameCount={frameCount} />
      {shotOf && <LoopSound name="风声" event="item.elytra.flying" beginFrame={0} endFrame={frameCount} pitch={1.2} tier="中" envelope={flightWindVolume(camera, shotOf, frameCount)} />}
      <LineTrack 句们={lines} />
    </>
  );
};
