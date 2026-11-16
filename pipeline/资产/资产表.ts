// 资产表 assets/registry/<类>.toml（人写）：每条 [["asset"]] 写 id、category、source、license、visibility，可选 oldPath、note。
// 只有一部作品用的可以登记在作品那一侧 <作品根>/资产表/<类>.toml（格式一样，锁是 <作品根>/资产锁/）；私有作品的表锁跟着作品目录不进 Git。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { codeRoot } from '../环境/路径.ts';
import { isValidId, type AssetStorage } from './资产锁.ts';

export const visibilityValues = ['公开', '提取', '发布', '私有'] as const;
export type Visibility = (typeof visibilityValues)[number];

/** 登记在哪一侧：共用 = assets/registry/，作品 = <作品根>/资产表/ */
export type AssetSide = '共用' | '作品';
export type AssetEntry = { id: string; category: string; source: string; license: string; visibility: Visibility; oldPath?: string; note?: string; 表: string; side: AssetSide };

export const assetRegistryDir = () => path.join(codeRoot(), 'assets', 'registry');
export const workAssetRegistryDir = (workRoot: string) => path.join(workRoot, '资产表');

// 提取的 @ 后面是用到的 jar（原版声音是资源索引文件）sha256 前 12 位，几个用 + 连
const sourceFormat = /^(提取:[^@]+@[0-9a-f]{12}(\+[0-9a-f]{12})*|手工:.+|派生:.+\+.+)$/;

/** 读全部资产表；字段缺失、取值不对、id 重复都报出来（不在第一条就停） */
export const readAssetRegistry = (dir = assetRegistryDir(), side: AssetSide = '共用'): { entryMap: Map<string, AssetEntry>; issues: string[] } => {
  const entryMap = new Map<string, AssetEntry>();
  const issues: string[] = [];
  if (!fs.existsSync(dir)) return { entryMap, issues };
  for (const fileName of fs.readdirSync(dir).filter((n) => n.endsWith('.toml')).sort()) {
    const tablePath = path.join(dir, fileName);
    let doc: Record<string, unknown>;
    try {
      doc = parse(fs.readFileSync(tablePath, 'utf8'));
    } catch (e) {
      issues.push(`${fileName}：TOML 解析失败：${(e as Error).message.split('\n')[0]}`);
      continue;
    }
    for (const raw of (doc['asset'] ?? []) as Record<string, unknown>[]) {
      const e = { ...raw, 表: fileName, side } as AssetEntry;
      const posLabel = `${fileName} 的「${String(raw.id)}」`;
      for (const k of ['id', 'category', 'source', 'license', 'visibility'] as const) if (typeof e[k] !== 'string' || !e[k]) issues.push(`${posLabel}：缺 ${k}`);
      if (typeof e.id !== 'string') continue;
      if (!isValidId(e.id)) issues.push(`${posLabel}：id 要是 <类>/<名>，不含空格和 Windows 不许的字符`);
      if (!visibilityValues.includes(e.visibility)) issues.push(`${posLabel}：可见性只能是 ${visibilityValues.join('、')}`);
      if (typeof e.source === 'string' && !sourceFormat.test(e.source)) issues.push(`${posLabel}：来源要写成 提取:<配方>@<jar sha256 前 12 位>[+…] / 手工:<说明> / 派生:<输入 sha>+<参数>`);
      if (entryMap.has(e.id)) issues.push(`${posLabel}：id 和 ${entryMap.get(e.id)!.表} 里的重复`);
      entryMap.set(e.id, e);
    }
  }
  return { entryMap, issues };
};

type ReadTableResult = { entryMap: Map<string, AssetEntry>; issues: string[] };

/** 共用表并上作品表；同一个 id 两侧都登记的，条目留共用那条，作品那条放进 重复（作品专有的 id 不强制带作品名前缀，靠这条兜底，0004 用户 10-22 定） */
export const mergeAssetRegistry = (sharedTable: ReadTableResult, workAssetRegistry: ReadTableResult): { entryMap: Map<string, AssetEntry>; duplicates: AssetEntry[] } => {
  const entryMap = new Map(sharedTable.entryMap);
  const duplicates: AssetEntry[] = [];
  for (const [id, e] of workAssetRegistry.entryMap) {
    if (entryMap.has(id)) duplicates.push(e);
    else entryMap.set(id, e);
  }
  return { entryMap, duplicates };
};

/** 一部作品看得到的全部登记：共用表并上 <作品根>/资产表/（没有就只有共用的） */
export const readAssetRegistryBoth = (workRoot: string, sharedDir = assetRegistryDir()) => mergeAssetRegistry(readAssetRegistry(sharedDir), readAssetRegistry(workAssetRegistryDir(workRoot), '作品'));

export const libName = (v: Visibility): AssetStorage => (v === '私有' ? '私有' : 'store');
