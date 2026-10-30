// 音频入库时顺手量出的元数据，作为可选字段写进资产锁：时长（秒）、峰值（采样峰值 dBFS）、响度（EBU R128 积分响度 LUFS）。
// 给按目标响度挂 cue 的助手用（比如「放(资产, 帧, 目标dB)」算增益），不用每次现解码。
// 指纹只认锁里的 sha256（指纹/默克尔.ts、资产/esbuild插件.ts），这几个字段加不加、变不变都不让段过期。
// ffmpeg 的 ebur128 出积分响度和采样峰值，ffprobe 出时长。量法全仓库只有这一份：入库、assets measure 补老条目、anim cues 现量（段框架/音频数.ts）都调这里，
// 锁里的数和 cue 助手 放() 现量的数才逐位一样。
import path from 'node:path';
import { 配置 } from '../环境/配置.ts';
import { 试跑 } from '../环境/子进程.ts';
import type { 锁条目 } from './资产锁.ts';

export const 音频后缀 = new Set(['.ogg', '.wav', '.mp3', '.m4a', '.flac', '.aac', '.opus']);
export const 是音频 = (文件: string) => 音频后缀.has(path.extname(文件).toLowerCase());

export type 音频元数据 = Pick<锁条目, '时长' | '峰值' | '响度'>;

/** 解析 ffmpeg -af ebur128=peak=sample 的 stderr 和 ffprobe 的时长；静音的峰值是 -inf，量不出的字段不给 */
export const 解析ebur128 = (stderr: string, 时长?: string): 音频元数据 => {
  const 汇总 = stderr.slice(stderr.lastIndexOf('Summary:'));
  const 数 = (re: RegExp, s: string) => {
    const m = re.exec(s)?.[1];
    return m === undefined || m === '-inf' ? undefined : Number(m);
  };
  const r: 音频元数据 = {};
  const lufs = 数(/I:\s+(-?[\d.]+|-inf) LUFS/, 汇总);
  const peak = 数(/Peak:\s+(-?[\d.]+|-inf) dBFS/, 汇总);
  const t = Number(时长?.trim());
  if (时长?.trim() && Number.isFinite(t)) r.时长 = Math.round(t * 1e6) / 1e6;
  if (peak !== undefined && Number.isFinite(peak)) r.峰值 = Math.round(peak * 100) / 100;
  if (lufs !== undefined && Number.isFinite(lufs)) r.响度 = Math.round(lufs * 100) / 100;
  return r;
};

/** 量一个音频文件；ffmpeg 失败就抛 */
export const 量音频 = (文件: string): 音频元数据 => {
  const r = 试跑([配置('ffmpeg'), '-hide_banner', '-nostats', '-nostdin', '-i', 文件, '-map', '0:a:0', '-af', 'ebur128=peak=sample', '-f', 'null', '-']);
  if (r.退出码 !== 0) throw new Error(`量不了 ${文件}：${r.stderr.slice(-300)}`);
  const d = 试跑([配置('ffprobe'), '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 文件]);
  return 解析ebur128(r.stderr, d.退出码 === 0 ? d.stdout : undefined);
};

/** 量一个音频文件，时长必须量得出（声音表、补锁都要时长）；峰值、响度量不出（静音）照常不给 */
export const 量音频数 = (文件: string): 音频元数据 & { 时长: number } => {
  const r = 量音频(文件);
  if (r.时长 === undefined || !(r.时长 > 0)) throw new Error(`ffprobe 量不出 ${文件} 的时长`);
  return { ...r, 时长: r.时长 };
};

/** 是音频就量了并进锁条目，不是原样返回。量不出（没装 ffmpeg、文件解不开）只警告：这几个字段可选，不挡入库 */
export const 带音频元数据 = (条目: 锁条目, 文件: string): 锁条目 => {
  if (!是音频(文件) && !音频后缀.has(条目.后缀)) return 条目;
  try {
    return { ...条目, ...量音频(文件) };
  } catch (e) {
    console.warn(`（没量出时长、响度：${(e as Error).message.split('\n')[0]}）`);
    return 条目;
  }
};
