// 段指纹：决定母版要不要重渲。代码部分按默克尔算（默克尔.ts：去注释、格式，说明符换成目标哈希，路径不进），再并上别的输入：
//   代码    画面、段.ts、设置.ts、外壳（作品 index.ts，到 清单.ts 的边不跟，加段、改顺序不让已有段过期）各自的默克尔根；
//           npm 包按 lockfile 版本、asset: 按资产锁 sha 已在叶子里
//   地形    段声明的地形包和登记的版本（assets/地形版本.json）。代码不再 import 这张表（engine/voxel/区段包位置.ts），改别的包不让这段过期；页面也只拿到这几个包（渲/地形注入.ts）
//   渲染设置 传给 Remotion 的全部渲染参数和 inputProps
//   依赖版本 lockfile 里 remotion、three 等决定像素的包
//   打包规则 webpack 改写、ogg 解码和媒体字面量兼容各自规范化文本的哈希（不跟它们的闭包），和影响输出的 tsconfig 编译选项
//   平台    process.platform-arch（跨平台不要求逐像素一致）
//   私有配乐 闭包里有 engine/audio/私有配乐.ts 的段（按 cue 现取、不打进包）：本段 cue 里的私有配乐记 sha 或「缺:静音」（资产/私有配乐.ts）；
//           没有这一项的段不写这个键，指纹和加这项之前一样
//   缺字节  闭包里 import 的资产字节不在数据根（公开仓库只带 随仓库.toml 的段要用的）、打进的是占位的（资产/缺字节.ts）：记这些 id；都在就不写这个键
// 指纹 = 项按键排序后的 JSON 的 sha256；.指纹.json 另存 明细（路径 → 模块哈希、asset id → sha），不进指纹，只给 anim stale 说明是哪个文件变了。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { codeRoot, relativeToCodeRoot } from '../环境/路径.ts';
import { workRoot } from '../环境/作品.ts';
import { buildMerkleGraph, textFileHash, compileOptions, lockedVersion, MERKLE_ALGORITHM, type MerkleDetail } from './默克尔.ts';
import { dataRoot } from '../环境/配置.ts';
import { groupByResourcePackSelection, withResourcePackSelection, readWorkAssetLock } from '../资产/资产锁.ts';
import { segPrivateMusic, privateMusicModule } from '../资产/私有配乐.ts';
import { missingBytes } from '../资产/缺字节.ts';
import type { SegInfo } from '../清单/清单.ts';
import { segDurSec } from '../../engine/段/段定义.ts';

export type FingerprintItem = {
  代码: { 画面根: string; 段根: string; 设置根: string; 外壳根: string };
  地形: Record<string, string>;
  渲染设置: Record<string, unknown>;
  依赖版本: Record<string, string | null>;
  打包规则: Record<string, string>;
  平台: string;
  私有配乐?: Record<string, string>;
  缺字节?: string[];
};
export type SegFingerprint = { 段: string; 指纹: string; 算法: typeof MERKLE_ALGORITHM; 项: FingerprintItem; 明细: MerkleDetail };
export { lockedVersion };

/** 决定像素和声音的包，不管闭包里直接引没引都记版本 */
const keyDependencies = ['remotion', '@remotion/bundler', '@remotion/renderer', '@remotion/media', '@remotion/three', 'three', 'react', 'react-dom', 'webpack', 'esbuild'];
/** 外壳入口是所选作品的 index.ts（和 渲.ts 的 entryPoint 同一个） */
const shellEntry = () => relativeToCodeRoot(path.join(workRoot(), 'index.ts'));
const bundleRuleFiles = ['pipeline/资产/webpack.ts', 'pipeline/资产/ogg解码.cjs', 'pipeline/资产/媒体字面量.cjs'];

const sha = (buf: crypto.BinaryLike) => crypto.createHash('sha256').update(buf).digest('hex');

