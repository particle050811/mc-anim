// 7-4-1 风筝的声音：只用游戏原声（src/音效/，规则见 游戏音效.tsx），听者是镜头；台词（刘心忠）配音在 src/配音/，按 编排.ts 的开口帧挂台词轨。
// 每圈取一截：事件都按剧情时刻 T 排，落在哪个镜头那一截里就在那一帧响，落在剪掉的时间里的不放（镜 1 开头之前 2 秒内响起的照样从中间接着放）。
// 离镜头超过 16 格 × 音量（原版声音的衰减距离）的不放（用户 10-18：照理听不见就删）。各声音的原版出处同 ../7-3/声音.tsx：
// - 马：每个步子一声 entity.horse.gallop（0.15）；炮：出手 entity.creeper.hurt，炸 entity.generic.explode（3、音高 0.9～1.1）+ entity.warden.hurt；
// - 音爆：开始 entity.warden.sonic_charge、第 34 刻 entity.warden.sonic_boom（都是 3）；风矢：鼓风机化出「哄」item.elytra.flying（音高 2、0.4，一串一声）、
//   放箭 entity.arrow.shoot、命中 entity.arrow.hit + entity.warden.hurt；最后一箭 entity.warden.death（3）。
// 不放：监守者脚步（交给 AI 生成，chapter6-sound-mix 的规矩）、心跳。
import React from 'react';
import { rng, type V3 } from '@engine/model/parts.tsx';
import { WARDEN } from '@库/生物/监守者.tsx';
import { GameSoundTrack, randomPitch, type SoundCue } from '@engine/audio/游戏音效.tsx';
import { LineTrack } from '../../配音/台词轨.tsx';
import * as play from '../../场/7-收场/7-4-1/戏.ts';
import * as choreo from '../../场/7-收场/7-4-1/编排.ts';

const listener = (f: number) => choreo.camera(Math.min(Math.max(Math.round(f), 0), choreo.END - 1)).pos;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// 剧情时刻 T → 成片帧（各镜头那一截里找；镜 1 往前多放 2 秒）
const framesOf = (T: number): number[] => {
  const out: number[] = [];
  for (let k = 1; k <= choreo.shotCount; k++) {
    const f = choreo.frameInShot(k, T);
    if (f !== undefined) out.push(f);
  }
  const f1 = choreo.shotStartFrame(1) + (T - choreo.shotStartT(1)) * choreo.FPS;
  if (f1 < 0 && f1 >= -2 * choreo.FPS) out.push(f1);
  return out;
};

export const sounds: SoundCue[] = (() => {
  const rand = rng(7401);
  const out: SoundCue[] = [];
  const push = (T: number, s: Omit<SoundCue, '帧'>) => {
    for (const f of framesOf(T)) if (dist(listener(Math.max(0, f)), s.位置) < 16 * Math.max(1, s.音量)) out.push({ ...s, 帧: f });
  };
  const voicePitch = () => randomPitch.voice(rand(), rand());
  // 马蹄：腿相位每过一个周期（2π / 0.6662，幽灵马.tsx 的腿摆）落一个步子
  const horseRand = rng(7402);
  const strideCycle = (2 * Math.PI) / 0.6662;
  let lastStride = Math.floor(play.horseState(0).行走.相位 / strideCycle);
  for (let T = 0; T < play.endStoryT; T += 1 / 240) {
    const horse = play.horseState(T);
    const stride = Math.floor(horse.行走.相位 / strideCycle);
    if (stride !== lastStride && horse.速度 > 1) push(T, { 名: '马蹄', 事件: 'entity.horse.gallop', 位置: horse.p, 音量: 0.15, 音高: 1, 选: horseRand() });
    lastStride = stride;
  }
  play.mortars.forEach((mortar, i) => {
    push(mortar.出T, { 名: `出炮${i}`, 事件: 'entity.creeper.hurt', 位置: play.liuEye(mortar.出T), 音量: 1, 音高: 1, 选: rand() });
    push(mortar.中T, { 名: `爆炸${i}`, 事件: 'entity.generic.explode', 位置: mortar.blastPos, 音量: 3, 音高: 0.9 + 0.2 * rand(), 选: rand() });
    push(mortar.中T, { 名: `炮伤${i}`, 事件: 'entity.warden.hurt', 位置: mortar.blastPos, 音量: 3, 音高: voicePitch(), 选: rand() });
  });
  play.booms.forEach((boom, i) => {
    const startT = boom.fireT - WARDEN.sonicBoomHitSec;
    push(startT, { 名: `蓄力${i}`, 事件: 'entity.warden.sonic_charge', 位置: play.wardenChest(startT), 音量: 3, 音高: 1, 选: rand() });
    push(boom.fireT, { 名: `音爆${i}`, 事件: 'entity.warden.sonic_boom', 位置: play.wardenChest(boom.fireT), 音量: 3, 音高: 1, 选: rand() });
  });
  // 一串 6 支鼓风机一直开着：一串一声「哄」，从第一支化出响到最后一支放完
  play.arrows.forEach((arrow, i) => {
    if (arrow.串首) {
      const burst = play.arrows.filter((a) => a.圈 === arrow.圈);
      const startT = arrow.放 - 0.3;
      const fan = play.fansAt(arrow.放 - 0.1)[0];
      push(startT, { 名: `哄${i}`, 事件: 'item.elytra.flying', 位置: fan ? fan.心 : arrow.起, 音量: 0.4, 音高: 2, 选: rand(), stopSec: 2 * (burst[burst.length - 1].放 + 0.3 - startT) }); // stopSec 按文件时间，音高 2 播得快一倍
    }
    push(arrow.放, { 名: `放箭${i}`, 事件: 'entity.arrow.shoot', 位置: arrow.起, 音量: 1, 音高: 1 / (rand() * 0.4 + 1.2) + 0.5, 选: rand() });
    push(arrow.中, { 名: `箭中${i}`, 事件: 'entity.arrow.hit', 位置: arrow.落, 音量: 1, 音高: 1.2 / (rand() * 0.2 + 0.9), 选: rand() });
    if (arrow.中 < play.deathT) push(arrow.中, { 名: `箭伤${i}`, 事件: 'entity.warden.hurt', 位置: arrow.落, 音量: 3, 音高: voicePitch(), 选: rand() });
  });
  push(play.deathT, { 名: '监守者死', 事件: 'entity.warden.death', 位置: play.wardenChest(play.deathT), 音量: 3, 音高: voicePitch(), 选: rand() });
  return out;
})();

export const KiteSound: React.FC = () => (
  <>
    <GameSoundTrack sounds={sounds} listener={listener} />
    <LineTrack 句们={choreo.lines.map(({ id, 开口帧 }) => ({ id, 帧: 开口帧 }))} />
  </>
);
