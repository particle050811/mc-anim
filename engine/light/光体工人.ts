// 光体工人：在 Web Worker 里备光体要的数据（光体.ts）。主线程（光体组件.tsx）发来区段数据，这里换成体素块（导入区段.ts，和主线程、区段工人同一份纯函数）、
// 再压成格码按 来源|区段 留着（主线程记着这边有哪些、让丢哪些）；建一次按层拼窗口格码，出各层的占用格和团表，转交回去，探针在显卡上算。
// 同一层窗口没变就不重拼格码；一层的团表要它和比它粗的各层，所以粗层变了细层跟着重出（主线程按层键要）。
// 方块网格（光体网格.ts）的格码在主线程算好发来（'网格'），只有一层。
// 给了 cacheKeys 的层顺手编成光体缓存的文件、压好一起回（光体缓存.ts），主线程挂起来等关页面时收走。
import { buildPackTables, type SectionData } from '../voxel/区段包.ts';
import { variesByPos } from '../voxel/群系色.ts';
import { importedSectionVoxels, type SectionContext, type SectionPackInfo, type CutBox, type FlattenArea } from '../voxel/导入区段.ts';
import { sectionKey } from '../voxel/区段.ts';
import { buildLightSet, emitColors, fillWindow, occupancy, sectionCodes, windowKey, type LayerCodes, type LightLayerData, type LightWindow } from './光体.ts';
import { encodeLayer, gzipBytes } from './光体缓存.ts';

export type LightWorkerMessage =
  | { type: '来源'; ctx: number; info: SectionPackInfo; cutBoxes: CutBox[]; flattenAreas: FlattenArea[] }
  | { type: '建'; id: number; ctx: number; minLight: number; windows: LightWindow[]; need: boolean[]; sections: { data: SectionData }[]; drop: string[]; cacheKeys: (string | null)[] }
  | { type: '网格'; id: number; layer: LayerCodes; minLight: number };
export type { LightLayerData };
/** cache：要存的层压好的缓存文件（下标同 windows） */
export type LightWorkerReply = { id: number; layers: (LightLayerData | null)[]; cache?: (Uint8Array | null)[]; err?: string };

const contexts = new Map<number, SectionContext>();
const codes = new Map<string, Uint8Array>(); // 来源|区段键 → 格码（区段核心 64 × 64 列，竖直同那一层的窗口）
// 上一次各层拼好的窗口格码（窗口没变就沿用）
const lastCodes: { key: string; layer: LayerCodes }[] = [];

const build = (msg: Extract<LightWorkerMessage, { type: '建' }>): (LightLayerData | null)[] => {
  const ctx = contexts.get(msg.ctx);
  if (!ctx) throw new Error(`光体工人没有登记来源 ${msg.ctx}`);
  for (const k of msg.drop) codes.delete(k);
  for (const { data } of msg.sections) {
    const w = msg.windows.find((x) => x.L === data.L)!;
    codes.set(`${msg.ctx}|${sectionKey(data)}`, sectionCodes(importedSectionVoxels(data, ctx), w.z0, w.D));
  }
  const layers = msg.windows.map((w, n) => {
    const key = `${msg.ctx}|${windowKey(w)}`;
    if (lastCodes[n]?.key !== key) lastCodes[n] = { key, layer: { w, codes: fillWindow(w, (i, j) => codes.get(`${msg.ctx}|${sectionKey({ L: w.L, i, j })}`) ?? null), colors: emitColors } };
    return lastCodes[n]!.layer;
  });
  return msg.windows.map((w, n) => (msg.need[n] ? { occ: occupancy(layers[n]!.codes), set: buildLightSet(w, layers.slice(0, n + 1), msg.minLight) } : null));
};

const transfers = (layers: (LightLayerData | null)[]) =>
  layers.flatMap((l) => (l ? [l.occ.buffer, l.set.lights.buffer, l.set.bricks.buffer, l.set.index.buffer] : [])) as ArrayBuffer[];

// 消息按到达的顺序一条一条做完（压缓存要等），工人里的格码表不会被下一条插进来改
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<LightWorkerMessage>) => {
  const msg = event.data;
  if (msg.type === '来源') {
    contexts.set(msg.ctx, { info: msg.info, tables: buildPackTables(msg.info), variesByPos: msg.info.biome.map(variesByPos), cutBoxes: msg.cutBoxes, flattenAreas: msg.flattenAreas });
    return;
  }
  queue = queue.then(() => handle(msg));
};

const handle = async (msg: Exclude<LightWorkerMessage, { type: '来源' }>) => {
  try {
    const layers = msg.type === '建' ? build(msg) : [{ occ: occupancy(msg.layer.codes), set: buildLightSet(msg.layer.w, [msg.layer], msg.minLight) }];
    const cache = msg.type === '建' ? await Promise.all(layers.map((l, n) => (l && msg.cacheKeys[n] ? gzipBytes(encodeLayer(msg.cacheKeys[n], l)) : null))) : undefined;
    (self as unknown as Worker).postMessage({ id: msg.id, layers, cache } satisfies LightWorkerReply, [...transfers(layers), ...(cache ?? []).flatMap((c) => (c ? [c.buffer as ArrayBuffer] : []))]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, layers: [], err: String((err as Error)?.stack ?? err) } satisfies LightWorkerReply);
  }
};