/** 键排序的 JSON（指纹要和对象键的插入顺序无关） */
export const stableJson = (x: unknown): string => {
  if (Array.isArray(x)) return `[${x.map(stableJson).join(',')}]`;
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(x);
};

export const readTerrainVersionTable = (): Record<string, string> => {
  const file = path.join(codeRoot(), 'assets', '地形版本.json');
  if (!fs.existsSync(file)) return {};
  const packs = (JSON.parse(fs.readFileSync(file, 'utf8')).包 ?? {}) as Record<string, { 版本: string }>;
  return Object.fromEntries(Object.entries(packs).map(([k, v]) => [k, v.版本]));
};

/** 段声明的包 → 登记的版本，键排好。指纹的地形项用它；切片的页面直接拿算好的这份，不重读表（渲/地形注入.ts） */
export const segTerrainVersion = (segKey: string, decls: readonly string[], versionTable: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    [...decls].sort().map((packName) => {
      if (!versionTable[packName]) throw new Error(`${segKey} 用的地形包 ${packName} 没在 assets/地形版本.json 登记版本`);
      return [packName, versionTable[packName]!];
    }),
  );

/** 外壳到作品 清单.ts 的边不跟（加段、改顺序不影响已有段的像素） */
const skipImport = (importer: string, target: string) => path.basename(importer) === '注册.tsx' && path.basename(target) === '清单.ts';

/** 段的默克尔入口：画面、段.ts、设置.ts、外壳 */
const segEntries = (s: SegInfo) => [relativeToCodeRoot(s.画面), relativeToCodeRoot(s.段文件), 'engine/段/设置.ts', shellEntry()];

export type FingerprintTask = { 段: SegInfo; 渲染设置: Record<string, unknown> };

/** 一批段一次打包算指纹（建一张默克尔图，按段取闭包），顺序和任务一样；每一份都和单独算这一段的一样。
 *  材质包按段选的（资产锁.ts）按选用分组，一组一张图：asset: 叶子是这一段选用下的 sha */
export const computeSegFingerprints = async (tasks: readonly FingerprintTask[]): Promise<SegFingerprint[]> => {
  const groups = groupByResourcePackSelection(workRoot(), tasks.map((t, i) => ({ t, i })), (x) => x.t.段.键);
  const fingerprints: SegFingerprint[] = [];
  for (const g of groups) {
    const r = await withResourcePackSelection(g.选, () => computeGroupFingerprints(g.items.map((x) => x.t)));
    g.items.forEach((x, j) => (fingerprints[x.i] = r[j]!));
  }
  return fingerprints;
};

const computeGroupFingerprints = async (tasks: readonly FingerprintTask[]): Promise<SegFingerprint[]> => {
  if (!tasks.length) return [];
  const merkleTree = await buildMerkleGraph(
    tasks.flatMap((t) => segEntries(t.段)),
    { skip: skipImport },
  );
  const versionTable = readTerrainVersionTable();
  const bundleRules: Record<string, string> = { tsconfig: sha(stableJson(compileOptions())) };
  for (const f of bundleRuleFiles) bundleRules[f] = await textFileHash(f);
  const dependencyVersions = Object.fromEntries(keyDependencies.map((k) => [k, lockedVersion(k)]));
  const assetLock = readWorkAssetLock(workRoot());
  // 先把整把锁里缺的挑出来，各段再按自己闭包里的 id 取（和逐段 缺字节(闭包 id) 同一个判据，只是不重复查盘）
  const lockMissing = new Set(missingBytes(Object.keys(assetLock), assetLock, dataRoot()));
  return tasks.map(({ 段: s, 渲染设置: renderSettings }) => {
    const { 根: roots, 明细: detail } = merkleTree.取(segEntries(s));
    const fingerprintItems: FingerprintItem = {
      代码: { 画面根: roots[0]!, 段根: roots[1]!, 设置根: roots[2]!, 外壳根: roots[3]! },
      地形: segTerrainVersion(s.键, s.段.地形, versionTable),
      渲染设置: { ...renderSettings, 秒: segDurSec(s.段), 宽: s.段.宽, 高: s.段.高 },
      依赖版本: { ...dependencyVersions },
      打包规则: { ...bundleRules },
      平台: `${process.platform}-${process.arch}`,
    };
    // 私有配乐、缺字节都按本段的闭包判（明细是本段单独打包时的那份）
    if (privateMusicModule in detail.模块) {
      const music = segPrivateMusic(s.段, assetLock, dataRoot());
      if (Object.keys(music).length) fingerprintItems.私有配乐 = music;
    }
    const missing = Object.keys(detail.资产).filter((id) => lockMissing.has(id)).sort();
    if (missing.length) fingerprintItems.缺字节 = missing;
    return { 段: s.键, 指纹: sha(stableJson(fingerprintItems)), 算法: MERKLE_ALGORITHM, 项: fingerprintItems, 明细: detail };
  });
};

