// 区段工人池：几个 Web Worker 取、解区段包的区段（区段工人.ts）。导入地形.ts 把一帧要的区段按块文件里的偏移排好、挨着的并成一次活交过来；
// 活里的区段按给的先后回来，主线程照旧按体素世界要的先后建网格，画面不变。
// 来源（挖法、平整不同的同一个包）先 `登记来源` 广播给每个工人，之后的活带上它的号，工人顺手把区段换成体素块。
import type { SectionData } from './区段包.ts';
import type { CutBox, FlattenArea, 区段包信息 } from './导入区段.ts';
import type { VoxelGrid } from './生成.ts';

export type 工人消息 =
  | { type: '来源'; ctx: number; info: 区段包信息; cutBoxes: CutBox[]; flattenAreas: FlattenArea[] }
  | { type: '取'; id: number; url: string; start: number; len: number; parts: { off: number; len: number; ctx?: number }[] };
export type 区段结果 = { data: SectionData; voxels: VoxelGrid | null };
export type 工人回信 = { id: number; out: 区段结果[]; transfers: ArrayBuffer[] };

// 工人数：取、解大半在等网络和解压，三个够；网格池另有自己的工人
const workerCount = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));

type PendingJob = { resolve: (out: 区段结果[]) => void; reject: (err: unknown) => void };
let workers: Worker[] | null = null;
const pendingJobs = new Map<number, PendingJob>();
let nextId = 0;
let nextWorker = 0;
let nextCtx = 0;

const openPool = () => {
  if (workers) return workers;
  workers = Array.from({ length: workerCount }, () => {
    const worker = new Worker(new URL('./区段工人.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<{ id: number; out?: 区段结果[]; err?: string }>) => {
      const job = pendingJobs.get(event.data.id);
      pendingJobs.delete(event.data.id);
      if (event.data.err !== undefined) job?.reject(new Error(`区段工人：${event.data.err}`));
      else job?.resolve(event.data.out!);
    };
    worker.onerror = (err) => {
      for (const job of pendingJobs.values()) job.reject(err);
      pendingJobs.clear();
    };
    return worker;
  });
  return workers;
};

/** 登记一个来源，返回它的号；每个工人都收到（消息按发送先后到，之后带这个号的活一定在它后面） */
export const registerSource = (info: 区段包信息, cutBoxes: CutBox[], flattenAreas: FlattenArea[]): number => {
  const ctx = nextCtx++;
  for (const w of openPool()) w.postMessage({ type: '来源', ctx, info, cutBoxes, flattenAreas } satisfies 工人消息);
  return ctx;
};

/** 按 Range 取 [start, start + len) 这一段，parts 是段里各区段（off 相对 start）；回来的和 parts 一一对应 */
export const fetchSectionsInPool = (url: string, start: number, len: number, parts: { off: number; len: number; ctx?: number }[]): Promise<区段结果[]> => {
  const ws = openPool();
  const id = nextId++;
  const worker = ws[nextWorker++ % ws.length];
  return new Promise((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject });
    worker.postMessage({ type: '取', id, url, start, len, parts } satisfies 工人消息);
  });
};
