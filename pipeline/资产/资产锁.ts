// 资产锁 assets/资产锁/（工具生成，人不手改）：一件资产一个文件 <id>.json（id 里的 / 就是子目录），内容 { sha256, 大小, 库, 后缀 }，键排序、UTF-8、缩进 2。
// 一件一个文件是为了并行的 Agent 各自登记资产时不撞同一个文件（以前整份一个 JSON，合并冲突 26 次，用户 11-06「按你的想法优化」）。
// 登记在作品资产表（<作品根>/资产表/）的 id 写在 <作品根>/资产锁/，格式一样；一部作品用的是两份并起来（读作品资产锁）。
// 字节按内容寻址放在数据根：可见性=私有 的进 私有/，其余进 store/，路径 <库>/<sha 前 2 位>/<sha256>，无后缀，只增不改。
// 这个文件也被 remotion.config.ts 打进 Remotion 的配置包，只能用 Node 自带模块和本仓库的纯 TS。
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataRoot } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';

export type AssetStorage = 'store' | '私有';
/** 时长（秒）、峰值（采样峰值 dBFS）、响度（积分响度 LUFS）：音频入库时量的可选字段（资产/音频量.ts），不进指纹 */
export type LockEntry = { sha256: string; 大小: number; 库: AssetStorage; 后缀: string; 时长?: number; 峰值?: number; 响度?: number };
export type AssetLock = Record<string, LockEntry>;

/** 锁目录 */
export const assetLockPath = () => path.join(codeRoot(), 'assets', '资产锁');
export const workAssetLockPath = (workRoot: string) => path.join(workRoot, '资产锁');
/** 一件资产的锁文件 */
export const lockFilePath = (lockDir: string, id: string) => `${path.join(lockDir, ...id.split('/'))}.json`;

const lockText = (entry: LockEntry) => {
  // 字段排序，和 Python json.dumps(sort_keys=True, ensure_ascii=False, indent=2) 写出的逐字节一样
  const sortedLock = Object.fromEntries(Object.keys(entry).sort().map((k) => [k, (entry as Record<string, unknown>)[k]]));
  return JSON.stringify(sortedLock, null, 2) + '\n';
};

/** 整份一个文件的旧格式还在（老分支合进来又带回来）就报错，不悄悄漏掉它里面的条目 */
const rejectOldFormat = (lockDir: string) => {
  if (fs.existsSync(`${lockDir}.json`)) throw new Error(`${lockDir}.json 是整份一个文件的旧资产锁，现在一件资产一个文件放 ${lockDir}/：把它的条目并进去（写资产锁）再删掉它`);
};

export const readAssetLock = (lockDir = assetLockPath()): AssetLock => {
  rejectOldFormat(lockDir);
  if (!fs.existsSync(lockDir)) return {};
  const entries: [string, LockEntry][] = [];
  for (const rel of fs.readdirSync(lockDir, { recursive: true }) as string[]) {
    if (!rel.endsWith('.json')) continue;
    const f = path.join(lockDir, rel);
    try {
      entries.push([rel.slice(0, -'.json'.length).split(path.sep).join('/'), JSON.parse(fs.readFileSync(f, 'utf8')) as LockEntry]);
    } catch (e) {
      throw new Error(`${f} 读不了：${(e as Error).message}`);
    }
  }
  // 键按 id 排（和以前整份 JSON 的键序一样），不按文件路径排
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};

/** 打包一部作品用的锁：共用的 assets/资产锁/ 并上 <作品根>/资产锁/（没有就只用共用的）；同一个 id 两边都有就报错。
 *  这部作品选用了材质包就再盖上材质包覆盖层（套材质包）：在 照材质包选用 里按那一组的选用，不在就按作品的 "包"（当前材质包选用）；
 *  作品写了 换用.toml 的先照它把共用 id 换成作品自己那件的字节（套换用），材质包覆盖层盖在换过的上面；换用 = false 是没换的（取材配方的输入要原件）。
 *  写锁的地方（assets add、extract --登记）读的是 读资产锁(单份)，不经这里 */
