// 光体的纯函数：方块格码、区段拼窗口、各层窗口的套法、发光格聚团、团分砖、各级的权重、方块网格反推格码。
// 真实方块表要 `asset:` 方块表，vitest 里解析不了，换成几种方块的小表（体素值 = 下标 + 1）。
import { describe, expect, it, vi } from 'vitest';
import type { VoxelGrid } from '../voxel/生成.ts';
import type { BlockMeshInfo } from '../voxel/方块网格信息.ts';

vi.mock('../voxel/真实方块表.ts', () => {
  const names = ['minecraft:fire[age=0]', 'minecraft:lava[level=0]', 'minecraft:netherrack', 'minecraft:oak_leaves', 'minecraft:shroomlight'];
  return {
    blockNames: names,
    voxelCount: names.length + 1,
    voxelFromState: (s: string) => names.findIndex((n) => n.startsWith(s)) + 1,
    blockProps: { glow: Uint8Array.from([0, 255, 255, 0, 0, 255]), opaque: Uint8Array.from([0, 0, 1, 15, 15, 15]), leaf: Uint8Array.from([0, 0, 0, 0, 1, 0]) },
  };
});

const { voxelFromState } = await import('../voxel/真实方块表.ts');
const { sectionCells } = await import('../voxel/区段.ts');
const { BRICK, buildLightSet, cascades, cellCode, CODE_AIR, CODE_OPAQUE, EMIT_OPAQUE, emitColors, fillWindow, KMAX, levelWeight, LIGHT_FLOATS, lightWindows, occupancy, sectionCodes, windowSections } = await import('./光体.ts');
const { meshLightCodes } = await import('./光体网格.ts');
type LightWindow = import('./光体.ts').LightWindow;

const fire = cellCode[voxelFromState('minecraft:fire')]!;
const lava = cellCode[voxelFromState('minecraft:lava')]!;
const win = (W: number, H: number, D: number, L = 0): LightWindow => ({ L, x0: 0, y0: 0, z0: 0, W, H, D });
const at = (w: LightWindow, x: number, y: number, z: number) => (z * w.H + y) * w.W + x;
// 团表里第 n 盏的各项
const light = (lights: Float32Array, n: number) => {
  const o = n * LIGHT_FLOATS;
  const f = (i: number) => lights[o + i]!;
  return { pos: [f(0), f(1), f(2)], k: f(3), iso: [f(4), f(5), f(6)], flags: f(7), dir: [f(8), f(9), f(10)], R: f(11) };
};

