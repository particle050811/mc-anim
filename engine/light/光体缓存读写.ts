// 光体缓存的读写（格式、为什么能缓存见 光体缓存.ts）。照求解缓存（engine/core/求解缓存.ts）的路子：
// 读：public 目录的 lightVolume/ 链到 <数据根>/cache/光体/（pipeline/渲/public目录.ts），按 <作品>/<键哈希>.gz 取；
// 写：页面写不了盘，新算的压好挂在 window 上，渲染（film、still、bench）关页面前由 pipeline/渲/光体缓存收集.ts 收走写盘，读中的也报给它推修改时间（anim cache gc 按它算多久没用）。
// 只在渲染入口传了 <作品>/<段键>（地形用量那个环境变量，pipeline/渲/地形注入.ts）、注入了代码层指纹时用；Studio、Node 工具照常现算。
import { getRemotionEnvironment } from 'remotion';
import { dataUrl, gunzip } from '../core/数据源.ts';
import { hash64, solverFingerprint } from '../core/求解缓存.ts';
import { terrainUsageSegEnv } from '../段/地形环境.ts';
import type { ImportedTerrain } from '../voxel/导入地形.ts';
import { decodeLayer } from './光体缓存.ts';
import type { LightLayerData } from './光体.ts';

// 一页里挂着没收走的上限：超了的不再挂（只是这次不存，下次再算）
const maxPendingBytes = 512 * 1024 * 1024;

type Store = { pending: Map<string, Uint8Array>; pendingBytes: number; hits: Set<string> };
type CacheWindow = { __lightVolumeCache?: Store; __lightVolumeCacheList?: () => string; __lightVolumeCacheChunk?: (file: string, start: number, len: number) => string };

const pageWork = (): string | null => {
  if (typeof window === 'undefined' || getRemotionEnvironment().isStudio) return null;
  const seg = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[terrainUsageSegEnv];
  const work = seg?.slice(0, seg.indexOf('/'));
  return work && !/[\\/]/.test(work) && !work.startsWith('.') ? work : null;
};

const store = (): Store => {
  const w = window as unknown as CacheWindow;
  if (!w.__lightVolumeCache) {
    const s: Store = (w.__lightVolumeCache = { pending: new Map(), pendingBytes: 0, hits: new Set() });
    // 收集那边先要清单，再按块取 base64（一次返回几十 MB 的字符串太大）
    w.__lightVolumeCacheList = () => JSON.stringify({ files: [...s.pending].map(([file, b]) => ({ file, bytes: b.length })), hits: [...s.hits] });
    w.__lightVolumeCacheChunk = (file, start, len) => {
      const b = s.pending.get(file)!.subarray(start, start + len);
      let bin = '';
      for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(bin);
    };
  }
  return w.__lightVolumeCache;
};

// 地形这一项：包目录（带内容版本）+ 挖框、平整（同一个包挖法不同，结果不同）。平整的罩可能很大，整项取哈希
const terrainIds = new WeakMap<ImportedTerrain, string>();
const terrainId = (t: ImportedTerrain) => {
  let id = terrainIds.get(t);
  if (id === undefined) {
    const { cutBoxes, flattenAreas } = t.voxelContext;
    const ctx = JSON.stringify({ cutBoxes, flattenAreas }, (_k, v: unknown) => (v instanceof RegExp ? `/${v.source}/${v.flags}` : ArrayBuffer.isView(v) ? Array.from(v as Uint8Array).join(',') : v));
    terrainIds.set(t, (id = `${t.key}#${hash64(ctx)}`));
  }
  return id;
};

/** 这一页能不能用光体缓存；能的话给出每层的键文本和文件名（相对 lightVolume/） */
export const lightCacheSlots = (t: ImportedTerrain, layerKeys: readonly string[]): { key: string; file: string }[] | null => {
  const work = pageWork();
  const code = solverFingerprint('光体');
  if (!work || !code) return null;
  return layerKeys.map((k) => {
    const key = `光体|${code}|${terrainId(t)}|${k}`;
    return { key, file: `${work}/${hash64(key)}.gz` };
  });
};

/** 取一层；没有、坏了、键对不上都是 null */
export const readLightCache = async (slot: { key: string; file: string }): Promise<LightLayerData | null> => {
  try {
    const res = await fetch(dataUrl(`lightVolume/${slot.file}`));
    if (!res.ok) return null;
    const d = decodeLayer(await gunzip(res.body!), slot.key);
    if (d) store().hits.add(slot.file);
    return d;
  } catch {
    return null;
  }
};

/** 新算的一层（已压好）挂起来等收走 */
export const putLightCache = (file: string, gz: Uint8Array) => {
  const s = store();
  if (s.pending.has(file) || s.pendingBytes + gz.length > maxPendingBytes) return;
  s.pending.set(file, gz);
  s.pendingBytes += gz.length;
};
