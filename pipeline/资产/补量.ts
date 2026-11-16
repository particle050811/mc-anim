// anim assets measure：给早先入库、锁里还没有 时长/峰值/响度 的音频条目补上这几个可选字段。
// 只补缺的字段，已有的数、sha256、大小、库、后缀一个不动（指纹只认 sha，补了不让段过期）；字节不在本机的（多半是私有的）跳过并报件数。
// 量法和入库、anim cues 现量同一个函数（音频量.ts 的 量音频数）。
import fs from 'node:fs';
import { bytesPath, type AssetLock, type LockEntry } from './资产锁.ts';
import { measureAudio, audioExtensions, type AudioMetadata } from './音频量.ts';

const measureFields = ['duration', 'peakDb', 'loudness'] as const;

export const isAudioEntry = (e: LockEntry) => audioExtensions.has(e.suffix.toLowerCase());
/** 还没量过的音频条目。有时长就算量过：量音频数 量得出时长才写，峰值、响度和它一起写；
 *  量过仍缺峰值（静音）、响度（太短）的重量也量不出，不再挑，免得 --check 永远报能补、每次重量 */
export const lacksAudioMetadata = (e: LockEntry) => isAudioEntry(e) && e.duration === undefined;

export type FillMeasureResult = {
  assetLock: AssetLock;
  audio: number;
  missing: string[];
  patched: string[];
  noBytes: string[];
  unmeasured: { id: string; cause: string }[];
  /** 量完还缺字段的（静音没有峰值、太短没有积分响度） */
  stillMissing: { id: string; missingFields: string[] }[];
};

export type FillMeasureOptions = { dataRoot: string; checkOnly?: boolean; measure?: (file: string) => AudioMetadata; progress?: (done: number, total: number) => void };

/** 只把量出来、条目里原来没有的字段并进去 */
export const mergeMissing = (e: LockEntry, measured: AudioMetadata): LockEntry => {
  const fill = Object.fromEntries(measureFields.filter((k) => e[k] === undefined && measured[k] !== undefined).map((k) => [k, measured[k]]));
  return { ...e, ...fill };
};

/** 返回新的锁对象（不改传进来的）；只查 时不量、不改，只报缺多少、字节在不在 */
export const fillAudioMetadata = (assetLock: AssetLock, o: FillMeasureOptions): FillMeasureResult => {
  const measure = o.measure ?? measureAudio;
  const nextLock: AssetLock = { ...assetLock };
  const r: FillMeasureResult = { assetLock: nextLock, audio: 0, missing: [], patched: [], noBytes: [], unmeasured: [], stillMissing: [] };
  const ids = Object.keys(assetLock).sort();
  for (const id of ids) if (isAudioEntry(assetLock[id]!)) r.audio++;
  r.missing = ids.filter((id) => lacksAudioMetadata(assetLock[id]!));
  r.missing.forEach((id, i) => {
    const e = assetLock[id]!;
    const file = bytesPath(e, o.dataRoot);
    if (!fs.existsSync(file)) return void r.noBytes.push(id);
    if (o.checkOnly) return;
    o.progress?.(i + 1, r.missing.length);
    let audioMeta: AudioMetadata;
    try {
      audioMeta = measure(file);
    } catch (err) {
      return void r.unmeasured.push({ id, cause: (err as Error).message.split('\n')[0]! });
    }
    const filled = mergeMissing(e, audioMeta);
    if (measureFields.some((k) => filled[k] !== e[k])) {
      nextLock[id] = filled;
      r.patched.push(id);
    }
    const missingKeys = measureFields.filter((k) => filled[k] === undefined);
    if (missingKeys.length) r.stillMissing.push({ id, missingFields: [...missingKeys] });
  });
  return r;
};
