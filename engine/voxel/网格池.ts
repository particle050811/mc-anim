// 网格池复用现有工人：主世界的补水、植物和远景也在同一次活里算，体素数组不再往返主线程。
// 工人完成顺序不定，世界.tsx 仍按派出顺序收货并建 three 对象。
import type { SectionMesh } from './网格.ts';
import type { BuiltSection, VoxelGrid } from './生成.ts';
import type { SectionId } from './区段.ts';
import type { OverworldContext } from './主世界区段.ts';

export type MeshJob =
  | { type: '主世界'; ctx: number; context: OverworldContext }
  | { type: '网格'; id: number; V: VoxelGrid | null; 实心树叶: boolean; 地表?: { ctx: number; section: SectionId } };
export type MeshReply = { id: number; out?: BuiltSection; err?: string };

// 留两个核给主线程和 GPU 进程；渲染并发为 1 时共用这个池。
const workerCount = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));
type PendingJob = { resolve: (out: BuiltSection) => void; reject: (err: unknown) => void };
let workers: Worker[] | null = null;
const pendingJobs = new Map<number, PendingJob>();
let nextId = 0;
let nextWorker = 0;
let nextContext = 0;
const contexts = new WeakMap<OverworldContext['grid'], { context: OverworldContext; id: number }[]>();

const openPool = () => {
  if (workers) return workers;
  workers = Array.from({ length: workerCount }, () => {
    const worker = new Worker(new URL('./网格工人.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<MeshReply>) => {
      const job = pendingJobs.get(event.data.id);
      pendingJobs.delete(event.data.id);
      if (event.data.err !== undefined) job?.reject(new Error(`网格工人：${event.data.err}`));
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

export const registerOverworld = (context: OverworldContext): number => {
  // 拼段换 Canvas 不换远景数据，不能每截都向八个工人复制整份高度图；挖掉/平整已包含在传入的体素里。
  const registered = contexts.get(context.grid) ?? [];
  const found = registered.find((x) => x.context.coarseHeights === context.coarseHeights && x.context.seam === context.seam && x.context.origin.every((v, i) => v === context.origin[i]));
  if (found) return found.id;
  const id = nextContext++;
  for (const w of openPool()) w.postMessage({ type: '主世界', ctx: id, context } satisfies MeshJob);
  registered.push({ context, id });
  contexts.set(context.grid, registered);
  return id;
};

const dispatch = (voxels: VoxelGrid | null, solidLeaves: boolean, transfer: boolean, surface?: { ctx: number; section: SectionId }): Promise<BuiltSection> => {
  const ws = openPool();
  const id = nextId++;
  const worker = ws[nextWorker++ % ws.length];
  return new Promise((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject });
    const transfers = transfer && voxels ? [voxels.vox.buffer as ArrayBuffer, ...(voxels.挖空 ? [voxels.挖空.buffer as ArrayBuffer] : [])] : [];
    worker.postMessage({ type: '网格', id, V: voxels, 实心树叶: solidLeaves, 地表: surface } satisfies MeshJob, transfers);
  });
};

// 来源可能缓存体素，默认只拷贝；声明可转交的来源才移走数组所有权。
export const buildMeshInPool = (voxels: VoxelGrid, solidLeaves: boolean, transfer = false): Promise<SectionMesh> =>
  dispatch(voxels, solidLeaves, transfer).then((out) => out.mesh!);

export const buildOverworldMeshInPool = (voxels: VoxelGrid | null, section: SectionId, ctx: number): Promise<BuiltSection> =>
  dispatch(voxels, section.L >= 1, true, { ctx, section });
