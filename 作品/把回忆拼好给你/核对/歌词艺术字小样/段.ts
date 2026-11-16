// 歌词艺术字小样：第 8 句「将快乐全都收集 / 将不开心全都淘汰」在门口机位上逐字由符文拼出（断两行、错落），会动、带原声（听着节奏看每个字是不是唱到时正好拼齐）。
// 窗口从第 7 句末两字到第 9 句前几个字（歌上 24.40–29.50 秒），看得到上一句退、这一句提前进场、符文一个字一个字飞来拼字、下一句接上。底是 核对-歌词艺术字 的门口那一帧，定住不动。
// 原声由 definePicture 照 cue 放。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, toSongFrame, aspect } from '../../分镜/时间.ts';

/** 歌上的起帧、止帧（不含） */
export const frameWindow = { 起帧: toSongFrame(24.4), 止帧: toSongFrame(29.5) } as const;
const frameCount = frameWindow.止帧 - frameWindow.起帧;

export default defineSeg({
  scene: '核对',
  sec: frameCount / fps,
  width: aspect.width,
  height: aspect.height,
  terrain: [],
  sound: [{ sec: 0, 长秒: frameCount / fps, 入点秒: frameWindow.起帧 / fps, asset: '配乐/把回忆拼好给你-无男声DJ', name: '原声', 增益: 0.5 }],
});