export const readWorkAssetLock = (workRoot: string, packSelection = currentResourcePackSelection(workRoot), useSwap = true): AssetLock => {
  const sharedLock = readAssetLock();
  const workAssetLock = readAssetLock(workAssetLockPath(workRoot));
  const duplicates = Object.keys(workAssetLock).filter((id) => id in sharedLock);
  if (duplicates.length) throw new Error(`资产 id 在共用锁和 ${workAssetLockPath(workRoot)} 里都有：${duplicates.join('、')}（一个 id 只登记在一侧）`);
  const merged = { ...sharedLock, ...workAssetLock };
  return applyResourcePack(useSwap ? applySwap(merged, workRoot) : merged, workRoot, packSelection);
};

// 按作品换用：<作品根>/换用.toml 一行一条 "<共用 id>" = "<本作品资产 id>"，这部作品里引用左边 id 的地方（asset:、打包、指纹）拿到的是右边那件的字节，
// 别的作品不受影响。现在只给体素方块表用：全局表、图集公开发且别的作品的画面钉在它上面，作品要的模组方块做成「全局表 + 追加」的附加表登记在作品侧
// （sourcing/extract.toml「方块附加-…」，docs/世界.md「给方块表加模组方块」）。
export const swapTablePath = (workRoot: string) => path.join(workRoot, '换用.toml');

/** 换用.toml 的条目；没有这个文件是空的。随 remotion.config.ts 打包不能用 TOML 库，只认 "…" = "…" 和 # 注释 */
export const readSwapTable = (workRoot: string): [string, string][] => {
  const f = swapTablePath(workRoot);
  if (!fs.existsSync(f)) return [];
  const pairs: [string, string][] = [];
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = line.replace(/\s+#.*$/, '').trim();
    if (!t || t.startsWith('#')) continue;
    const m = /^"([^"]+)"\s*=\s*"([^"]+)"$/.exec(t);
    if (!m) throw new Error(`${f}：一行一条，写成 "<共用资产 id>" = "<本作品资产 id>"，这里认不出：${t}`);
    if (pairs.some(([a]) => a === m[1])) throw new Error(`${f}：${m[1]} 写了两次`);
    pairs.push([m[1], m[2]]);
  }
  return pairs;
};

export const applySwap = (assetLock: AssetLock, workRoot: string): AssetLock => {
  const swapTable = readSwapTable(workRoot);
  if (!swapTable.length) return assetLock;
  const swapped = { ...assetLock };
  for (const [originalId, newId] of swapTable) {
    if (!assetLock[originalId]) throw new Error(`${swapTablePath(workRoot)}：${originalId} 不在资产锁里（只能换已登记的资产）`);
    if (!assetLock[newId]) throw new Error(`${swapTablePath(workRoot)}：${newId} 不在资产锁里：先登记、入库（anim assets add，或对应的 anim extract … --登记）`);
    if (assetLock[originalId].后缀 !== assetLock[newId].后缀) throw new Error(`${swapTablePath(workRoot)}：${originalId}（${assetLock[originalId].后缀}）和 ${newId}（${assetLock[newId].后缀}）后缀不一样`);
    swapped[originalId] = assetLock[newId];
  }
  return swapped;
};

