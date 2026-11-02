import { describe, expect, it, vi } from 'vitest';
import type { MeshJob, MeshReply } from './网格池.ts';
import type { VoxelGrid } from './生成.ts';
import type { OverworldContext } from './主世界区段.ts';

const fake = vi.hoisted(() => ({ complete: vi.fn(), mesh: vi.fn() }));
vi.mock('./主世界区段.ts', () => ({ completeOverworldSection: fake.complete }));
vi.mock('./网格.ts', () => ({ buildSectionMesh: fake.mesh }));
const postMessage = vi.fn();
const scope = { postMessage, onmessage: null as ((e: MessageEvent<MeshJob>) => void) | null };
vi.stubGlobal('self', scope);
await import('./网格工人.ts');
const send = (data: MeshJob) => scope.onmessage!({ data } as MessageEvent<MeshJob>);
const voxels = (): VoxelGrid => ({ nx: 2, ny: 2, nz: 1, 格: 2, 原点: [0, 0, 0], vox: new Uint16Array(4), 色板: [] });

describe('网格工人协议', () => {
  it('补完才出网格并回传最终范围，共用缓冲只转交一次', () => {
    const context = {} as OverworldContext;
    const filled = { ...voxels(), nz: 7, 原点: [0, 0, -8] as [number, number, number] };
    fake.complete.mockReturnValue(filled);
    const buffer = new ArrayBuffer(64);
    const group = { pos: new Float32Array(buffer), uv: new Float32Array(buffer), tex: new Float32Array(0), col: new Uint8Array(buffer) };
    const mesh = Object.fromEntries(['实心', '镂空', '实心树叶', '水', '花草'].map((k) => [k, group]));
    fake.mesh.mockReturnValue(mesh);
    send({ type: '主世界', ctx: 17, context });
    const section = { L: 1, i: 2, j: 3 };
    send({ type: '网格', id: 3, V: null, 实心树叶: true, 地表: { ctx: 17, section } });
    expect(fake.complete).toHaveBeenCalledWith(null, section, context);
    expect(fake.mesh).toHaveBeenCalledWith(filled, true);
    expect(postMessage).toHaveBeenLastCalledWith({ id: 3, out: { mesh, V: { 原点: [0, 0, -8], 格: 2, nz: 7 } } }, [buffer]);
  });

  it('不带主世界上下文的普通区段不走地表计算', () => {
    fake.complete.mockClear();
    const v = voxels();
    send({ type: '网格', id: 4, V: v, 实心树叶: false });
    expect(fake.complete).not.toHaveBeenCalled();
    expect(fake.mesh).toHaveBeenLastCalledWith(v, false);
    expect((postMessage.mock.calls.at(-1)![0] as MeshReply).out!.V).toEqual({ 原点: [0, 0, 0], 格: 2, nz: 1 });
  });

  it('未知来源回带任务号的错误，不静默画空区段', () => {
    send({ type: '网格', id: 5, V: null, 实心树叶: true, 地表: { ctx: 404, section: { L: 1, i: 0, j: 0 } } });
    expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ id: 5, err: expect.stringContaining('没有登记主世界来源 404') });
  });
});
