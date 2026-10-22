// 6-4-7至9 的声音：三截的声音表（../6-4-7/、../6-4-8/、../6-4-9/ 的 声音.tsx，段内帧）换到合成段的帧上一条轨放，听者是镜头。
// 一个镜头里不截断：上一截没放完的声音接着响进下一截。只有这几处照用户定的掐掉：
//   - 第四次尖啸用 6-4-7 那份（6-4-8 表里同一声不放），响到 6-4-9 第一镜开头就掐（听不见了）；6-4-8 的心跳也不带进 6-4-9；
//   - 钻出的轰响在 6-4-9 第一镜（接 6-4-8 的机位）末尾淡完，不带进大口特写（用户 10-18）。
import React from 'react';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { GameSoundTrack, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import { LineTrack } from '../../../../world/配音/台词轨.tsx';
import * as K647 from '../6-4-7/编排.ts';
import { sounds as sounds647 } from '../6-4-7/声音.tsx';
import * as K648 from '../../../../world/地点/古城4x/6-4-8/编排.ts';
import { sounds as sounds648 } from '../6-4-8/声音.tsx';
import * as K649 from '../../../../world/地点/古城4x/6-4-9/编排.ts';
import { sounds as sounds649 } from '../../../../world/地点/古城4x/6-4-9/声音.tsx';
import { partAt, partStartFrame, toMergedFrame } from './时间线.ts';

const start649 = partStartFrame['6-4-9'];
const emergeFadeEnd = toMergedFrame('6-4-9', K649.shot1End);
export const sounds: SoundCue[] = [
  ...sounds647.map((s) => ({ ...s, ...(s.事件 === 'block.sculk_shrieker.shriek' ? { 止帧: start649 } : {}) })),
  ...sounds648
    .filter((s) => s.名 !== '第四次尖啸')
    .map((s) => ({
      ...s,
      帧: toMergedFrame('6-4-8', s.帧),
      ...(s.事件 === 'entity.warden.heartbeat' ? { 止帧: start649 } : s.事件 === 'entity.warden.emerge' ? { 止帧: emergeFadeEnd } : {}),
    })),
  ...sounds649.map((s) => ({ ...s, 帧: toMergedFrame('6-4-9', s.帧) })),
];

export const listener = (frame: number): V3 => {
  const { id, f } = partAt(frame);
  return id === '6-4-7' ? K647.camera(f).pos : id === '6-4-8' ? K648.camera(f).pos : K649.camera(f).pos;
};

export const GloryEmergeRevealSound: React.FC = () => (
  <>
    <GameSoundTrack sounds={sounds} listener={listener} />
    <LineTrack 句们={Object.values(K647.lines)} />
  </>
);