// 材质包兼容层（用户 11-02「找一个更好的材质包」「写个统一的兼容层…也兼容现有的光影和材质包」）：标准 Java 版资源包 zip 按资产 id 登记（类 材质包/），
// 作品在 <作品根>/材质包.toml 写 "包" = [...] 选用（顺序同 MC 资源包界面，上面的盖下面的），anim assets 材质包 生成覆盖层锁：
// 被包换掉的 id → 换后的字节，盖在作品锁上，打包、指纹都看盖过的（换了的贴图 sha 不同，段指纹跟着变）。没写或空 = 原版，锁、指纹都不变。
// 试样不改作品：环境变量 ANIM_PACKS=<名,名…> 顶掉作品的选用（=原版 关掉），覆盖层锁放数据根 cache/材质包/<作品>/。变量名用 ASCII：本机 zsh 会把中文变量名搅乱。
// 封顶：一格最多几个贴图像素（16 = 缩回原版尺寸；不写按作品画风放到最大，见 材质包.ts 放大上限），环境变量 ANIM_PACKS_RES 或 材质包.toml 的 "封顶" = 16（全作品一个）。
// 分辨率：材质包.toml 的 "分辨率" = 64（全作品一个）同试验倍数一样不按画风整除，照这个分辨率上屏（用户 11-07 定《把回忆拼好给你》直接用 64x）。
// 试验倍数（用户 11-06 要看 64x、128x、256x 真上屏的样子和渲染时长）：环境变量 ANIM_PACKS_TRY=64|128|256 只跟 ANIM_PACKS 一起才起作用，
// 不按画风整除、照这个分辨率放（一个贴图像素不再是整数个成片像素），覆盖层锁名带 @试验<N>；作品的 材质包.toml 不认它。
// 按段选（用户 11-02「材质包应该也是可选项 而不是耦合的」）：材质包.toml 的 [段] 小节 "<段键>" = [...] 给这一段换包，[] = 这一段用原版，没写的段用 "包"。
// 选的包只进那一段自己的指纹（换了的贴图 sha 在它闭包的 asset: 叶子里），别的段不动；打包、算指纹按选用分组，一组一个打包（按材质包分组、照材质包选用）。
// Studio（remotion.config.ts）只有一个打包，按作品的 "包"：[段] 里另选的段在 Studio 里看到的是作品的包，以 anim still、film 为准。
export const resourcePackEnvVar = 'ANIM_PACKS';
export const resourcePackCapEnvVar = 'ANIM_PACKS_RES';
export const resourcePackTrialEnvVar = 'ANIM_PACKS_TRY';
export const workResourcePackTablePath = (workRoot: string) => path.join(workRoot, '材质包.toml');
/** 来自：作品 = 作品的 "包"；段 = [段] 小节给这一段另选的（和 "包" 一样的算 作品）；环境 = 试样的环境变量 */
export type ResourcePackSelection = { 包: string[]; source: '无' | '作品' | '段' | '环境'; 封顶?: number; 试验?: number; 分辨率?: number };
export type ResourcePackLock = { 包: { id: string; sha256: string }[]; 封顶?: number; 试验?: number; 分辨率?: number; 覆盖: AssetLock; 报告?: unknown };

const addPackPrefix = (x: string) => (x.startsWith('材质包/') ? x : `材质包/${x}`);

const readResCap = (x: string, source: string) => {
  const n = Number(x.trim());
  if (!Number.isInteger(n) || n < 16 || (n & (n - 1)) !== 0) throw new Error(`${source}：封顶要写 16、32、64 这样 16 起的 2 的幂，现在是「${x}」`);
  return n;
};

const readPackArray = (x: string, source: string) => {
  try {
    return (JSON.parse(`[${x.replace(/,\s*$/, '')}]`) as unknown[]).map((v) => addPackPrefix(String(v)));
  } catch {
    throw new Error(`${source}：包名只能是双引号字符串`);
  }
};

export type ResourcePackTable = { 文件: string; 包: string[]; 封顶?: number; 分辨率?: number; 段: Map<string, string[]> };

/** <作品根>/材质包.toml；没有这个文件是 null。这个文件随 remotion.config.ts 打包，不能用 TOML 库，只认下面这几种写法：
 *  "包" = [ … ]、"封顶" = 32、"分辨率" = 64、[段] 小节里一行一段 "<段键>" = [ … ]（# 开头的行是注释） */
