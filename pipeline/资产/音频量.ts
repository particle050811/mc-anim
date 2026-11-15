// 音频入库时顺手量出的元数据，作为可选字段写进资产锁：时长（秒）、峰值（采样峰值 dBFS）、响度（EBU R128 积分响度 LUFS）。
// 给按目标响度挂 cue 的助手用（比如「放(资产, 帧, 目标dB)」算增益），不用每次现解码。
// 指纹只认锁里的 sha256（指纹/默克尔.ts、资产/esbuild插件.ts），这几个字段加不加、变不变都不让段过期。
// ffmpeg 的 ebur128 出积分响度和峰值，ffprobe 出时长。量法全仓库（TS 这边）只有这一份：入库、assets measure 补老条目、anim cues 现量（段框架/音频数.ts）、
// 出片量成片和分享版（合成/成片.ts）、验收量整段响度（验收/比较.ts）都调这里，锁里的数和 cue 助手 放() 现量的数才逐位一样。
// Python 的配音链（py/anim_py/配音/处理.py）自己调 ffmpeg 量，同一个滤镜。
import path from 'node:path';
import { config } from '../环境/配置.ts';
import { lowPriority, tryRun } from '../环境/子进程.ts';
import type { LockEntry } from './资产锁.ts';

export const audioExtensions = new Set(['.ogg', '.wav', '.mp3', '.m4a', '.flac', '.aac', '.opus']);
export const isAudio = (file: string) => audioExtensions.has(path.extname(file).toLowerCase());

export type AudioMetadata = Pick<LockEntry, '时长' | '峰值' | '响度'>;

/** ebur128 汇总里的积分响度（LUFS）、峰值（dBFS）；-inf 给 -Infinity，没有的不给 */
const readEbur128Summary = (stderr: string): { lufs?: number; peak?: number } => {
  const ebuSummary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const matchNum = (re: RegExp) => {
    const m = re.exec(ebuSummary)?.[1];
    return m === undefined ? undefined : m === '-inf' ? -Infinity : Number(m);
  };
  return { lufs: matchNum(/I:\s+(-?[\d.]+|-inf) LUFS/), peak: matchNum(/Peak:\s+(-?[\d.]+|-inf) dBFS/) };
};

/** ffmpeg 的 ebur128 量第一条音轨：积分响度（LUFS）、峰值（dBFS，peak 选采样峰或真峰）；静音是 -Infinity，汇总里没有的不给。ffmpeg 失败就抛 */
export const measureEbur128 = (file: string, o: { peak?: 'sample' | 'true'; lowPriority?: boolean } = {}) => {
  const cmd = [config('ffmpeg'), '-hide_banner', '-nostats', '-nostdin', '-i', file, '-map', '0:a:0', '-af', `ebur128=peak=${o.peak ?? 'sample'}:framelog=quiet`, '-f', 'null', '-'];
  const r = tryRun(o.lowPriority ? lowPriority(cmd) : cmd); // ebur128 的汇总写在 stderr
  if (r.退出码 !== 0) throw new Error(`量不了 ${file}：${r.stderr.slice(-300)}`);
  return { ...readEbur128Summary(r.stderr), stderr: r.stderr };
};

/** 解析 ffmpeg -af ebur128=peak=sample 的 stderr 和 ffprobe 的时长；静音的峰值是 -inf，量不出的字段不给 */
export const parseEbur128 = (stderr: string, durationText?: string): AudioMetadata => {
  const r: AudioMetadata = {};
  const { lufs, peak } = readEbur128Summary(stderr);
  const t = Number(durationText?.trim());
  if (durationText?.trim() && Number.isFinite(t)) r.时长 = Math.round(t * 1e6) / 1e6;
  if (peak !== undefined && Number.isFinite(peak)) r.峰值 = Math.round(peak * 100) / 100;
  if (lufs !== undefined && Number.isFinite(lufs)) r.响度 = Math.round(lufs * 100) / 100;
  return r;
};

/** 量一个音频文件；ffmpeg 失败就抛 */
export const measureAudioFile = (file: string): AudioMetadata => {
  const { stderr } = measureEbur128(file);
  const d = tryRun([config('ffprobe'), '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseEbur128(stderr, d.退出码 === 0 ? d.stdout : undefined);
};

/** 量一个音频文件，时长必须量得出（声音表、补锁都要时长）；峰值、响度量不出（静音）照常不给 */
export const measureAudio = (file: string): AudioMetadata & { 时长: number } => {
  const r = measureAudioFile(file);
  if (r.时长 === undefined || !(r.时长 > 0)) throw new Error(`ffprobe 量不出 ${file} 的时长`);
  return { ...r, 时长: r.时长 };
};

/** 是音频就量了并进锁条目，不是原样返回。量不出（没装 ffmpeg、文件解不开）只警告：这几个字段可选，不挡入库 */
export const withAudioMetadata = (entry: LockEntry, file: string): LockEntry => {
  if (!isAudio(file) && !audioExtensions.has(entry.后缀)) return entry;
  try {
    return { ...entry, ...measureAudioFile(file) };
  } catch (e) {
    console.warn(`（没量出时长、响度：${(e as Error).message.split('\n')[0]}）`);
    return entry;
  }
};
