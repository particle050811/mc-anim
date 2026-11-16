// 方块图集按格边长建（材质包 32x、64x 的覆盖层，pipeline/取材/材质包.ts）：16 像素一格的原版图集，图集字节和着色器源码要和支持高清之前逐字节一样
// （金标准哈希是改之前那版代码算的），默认画面才不变。图集是数据根里的资产，测试换成一条自己生成的竖条。
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { encode } from 'fast-png';
import { describe, expect, it, vi } from 'vitest';

// 确定的假贴图：不透明、带透明洞（镂空）、半透明、全透明、只有一个不透明像素，凑满 17 张跨两行
const fakeVerticalStrip = (cellSize: number, sheetCount = 17) => {
  const px = new Uint8Array(cellSize * cellSize * sheetCount * 4);
  let s = 12345;
  const random = () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 16) & 255;
  for (let k = 0; k < sheetCount; k++)
    for (let p = 0; p < cellSize * cellSize; p++) {
      const i = (k * cellSize * cellSize + p) * 4;
      px[i] = random();
      px[i + 1] = random();
      px[i + 2] = random();
      const stripeKind = k % 5;
      px[i + 3] = stripeKind === 0 ? 255 : stripeKind === 1 ? (random() < 80 ? 0 : 255) : stripeKind === 2 ? 100 + (random() % 156) : stripeKind === 3 ? 0 : p === 37 ? 255 : 0;
    }
  return { w: cellSize, h: cellSize * sheetCount, px };
};
// 每格按最近邻放大 倍：放大后的高清图集，第 k+log2(倍) 级应和原图集第 k 级一样
const upscale = (t: { w: number; h: number; px: Uint8Array }, factor: number) => {
  const w = t.w * factor, h = t.h * factor;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(t.px.subarray(((Math.floor(y / factor) * t.w + Math.floor(x / factor)) * 4), (Math.floor(y / factor) * t.w + Math.floor(x / factor)) * 4 + 4), (y * w + x) * 4);
  return { w, h, px };
};
const toDataUri = (t: { w: number; h: number; px: Uint8Array }) => `data:image/png;base64,${Buffer.from(encode({ width: t.w, height: t.h, data: t.px, channels: 4, depth: 8 })).toString('base64')}`;

// 材质.ts 经 网格.ts 引到方块表、群系色：给最小的表
vi.mock('asset:数据/场景/关键帧/方块表', () => ({ default: { 贴图: ['test:block/stone'], 面组: [], 方块: {} } }));
vi.mock('asset:数据/场景/关键帧/群系色', () => ({ default: { 群系: { 'minecraft:plains': { 草: '#91bd59', 叶: '#77ab2f', 水: '#3f76e4' } } } }));

const load = async (t: { w: number; h: number; px: Uint8Array }) => {
  vi.resetModules();
  vi.doMock('asset:贴图/场景/关键帧/方块表', () => ({ default: toDataUri(t) }));
  return { atlas: await import('./真实方块图集.ts'), materialModule: await import('./材质.ts') };
};
const hash = (...xs: (string | Uint8Array)[]) => {
  const h = createHash('sha256');
  for (const x of xs) h.update(x);
  return h.digest('hex');
};
const allLevels = (t: THREE.DataTexture) => (t.mipmaps as unknown as { width: number; height: number; data: Uint8Array }[]).map((m) => m.data);
// 体素材质的着色器源码（用 three 的标准着色器当底）
const shaderSource = (m: Awaited<ReturnType<typeof load>>['materialModule'], passKind: '实心' | '镂空' | '实心树叶' | '水' | '花草') => {
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  (m.voxelMaterial(passKind) as THREE.MeshStandardMaterial).onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
  return sh.vertexShader + '\n----\n' + sh.fragmentShader;
};

describe('方块图集', () => {
  it('16 像素一格：图集各级字节、着色器源码和支持高清之前一样', async () => {
    const { atlas, materialModule } = await load(fakeVerticalStrip(16));
    const a = atlas.blockAtlas();
    expect(a.rows).toBe(2);
    expect(a.original.mipmaps.length).toBe(5);
    expect(hash(...allLevels(a.original))).toMatchInlineSnapshot(`"ff919fc75bd3c4dda2ee65f59b4017ebe6a8ff0c046eeb8c391eebd3804f5abe"`);
    expect(hash(...allLevels(a.solid))).toMatchInlineSnapshot(`"b1ed730fe126b7192cc3237d81e9dadd2d9bd7e500cb0bd3b19fed2ef5856d1a"`);
    expect(hash(atlas.blockAtlasGlsl())).toMatchInlineSnapshot(`"d6dd78968605f7f960fbd919567955526c7be4add9effbd04c08233b6bc82034"`);
    expect(hash(...(['实心', '镂空', '实心树叶', '水', '花草'] as const).map((k) => shaderSource(materialModule, k)))).toMatchInlineSnapshot(`"b5b1af615d03bdaace6befc7735ac670611bb745516ce4d8b0647ee10d893691"`);
  });
  it('纯色方块：16 像素一格的压色和支持高清之前一样', async () => {
    const { flattenAtlasColors } = await import('./纯色方块.ts');
    const t = fakeVerticalStrip(16);
    expect(hash(...(['花草', '其他', '不分'] as const).map((k) => flattenAtlasColors(t, k).px))).toMatchInlineSnapshot(`"37b91f8fd973757e058524d0ba5a8aeb56759a10e23c8f6ad5bc0f4db6c5d3aa"`);
  });
  it.each([2, 4])('格边长 16 × %i：最近邻放大的图集往下缩 log2(倍) 级后和原版图集逐字节一样，着色器按格边长取级别', async (factor) => {
    // 没有全透明像素的贴图（全透明的颜色按最近不透明像素补，放大后先后不同，补出来不一样）
    const fakeStrip = fakeVerticalStrip(16);
    for (let i = 3; i < fakeStrip.px.length; i += 4) fakeStrip.px[i] = Math.max(fakeStrip.px[i]!, 100);
    const lowAtlas = (await load(fakeStrip)).atlas.blockAtlas();
    const lowLevel = [allLevels(lowAtlas.original), allLevels(lowAtlas.solid)];
    const { atlas, materialModule } = await load(upscale(fakeStrip, factor));
    const hiResAtlas = atlas.blockAtlas();
    expect(hiResAtlas.cell).toBe(16 * factor);
    expect(hiResAtlas.rows).toBe(lowAtlas.rows);
    const highLevel = [allLevels(hiResAtlas.original), allLevels(hiResAtlas.solid)];
    for (const j of [0, 1]) {
      expect(highLevel[j]!.length).toBe(lowLevel[j]!.length + Math.log2(factor));
      lowLevel[j]!.forEach((d, k) => expect(hash(highLevel[j]![k + Math.log2(factor)]!)).toBe(hash(d)));
    }
    const source = shaderSource(materialModule, '实心');
    expect(source).toContain(`vec2 tc = uv * ${16 * factor}.0;`);
    expect(source).toContain(`lod = mix(lod, ${4 + Math.log2(factor)}.0, farK);`);
  });
  it('格边长不是 2 的幂就报错（材质.ts 一引就建图集）', async () => {
    await expect(load(fakeVerticalStrip(24, 3))).rejects.toThrow(/2 的幂/);
  });
});
