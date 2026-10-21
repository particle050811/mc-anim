// 6-4-2 规矩的声音：李樱的内心独白 + 原版音效（src/音效/），时刻全从 编排.ts 的时间轴推，原速。听者是镜头机位（项目规则）。照 1.20.1（规则见 src/音效/游戏音效.tsx）：
// - 接 6-4-1：跳切（中间四跳不演），6-4-1 的声音不接过来；同一条剧情时间线上（6-4-1/声音.tsx 的 `storySounds`）从本段第 0 帧起的垫羊毛、落地照搬。
// - 垫羊毛：block.wool.place，volume 1、pitch 0.8；落在羊毛上：block.wool.step，volume 0.15（同 6-4-1，按没摔伤算）。
// - 开箱：开箱声（模型/物品/箱子.tsx 的 chestSound）。箱子一直开着，关盖声在 6-4-3a（转身那一刻）。
// - 感测体：激活 block.sculk_sensor.clicking、40 刻后 clicking_stop，volume 1、pitch 0.8 + r × 0.2（同 6-4-3）；8 格内只有 (−1092, −47, 191) 一个感测体，响一次。
// - 尖啸：block.sculk_shrieker.shriek，volume 2、位置是尖啸体顶面中心（LevelRenderer.levelEvent 3007，同 6-4-3）。音高和挑哪个文件照占位卡（已删）6-4-2 那一声搬来：pitch 0.67 这一声放 9.7 秒，「等四周重新安静」就是等它放完；照游戏线性衰减（R = 27.2 格）。
// - 监守者回应（编排.ts 的 `wardenReplyOn`）：尖啸后 90 刻，和黑暗效果同一刻，entity.warden.nearby_close，HOSTILE、volume 5、pitch 1，位置是尖啸体方块坐标三轴各加 [−10, 10] 随机整数（SculkShriekerBlockEntity.playWardenReplySound，见 编排.ts 文件头），R = 80 格。占位卡里没有，照游戏补的。
// - 黑暗效果本身没有声音。台词：没有（「满四次……」用户 10-12 删了）。
// 跳切（编排.ts）：成片只有剧情时间轴上的三截。下面按剧情帧排，最后用 `toCutFrame` 换算；跳点以前响起的照常放完（尖啸 9.7 秒跨过两个跳点当余音），落在跳掉段里的不放。
// 尖啸的余音放到 6-4-3a 切黄叛那一刻（切.A2）为止，5 帧淡掉：那边离尖啸体 370 米，听不见。
import React from 'react';
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { GameSoundTrack, randomPitch, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import { LineTrack } from '../../../../engine/audio/台词轨.tsx';
import { storySounds as 跳搭声们 } from '../../../场/6-古城/6-4-1/声音.tsx';
import { cellCenter } from '../../../../world/地点/古城4x/布局.ts';
import { chestSound } from '../../../../world/物品/箱子.tsx';
import * as choreo from './编排.ts';
import { 切, 帧小数, 段表 } from '../../../场/6-古城/6-4-3/时间线.ts';

const shriekPitch = 0.6694037911482155; // 占位卡 6-4-2 的那一声（见文件头）
const shriekPick = 0.5096602365374565;

// 6-4-3a 切到黄叛那一帧（本段成片帧，6-4-3a 接在 6-4-2 后面）
const cutToHuangPan = choreo.END + 帧小数(切.A2) - 段表['6-4-3a'].起;

const storySounds: SoundCue[] = (() => {
  const rand = rng(6412);
  const out: SoundCue[] = [];
  // 垫羊毛 C、落在 C 上离镜头 16 格，照游戏规则听不见，不放（用户 10-18：理论上听不到就别弄）
  const inaudible = ['垫羊毛C', '落地C'];
  for (const jumpSound of 跳搭声们) if (jumpSound.帧 >= choreo.start642 && !jumpSound.名?.includes('#212') && !inaudible.includes(jumpSound.名!)) out.push({ ...jumpSound, 名: `跳搭 ${jumpSound.名}`, 帧: jumpSound.帧 - choreo.start642 });
  out.push({ 名: '开箱', ...chestSound('开', rand), 帧: choreo.lidOpenSec * choreo.FPS, 位置: choreo.chestCenter });
  choreo.sensors.forEach(([x, y, z], i) => {
    const t = choreo.activateSecs[i];
    if (!Number.isFinite(t)) return;
    const sensorPos: V3 = cellCenter([x, y, z]);
    out.push({ 名: `感测体${i}激活`, 事件: 'block.sculk_sensor.clicking', 帧: t * choreo.FPS, 位置: sensorPos, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand() });
    // 冷却完的咔嗒和 6-4-3 一样归「中」（用户 10-18 定的 6-4-3 分档）
    out.push({ 名: `感测体${i}停`, 事件: 'block.sculk_sensor.clicking_stop', 档: '中', 帧: (t + 2) * choreo.FPS, 位置: sensorPos, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand() });
  });
  const shriekPos = choreo.shriek.p;
  out.push({ 名: '尖啸', 事件: 'block.sculk_shrieker.shriek', 帧: choreo.shriek.t * choreo.FPS, 位置: [shriekPos[0], shriekPos[1], shriekPos[2] + 0.5], 音量: 2, 音高: shriekPitch, 选: shriekPick, 止帧: cutToHuangPan });
  if (choreo.wardenReplyOn) out.push({ 名: '监守者回应', 事件: 'entity.warden.nearby_close', 帧: choreo.darknessStartSec * choreo.FPS, 位置: choreo.wardenReplyPos, 音量: 5, 音高: 1, 选: rand() });
  return out;
})();
export const sounds: SoundCue[] = storySounds.flatMap((sound) => {
  const cutFrame = choreo.toCutFrame(Math.round(sound.帧));
  return cutFrame === undefined ? [] : [{ ...sound, 帧: cutFrame + (sound.帧 - Math.round(sound.帧)) }];
});

const listener = (f: number) => choreo.camera(choreo.toStoryFrame(Math.min(Math.max(Math.round(f), 0), choreo.END - 1))).pos;

export const RulesSound: React.FC = () => (
  <>
    <GameSoundTrack sounds={sounds} listener={listener} />
    <LineTrack 句们={choreo.lines} />
  </>
);
