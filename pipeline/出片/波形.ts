// 时间轴音频块上画的波形（用户 11-19：「和剪映的感觉不是很像，音频条上面没有显示出波形」）：每件用到的资产一份峰值包络，写进时间轴 json 的 waveforms。
// 量法：ffmpeg 解成 48 kHz 双声道 float，每 1/perSec 秒一格取两声道 |样本| 的最大值，换成 dBFS 后把 [floorDb, 0] 线性映射到 0–255（低于 floorDb 是 0）。
// 用 dB 不用线性：音效 cue 常压到 -20 dB 以下，线性的话播放器再乘上增益就扁成一条线。整文件的包络按字节 sha256 缓存在 <数据根>/cache/波形/，
// 时间轴里只放片里实际放到的那一段文件区间（同一资产各截的最小入点到最大出点），整份文件一首曲子 3 分多钟、片里只放十几秒。
import fs from 'node:fs';
import path from 'node:path';
import { toFloat32 } from '../合成/音频.ts';
import { config } from '../环境/配置.ts';
import { lowPriority, runCaptureBytes } from '../环境/子进程.ts';
import { bytesPath, type LockEntry } from '../资产/资产锁.ts';
import type { TimelineAudio, TimelineWaveform } from './时间轴.ts';

export const waveformPerSec = 100;
export const waveformFloorDb = -60;
const sampleRate = 48000;
/** 缓存文件的量法版本：量法、perSec、floorDb 改了就加一，旧缓存自然不认 */
const cacheVersion = 1;


/** 线性峰值（1 = 满幅）→ 0–255：dBFS 在 [floorDb, 0] 里线性映射，满幅以上记 255 */
export const peakByte = (peak: number, floorDb = waveformFloorDb) => {
  if (!(peak > 0)) return 0;
  const db = 20 * Math.log10(peak);
  return Math.max(0, Math.min(255, Math.round(((db - floorDb) / -floorDb) * 255)));
};

/** 交错的多声道 float PCM → 每格一个峰值字节（最后不满一格的也算一格） */
export const peaksFromPcm = (pcm: Float32Array, channels: number, rate: number, perSec = waveformPerSec): Uint8Array => {
  const frames = Math.floor(pcm.length / channels);
  const cell = rate / perSec;
  const out = new Uint8Array(Math.ceil(frames / cell));
  for (let i = 0; i < out.length; i++) {
    let peak = 0;
    const end = Math.min(frames, Math.round((i + 1) * cell)) * channels;
    for (let j = Math.round(i * cell) * channels; j < end; j++) {
      const v = Math.abs(pcm[j]!);
      if (v > peak) peak = v;
    }
    out[i] = peakByte(peak);
  }
  return out;
};

const decodePeaks = (file: string) => {
  const pcm = toFloat32(runCaptureBytes(lowPriority([config('ffmpeg'), '-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-ac', '2', '-ar', String(sampleRate), '-f', 'f32le', '-'])));
  return peaksFromPcm(pcm, 2, sampleRate);
};

type CacheFile = { version: number; perSec: number; floorDb: number; peaks: string };

/** 一件资产整份文件的峰值：缓存里有就读，没有就解码、写缓存。字节不在数据根给 null */
export const assetPeaks = (entry: LockEntry, dataRoot: string, decode = decodePeaks): Uint8Array | null => {
  const cache = path.join(dataRoot, 'cache', '波形', `${entry.sha256}.json`);
  if (fs.existsSync(cache)) {
    const c = JSON.parse(fs.readFileSync(cache, 'utf8')) as CacheFile;
    if (c.version === cacheVersion && c.perSec === waveformPerSec && c.floorDb === waveformFloorDb) return new Uint8Array(Buffer.from(c.peaks, 'base64'));
  }
  const file = bytesPath(entry, dataRoot);
  if (!fs.existsSync(file)) return null;
  const peaks = decode(file);
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  const tmp = `${cache}.${process.pid}.tmp`;
  const body: CacheFile = { version: cacheVersion, perSec: waveformPerSec, floorDb: waveformFloorDb, peaks: Buffer.from(peaks).toString('base64') };
  fs.writeFileSync(tmp, JSON.stringify(body) + '\n', 'utf8');
  fs.renameSync(tmp, cache);
  return peaks;
};

/** 片里放到了一件资产文件的哪一段：各截 [入点, 入点 + 长 × 速率] 的并（循环的算整份），夹在文件长里；换成格号 [i0, i1) */
export const playedCells = (items: readonly TimelineAudio[], cells: number, perSec = waveformPerSec): [number, number] | null => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of items) {
    const [s, e] = a.loop ? [0, Infinity] : [a.inSec, a.inSec + a.durSec * a.rate];
    lo = Math.min(lo, s);
    hi = Math.max(hi, e);
  }
  const i0 = Math.max(0, Math.floor(lo * perSec));
  const i1 = Math.min(cells, Math.ceil(hi * perSec));
  return i1 > i0 ? [i0, i1] : null;
};

/**
 * 时间轴里各件资产的波形，键是 audio 的 asset（台词是台词 id，按它的配音文件算）。
 * fileOf 给资产 → 锁条目（取不到给 undefined）；字节不在、解不开的跳过，记在 missing 里，不挡时间轴
 */
export const timelineWaveforms = (
  audio: readonly TimelineAudio[],
  fileOf: (a: TimelineAudio) => LockEntry | undefined,
  dataRoot: string,
  decode = decodePeaks,
): { waveforms: Record<string, TimelineWaveform>; missing: string[] } => {
  const byAsset = new Map<string, TimelineAudio[]>();
  for (const a of audio) byAsset.set(a.asset, [...(byAsset.get(a.asset) ?? []), a]);
  const waveforms: Record<string, TimelineWaveform> = {};
  const missing: string[] = [];
  for (const [asset, items] of [...byAsset].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const entry = fileOf(items[0]!);
    let peaks: Uint8Array | null = null;
    try {
      peaks = entry ? assetPeaks(entry, dataRoot, decode) : null;
    } catch (e) {
      missing.push(`${asset}（${(e as Error).message.split('\n')[0]}）`);
      continue;
    }
    if (!peaks) {
      missing.push(asset);
      continue;
    }
    const span = playedCells(items, peaks.length);
    if (!span) continue;
    waveforms[asset] = { perSec: waveformPerSec, startSec: span[0] / waveformPerSec, floorDb: waveformFloorDb, peaks: Buffer.from(peaks.subarray(span[0], span[1])).toString('base64') };
  }
  return { waveforms, missing };
};
