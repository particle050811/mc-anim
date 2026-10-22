// 7-4-2 又一只的声音：只用游戏原声（src/音效/），听者是镜头；没有台词。时刻全从 编排.ts 推，档按事件名归（混音.ts 的 defaultTier：尖啸重、其余中）。
// - 开箱：开箱声（模型/物品/箱子.tsx 的 chestSound），开盖那一刻，箱子中心。
// - 咔嗒：各感测体激活 block.sculk_sensor.clicking、2 秒后 clicking_stop（同 6-4-2）。
// - 尖啸：四个尖啸体各一声 block.sculk_shrieker.shriek（levelEvent 3007：volume 2、pitch 0.6 + r × 0.4），尖啸体顶面中心。
// - 钻出：每只照 6-4-8 的剪法——entity.warden.emerge（volume 5、pitch 1）原文件里剪两截：0.82～1.6 秒那截的起音落在手撑出地面（钻出后 0.08 秒），
//   3.02 秒到完那截落在头全出（钻出后 0.78 秒），不变速、不变调（见 6-4-8/声音.tsx 文件头）。
// - 心跳：每只的游戏时间整 2 秒跳一次（entity.warden.heartbeat，volume 5），钻出以前不跳；站直后触角 entity.warden.tendril_clicks（volume 5）。
// - 掉头跑：马 entity.horse.gallop 每 0.2 秒一声（volume 0.15；50 米/秒一秒 5 个步子，同 7-4-1）。
// 镜 1（岛上得意）没有声音：马停着，白烟没有声音。
import React from 'react';
import { rng, type V3 } from '@engine/model/parts.tsx';
import { WARDEN } from '@库/生物/监守者.tsx';
import { GameSoundTrack, randomPitch, type SoundCue } from '@engine/audio/游戏音效.tsx';
import * as K8 from '../../地点/古城4x/6-4-8/编排.ts';
import { blockCenter } from '../../地点/古城4x/6-4-1/古城戏.ts';
import { chestSound } from '@库/物品/箱子.tsx';
import * as choreo from './编排.ts';

const FPS = choreo.FPS;
const heartbeatIntervalSec = WARDEN.heartbeatTicks.calm / 20;

export const sounds: SoundCue[] = (() => {
  const rand = rng(7402);
  const out: SoundCue[] = [];
  out.push({ 名: '开箱', ...chestSound('开', rand), 帧: choreo.lidOpenFrame, 位置: choreo.chestCenter });
  choreo.sensors.forEach((sensor, i) => {
    const center = blockCenter(sensor);
    const pos: V3 = [center[0], center[1], center[2] + 0.5];
    out.push({ 名: `感测体${i}激活`, 事件: 'block.sculk_sensor.clicking', 帧: choreo.activateSecs[i] * FPS, 位置: pos, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand() });
    out.push({ 名: `感测体${i}停`, 事件: 'block.sculk_sensor.clicking_stop', 帧: (choreo.activateSecs[i] + 2) * FPS, 位置: pos, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand() });
  });
  choreo.wardens.forEach((w, i) => {
    out.push({ 名: `尖啸${i + 1}`, 事件: 'block.sculk_shrieker.shriek', 帧: w.shriekSec * FPS, 位置: [w.shriekP[0], w.shriekP[1], w.shriekP[2] + 0.5], 音量: 2, 音高: randomPitch.尖啸(rand()), 选: rand() });
    const pick = rand();
    for (const [name, startOffset, atSec, stopSec] of [
      ['破土', 0.82, 0.08, 1.6],
      ['爬出', 3.02, 0.78, undefined],
    ] as const)
      out.push({ 名: `钻出${i + 1}（${name}）`, 事件: 'entity.warden.emerge', 帧: w.emergeFrame + atSec * FPS, 位置: w.p, 音量: 5, 音高: 1, 选: pick, 起点: startOffset, stopSec });
    // 心跳：游戏时间整 2 秒那一刻（和心脏发光同一刻），钻出以后才跳
    const gameSec0 = choreo.wardenGameSec(w, 0);
    for (let k = Math.ceil(gameSec0 / heartbeatIntervalSec); (k * heartbeatIntervalSec - gameSec0) * FPS < choreo.END; k++) {
      const frame = (k * heartbeatIntervalSec - gameSec0) * FPS;
      if (frame < w.emergeFrame) continue;
      out.push({ 名: `心跳${i + 1}`, 事件: 'entity.warden.heartbeat', 帧: frame, 位置: w.p, 音量: 5, 音高: randomPitch.voice(rand(), rand()), 选: rand() });
    }
    const tendrilFrame = w.emergeFrame + (K8.emergeDurationSec + 0.1) * FPS;
    if (tendrilFrame < choreo.END) out.push({ 名: `触角${i + 1}`, 事件: 'entity.warden.tendril_clicks', 帧: tendrilFrame, 位置: w.p, 音量: 5, 音高: randomPitch.voice(rand(), rand()), 选: rand() });
  });
  for (let frame = choreo.turnAwayStart + 8; frame < choreo.END; frame += 0.2 * FPS)
    out.push({ 名: '马蹄', 事件: 'entity.horse.gallop', 帧: frame, 位置: choreo.horseState(Math.round(frame)).p, 音量: 0.15, 音高: 1, 选: rand() });
  return out;
})();

const listener = (f: number) => choreo.camera(Math.min(Math.max(Math.round(f), 0), choreo.END - 1)).pos;

// 段尾淡出：下一段 7-4-3 硬切到边城坑口，钻出、尖啸还在响（用户 10-18 批）
export const AnotherOneSound: React.FC = () => <GameSoundTrack sounds={sounds} listener={listener} tailFade />;
