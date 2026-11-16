// 第 7 章各场时间线的段界：切镜那一刻落到最近的一帧（1/60 秒）上；一场的帧从首段第 0 帧起连着数，前一段末帧的下一帧就是后一段的第 0 帧。
// 用户 11-16 定：1/24 秒格的取整一处不留（最后按 60 帧渲）。段长是整帧，段界只好落在帧上，离切点不超过半帧。
import { segFps } from '@engine/段/段定义.ts';

export const sceneFrames = (firstT: number) => ({
  frameAt: (t: number) => Math.round((t - firstT) * segFps),
  tAtFrame: (frame: number) => firstT + frame / segFps,
});
