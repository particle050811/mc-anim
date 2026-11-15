import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { terrainVersionEnv, terrainUsageSegEnv } from '../../engine/段/地形环境.ts';
import { fullTableEnv, segRenderEnv, segTerrainNow } from '../渲/地形注入.ts';
import type { SegInfo } from '../清单/清单.ts';
import { codeRoot } from '../环境/路径.ts';
import { loadAllSegments } from '../清单/清单.ts';
import { renderParams } from '../渲/设置.ts';
import { readAssetLock } from '../资产/资产锁.ts';
import { stableJson, computeSegFingerprints, fingerprintDiff, type FingerprintTask } from './指纹.ts';

const computeSegFingerprint = async (s: SegInfo, renderSettings: Record<string, unknown>) => (await computeSegFingerprints([{ 段: s, 渲染设置: renderSettings }]))[0]!;
import { computeMerkle } from './默克尔.ts';

const relPath = (p: string) => path.relative(codeRoot(), p).split(path.sep).join('/');

describe('稳定JSON', () => {
  it('和键的插入顺序无关', () => {
    expect(stableJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(stableJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
});

describe('默克尔指纹', () => {
  const makeTempDir = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-指纹-')));
  const merkleRoot = async (entry: string) => (await computeMerkle([relPath(entry)])).根[0]!;

  it('只改注释、格式，或挪文件、换说明符写法，根哈希不变；改了代码就变', async () => {
    const d = makeTempDir();
    const moduleA = path.join(d, '甲.ts');
    fs.writeFileSync(moduleA, "import { 乙 } from './乙.ts';\nexport default 乙 + 1;\n");
    fs.writeFileSync(path.join(d, '乙.ts'), 'export const 乙 = 1;\n');
    const rootBefore = await merkleRoot(moduleA);
    fs.writeFileSync(moduleA, "// 说明\nimport {乙} from './乙.ts'\n\n/** 加一 */\nexport default (乙 + 1)\n");
    fs.writeFileSync(path.join(d, '乙.ts'), 'export const 乙: number = 1; // 类型和注释\n');
    expect(await merkleRoot(moduleA)).toBe(rootBefore);
    fs.mkdirSync(path.join(d, '子'));
    fs.renameSync(path.join(d, '乙.ts'), path.join(d, '子', '丙.ts'));
    fs.writeFileSync(moduleA, "import { 乙 } from './子/丙.ts';\nexport default 乙 + 1;\n");
    expect(await merkleRoot(moduleA)).toBe(rootBefore);
    fs.writeFileSync(path.join(d, '子', '丙.ts'), 'export const 乙 = 2;\n');
    expect(await merkleRoot(moduleA)).not.toBe(rootBefore);
    fs.rmSync(d, { recursive: true });
  });

  it('asset: 按资产锁 sha、npm 包按 lockfile 版本、Worker 的 new URL 都算进去；锁里没有的 id 报错', async () => {
    const d = makeTempDir();
    const moduleA = path.join(d, '甲.ts');
    fs.writeFileSync(moduleA, "import 图 from 'asset:核对/冒烟色块'; import { interpolate } from 'remotion'; export const w = () => new Worker(new URL('./工人.ts', import.meta.url)); export default [图, interpolate];");
    fs.writeFileSync(path.join(d, '工人.ts'), 'export const 工 = 1;');
    const r = await computeMerkle([relPath(moduleA)]);
    expect(r.明细.资产).toEqual({ '核对/冒烟色块': readAssetLock()['核对/冒烟色块']!.sha256 });
    expect(Object.keys(r.明细.模块).sort()).toEqual([relPath(moduleA), relPath(path.join(d, '工人.ts'))].sort());
    fs.writeFileSync(path.join(d, '工人.ts'), 'export const 工 = 2;');
    expect((await computeMerkle([relPath(moduleA)])).根[0]).not.toBe(r.根[0]);
    fs.writeFileSync(path.join(d, '工人.ts'), "import x from 'asset:核对/不存在'; export const 工 = x;");
    await expect(computeMerkle([relPath(moduleA)])).rejects.toThrow(/资产锁里没有「核对\/不存在」/);
    fs.rmSync(d, { recursive: true });
  });
});

describe('段指纹', () => {
  it('冒烟段的指纹：逐项展开、两级渲染设置不同指纹、差异说得出是哪项', async () => {
    const [smokeSeg] = await loadAllSegments();
    const videoFingerprint = await computeSegFingerprint(smokeSeg!, renderParams('视频'));
    const previewRun = await computeSegFingerprint(smokeSeg!, renderParams('预览'));
    expect(videoFingerprint.指纹).toMatch(/^[0-9a-f]{64}$/);
    expect(videoFingerprint.指纹).not.toBe(previewRun.指纹);
    expect(Object.keys(videoFingerprint.明细.模块)).toEqual(expect.arrayContaining(['作品/应力转动/核对/冒烟/画面.tsx', '作品/应力转动/核对/冒烟/段.ts', 'engine/段/设置.ts', '作品/应力转动/注册.tsx', 'engine/段/注册工厂.tsx']));
    expect(Object.keys(videoFingerprint.明细.模块)).not.toContain('作品/应力转动/清单.ts');
    expect(Object.keys(videoFingerprint.明细.资产).sort()).toEqual(['核对/冒烟色块', '核对/冒烟音']);
    expect(videoFingerprint.项.依赖版本).toMatchObject({ remotion: '4.0.537', react: '19.3.0', three: '0.186.1' });
    expect(Object.keys(videoFingerprint.项.打包规则).sort()).toEqual(['pipeline/资产/ogg解码.cjs', 'pipeline/资产/webpack.ts', 'pipeline/资产/媒体字面量.cjs', 'tsconfig']);
    expect(fingerprintDiff(videoFingerprint, previewRun).sort()).toEqual(['渲染设置 改了 imageFormat', '渲染设置 改了 inputProps', '渲染设置 改了 scale']);
    expect((await computeSegFingerprint(smokeSeg!, renderParams('视频'))).指纹).toBe(videoFingerprint.指纹);
  });
});

describe('地形按段依赖', () => {
  const tableFile = path.join(codeRoot(), 'assets', '地形版本.json');
  const readFile = fs.readFileSync;
  /** 拿改过的地形登记表算指纹（代码根不动） */
  const computeWithTable = async (s: SegInfo, mutate: (packs: Record<string, { 版本: string }>, tableDoc: { 说明?: string }) => void) => {
    const tableDoc = JSON.parse(readFile(tableFile, 'utf8')) as { 说明?: string; 包: Record<string, { 版本: string }> };
    mutate(tableDoc.包, tableDoc);
    const stub = vi.spyOn(fs, 'readFileSync').mockImplementation(((f: fs.PathOrFileDescriptor, ...args: unknown[]) => (f === tableFile ? JSON.stringify(tableDoc) : (readFile as (...a: unknown[]) => unknown)(f, ...args))) as typeof fs.readFileSync);
    try {
      return await computeSegFingerprint(s, renderParams('视频'));
    } finally {
      stub.mockRestore();
    }
  };
  const pierceTowerSegment = async () => (await loadAllSegments()).find((s) => s.键 === '6-穿塔斩首领')!;

  it('改没声明的包、加新包、改说明，段不过期；改声明的包段过期，差异说得出是哪个包', async () => {
    const s = await pierceTowerSegment();
    const unrelatedKeys = Object.keys(JSON.parse(readFile(tableFile, 'utf8')).包).filter((packName) => !s.段.地形.includes(packName));
    expect(unrelatedKeys.length).toBeGreaterThan(0);
    const baseline = await computeWithTable(s, () => {});
    expect(Object.keys(baseline.明细.模块)).not.toContain('assets/地形版本.json');
    expect(Object.keys(baseline.明细.模块).some((f) => f.includes('/格式2'))).toBe(false);
    expect(Object.keys(baseline.明细.模块)).not.toContain('engine/voxel/区段模型表.生成.ts');
    expect(Object.keys(baseline.项.地形).sort()).toEqual([...s.段.地形].sort());
    const afterUnrelatedEdit = await computeWithTable(s, (packs, tableDoc) => {
      packs[unrelatedKeys[0]!]!.版本 = '无关新版本';
      packs.newPackage = { 版本: 'x' };
      tableDoc.说明 = '改过';
    });
    expect(afterUnrelatedEdit.指纹).toBe(baseline.指纹);
    const afterDeclEdit = await computeWithTable(s, (packs) => {
      packs[s.段.地形[0]!]!.版本 = '声明新版本';
    });
    expect(afterDeclEdit.指纹).not.toBe(baseline.指纹);
    // 模型是包内数据，换表只换包版本，不改解码器闭包。
    expect(afterDeclEdit.明细.模块).toEqual(baseline.明细.模块);
    expect(fingerprintDiff(baseline, afterDeclEdit)).toEqual([`地形 改了 ${s.段.地形[0]}`]);
  });

  it('删掉没声明的包不过期；删掉声明的包算指纹时报错', async () => {
    const s = await pierceTowerSegment();
    const baseline = await computeWithTable(s, () => {});
    const unrelatedKey = Object.keys(JSON.parse(readFile(tableFile, 'utf8')).包).filter((packName) => !s.段.地形.includes(packName))[0]!;
    expect((await computeWithTable(s, (packs) => void delete packs[unrelatedKey])).指纹).toBe(baseline.指纹);
    await expect(computeWithTable(s, (packs) => void delete packs[s.段.地形[0]!])).rejects.toThrow(/没在 assets\/地形版本.json 登记版本/);
  });

  // 批次中途表变了页面也不跟着变，整条流程在 渲/渲母版.test.ts 验
  it('环境按给的地形项拼，只有声明的包；同一张表当场读的和指纹的地形项相同', async () => {
    const s = await pierceTowerSegment();
    const baseline = await computeWithTable(s, () => {});
    const env = segRenderEnv(baseline.段, baseline.项.地形);
    expect(JSON.parse(env[terrainVersionEnv]!)).toEqual(baseline.项.地形);
    expect(segTerrainNow(s)).toEqual(baseline.项.地形);
    expect(env[terrainUsageSegEnv]).toBe(`应力转动/${s.键}`);
    expect(Object.keys(JSON.parse(fullTableEnv()[terrainVersionEnv]!))).toEqual(Object.keys(JSON.parse(readFile(tableFile, 'utf8')).包));
  });
});

describe('一次算 = 逐段算', () => {
  it('一批段一次建图算的指纹、明细，和逐段单独算的逐字相同', async () => {
    const segments = await loadAllSegments();
    // 取头几段加一个带叠层的段：两级渲染设置、共用闭包都覆盖到，又不至于逐段打包太久
    const picked = [...new Set([...segments.slice(0, 3), ...segments.filter((s) => s.段.叠层?.length).slice(0, 1)])];
    const tasks: FingerprintTask[] = picked.flatMap((s) => [
      { 段: s, 渲染设置: renderParams('视频') },
      { 段: s, 渲染设置: renderParams('预览') },
    ]);
    const firstRun = await computeSegFingerprints(tasks);
    expect(firstRun.map((x) => x.段)).toEqual(tasks.map((t) => t.段.键));
    const perSegment = await Promise.all(tasks.map((t) => computeSegFingerprint(t.段, t.渲染设置)));
    for (const [i, x] of perSegment.entries()) expect(JSON.stringify(firstRun[i])).toBe(JSON.stringify(x));
  });
});
