// 第 7 章第 2 场的游戏音效，按场内帧排（时刻全从 时间线.ts / 戏.ts 推），各段用 段声们() 截出自己那一截：
// 段开头之前就响起、还没放完的照样带上（帧是负的，从响到的地方接着放，同 6-4-5 接 6-4-4 的做法）。听者是各段的镜头机位。
// 只用游戏原声，音量音高照 1.20.1（见 src/音效/游戏音效.tsx、6-4-2/声音.tsx 的同一套）：
// - 垫羊毛、落在羊毛上：离镜头太远，不放（见下）；起跳没有声音。
// - 开箱、关箱：模型/物品/箱子.tsx 的 chestSound。
// - 感测体：激活 block.sculk_sensor.clicking、40 刻后 clicking_stop（1、0.8 + r × 0.2）；#240 周围三个开箱、关箱各响一遍（见 时间线.ts 文件头）。
// - 箱子界面里 shift 点击移东西：原版没有声音（AbstractContainerScreen 点格子不放音效），不放。
// - 尖啸：block.sculk_shrieker.shriek（volume 2、pitch 0.6 + r × 0.4，levelEvent 3007），位置在尖啸体顶面中心。
// - 传送石：开始按住 block.portal.trigger（0.1、2），传走 block.portal.travel（0.1、1），位置在他身上（WarpStoneItem、PlayerWaystoneManager）。
// 7-2-1 远景里第 1 场的声音不在这张表里，见 ../7-2-1/声音.tsx（照游戏的可听范围挑）。
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { randomPitch, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import { FPS } from '../../../../world/地点/古城4x/6-4-1/古城戏.ts';
import { chestSound } from '../../../../world/物品/箱子.tsx';
import * as geom from './几何.ts';
import * as timeline from './时间线.ts';
import * as play from './戏.ts';

const onBody = (): V3 => [geom.chestFrontFeet[0], geom.chestFrontFeet[1], geom.chestFrontFeet[2] + 1];

export const sceneSounds: SoundCue[] = (() => {
  const rand = rng(7201);
  const out: SoundCue[] = [];
  // 垫羊毛、落在羊毛上：镜 A 离落点 25 格，游戏里听不见，不放（用户 10-18：照理听不见就删）；照旧各取一次随机数，后面的声音挑的文件不变
  rand();
  rand();
  out.push({ 名: '开箱', ...chestSound('开', rand), 帧: timeline.lidOpenSec * FPS, 位置: geom.chestCenter });
  geom.sensors.forEach((sensor, i) => {
    const t = play.激活秒[i];
    const center = geom.方块中心(sensor);
    out.push({ 名: `感测体${i}激活`, 事件: 'block.sculk_sensor.clicking', 帧: t * FPS, 位置: center, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand(), 止帧: timeline.sensorClickCutFrame });
    out.push({ 名: `感测体${i}停`, 事件: 'block.sculk_sensor.clicking_stop', 帧: (t + 2) * FPS, 位置: center, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand() });
  });
  const shriekPos = play.尖啸.p;
  // 中档：和「开到了！」同时响，重档会盖住台词；止帧：传走前 3 帧淡完，不然盖住传送石和传走（用户 10-18 批）
  out.push({ 名: '尖啸', 事件: 'block.sculk_shrieker.shriek', 帧: play.尖啸.t * FPS, 位置: [shriekPos[0], shriekPos[1], shriekPos[2] + 0.5], 音量: 2, 音高: randomPitch.尖啸(rand()), 选: rand(), 档: '中', 止帧: Math.round(timeline.teleportSec * FPS) - 3 });
  out.push({ 名: '关箱', ...chestSound('关', rand), 帧: timeline.lidCloseSec * FPS, 位置: geom.chestCenter });
  out.push({ 名: '传送石按住', 事件: 'block.portal.trigger', 帧: timeline.useStartSec * FPS, 位置: onBody(), 音量: 0.1, 音高: 2, 选: rand() });
  out.push({ 名: '传走', 事件: 'block.portal.travel', 帧: timeline.teleportSec * FPS, 位置: onBody(), 音量: 0.1, 音高: 1, 选: rand() });
  // 关箱那一遍咔嗒（排在最后取随机数，前面各声挑的文件不变）；传走前 3 帧淡完，同尖啸
  geom.sensors.forEach((sensor, i) => {
    const t = play.再激活秒[i];
    const center = geom.方块中心(sensor);
    out.push({ 名: `感测体${i}再激活`, 事件: 'block.sculk_sensor.clicking', 帧: t * FPS, 位置: center, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand(), 止帧: Math.round(timeline.teleportSec * FPS) - 3 });
    out.push({ 名: `感测体${i}再停`, 事件: 'block.sculk_sensor.clicking_stop', 帧: (t + 2) * FPS, 位置: center, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand() });
  });
  return out;
})();
