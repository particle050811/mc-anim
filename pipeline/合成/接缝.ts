// 接缝：后一段首帧和前一段末帧画面、声音都一样（段与段共用了一帧）只报警，两帧都留（用户 10-18 定：段与段不共用帧，要去掉就改那段的编排）。
// 判法照旧项目 合成第六章.py 的 judge_seam：160×90 灰度平均差 ≤ 2 才看声音；两帧声音都低于 −60 dB，或相关 > 0.6 且响度差 < 1.5 dB，算首帧重复。
// 相关 0.6：一镜到底相邻两段同一个全局帧，配乐一样，但有的音效只在一边；声音接着往下放的在 0 上下。
// 两头的画面、声音可以取自母版，也可以取自段签（首尾帧小图是派生段签时从切片用同一个滤镜缩的，声音从 声音.flac 截，取出来和母版逐位相同）。
import { config } from '../环境/配置.ts';
import { runCaptureBytes } from '../环境/子进程.ts';
import { toFloat32 } from './音频.ts';

/** 接缝比的小图：160×90 灰度（段签的首尾帧小图也用它，见 验收.ts 的 扫母版） */
export const grayFilter = 'scale=160:90,format=gray';

export const grayFrame = (file: string, frame: number) =>
  runCaptureBytes([config('ffmpeg'), '-v', 'error', '-i', file, '-vf', `select=eq(n\\,${frame}),${grayFilter}`, '-vframes', '1', '-f', 'rawvideo', '-']);

export const frameAudio = (file: string, frame: number, samplesPerFrame: number) =>
  toFloat32(runCaptureBytes([config('ffmpeg'), '-v', 'error', '-i', file, '-vn', '-af', `atrim=start_sample=${frame * samplesPerFrame}:end_sample=${(frame + 1) * samplesPerFrame}`, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']));

export type SeamVerdict = '首帧重复' | '正常';

/** 接缝一头：那一帧的 160×90 灰度和那一帧的声音（单声道 float） */
export type SeamSide = { grayFrame: () => Buffer; 声音: (samplesPerFrame: number) => Float32Array };
export const masterSide = (file: string, frame: number): SeamSide => ({ grayFrame: () => grayFrame(file, frame), 声音: (n) => frameAudio(file, frame, n) });

export const judgeSeam = (frontSide: SeamSide | { 文件: string; 帧: number }, backEnd: SeamSide | { 文件: string; 帧: number }, samplesPerFrame: number): SeamVerdict => {
  const front = '文件' in frontSide ? masterSide(frontSide.文件, frontSide.帧) : frontSide;
  const backSide = '文件' in backEnd ? masterSide(backEnd.文件, backEnd.帧) : backEnd;
  const a = front.grayFrame();
  const b = backSide.grayFrame();
  if (!a.length || a.length !== b.length) return '正常';
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i]! - b[i]!);
  if (d / a.length > 2.0) return '正常';
  const x = front.声音(samplesPerFrame);
  const y = backSide.声音(samplesPerFrame);
  const n = Math.min(x.length, y.length);
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < n; i++) (xx += x[i]! * x[i]!), (yy += y[i]! * y[i]!), (xy += x[i]! * y[i]!);
  const rx = Math.sqrt(xx / Math.max(n, 1) + 1e-20);
  const ry = Math.sqrt(yy / Math.max(n, 1) + 1e-20);
  if (20 * Math.log10(rx) < -60 && 20 * Math.log10(ry) < -60) return '首帧重复';
  const correlation = xy / (Math.sqrt(xx) * Math.sqrt(yy) + 1e-20);
  return correlation > 0.6 && Math.abs(20 * Math.log10(rx / ry)) < 1.5 ? '首帧重复' : '正常';
};
