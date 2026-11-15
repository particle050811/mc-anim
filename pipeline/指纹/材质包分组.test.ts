// 材质包按段选（资产锁.ts）：一段换包只让那一段的指纹变，别的段不动；没选的段和没有 材质包.toml 时一样。
// 夹具作品放临时目录，两段都 import 同一件 asset:，覆盖层锁只换它的 sha。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { SegInfo } from '../清单/清单.ts';
import { readAssetLock, type ResourcePackLock } from '../资产/资产锁.ts';

const fixture = vi.hoisted(() => ({ 根: '' }));
vi.mock('../环境/作品.ts', async (actual) => ({ ...(await actual<typeof import('../环境/作品.ts')>()), workRoot: () => fixture.根 }));
const { computeSegFingerprints, fingerprintDiff } = await import('./指纹.ts');

const smokeBlockPath = '核对/冒烟色块';
const resourcePack = '材质包/faithful-32x';

describe('材质包按段选进各段自己的指纹', () => {
  const workRoot = (fixture.根 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包分组-'))));
  afterAll(() => fs.rmSync(workRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(workRoot, 'index.ts'), 'export {};\n');
  const makeSeg = (segKey: string): SegInfo => {
    const segDir = path.join(workRoot, segKey);
    fs.mkdirSync(segDir, { recursive: true });
    fs.writeFileSync(path.join(segDir, '画面.ts'), `import 图 from 'asset:${smokeBlockPath}';\nexport default ['${segKey}', 图];\n`);
    fs.writeFileSync(path.join(segDir, '段.ts'), 'export default {};\n');
    return { 键: segKey, 编号: null, segmentName: segKey, 目录: segDir, 画面: path.join(segDir, '画面.ts'), 段文件: path.join(segDir, '段.ts'), 段: { 地形: [], 帧数: 1, fps: 30, 宽: 16, 高: 16 } } as unknown as SegInfo;
  };
  const segments = [makeSeg('甲'), makeSeg('乙'), makeSeg('丙')];
  const calc = async () => Object.fromEntries((await computeSegFingerprints(segments.map((s) => ({ 段: s, 渲染设置: {} })))).map((f) => [f.段, f]));
  const writeTable = (contentText: string) => fs.writeFileSync(path.join(workRoot, '材质包.toml'), contentText);
  const sharedLock = readAssetLock();
  const resourcePackLock: ResourcePackLock = { 包: [{ id: resourcePack, sha256: sharedLock[resourcePack]!.sha256 }], 覆盖: { [smokeBlockPath]: { ...sharedLock[smokeBlockPath]!, sha256: 'f'.repeat(64) } } };
  fs.writeFileSync(path.join(workRoot, '材质包-faithful-32x.锁.json'), JSON.stringify(resourcePackLock));

  it('[段] 给一段换包：只有这一段过期，差异说得出是哪件资产；写 [] 和没写一样', async () => {
    const firstRun = await calc();
    writeTable('"包" = []\n');
    const emptyResult = await calc();
    for (const k of ['甲', '乙', '丙']) expect(emptyResult[k]!.指纹).toBe(firstRun[k]!.指纹);

    writeTable('"包" = []\n\n[段]\n"甲" = ["faithful-32x"]\n"乙" = []\n');
    const changed = await calc();
    expect(changed.甲!.指纹).not.toBe(firstRun.甲!.指纹);
    expect(fingerprintDiff(firstRun.甲!, changed.甲!)).toContain(`资产 改了 ${smokeBlockPath}`);
    expect(changed.乙!.指纹).toBe(firstRun.乙!.指纹);
    expect(changed.丙!.指纹).toBe(firstRun.丙!.指纹);

    // 和单独算这一段一样（分组不影响结果）
    expect((await computeSegFingerprints([{ 段: segments[0]!, 渲染设置: {} }]))[0]!.指纹).toBe(changed.甲!.指纹);
  });

  it('作品选了包、[段] 让一段退回原版：只有那一段和原版一样，其余换', async () => {
    fs.rmSync(path.join(workRoot, '材质包.toml'), { force: true });
    const firstRun = await calc();
    fs.copyFileSync(path.join(workRoot, '材质包-faithful-32x.锁.json'), path.join(workRoot, '材质包.锁.json'));
    writeTable('"包" = ["faithful-32x"]\n');
    const allSwapped = await calc();
    writeTable('"包" = ["faithful-32x"]\n[段]\n"乙" = []\n');
    const revertedB = await calc();
    expect(revertedB.乙!.指纹).toBe(firstRun.乙!.指纹);
    expect(revertedB.甲!.指纹).toBe(allSwapped.甲!.指纹);
    expect(revertedB.丙!.指纹).toBe(allSwapped.丙!.指纹);
    expect(allSwapped.甲!.指纹).not.toBe(firstRun.甲!.指纹);
  });
});