export const readResourcePackTable = (workRoot: string): ResourcePackTable | null => {
  const f = workResourcePackTablePath(workRoot);
  if (!fs.existsSync(f)) return null;
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('#'));
  const sectionIndex = lines.findIndex((l) => /^\s*\[/.test(l) && !/^\s*"?包"?\s*=/.test(l));
  const topText = (sectionIndex < 0 ? lines : lines.slice(0, sectionIndex)).join('\n');
  const m = /^\s*"?包"?\s*=\s*\[([^\]]*)\]/m.exec(topText);
  if (!m) throw new Error(`${f}：要写成 "包" = ["材质包/<名>", …]（空数组 = 原版）`);
  const c = /^\s*"?封顶"?\s*=\s*(\S+)/m.exec(topText);
  const resolutionMatch = /^\s*"?分辨率"?\s*=\s*(\S+)/m.exec(topText);
  const segmentPacks = new Map<string, string[]>();
  if (sectionIndex >= 0) {
    if (lines[sectionIndex]!.trim() !== '[段]') throw new Error(`${f}：只认 [段] 小节，现在是「${lines[sectionIndex]!.trim()}」`);
    let body = lines.slice(sectionIndex + 1).join('\n');
    for (const e of body.matchAll(/^\s*"([^"]+)"\s*=\s*\[([^\]]*)\]/gm)) {
      if (segmentPacks.has(e[1]!)) throw new Error(`${f}：[段] 里「${e[1]}」写了两次`);
      segmentPacks.set(e[1]!, readPackArray(e[2]!, `${f} [段] 的「${e[1]}」`));
      body = body.replace(e[0], '');
    }
    if (body.trim()) throw new Error(`${f}：[段] 里一行一段，写成 "<段键>" = ["材质包/<名>", …]（[] = 这段用原版），这里认不出：${body.trim().split('\n')[0]}`);
  }
  return { 文件: f, 包: readPackArray(m[1]!, `${f} 的「包」`), ...(c ? { 封顶: readResCap(c[1]!, f) } : {}), ...(resolutionMatch ? { 分辨率: readResCap(resolutionMatch[1]!, f) } : {}), 段: segmentPacks };
};

const samePacks = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 选用哪些材质包：环境变量（试样，所有段一样）> 材质包.toml [段] 里这一段的 > "包"。不给段键就是作品的 */
export const readResourcePackSelection = (workRoot: string, env = process.env[resourcePackEnvVar], envResCap = process.env[resourcePackCapEnvVar], segKey?: string, envTrialRes = process.env[resourcePackTrialEnvVar]): ResourcePackSelection => {
  const withResCap = (packSelection: ResourcePackSelection, resCap: number | undefined): ResourcePackSelection => (packSelection.包.length && resCap !== undefined ? { ...packSelection, 封顶: resCap } : packSelection);
  const envResCapNum = envResCap !== undefined && envResCap.trim() !== '' ? readResCap(envResCap, resourcePackCapEnvVar) : undefined;
  if (env !== undefined && env.trim() !== '') {
    const resourcePacks = env.trim() === '原版' ? [] : env.split(',').map((x) => x.trim()).filter(Boolean).map(addPackPrefix);
    const packSelection = withResCap({ 包: resourcePacks, source: resourcePacks.length ? '环境' : '无' }, envResCapNum);
    if (!resourcePacks.length || envTrialRes === undefined || envTrialRes.trim() === '') return packSelection;
    return { ...packSelection, 试验: readResCap(envTrialRes, resourcePackTrialEnvVar) };
  }
  const resourcePackTable = readResourcePackTable(workRoot);
  if (!resourcePackTable) return { 包: [], source: '无' };
  const resCap = envResCapNum ?? resourcePackTable.封顶;
  const segPacks = segKey === undefined ? undefined : resourcePackTable.段.get(segKey);
  const withResolution = (packSelection: ResourcePackSelection): ResourcePackSelection => (packSelection.包.length && resourcePackTable.分辨率 !== undefined ? { ...packSelection, 分辨率: resourcePackTable.分辨率 } : packSelection);
  if (segPacks && !samePacks(segPacks, resourcePackTable.包)) return withResolution(withResCap({ 包: segPacks, source: segPacks.length ? '段' : '无' }, resCap));
  return withResolution(withResCap({ 包: resourcePackTable.包, source: resourcePackTable.包.length ? '作品' : '无' }, resCap));
};

