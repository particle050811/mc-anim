// 7-2-2至3 开到了、传送的声音：本场的游戏音效（../7-2/声音.ts）截这一段：开箱、三个感测体咔嗒、尖啸（传走前淡完）、clicking_stop、关箱、关箱后感测体再咔嗒一遍、
// 传送石按住（block.portal.trigger）、传走（block.portal.travel）。界面里移东西原版没有声音。听者是镜头。
// 台词「开到了！」开口帧在 编排.ts 的 台词；配音在 src/配音/（工具/配音/生成台词.py），按开口帧挂台词轨。
import React from 'react';
import { GameSoundTrack } from '@engine/audio/游戏音效.tsx';
import { LineTrack } from '../../配音/台词轨.tsx';
import { sceneSounds } from '../../场/7-李樱撤离/7-2/声音.ts';
import * as choreo from './编排.ts';

// 段尾淡出：下一段 7-3-1 硬切到别的场，传走声还在响
export const GotItTeleportSound: React.FC = () => (
  <>
    <GameSoundTrack sounds={sceneSounds} listener={(f) => choreo.camera(f - choreo.段起).pos} startFrame={choreo.段起} frameCount={choreo.帧数} tailFade />
    <LineTrack 句们={choreo.台词.map(({ id, 帧: frame }) => ({ id, 帧: frame }))} />
  </>
);