/** 两份指纹哪些项变了；给了明细就细到文件（只挪了路径的记成「挪了」）。旧算法的记录不逐项比 */
export const fingerprintDiff = (oldFingerprint: Pick<SegFingerprint, '项'> & { 明细?: MerkleDetail; 算法?: string }, newFingerprint: Pick<SegFingerprint, '项'> & { 明细?: MerkleDetail; 算法?: string }): string[] => {
  if (oldFingerprint.算法 !== newFingerprint.算法 || !('代码' in oldFingerprint.项)) return [`指纹算法换过（${oldFingerprint.算法 ?? '旧算法'} → ${newFingerprint.算法 ?? '旧算法'}），不逐项比`];
  const diffs: string[] = [];
  const compareTable = (displayName: string, a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) diffs.push(`${displayName} 多了 ${k}`);
      else if (!(k in b)) diffs.push(`${displayName} 少了 ${k}`);
      else if (stableJson(a[k]) !== stableJson(b[k])) diffs.push(`${displayName} 改了 ${k}`);
    }
  };
  compareTable('代码', oldFingerprint.项.代码, newFingerprint.项.代码);
  if (oldFingerprint.明细 && newFingerprint.明细 && diffs.length) {
    const a = oldFingerprint.明细.模块;
    const b = newFingerprint.明细.模块;
    const oldHashes = new Map(Object.entries(a).map(([p, h]) => [h, p]));
    const newHashes = new Set(Object.values(b));
    for (const [p, h] of Object.entries(b)) {
      if (p in a) {
        if (a[p] !== h) diffs.push(`模块 改了 ${p}`);
      } else if (oldHashes.has(h)) diffs.push(`模块 挪了 ${oldHashes.get(h)} → ${p}`);
      else diffs.push(`模块 多了 ${p}`);
    }
    for (const [p, h] of Object.entries(a)) if (!(p in b) && !newHashes.has(h)) diffs.push(`模块 少了 ${p}`);
    compareTable('资产', oldFingerprint.明细.资产, newFingerprint.明细.资产);
  }
  compareTable('地形', oldFingerprint.项.地形, newFingerprint.项.地形);
  compareTable('渲染设置', oldFingerprint.项.渲染设置, newFingerprint.项.渲染设置);
  compareTable('依赖版本', oldFingerprint.项.依赖版本, newFingerprint.项.依赖版本);
  compareTable('打包规则', oldFingerprint.项.打包规则, newFingerprint.项.打包规则);
  if (oldFingerprint.项.平台 !== newFingerprint.项.平台) diffs.push(`平台 ${oldFingerprint.项.平台} → ${newFingerprint.项.平台}`);
  compareTable('私有配乐', oldFingerprint.项.私有配乐 ?? {}, newFingerprint.项.私有配乐 ?? {});
  const missingTable = (x?: string[]) => Object.fromEntries((x ?? []).map((id) => [id, '缺字节']));
  compareTable('缺字节', missingTable(oldFingerprint.项.缺字节), missingTable(newFingerprint.项.缺字节));
  return diffs;
};
