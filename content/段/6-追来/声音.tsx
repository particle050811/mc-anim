// 6-4-6 追来的声音：两句台词、振动链里的感测体咔嗒和第三次尖啸（落点都是 追兵.ts 的振动链算出来的）、二人落地的那一下。听者是镜头。
// - 第三次尖啸：block.sculk_shrieker.shriek（volume 2；音高、文件沿用占位卡按 rng(6409) 抽的那一组），声源是尖啸体 (−848,−51,215) 顶面，一直响进 6-4-7。
// - 感测体咔嗒：block.sculk_sensor.clicking（volume 1、pitch 0.8 + r × 0.2，16 格外听不见），每个感测体激活那一刻一声；路上那几跳在大道上踩到的感测体也算
//   （第 1 镜跟拍时听得到 (−797,−50,228)、(−821,−51,232) 那几声）。
// - 落地：每一跳落地放一声脚下方块的脚步声。强者从 7 米高落下照原版会摔伤、有 big_fall，这里不放（剧情里他们是强者，不掉血）。
//   哪几声放、归什么档见下面 `audibleLandings`。
// 6-4-5 → 6-4-6 硬切，6-4-4 那声尖啸在 6-4-5 段尾以前已经放完（10 秒多，6-4-5 只有 5.6 秒，剩下的在两百米外，听不见），不接。
import React from 'react';
import type { V3 } from '../../../engine/model/parts.tsx';
import { GameSoundTrack, type SoundCue } from '../../../engine/audio/游戏音效.tsx';
import { LineTrack } from '../../../engine/audio/台词轨.tsx';
import * as choreo from './编排.ts';
import { landingSounds, clickSounds } from '../../场/6-古城/6-4-6/追兵声.ts';

const FPS = choreo.FPS;
const τ0 = choreo.τ(0);
// 用户 10-18 分档：画面上看得见、照游戏也听得见（离镜头 16 格以内）的落地归「中」，其余落地照游戏听不见，不放；
// 黄落地 7 那一串咔嗒里离镜头 19～21 格的两声同样照游戏听不见，不放
const audibleLandings = ['黄叛落地4', '黄叛落地5', '黄叛落地7', '刘心忠落地4', '刘心忠落地7'];
const farClicks = ['咔嗒 感测体 -853,-51,219（黄落地7）', '咔嗒 感测体 -853,-51,222（黄落地7）'];
export const sounds: SoundCue[] = (() => {
  const toSegment = (s: SoundCue[]) => s.map((x) => ({ ...x, 帧: x.帧 - τ0 * FPS })).filter((x) => x.帧 >= -FPS * 2 && x.帧 < choreo.frameCount);
  return [
    ...toSegment(landingSounds)
      .filter((x) => audibleLandings.includes(x.名!))
      .map((x) => ({ ...x, 档: '中' as const })),
    ...toSegment(clickSounds).filter((x) => !farClicks.includes(x.名!)),
    // 黄叛「结构奇怪」在尖啸后 0.9 秒开口，压在尖啸最响的那一截上：归「中」不盖住台词（用户 10-18 分档），6-4-7 接着放的那截同档
    { 名: '第三次尖啸', 事件: 'block.sculk_shrieker.shriek', 档: '中', 帧: choreo.shriekSec * FPS, 位置: choreo.shriekSource as V3, 音量: 2, 音高: 0.8920536637306213, 选: 0.5096602365374565 },
  ];
})();

const listener = (f: number) => choreo.camera(f).pos;

export const ChaseInSound: React.FC = () => (
  <>
    <GameSoundTrack sounds={sounds} listener={listener} />
    <LineTrack 句们={Object.values(choreo.lines)} />
  </>
);
