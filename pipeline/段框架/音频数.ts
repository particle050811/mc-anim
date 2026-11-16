// 声音表要的音频数（时长秒、采样峰值 dBFS、积分响度 LUFS）：资产锁条目里有就用锁里的（assets add 入库时量的），
// 没有就现量（资产/音频量.ts，和入库同一个量法）；量过的按 sha 缓存在 <数据根>/cache/音频数/<sha>.json。
// 只给 anim cues 生成声音表用，数写进生成的文件（段指纹按那个文件算），这里本身不进指纹。
import fs from 'node:fs';
import path from 'node:path';
import type { AudioInfo } from '../../engine/段/声音助手.ts';
import { measureAudio } from '../资产/音频量.ts';
import { bytesPath, type LockEntry } from '../资产/资产锁.ts';

/** 锁条目里量好的可选字段（assets add 入库时写的；老条目没有） */
type MeasuredEntry = LockEntry & Partial<AudioInfo>;

/** 和入库、assets measure 用同一个量法，锁里的数和这里现量的逐位一样 */
export const measureAudioFile = (file: string): AudioInfo => measureAudio(file);

/** 不量就知道的数：锁里有时长就用锁的，否则读量过的缓存；都没有给 undefined。根 不给就不读缓存 */
export const knownAudioMeasure = (entry: LockEntry | undefined, dataRoot?: string): AudioInfo | undefined => {
  if (!entry) return undefined;
  const e = entry as MeasuredEntry;
  if (typeof e.duration === 'number') return { duration: e.duration, ...(e.peakDb !== undefined ? { peakDb: e.peakDb } : {}), ...(e.loudness !== undefined ? { loudness: e.loudness } : {}) };
  if (!dataRoot) return undefined;
  const cachePath = cacheLocation(entry, dataRoot);
  return fs.existsSync(cachePath) ? (JSON.parse(fs.readFileSync(cachePath, 'utf8')) as AudioInfo) : undefined;
};

const cacheLocation = (entry: LockEntry, dataRoot: string) => path.join(dataRoot, 'cache', '音频数', `${entry.sha256}.json`);

/** 一件音频资产的数：锁里、缓存里有就用，否则现量（字节要在数据根里）并写缓存 */
export const getAudioMeasure = (id: string, entry: LockEntry | undefined, dataRoot: string, measure = measureAudioFile): AudioInfo => {
  if (!entry) throw new Error(`资产锁里没有「${id}」：先登记、anim assets add 入库`);
  const knownCount = knownAudioMeasure(entry, dataRoot);
  if (knownCount) return knownCount;
  const file = bytesPath(entry, dataRoot);
  if (!fs.existsSync(file)) throw new Error(`「${id}」的字节不在数据根（${file}），量不了时长、峰值：先 anim assets pull 或从别的机器同步`);
  const r = measure(file);
  const cachePath = cacheLocation(entry, dataRoot);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(r) + '\n', 'utf8');
  fs.renameSync(tempPath, cachePath);
  return r;
};