/** 材质包.toml 里用得上的每一种选用（作品的 "包" 和 [段] 另选的，去重、不含原版），anim assets 材质包 逐个建覆盖层锁 */
export const workResourcePackSelections = (workRoot: string): ResourcePackSelection[] => {
  const resourcePackTable = readResourcePackTable(workRoot);
  if (!resourcePackTable) return [];
  const packPicks = new Map<string, ResourcePackSelection>();
  for (const segKey of [undefined, ...resourcePackTable.段.keys()]) {
    const packSelection = readResourcePackSelection(workRoot, '', '', segKey);
    if (packSelection.包.length) packPicks.set(resourcePackSelectionKey(packSelection), packSelection);
  }
  return [...packPicks.values()];
};

/** 两份选用打出来的包一样，键就一样（分组用） */
const trialSuffix = (packSelection: ResourcePackSelection) => (packSelection.试验 !== undefined ? `@试验${packSelection.试验}` : '');
export const resourcePackSelectionKey = (packSelection: ResourcePackSelection) => (packSelection.包.length ? `${packSelection.source}:${packSelection.包.join(',')}${packSelection.封顶 !== undefined ? `@${packSelection.封顶}` : ''}${trialSuffix(packSelection)}` : '原版');
const describeSelection = (packSelection: ResourcePackSelection) => (packSelection.包.length ? `${packSelection.包.join('、')}${packSelection.封顶 !== undefined ? `（封顶 ${packSelection.封顶}）` : ''}${packSelection.试验 !== undefined ? `（试验 ${packSelection.试验}）` : ''}` : '原版');

// 打包、算指纹时这一组的选用：webpack改写、补缺字节占位、建默克尔图 都在里面调 读作品资产锁，不用一路传参（webpack.ts 的文本进全片指纹，改不得）
const buildSelection = new AsyncLocalStorage<ResourcePackSelection>();
/** fn 里（连同它发起的打包、算指纹）读作品资产锁 默认按 选 */
export const withResourcePackSelection = <T>(packSelection: ResourcePackSelection, fn: () => T): T => buildSelection.run(packSelection, fn);
/** 只渲一段（still、bench）：按这一段的选用 */
export const withSegResourcePack = <T>(workRoot: string, segKey: string, fn: () => T): T => withResourcePackSelection(readResourcePackSelection(workRoot, undefined, undefined, segKey), fn);
/** 在 照材质包选用 里就是那一组的，不在就是作品的 */
export const currentResourcePackSelection = (workRoot: string): ResourcePackSelection => buildSelection.getStore() ?? readResourcePackSelection(workRoot);

/** 按段的选用分组，组的顺序、组里的顺序都照原来的先后；没写材质包.toml 或都一样时只有一组 */
export const groupByResourcePackSelection = <T>(workRoot: string, items: readonly T[], segKey: (x: T) => string): { 选: ResourcePackSelection; items: T[] }[] => {
  const packGroups = new Map<string, { 选: ResourcePackSelection; items: T[] }>();
  for (const x of items) {
    const packSelection = readResourcePackSelection(workRoot, undefined, undefined, segKey(x));
    const k = resourcePackSelectionKey(packSelection);
    const g = packGroups.get(k) ?? { 选: packSelection, items: [] };
    g.items.push(x);
    packGroups.set(k, g);
  }
  return [...packGroups.values()];
};

