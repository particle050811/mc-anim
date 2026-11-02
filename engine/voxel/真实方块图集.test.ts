// 方块图集按格边长建（材质包 32x、64x 的覆盖层，pipeline/资产/材质包.ts）：16 像素一格的原版图集，图集字节和着色器源码要和支持高清之前逐字节一样
// （金标准哈希是改之前那版代码算的），默认画面才不变。图集是数据根里的资产，测试换成一条自己生成的竖条。
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { encode } from 'fast-png';
import { describe, expect, it, vi } from 'vitest';

// 确定的假贴图：不透明、带透明洞（镂空）、半透明、全透明、只有一个不透明像素，凑满 17 张跨两行
const 假竖条 = (格: number, 张数 = 17) => {
  const px = new Uint8Array(格 * 格 * 张数 * 4);
  let s = 12345;
  const 随 = () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 16) & 255;
  for (let k = 0; k < 张数; k++)
    for (let p = 0; p < 格 * 格; p++) {
      const i = (k * 格 * 格 + p) * 4;
      px[i] = 随();
      px[i + 1] = 随();
      px[i + 2] = 随();
      const 类 = k % 5;
      px[i + 3] = 类 === 0 ? 255 : 类 === 1 ? (随() < 80 ? 0 : 255) : 类 === 2 ? 100 + (随() % 156) : 类 === 3 ? 0 : p === 37 ? 255 : 0;
    }
  return { w: 格, h: 格 * 张数, px };
};
// 每格按最近邻放大 倍：放大后的高清图集，第 k+log2(倍) 级应和原图集第 k 级一样
const 放大 = (t: { w: number; h: number; px: Uint8Array }, 倍: number) => {
  const w = t.w * 倍, h = t.h * 倍;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(t.px.subarray(((Math.floor(y / 倍) * t.w + Math.floor(x / 倍)) * 4), (Math.floor(y / 倍) * t.w + Math.floor(x / 倍)) * 4 + 4), (y * w + x) * 4);
  return { w, h, px };
};
const 成uri = (t: { w: number; h: number; px: Uint8Array }) => `data:image/png;base64,${Buffer.from(encode({ width: t.w, height: t.h, data: t.px, channels: 4, depth: 8 })).toString('base64')}`;

// 材质.ts 经 网格.ts 引到方块表、群系色：给最小的表
vi.mock('asset:数据/场景/关键帧/方块表', () => ({ default: { 贴图: ['test:block/stone'], 面组: [], 方块: {} } }));
vi.mock('asset:数据/场景/关键帧/群系色', () => ({ default: { 群系: { 'minecraft:plains': { 草: '#91bd59', 叶: '#77ab2f', 水: '#3f76e4' } } } }));

const 载 = async (t: { w: number; h: number; px: Uint8Array }) => {
  vi.resetModules();
  vi.doMock('asset:贴图/场景/关键帧/方块表', () => ({ default: 成uri(t) }));
  return { 图集: await import('./真实方块图集.ts'), 材质: await import('./材质.ts') };
};
const 哈希 = (...xs: (string | Uint8Array)[]) => {
  const h = createHash('sha256');
  for (const x of xs) h.update(x);
  return h.digest('hex');
};
const 各级 = (t: THREE.DataTexture) => (t.mipmaps as unknown as { width: number; height: number; data: Uint8Array }[]).map((m) => m.data);
// 体素材质的着色器源码（用 three 的标准着色器当底）
const 着色器源码 = (m: Awaited<ReturnType<typeof 载>>['材质'], 类: '实心' | '镂空' | '实心树叶' | '水' | '花草') => {
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  (m.voxelMaterial(类) as THREE.MeshStandardMaterial).onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
  return sh.vertexShader + '\n----\n' + sh.fragmentShader;
};

describe('方块图集', () => {
  it('16 像素一格：图集各级字节、着色器源码和支持高清之前一样', async () => {
    const { 图集, 材质 } = await 载(假竖条(16));
    const a = 图集.blockAtlas();
    expect(a.rows).toBe(2);
    expect(a.original.mipmaps.length).toBe(5);
    expect(哈希(...各级(a.original))).toMatchInlineSnapshot(`"ff919fc75bd3c4dda2ee65f59b4017ebe6a8ff0c046eeb8c391eebd3804f5abe"`);
    expect(哈希(...各级(a.solid))).toMatchInlineSnapshot(`"b1ed730fe126b7192cc3237d81e9dadd2d9bd7e500cb0bd3b19fed2ef5856d1a"`);
    expect(哈希(图集.blockAtlasGlsl())).toMatchInlineSnapshot(`"d6dd78968605f7f960fbd919567955526c7be4add9effbd04c08233b6bc82034"`);
    expect(哈希(...(['实心', '镂空', '实心树叶', '水', '花草'] as const).map((k) => 着色器源码(材质, k)))).toMatchInlineSnapshot(`"65164669b31be608c05235a325fb5620748ff961ccc090a1171df92ea4e1e3cd"`);
  });
  it('纯色方块：16 像素一格的压色和支持高清之前一样', async () => {
    const { flattenAtlasColors } = await import('./纯色方块.ts');
    const t = 假竖条(16);
    expect(哈希(...(['花草', '其他', '不分'] as const).map((k) => flattenAtlasColors(t, k).px))).toMatchInlineSnapshot(`"37b91f8fd973757e058524d0ba5a8aeb56759a10e23c8f6ad5bc0f4db6c5d3aa"`);
  });
  it.each([2, 4])('格边长 16 × %i：最近邻放大的图集往下缩 log2(倍) 级后和原版图集逐字节一样，着色器按格边长取级别', async (倍) => {
    // 没有全透明像素的贴图（全透明的颜色按最近不透明像素补，放大后先后不同，补出来不一样）
    const 原 = 假竖条(16);
    for (let i = 3; i < 原.px.length; i += 4) 原.px[i] = Math.max(原.px[i]!, 100);
    const 低 = (await 载(原)).图集.blockAtlas();
    const 低级 = [各级(低.original), 各级(低.solid)];
    const { 图集, 材质 } = await 载(放大(原, 倍));
    const 高 = 图集.blockAtlas();
    expect(高.cell).toBe(16 * 倍);
    expect(高.rows).toBe(低.rows);
    const 高级 = [各级(高.original), 各级(高.solid)];
    for (const j of [0, 1]) {
      expect(高级[j]!.length).toBe(低级[j]!.length + Math.log2(倍));
      低级[j]!.forEach((d, k) => expect(哈希(高级[j]![k + Math.log2(倍)]!)).toBe(哈希(d)));
    }
    const 源 = 着色器源码(材质, '实心');
    expect(源).toContain(`vec2 tc = uv * ${16 * 倍}.0;`);
    expect(源).toContain(`lod = mix(lod, ${4 + Math.log2(倍)}.0, farK);`);
  });
  it('格边长不是 2 的幂就报错（材质.ts 一引就建图集）', async () => {
    await expect(载(假竖条(24, 3))).rejects.toThrow(/2 的幂/);
  });
});
