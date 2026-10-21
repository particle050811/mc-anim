// 接缝：后一段首帧和前一段末帧画面、声音都一样（段与段共用了一帧）只报警，两帧都留（用户 10-18 定：段与段不共用帧，要去掉就改那段的编排）。
// 判法照旧项目 合成第六章.py 的 judge_seam：160×90 灰度平均差 ≤ 2 才看声音；两帧声音都低于 −60 dB，或相关 > 0.6 且响度差 < 1.5 dB，算首帧重复。
// 相关 0.6：一镜到底相邻两段同一个全局帧，配乐一样，但有的音效只在一边；声音接着往下放的在 0 上下。
import { 配置 } from '../环境/配置.ts';
import { 跑出字节 } from '../环境/子进程.ts';
import { 转float } from './音频.ts';

const 灰度帧 = (file: string, 帧: number) =>
  跑出字节([配置('ffmpeg'), '-v', 'error', '-i', file, '-vf', `select=eq(n\\,${帧}),scale=160:90,format=gray`, '-vframes', '1', '-f', 'rawvideo', '-']);

const 一帧声音 = (file: string, 帧: number, 每帧样本: number) =>
  转float(跑出字节([配置('ffmpeg'), '-v', 'error', '-i', file, '-vn', '-af', `atrim=start_sample=${帧 * 每帧样本}:end_sample=${(帧 + 1) * 每帧样本}`, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']));

export type 接缝判断 = '首帧重复' | '正常';

export const 判接缝 = (前: { 文件: string; 帧: number }, 后: { 文件: string; 帧: number }, 每帧样本: number): 接缝判断 => {
  const a = 灰度帧(前.文件, 前.帧);
  const b = 灰度帧(后.文件, 后.帧);
  if (!a.length || a.length !== b.length) return '正常';
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i]! - b[i]!);
  if (d / a.length > 2.0) return '正常';
  const x = 一帧声音(前.文件, 前.帧, 每帧样本);
  const y = 一帧声音(后.文件, 后.帧, 每帧样本);
  const n = Math.min(x.length, y.length);
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < n; i++) (xx += x[i]! * x[i]!), (yy += y[i]! * y[i]!), (xy += x[i]! * y[i]!);
  const rx = Math.sqrt(xx / Math.max(n, 1) + 1e-20);
  const ry = Math.sqrt(yy / Math.max(n, 1) + 1e-20);
  if (20 * Math.log10(rx) < -60 && 20 * Math.log10(ry) < -60) return '首帧重复';
  const 相关 = xy / (Math.sqrt(xx) * Math.sqrt(yy) + 1e-20);
  return 相关 > 0.6 && Math.abs(20 * Math.log10(rx / ry)) < 1.5 ? '首帧重复' : '正常';
};