/** 一组一组在各自的选用里跑 fn（一组一个打包），结果按组的顺序 */
export const perGroupWithResourcePacks = async <T, R>(workRoot: string, items: readonly T[], segKey: (x: T) => string, fn: (group: T[]) => Promise<R>): Promise<R[]> => {
  const results: R[] = [];
  for (const g of groupByResourcePackSelection(workRoot, items, segKey)) results.push(await withResourcePackSelection(g.选, () => fn(g.items)));
  return results;
};

/** 渲一段前核对：这个打包的选用和这一段的一样（调用处忘了按材质包分组时在这里拦下，不出错的画面） */
export const verifySegResourcePacks = (workRoot: string, segKey: string) => {
  const segmentPack = readResourcePackSelection(workRoot, undefined, undefined, segKey);
  const resourcePackPick = currentResourcePackSelection(workRoot);
  if (resourcePackSelectionKey(segmentPack) !== resourcePackSelectionKey(resourcePackPick)) throw new Error(`${segKey} 选用的材质包是 ${describeSelection(segmentPack)}，这次打包按的是 ${describeSelection(resourcePackPick)}：调用处要按材质包分组打包（资产锁.ts 逐组照材质包）`);
};

/** 覆盖层锁放哪：作品选用的进 Git（<作品根>/材质包.锁.json，像资产锁一样钉住字节；[段] 另选的是 材质包-<包+包>[@封顶].锁.json）；环境变量试样的放数据根 cache/ */
export const resourcePackLockPath = (workRoot: string, packSelection: ResourcePackSelection, root = dataRoot()) => {
  const lockName = `${packSelection.包.map((x) => x.slice('材质包/'.length)).join('+')}${packSelection.封顶 !== undefined ? `@${packSelection.封顶}` : ''}${trialSuffix(packSelection)}`;
  if (packSelection.source === '作品') return path.join(workRoot, '材质包.锁.json');
  if (packSelection.source === '段') return path.join(workRoot, `材质包-${lockName}.锁.json`);
  return path.join(root, 'cache', '材质包', path.basename(workRoot), `${lockName}.锁.json`);
};

export const applyResourcePack = (assetLock: AssetLock, workRoot: string, packSelection: ResourcePackSelection): AssetLock => {
  if (!packSelection.包.length) return assetLock;
  const file = resourcePackLockPath(workRoot, packSelection);
  const rebuildCmd = `anim${packSelection.source === '环境' ? ` 前面带 ${resourcePackEnvVar}=${packSelection.包.join(',')}${packSelection.封顶 !== undefined ? ` ${resourcePackCapEnvVar}=${packSelection.封顶}` : ''}${packSelection.试验 !== undefined ? ` ${resourcePackTrialEnvVar}=${packSelection.试验}` : ''}` : ''} assets 材质包`;
  if (!fs.existsSync(file)) throw new Error(`选用了材质包 ${packSelection.包.join('、')}，但覆盖层锁 ${file} 不存在：先跑 ${rebuildCmd}`);
  const resourcePackLock = JSON.parse(fs.readFileSync(file, 'utf8')) as ResourcePackLock;
  const chosenPacks = packSelection.包.map((id) => `${id}@${assetLock[id]?.sha256 ?? '没登记'}`).join(',');
  const buildKey = resourcePackLock.包.map((x) => `${x.id}@${x.sha256}`).join(',');
  if (chosenPacks !== buildKey) throw new Error(`覆盖层锁 ${file} 是按 ${buildKey} 建的，现在选用 ${chosenPacks}：重跑 ${rebuildCmd}`);
  if (resourcePackLock.分辨率 !== packSelection.分辨率) throw new Error(`覆盖层锁 ${file} 是按分辨率 ${resourcePackLock.分辨率 ?? '按画风'} 建的，现在选用 ${packSelection.分辨率 ?? '按画风'}：重跑 ${rebuildCmd}`);
  if (resourcePackLock.试验 !== packSelection.试验) throw new Error(`覆盖层锁 ${file} 是按试验 ${resourcePackLock.试验 ?? '无'} 建的，现在选用试验 ${packSelection.试验 ?? '无'}：重跑 ${rebuildCmd}`);
  if (resourcePackLock.封顶 !== packSelection.封顶) throw new Error(`覆盖层锁 ${file} 是按封顶 ${resourcePackLock.封顶 ?? '不限'} 建的，现在选用封顶 ${packSelection.封顶 ?? '不限'}：重跑 ${rebuildCmd}`);
  const unknownIds = Object.keys(resourcePackLock.覆盖).filter((id) => !(id in assetLock));
  if (unknownIds.length) throw new Error(`${file} 盖了作品锁里没有的 id：${unknownIds.slice(0, 5).join('、')}（覆盖层只能换已登记的资产）`);
  return { ...assetLock, ...resourcePackLock.覆盖 };
};

