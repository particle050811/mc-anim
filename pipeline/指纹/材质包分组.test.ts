// 材质包按段选（资产锁.ts）：一段换包只让那一段的指纹变，别的段不动；没选的段和没有 材质包.toml 时一样。
// 夹具作品放临时目录，两段都 import 同一件 asset:，覆盖层锁只换它的 sha。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { 段信息 } from '../清单/清单.ts';
import { 读资产锁, type 材质包锁 } from '../资产/资产锁.ts';

const 夹具 = vi.hoisted(() => ({ 根: '' }));
vi.mock('../环境/作品.ts', async (原) => ({ ...(await 原<typeof import('../环境/作品.ts')>()), 作品根: () => 夹具.根 }));
const { 算全部段指纹, 指纹差异 } = await import('./指纹.ts');

const 色块 = '核对/冒烟色块';
const 包 = '材质包/faithful-32x';

describe('材质包按段选进各段自己的指纹', () => {
  const 根 = (夹具.根 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包分组-'))));
  afterAll(() => fs.rmSync(根, { recursive: true, force: true }));
  fs.writeFileSync(path.join(根, 'index.ts'), 'export {};\n');
  const 段 = (键: string): 段信息 => {
    const 目录 = path.join(根, 键);
    fs.mkdirSync(目录, { recursive: true });
    fs.writeFileSync(path.join(目录, '画面.ts'), `import 图 from 'asset:${色块}';\nexport default ['${键}', 图];\n`);
    fs.writeFileSync(path.join(目录, '段.ts'), 'export default {};\n');
    return { 键, 编号: null, 段名: 键, 目录, 画面: path.join(目录, '画面.ts'), 段文件: path.join(目录, '段.ts'), 段: { 地形: [], 帧数: 1, fps: 30, 宽: 16, 高: 16 } } as unknown as 段信息;
  };
  const 段们 = [段('甲'), 段('乙'), 段('丙')];
  const 算 = async () => Object.fromEntries((await 算全部段指纹(段们.map((s) => ({ 段: s, 渲染设置: {} })))).map((f) => [f.段, f]));
  const 写表 = (文本: string) => fs.writeFileSync(path.join(根, '材质包.toml'), 文本);
  const 共用 = 读资产锁();
  const 盖: 材质包锁 = { 包: [{ id: 包, sha256: 共用[包]!.sha256 }], 覆盖: { [色块]: { ...共用[色块]!, sha256: 'f'.repeat(64) } } };
  fs.writeFileSync(path.join(根, '材质包-faithful-32x.锁.json'), JSON.stringify(盖));

  it('[段] 给一段换包：只有这一段过期，差异说得出是哪件资产；写 [] 和没写一样', async () => {
    const 原 = await 算();
    写表('"包" = []\n');
    const 空表 = await 算();
    for (const k of ['甲', '乙', '丙']) expect(空表[k]!.指纹).toBe(原[k]!.指纹);

    写表('"包" = []\n\n[段]\n"甲" = ["faithful-32x"]\n"乙" = []\n');
    const 换 = await 算();
    expect(换.甲!.指纹).not.toBe(原.甲!.指纹);
    expect(指纹差异(原.甲!, 换.甲!)).toContain(`资产 改了 ${色块}`);
    expect(换.乙!.指纹).toBe(原.乙!.指纹);
    expect(换.丙!.指纹).toBe(原.丙!.指纹);

    // 和单独算这一段一样（分组不影响结果）
    expect((await 算全部段指纹([{ 段: 段们[0]!, 渲染设置: {} }]))[0]!.指纹).toBe(换.甲!.指纹);
  });

  it('作品选了包、[段] 让一段退回原版：只有那一段和原版一样，其余换', async () => {
    fs.rmSync(path.join(根, '材质包.toml'), { force: true });
    const 原 = await 算();
    fs.copyFileSync(path.join(根, '材质包-faithful-32x.锁.json'), path.join(根, '材质包.锁.json'));
    写表('"包" = ["faithful-32x"]\n');
    const 全换 = await 算();
    写表('"包" = ["faithful-32x"]\n[段]\n"乙" = []\n');
    const 乙退回 = await 算();
    expect(乙退回.乙!.指纹).toBe(原.乙!.指纹);
    expect(乙退回.甲!.指纹).toBe(全换.甲!.指纹);
    expect(乙退回.丙!.指纹).toBe(全换.丙!.指纹);
    expect(全换.甲!.指纹).not.toBe(原.甲!.指纹);
  });
});