describe('光体', () => {
  it('方块的格码：火、熔岩发光，地狱岩挡光，空气、树叶不挡，菌光体是挡光的光源', () => {
    expect(fire).toBeGreaterThanOrEqual(2);
    expect(fire).toBeLessThan(EMIT_OPAQUE);
    expect(cellCode[voxelFromState('minecraft:oak_leaves')]).toBe(CODE_AIR);
    expect(cellCode[voxelFromState('minecraft:netherrack')]).toBe(CODE_OPAQUE);
    expect(cellCode[voxelFromState('minecraft:shroomlight')]).toBeGreaterThanOrEqual(EMIT_OPAQUE);
    expect(cellCode[0]).toBe(CODE_AIR);
    expect(emitColors[lava - 2]![0]).toBe(1);
    expect([...occupancy(Uint8Array.from([CODE_AIR, CODE_OPAQUE, fire, EMIT_OPAQUE + 2]))]).toEqual([0, 255, 0, 255]);
  });

  it('区段 → 格码：体素块底下当挡光，顶上当空气；拼窗口按全局格号对齐', () => {
    const n = sectionCells + 2;
    const g: VoxelGrid = { nx: n, ny: n, nz: 2, cell: 1, origin: [64, 0, 3], vox: new Uint16Array(n * n * 2), palette: [{ v: 0, c: [255, 255, 255] }, { v: voxelFromState('minecraft:fire'), c: [255, 255, 255] }] };
    g.vox[(1 * n + 1 + 5) * n + 1 + 7] = 1; // 核心 (7, 5)、第 1 层（z = 4）
    const codes = sectionCodes(g, 0, 8);
    const c = (x: number, y: number, z: number) => codes[(z * sectionCells + y) * sectionCells + x];
    expect(c(0, 0, 2)).toBe(CODE_OPAQUE);
    expect(c(0, 0, 3)).toBe(CODE_AIR);
    expect(c(7, 5, 4)).toBe(fire);
    expect(c(7, 5, 6)).toBe(CODE_AIR);
    const w: LightWindow = { L: 0, x0: 60, y0: 0, z0: 0, W: 16, H: 8, D: 8 };
    expect(windowSections(w).map((q) => q.i)).toEqual([0, 1]);
    const filled = fillWindow(w, (i) => (i === 1 ? codes : null));
    expect(filled[at(w, 4 + 7, 5, 4)]).toBe(fire);
    expect(filled[at(w, 3, 5, 0)]).toBe(CODE_AIR); // i = 0 那块拿不到，当空气
  });

  it('各层窗口：细的套在粗的里面，离边留得出渐变', () => {
    for (const cam of [[0, 0, 60], [31.9, -15.9, 60], [1000.5, -777.7, 10]]) {
      const ws = lightWindows(cam, [0, 128]);
      expect(ws.map((w) => w.L)).toEqual(cascades.map((c) => c.L));
      for (let n = 1; n < ws.length; n++) {
        const a = ws[n - 1]!, b = ws[n]!;
        const margin = Math.min(b.x0 - a.x0, a.x0 + a.W * 2 ** a.L - (b.x0 + b.W * 2 ** b.L), b.y0 - a.y0, a.y0 + a.H * 2 ** a.L - (b.y0 + b.H * 2 ** b.L));
        expect(margin).toBeGreaterThanOrEqual(32);
      }
      expect(ws.every((w) => w.x0 % 2 ** w.L === 0 && w.z0 === 0 && w.D * 2 ** w.L === 128)).toBe(true);
    }
  });

  it('各级权重：任一距离上加起来是 1，换级处连续', () => {
    for (let d = 0.05; d < 400; d *= 1.07) {
      let sum = 0;
      for (let k = 0; k <= KMAX; k++) sum += levelWeight(d, k, (k === 0 ? 1 : 0) + (k === KMAX ? 2 : 0));
      expect(sum).toBeCloseTo(1, 6);
    }
    // 最细一级从第 2 级起（粗层的格子）：更近的全给它
    let sum = 0;
    for (let k = 2; k <= KMAX; k++) sum += levelWeight(1, k, (k === 2 ? 1 : 0) + (k === KMAX ? 2 : 0));
    expect(sum).toBeCloseTo(1, 6);
  });

  it('聚团：露 4 面以上的火各向同性，熔岩海只露顶面、朝上发光；埋住的不算；各级团的光加起来等于格子的', () => {
    const w = win(16, 16, 4);
    const codes = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) codes[at(w, x, y, 0)] = CODE_OPAQUE;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) codes[at(w, x, y, 1)] = lava; // 一片熔岩，z = 1，上面是空气
    codes[at(w, 12, 12, 1)] = fire;
    codes[at(w, 12, 3, 1)] = EMIT_OPAQUE + (fire - 2) + 2;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]]) codes[at(w, 12 + dx!, 3 + dy!, 1 + dz!)] = CODE_OPAQUE; // 四面一顶全封住
    const set = buildLightSet(w, [{ w, codes, colors: emitColors }], 1e-3);
    const all = Array.from({ length: set.count }, (_, n) => light(set.lights, n));
    const base = all.filter((l) => l.k === 0);
    // 64 格熔岩 + 1 格火，封住的不算
    expect(base.length).toBe(65);
    const fireLight = base.find((l) => l.pos[0] === 12.5 && l.pos[1] === 12.5)!;
    expect(fireLight.iso[0]).toBeCloseTo((5 * emitColors[fire - 2]![0]) / 4, 6);
    expect(fireLight.dir).toEqual([0, 0, 0]);
    const lavaLight = base.find((l) => l.pos[0] === 0.5 && l.pos[1] === 0.5)!;
    expect(lavaLight.iso).toEqual([0, 0, 0]);
    expect(lavaLight.dir[2]).toBeGreaterThan(0);
    expect(lavaLight.flags & 1).toBe(1);
    // 每一级的朝上发光加起来一样（光只是聚成大团，没多没少）
    for (let k = 0; k <= KMAX; k++) {
      const sum = all.filter((l) => l.k === k).reduce((s, l) => s + l.dir[2]!, 0);
      expect(sum).toBeCloseTo(base.reduce((s, l) => s + l.dir[2]!, 0), 4);
    }
    expect(all.filter((l) => l.k === KMAX).every((l) => l.flags & 2)).toBe(true);
  });

  it('分砖：团只进用得到它那一级的砖', () => {
    const w = win(64, 8, 8);
    const codes = new Uint8Array(64 * 8 * 8);
    codes[at(w, 2, 4, 4)] = fire;
    const set = buildLightSet(w, [{ w, codes, colors: emitColors }], 1e-5);
    const brickLights = (b: number) => Array.from(set.index.subarray(set.bricks[b * 4]!, set.bricks[b * 4]! + set.bricks[b * 4 + 1]!), (n) => light(set.lights, n));
    expect(set.bricks.length / 4).toBe((64 / BRICK) * 1 * 1);
    // 火所在的砖要最细一级（1 米）的团；最远那块砖（离火五十多米）只要粗级的
    expect(brickLights(0).some((l) => l.k === 0)).toBe(true);
    expect(brickLights(7).some((l) => l.k === 0)).toBe(false);
    expect(brickLights(7).some((l) => l.k >= 4)).toBe(true);
  });

  it('细层的团表：粗层只取细层窗口外的格，每处的光只算一次', () => {
    const coarse: LightWindow = { L: 1, x0: 0, y0: 0, z0: 0, W: 32, H: 32, D: 2 };
    const cc = new Uint8Array(32 * 32 * 2);
    cc[at(coarse, 2, 16, 0)] = fire; // x 4～6 米，细层窗口外
    cc[at(coarse, 16, 16, 0)] = fire; // x 32～34 米，细层窗口里（细层自己也有这格火）
    const fine: LightWindow = { L: 0, x0: 16, y0: 16, z0: 0, W: 32, H: 32, D: 4 };
    const fc = new Uint8Array(32 * 32 * 4);
    fc[at(fine, 16, 16, 0)] = fire;
    const set = buildLightSet(fine, [{ w: coarse, codes: cc, colors: emitColors }, { w: fine, codes: fc, colors: emitColors }], 1e-3);
    const all = Array.from({ length: set.count }, (_, n) => light(set.lights, n));
    const finest = all.filter((l) => l.flags & 1);
    expect(finest.map((l) => [l.k, Math.round(l.pos[0]! * 100) / 100])).toEqual([[0, 32.5], [1, 5]]);
  });

  it('方块网格：贴在格面上的实心面反推出挡光格，marker 处发光', () => {
    // 一个方块 (0,0,0)～(1,1,1)（游戏坐标），只导出顶面（朝 +y）；一盏灯笼在 (3,0,0)
    const stride = 28;
    const verts = [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]];
    const buf = new DataView(new ArrayBuffer(4 * stride));
    verts.forEach((v, i) => v.forEach((c, a) => buf.setFloat32(i * stride + a * 4, c, true)));
    const info = { layers: [{ name: 'solid', quads: 1, byteOffset: 0 }], vertexBytes: stride, markers: { 'minecraft:lantern': [[3.5, 0, 0.5]] } } as unknown as BlockMeshInfo;
    const { w, codes, colors } = meshLightCodes(info, new Uint8Array(buf.buffer));
    // 场景坐标 [x, −z, y]：方块在场景格 (0, −1, 0)，灯笼在 (3, −1, 0)
    const cell = (x: number, y: number, z: number) => codes[((z - w.z0) * w.H + (y - w.y0)) * w.W + (x - w.x0)];
    expect(cell(0, -1, 0)).toBe(CODE_OPAQUE);
    expect(cell(0, -1, 1)).toBe(CODE_AIR);
    expect(cell(3, -1, 0)).toBe(2);
    expect(colors[0]![0]).toBe(1);
  });
});
