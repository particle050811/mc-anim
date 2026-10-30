// 区段工人：在 Web Worker 里取区段包的区段（见 区段工人池.ts）。一次活是块文件里挨着的几个区段：按 Range 一次取回、逐个 gzip 解开、解成 SectionData；
// 活里登记了来源的区段再换成体素块（导入区段.ts，和主线程同一份纯函数）。类型数组都转交回去，不拷贝。
// 为什么放工人：一帧要新取上百个区段，放主线程上逐个取、解会和建网格、画抢主线程（docs/渲染性能.md）。
import { decodeSection, buildPackTables, type SectionData } from './区段包.ts';
import { variesByPos } from './群系色.ts';
import { importedSectionVoxels, type 区段上下文 } from './导入区段.ts';
import type { 工人消息, 工人回信 } from './区段工人池.ts';
import type { VoxelGrid } from './生成.ts';

const contexts = new Map<number, 区段上下文>();

const gunzip = (bytes: Uint8Array<ArrayBuffer>) => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();

const run = async (msg: Extract<工人消息, { type: '取' }>): Promise<工人回信> => {
  const res = await fetch(msg.url, { headers: { Range: `bytes=${msg.start}-${msg.start + msg.len - 1}` } });
  if (res.status !== 206) throw new Error(`按 Range 取 ${msg.url} 的 ${msg.start}～${msg.start + msg.len} 字节，回的是 ${res.status}（要 206）`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const out: { data: SectionData; voxels: VoxelGrid | null }[] = [];
  const transfers: ArrayBuffer[] = [];
  for (const part of msg.parts) {
    const data = decodeSection(new Uint8Array(await gunzip(bytes.subarray(part.off, part.off + part.len))));
    transfers.push(data.palette.buffer as ArrayBuffer); // 四个数组同一块缓冲（decodeSection）
    let voxels: VoxelGrid | null = null;
    const ctx = part.ctx === undefined ? undefined : contexts.get(part.ctx);
    if (ctx) {
      voxels = importedSectionVoxels(data, ctx);
      transfers.push(voxels.vox.buffer as ArrayBuffer);
      if (voxels.挖空) transfers.push(voxels.挖空.buffer as ArrayBuffer);
    }
    out.push({ data, voxels });
  }
  return { id: msg.id, out, transfers };
};

self.onmessage = (event: MessageEvent<工人消息>) => {
  const msg = event.data;
  if (msg.type === '来源') {
    contexts.set(msg.ctx, { info: msg.info, tables: buildPackTables(msg.info), variesByPos: msg.info.群系.map(variesByPos), cutBoxes: msg.cutBoxes, flattenAreas: msg.flattenAreas });
    return;
  }
  run(msg).then(
    (reply) => (self as unknown as Worker).postMessage({ id: reply.id, out: reply.out }, reply.transfers),
    (err) => (self as unknown as Worker).postMessage({ id: msg.id, err: String((err as Error)?.stack ?? err) }),
  );
};
