// 按句取嘴：句口型(句们, '李樱', 帧) → { open, width }，没在说话返回 undefined；句们同 <台词句轨 句们>（句来自作品的 台词/<id>.ts，帧 = 开口那帧）。
// 嘴型过渡、提前量、点头原样用 口型.ts 的 mouthAt、withTalkNod：同一句新旧两条路动出来的嘴一样。只给说出口的台词（作品规矩「台词说出口」）。
import { mouthAt, withTalkNod, type 口型数据 } from './口型.ts';
import type { 台词句cue } from '@engine/audio/台词句.ts';

const 数据 = (句们: readonly 台词句cue[]): 口型数据 => {
  const 口型: Record<string, { 嘴: [number, string][] }> = {};
  const 台词: Record<string, { 角色: string; 开口: number }> = {};
  for (const { 句 } of 句们) {
    口型[句.id] = { 嘴: 句.嘴 as [number, string][] };
    台词[句.id] = { 角色: 句.角色, 开口: 句.开口 };
  }
  return { 口型, 台词 };
};
const 帧们 = (句们: readonly 台词句cue[]) => 句们.map(({ 句, 帧 }) => ({ id: 句.id, 帧 }));

export const 句口型 = (句们: readonly 台词句cue[], 角色: string, 帧: number, fps = 24) => mouthAt(数据(句们), 帧们(句们), 角色, 帧, fps);

/** 脸上没嘴的人说话时头随字轻点，用法同 口型.ts 的 withTalkNod */
export const 句点头 = <P extends { headPitch: number; headYaw: number }>(pose: P, 句们: readonly 台词句cue[], 角色: string, 帧: number, fps = 24): P =>
  withTalkNod(数据(句们), pose, 帧们(句们), 角色, 帧, fps);

export { CLOSED, MOUTH_SHAPES, type Mouth } from './口型.ts';
