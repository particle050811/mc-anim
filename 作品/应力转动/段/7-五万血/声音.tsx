// 7-2-1 五万血的声音：本场的游戏音效（../7-2/声音.ts）在这一段一声也没有。
// 远景是第 1 场同一刻（用户 10-19 定），第 1 场的声音（../7-1/声音.tsx 的表）照游戏规矩挑：声源离他（V 上的眼睛）比这一声的可听范围（max(音量, 1) × attenuation_distance）近才放，
//   55～90 米外多数听不见（脚步、箭、护盾），留下的是范围大的（监守者触角、心跳这类 5.0 音量的）。响度照分档（混音.ts）；段尾淡掉（下一段切开箱）。
// 台词「五万血？！这我打个集贸啊！」（镜 Jade 里，画外音）、「溜了溜了。」（起跳时）开口帧在 编排.ts 的 台词；配音在 src/配音/（工具/配音/生成台词.py），按开口帧挂台词轨。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { GameSoundTrack, resolveSound, type SoundCue } from '@engine/audio/游戏音效.tsx';
import { LineTrack } from '../../配音/台词轨.tsx';
import { FPS } from '../../地点/古城4x/6-4-1/古城戏.ts';
import { sceneSounds as scene1Sounds } from '../../地点/古城4x/7-1/声音.tsx';
import { sceneSounds } from '../../场/7-李樱撤离/7-2/声音.ts';
import * as geom from '../../场/7-李樱撤离/7-2/几何.ts';
import * as play from '../../场/7-李樱撤离/7-2/戏.ts';
import * as choreo from './编排.ts';

const ear: V3 = [geom.roofFeet[0], geom.roofFeet[1], geom.roofFeet[2] + 1.62];
// 第 1 场时刻 t → 本场帧（t = 远景t起 + 场内秒）；只取这一段里响起的
export const farSounds: SoundCue[] = (() => {
  const segFrom = choreo.sf(0);
  const segTo = choreo.sf(choreo.帧数);
  return scene1Sounds
    .map(({ t, 止t: _, ...sound }) => ({ ...sound, 帧: (t - play.远景t起) * FPS, 止帧: segTo }))
    .filter((s) => s.帧 >= segFrom && s.帧 < segTo)
    .filter((s) => Math.hypot(s.位置[0] - ear[0], s.位置[1] - ear[1], s.位置[2] - ear[2]) < resolveSound(s).range);
})();

export const FiftyKHpSound: React.FC = () => (
  <>
    <GameSoundTrack sounds={[...sceneSounds, ...farSounds]} listener={(f) => choreo.camera(f - choreo.段起).pos} startFrame={choreo.段起} frameCount={choreo.帧数} />
    <LineTrack 句们={choreo.台词.map(({ id, 帧: frame }) => ({ id, 帧: frame }))} />
  </>
);
