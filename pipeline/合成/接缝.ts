// 接缝：后一段首帧和前一段末帧画面、声音都一样（段与段共用了一帧）只报警，两帧都留（用户 10-18 定：段与段不共用帧，要去掉就改那段的编排）。
// 判法照旧项目 合成第六章.py 的 judge_seam：160×90 灰度平均差 ≤ 2 才看声音；两帧声音都低于 −60 dB，或相关 > 0.6 且响度差 < 1.5 dB，算首帧重复。
// 相关 0.6：一镜到底相邻两段同一个全局帧，配乐一样，但有的音效只在一边；声音接着往下放的在 0 上下。
// 两头的画面、声音可以取自母版，也可以取自段签（首尾帧小图是同一条 ffmpeg 从无损抽样帧缩的，声音从 声音.flac 截，取出来和母版逐位相同）。
import { 配置 } from '../环境/配置.ts';
import { 跑出字节 } from '../环境/子进程.ts';
import { 转float } from './音频.ts';

export const 灰度帧 = (file: string, 帧: number) =>
  跑出字节([配置('ffmpeg'), '-v', 'error', '-i', file, '-vf', `select=eq(n\\,${帧}),scale=160:90,format=gray`, '-vframes', '1', '-f', 'rawvideo', '-']);

export const 一帧声音 = (file: string, 帧: number, 每帧样本: number) =>
  转float(跑出字节([配置('ffmpeg'), '-v', 'error', '-i', file, '-vn', '-af', `atrim=start_sample=${帧 * 每帧样本}:end_sample=${(帧 + 1) * 每帧样本}`, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']));

export type 接缝判断 = '首帧重复' | '正常';

/** 接缝一头：那一帧的 160×90 灰度和那一帧的声音（单声道 float） */
export type 接缝端 = { 灰度: () => Buffer; 声音: (每帧样本: number) => Float32Array };
export const 母版端 = (文件: string, 帧: number): 接缝端 => ({ 灰度: () => 灰度帧(文件, 帧), 声音: (n) => 一帧声音(文件, 帧, n) });

export const 判接缝 = (前端: 接缝端 | { 文件: string; 帧: number }, 后端: 接缝端 | { 文件: string; 帧: number }, 每帧样本: number): 接缝判断 => {
  const 前 = '文件' in 前端 ? 母版端(前端.文件, 前端.帧) : 前端;
  const 后 = '文件' in 后端 ? 母版端(后端.文件, 后端.帧) : 后端;
  const a = 前.灰度();
  const b = 后.灰度();
  if (!a.length || a.length !== b.length) return '正常';
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i]! - b[i]!);
  if (d / a.length > 2.0) return '正常';
  const x = 前.声音(每帧样本);
  const y = 后.声音(每帧样本);
  const n = Math.min(x.length, y.length);
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < n; i++) (xx += x[i]! * x[i]!), (yy += y[i]! * y[i]!), (xy += x[i]! * y[i]!);
  const rx = Math.sqrt(xx / Math.max(n, 1) + 1e-20);
  const ry = Math.sqrt(yy / Math.max(n, 1) + 1e-20);
  if (20 * Math.log10(rx) < -60 && 20 * Math.log10(ry) < -60) return '首帧重复';
  const 相关 = xy / (Math.sqrt(xx) * Math.sqrt(yy) + 1e-20);
  return 相关 > 0.6 && Math.abs(20 * Math.log10(rx / ry)) < 1.5 ? '首帧重复' : '正常';
};