/** 让目录里的锁文件和 锁 一样：内容变了的才重写，锁里没有的删掉（空目录一并删），没变的文件不碰 */
export const writeAssetLock = (assetLock: AssetLock, lockDir = assetLockPath()) => {
  rejectOldFormat(lockDir);
  const existing = readAssetLock(lockDir);
  for (const [id, entry] of Object.entries(assetLock)) {
    const f = lockFilePath(lockDir, id);
    const text = lockText(entry);
    if (existing[id] && fs.readFileSync(f, 'utf8') === text) continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text, 'utf8');
  }
  for (const id of Object.keys(existing)) {
    if (id in assetLock) continue;
    fs.rmSync(lockFilePath(lockDir, id));
    for (let d = path.dirname(lockFilePath(lockDir, id)); d !== lockDir && !fs.readdirSync(d).length; d = path.dirname(d)) fs.rmdirSync(d);
  }
};

export const bytesPath = (entry: Pick<LockEntry, 'sha256' | '库'>, root = dataRoot()) => path.join(root, entry.库, entry.sha256.slice(0, 2), entry.sha256);

export const fileSha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** 资产 id 规则：<类>/<名>，Windows 文件名合法、不含空格 */
export const isValidId = (id: string) => /^[^/\s]+(\/[^/\s]+)+$/.test(id) && !/[<>:"\\|?*\x00-\x1f]/.test(id);

export class MissingAsset extends Error {}

/** 按 id 查锁、确认字节在库里；查不到给出该跑的命令 */
export const resolveAsset = (id: string, assetLock: AssetLock, root = dataRoot()) => {
  const entry = assetLock[id];
  if (!entry) {
    throw new MissingAsset(
      `资产锁里没有「${id}」：先在 assets/registry/<类>.toml（只有一部作品用的在 <作品根>/资产表/）登记，再跑 anim assets add ${id} <文件> 入库、写资产锁`,
    );
  }
  const file = bytesPath(entry, root);
  if (!fs.existsSync(file)) throw new MissingAsset(`资产「${id}」的字节不在 ${file}：数据根不全（检查 ANIM_DATA，或从别的机器同步 store/、私有/）`);
  return { entry, 文件: file };
};

/** 文件放进库（APFS 上是克隆，不占空间），返回锁条目；同 sha 已在就不动 */
export const importToStore = (sourcePath: string, libName: AssetStorage, root = dataRoot()): LockEntry => {
  const sha256 = fileSha256(sourcePath);
  const entry: LockEntry = { sha256, 大小: fs.statSync(sourcePath).size, 库: libName, 后缀: path.extname(sourcePath).toLowerCase() };
  const targetPath = bytesPath(entry, root);
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tmp = `${targetPath}.写入中-${process.pid}`;
    fs.copyFileSync(sourcePath, tmp, fs.constants.COPYFILE_FICLONE);
    fs.chmodSync(tmp, 0o444);
    fs.renameSync(tmp, targetPath);
  }
  return entry;
};
