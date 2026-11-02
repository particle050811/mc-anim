import { describe, expect, it, vi } from 'vitest';
import type { MeshJob, MeshReply } from './网格池.ts';
import type { VoxelGrid } from './生成.ts';
import type { OverworldContext } from './主世界区段.ts';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<MeshReply>) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  messages: MeshJob[] = [];
  constructor() { FakeWorker.instances.push(this); }
  postMessage(msg: MeshJob, transfer: ArrayBuffer[] = []) { this.messages.push(structuredClone(msg, { transfer })); }
}
vi.stubGlobal('Worker', FakeWorker);
vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
const { registerOverworld, buildOverworldMeshInPool, buildMeshInPool } = await import('./网格池.ts');
const context = (): OverworldContext => ({
  grid: { packName: '测试', x0: 0, z0: 0, step: 32, nx: 1, nz: 1, 海平面: 63, 高: Int16Array.of(30), 群: Uint8Array.of(0), 群系名: ['minecraft:ocean'], 温度: [0.5], 层: [] },
  origin: [0, 64, 0],
  coarseHeights: { 格: 16, x0: 0, y0: 0, nx: 1, ny: 1, 高: Int16Array.of(64) },
  seam: null,
});
const voxel = (): VoxelGrid => ({ nx: 1, ny: 1, nz: 1, 格: 1, 原点: [0, 0, 0], vox: Uint16Array.of(1), 挖空: Uint8Array.of(0), 色板: [] });
const lastJob = () => FakeWorker.instances.map((worker) => ({ worker, msg: worker.messages.at(-1)! })).filter((x): x is { worker: FakeWorker; msg: Extract<MeshJob, { type: '网格' }> } => x.msg.type === '网格').sort((a, b) => b.msg.id - a.msg.id)[0]!;
const reply = (job: ReturnType<typeof lastJob>, out: MeshReply) => job.worker.onmessage!({ data: out } as MessageEvent<MeshReply>);

describe('网格池的主世界来源', () => {
  it('同数据跨 Canvas 只广播一次，主线程仍保留高度图；交界变了不复用旧来源', () => {
    const ctx = context();
    const id = registerOverworld(ctx);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances.every((w) => w.messages.length === 1)).toBe(true);
    expect(ctx.grid.高.byteLength).toBe(2);
    expect(registerOverworld({ ...ctx, origin: [...ctx.origin] })).toBe(id);
    expect(FakeWorker.instances.every((w) => w.messages.length === 1)).toBe(true);
    expect(registerOverworld({ ...ctx, origin: [1, 64, 0] })).not.toBe(id);
    expect(registerOverworld({ ...ctx, seam: { x0: 0, y0: 0, nx: 1, ny: 1, cellSize: 16, deltas: Int16Array.of(2) } })).not.toBe(id);
  });

  it('主世界体素转交不复制，乱序回信仍按任务号对上最终范围', async () => {
    const ctx = registerOverworld(context());
    const v = voxel();
    const first = buildOverworldMeshInPool(v, { L: 1, i: 0, j: 0 }, ctx);
    const a = lastJob();
    const second = buildOverworldMeshInPool(null, { L: 2, i: 1, j: 0 }, ctx);
    const b = lastJob();
    expect(v.vox.byteLength).toBe(0);
    expect(v.挖空!.byteLength).toBe(0);
    expect(a.msg.V!.vox[0]).toBe(1);
    const outA = { mesh: null, V: { 原点: [0, 0, -2] as [number, number, number], 格: 2, nz: 4 } };
    const outB = { mesh: null, V: { 原点: [128, 0, -4] as [number, number, number], 格: 4, nz: 7 } };
    reply(b, { id: b.msg.id, out: outB });
    reply(a, { id: a.msg.id, out: outA });
    expect(await first).toEqual(outA);
    expect(await second).toEqual(outB);
  });

  it('普通来源默认不转交缓存，工人的错误使当前任务失败', async () => {
    const v = voxel();
    const pending = buildMeshInPool(v, false);
    const check = expect(pending).rejects.toThrow('网格工人：测试失败');
    const job = lastJob();
    expect(v.vox.byteLength).toBe(2);
    expect(job.msg.地表).toBeUndefined();
    reply(job, { id: job.msg.id, err: '测试失败' });
    await check;
  });
});
