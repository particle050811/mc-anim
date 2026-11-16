// 按句取嘴：句口型(句们, '李樱', 帧) → { open, width }，没在说话返回 undefined；句们同 <台词句轨 句们>（句来自作品的 台词/<id>.ts，帧 = 开口那帧）。
// 嘴型过渡、提前量、点头原样用 口型.ts 的 mouthAt、withTalkNod：同一句新旧两条路动出来的嘴一样。只给说出口的台词（作品规矩「台词说出口」）。
import { mouthAt, withTalkNod, type LipData } from './口型.ts';
import type { LineCue } from '@engine/audio/台词句.ts';

const buildLipData = (lineCues: readonly LineCue[]): LipData => {
  const lip: Record<string, { 嘴: [number, string][] }> = {};
  const lineStarts: Record<string, { 角色: string; 开口: number }> = {};
  for (const { 句: sentence } of lineCues) {
    lip[sentence.id] = { 嘴: sentence.嘴 as [number, string][] };
    lineStarts[sentence.id] = { 角色: sentence.character, 开口: sentence.mouthOpen };
  }
  return { lip: lip, lines: lineStarts };
};
const cueFrames = (lineCues: readonly LineCue[]) => lineCues.map(({ 句: sentence, frame: frame }) => ({ id: sentence.id, frame: frame }));

export const sentenceLip = (lineCues: readonly LineCue[], speaker: string, frame: number, fps: number) => mouthAt(buildLipData(lineCues), cueFrames(lineCues), speaker, frame, fps);

/** 脸上没嘴的人说话时头随字轻点，用法同 口型.ts 的 withTalkNod */
export const sentenceNod = <P extends { headPitch: number; headYaw: number }>(pose: P, lineCues: readonly LineCue[], speaker: string, frame: number, fps: number): P =>
  withTalkNod(buildLipData(lineCues), pose, cueFrames(lineCues), speaker, frame, fps);
