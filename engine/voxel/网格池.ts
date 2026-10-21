// 网格池：几个 Web Worker 并行跑 区段出网格（纯函数，在哪个线程算结果都一样）；建好的网格交回主线程后仍按原先后建 three 网格（见 世界.tsx），画面逐像素不变。
// 体素块拷给工人、不转交：来源要是缓存了体素块，转交会把缓存清空；建好的网格是工人新建的数组，转交回来。
import type { SectionMesh } from './网格.ts';
import type { VoxelGrid } from './生成.ts';

// 工人数：留两个核给主线程和 GPU 进程。Remotion 开几个并发标签页就有几个池，几个池抢同一批核，并发 1（remotion.config.ts）时正合适
const workerCount = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));

type PendingJob = { resolve: (mesh: SectionMesh) => void; reject: (err: unknown) => void };
let workers: Worker[] | null = null;
const pendingJobs = new Map<number, PendingJob>();
let nextId = 0;
let nextWorker = 0;

const openPool = () => {
  if (workers) return workers;
  workers = Array.from({ length: workerCount }, () => {
    const worker = new Worker(new URL('./网格工人.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<{ id: number; m: SectionMesh }>) => {
      const job = pendingJobs.get(event.data.id);
      pendingJobs.delete(event.data.id);
      job?.resolve(event.data.m);
    };
    worker.onerror = (err) => {
      for (const job of pendingJobs.values()) job.reject(err);
      pendingJobs.clear();
    };
    return worker;
  });
  return workers;
};

// 交给下一个工人（轮流派；区段大小差不多，不按忙闲挑）
export const buildMeshInPool = (voxels: VoxelGrid, solidLeaves: boolean): Promise<SectionMesh> => {
  const ws = openPool();
  const id = nextId++;
  const worker = ws[nextWorker++ % ws.length];
  return new Promise((resolve, reject) => {
    pendingJobs.set(id, { resolve: resolve, reject: reject });
    worker.postMessage({ id, V: voxels, 实心树叶: solidLeaves });
  });
};
