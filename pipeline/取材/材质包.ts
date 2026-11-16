// anim assets packs：按这部作品选用的材质包（资产锁.ts 读材质包选用：ANIM_PACKS > <作品根>/材质包.toml）建覆盖层锁。
// 材质包是标准 Java 版资源包 zip，登记成资产 材质包/<名>（assets/registry/材质包.toml，许可不许分发的 可见性 私有，字节只在数据根 私有/）。
// 换哪些：方块图集（贴图/场景/关键帧/方块表，按 数据/场景/关键帧/方块表 的 贴图名 一格一格换）；sourcing/extract.toml 里照搬 jar 里原版贴图的产物
// （照搬贴图：方块、物品、粒子、天空、实体和角色皮肤、选择世界界面；模组的、自己画的、2D 歌词点阵用的银河字母不换）；包里有 colormap 的，群系色表（数据/场景/关键帧/群系色）。
// 出图交给 py/anim_py/材质包覆盖.py（只读 zip、不解压、不执行包里的东西）。分辨率（用户 11-02 要 32x 原样上屏、顺便兼容 64x）：见 放大上限，
// 本作品 像素N 6 → 最多 2 倍（32x 原样，64x、128x 盒子平均缩到 32x）；方块图集一格跟着变大（engine/voxel/真实方块图集.ts 按竖条宽取格边长），
// 包里没有的原版贴图最近邻放大到同一格。换后的字节按最严的可见性入库：有私有包 → 私有/，否则 store/。
import spawn from 'cross-spawn';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';
import { codeRoot } from '../环境/路径.ts';
import { readManifest } from './清单.ts';
import { jarPath } from './提取.ts';
import { readAssetRegistryBoth } from '../资产/资产表.ts';
import { importToStore, resourcePackLockPath, resolveAsset, readWorkAssetLock, readResourcePackSelection, type ResourcePackLock, type AssetLock, type LockEntry } from '../资产/资产锁.ts';

const atlasId = '贴图/场景/关键帧/方块表';
const blockTableId = '数据/场景/关键帧/方块表';
const biomeColorId = '数据/场景/关键帧/群系色';
const vanillaJar = 'client-1.20.1';
/** 照搬的原版贴图都换（模组的贴图不在 minecraft 命名空间下，不换）；colormap 另走群系色 */
const swappablePrefix = 'assets/minecraft/textures/';
const noSwapPrefixes = ['assets/minecraft/textures/colormap/'];
/** 这几类 id 不换：2D 界面（像素聊天栏、女仆界面、歌词点阵用的银河字母）照自己的点阵画，点不随材质包变细；贴图/镜头/ 是应力转动单镜头的。
 *  界面里只换消费处核过、按贴图尺寸取像素的（选择世界界面，场/2-选择世界/画界面.ts） */
const noReplacePrefixes = ['贴图/界面/', '贴图/镜头/'];
const uiReplaceable = new Set(['贴图/界面/世界选择', '贴图/界面/选项背景']);
/** 照原版尺寸（不放大）：云的贴图一个像素是天上 12 格一块云，放大了云的形状就变了（地点/原版云层.tsx 按像素读） */
const originalSizeIds = new Set(['贴图/场景/天空/clouds']);

/** 材质包最多放大几倍（相对原版 16 像素一格，2 的幂）。用户 11-02：32x 原样上屏、以后的 64x 也要兼容。
 *  三渲二正交机位一个原版贴图像素 = 像素N 个成片像素、顶面一个贴图像素 = 正交顶面 个像素高（画风.ts）；放大 倍 倍后一个贴图像素是 像素N ÷ 倍，
 *  要整像素（画风原则 3：像素一样大、不糊）就得 倍 同时整除 像素N 和 正交顶面。本作品 6、2 → 2：32x 原样，64x、128x 缩到 32x（6 ÷ 4 = 1.5 像素）。
 *  封顶（一格最多几个贴图像素，16 = 原版尺寸）再往下压；作品没有 画风.ts 的 像素N 就不放大。
 *  第三个参数（作品 材质包.toml 的 "resolution"，或试样的 ANIM_PACKS_TRY，见 资产锁.ts）顶掉画风的整除限制，直接放到 ÷ 16 倍：
 *  一个贴图像素不再是整数个成片像素（64x 在 像素N 6 下是 1.5 像素）。用户 11-07 定《把回忆拼好给你》直接用 64x */
export const maxUpscale = (styleText: string | null, resCap?: number, trialRes?: number): { factor: number; basis: string } => {
  if (trialRes !== undefined) {
    const factor = Math.min(trialRes, resCap ?? trialRes) / 16;
    return { factor, basis: `指定 ${trialRes}x（材质包.toml 的 分辨率 或 ANIM_PACKS_TRY）：不按画风整除，最多 ${factor} 倍（${16 * factor}x）${resCap !== undefined ? `，封顶 ${resCap}` : ''}` };
  }
  const getLimit = (constName: string) => {
    const m = styleText ? new RegExp(`export const ${constName} = (\\d+)`).exec(styleText) : null;
    return m ? Number(m[1]) : undefined;
  };
  const N = getLimit('像素N');
  const topDepth = getLimit('正交顶面');
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let factor = 1;
  let basis = '作品没有 画风.ts 的 像素N，不放大';
  if (N) {
    const g = topDepth ? gcd(N, topDepth) : N;
    factor = g & -g; // 整除 g 的最大 2 的幂
    basis = `像素N ${N}${topDepth ? `、正交顶面 ${topDepth}` : ''} → 最多 ${factor} 倍（${16 * factor}x）`;
  }
  if (resCap !== undefined) {
    const c = Math.max(1, Math.floor(resCap / 16));
    if (c < factor) {
      factor = 2 ** Math.floor(Math.log2(c));
      basis += `，封顶 ${resCap} → ${16 * factor}x`;
    }
  }
  return { factor, basis: basis };
};

export type CopiedTexture = { packPath: string; group: string };
/** extract.toml 里照搬 jar 里一张贴图的产物：id → 包内路径（assets/<ns>/textures/...png）和组（同一步导出的一组，材质包放大时一组一样大）。
 *  认这几种：「导出模型」的 名=路径、单写路径（产物名 = 文件名）、路径里带 *（按 锁ids 里有的 id 展开）、导出到单个文件；
 *  「导出实体模型」--贴图 后面的 名=路径（一张时产物是 <模型>.png，几张时是 <模型>.<名>.png） */
export const copyTextures = (sourcingTableText: string, lockedIds: Iterable<string> = []): Map<string, CopiedTexture> => {
  const t = parse(sourcingTableText) as { sourcing?: { displayName?: string; steps?: unknown[][]; artifacts?: Record<string, string> }[] };
  const ids = [...lockedIds];
  const copies = new Map<string, CopiedTexture>();
  for (const r of t.sourcing ?? []) {
    (r.steps ?? []).forEach((s, index) => {
      if (typeof s[2] !== 'string') return;
      const group = `${r.displayName ?? '?'}#${index}`;
      const artifacts = Object.entries(r.artifacts ?? {});
      if (s[0] === '导出实体模型') {
        const i = s.indexOf('--贴图');
        if (i < 0) return;
        const texturePairs = [] as [string, string][];
        for (const a of s.slice(i + 1)) {
          if (a === '--动画') break;
          const m = typeof a === 'string' ? /^([^=]+)=(assets\/.+\.png)$/.exec(a) : null;
          if (m) texturePairs.push([m[1]!, m[2]!]);
        }
        const stem = s[2].replace(/\.json$/, '');
        const textureFiles = new Map(texturePairs.map(([suffix, filePath]) => [texturePairs.length === 1 ? `${stem}.png` : `${stem}.${suffix}.png`, filePath]));
        for (const [id, file] of artifacts) if (textureFiles.has(file)) copies.set(id, { packPath: textureFiles.get(file)!, group: group });
        return;
      }
      if (s[0] !== '导出模型') return;
      const dir = s[2];
      const mapping = new Map<string, string>();
      const wildcards: string[] = [];
      for (const a of s.slice(3)) {
        if (typeof a !== 'string') continue;
        const m = /^([^=]+)=(assets\/.+\.png)$/.exec(a);
        if (m) mapping.set(m[1]!, m[2]!);
        else if (/^assets\/.+\.png$/.test(a)) {
          if (a.includes('*')) wildcards.push(a);
          else mapping.set(path.posix.basename(a, '.png'), a);
        }
      }
      const byName = (textureName: string) => {
        if (mapping.has(textureName)) return mapping.get(textureName);
        for (const g of wildcards) {
          const pattern = new RegExp('^' + path.posix.basename(g, '.png').split('*').map((x) => x.replace(/[.+?^$()|[\]\\{}]/g, '\\$&')).join('.*') + '$');
          if (pattern.test(textureName)) return `${path.posix.dirname(g)}/${textureName}.png`;
        }
        return undefined;
      };
      for (const [idPattern, filePattern] of artifacts) {
        // 导出到单个文件（第三项是 .png、只给一张）：产物就是这个文件
        if (filePattern === dir && mapping.size === 1 && !wildcards.length) {
          copies.set(idPattern, { packPath: [...mapping.values()][0]!, group: group });
          continue;
        }
        if (!filePattern.startsWith(`${dir}/`) || !filePattern.endsWith('.png')) continue;
        const namePattern = filePattern.slice(dir.length + 1, -'.png'.length);
        if (namePattern === '*' && idPattern.endsWith('/*')) {
          const prefix = idPattern.slice(0, -1);
          const names = new Set([...mapping.keys(), ...ids.filter((x) => x.startsWith(prefix) && !x.slice(prefix.length).includes('/')).map((x) => x.slice(prefix.length))]);
          for (const textureName of names) {
            const inPackPath = byName(textureName);
            if (inPackPath) copies.set(prefix + textureName, { packPath: inPackPath, group: group });
          }
        } else if (!namePattern.includes('*')) {
          const inPackPath = byName(namePattern);
          if (inPackPath) copies.set(idPattern, { packPath: inPackPath, group: group });
        }
      }
    });
  }
  return copies;
};

export type HealthCheck = { name: string; pack_format: unknown; supported_formats: unknown; stats: Record<string, number>; examples: Record<string, string[]> };
export type RenderResult = {
  artifacts: { id: string; file: string; replaced: number; total: number }[];
  图集缺: number;
  图集不合: { name: string; pack: string; cause: string }[];
  单张缺: string[];
  单张原版放大: string[];
  单张不合: { id: string; pack: string; cause: string }[];
  图集格: Record<string, number>;
  scale: Record<string, number>;
  perPackContribution: Record<string, number>;
  体检: HealthCheck[];
  biomeColor?: { changed: number; colorMapSources: string[]; examples: Record<string, [string, string]> };
};

const runImageRender = (request: object, outDir: string): RenderResult => {
  const f = path.join(outDir, '请求.json');
  fs.writeFileSync(f, JSON.stringify({ ...request, 出目录: outDir }));
  const scriptPath = path.join(codeRoot(), 'py', 'anim_py', '材质包覆盖.py');
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  delete env.VIRTUAL_ENV;
  const r = spawn.sync('uv', ['run', '-q', '--no-project', '--with', 'pillow==13.0.0', 'python', '-I', scriptPath, f], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`材质包覆盖.py 失败（退出码 ${r.status}）：${String(r.stdout ?? '').slice(-500)}`);
  return JSON.parse(String(r.stdout).trim().split('\n').at(-1)!) as RenderResult;
};

/** OptiFine、models、blockstates、shaders 这些兼容层不认的东西，按包列成警告 */
export const warnings = (checks: HealthCheck[]) =>
  checks.flatMap((t) => {
    const w: string[] = [];
    if (t.pack_format != null && t.pack_format !== 15 && !/\b15\b/.test(JSON.stringify(t.supported_formats ?? ''))) w.push(`${t.name}：pack_format ${String(t.pack_format)}，不是 1.20.1 的 15，个别贴图可能改过名`);
    for (const [k, n] of Object.entries(t.stats)) {
      const examplesText = (t.examples[k] ?? []).slice(0, 2).join('、');
      if (k.startsWith('OptiFine/')) w.push(`${t.name}：${k} ${n} 个文件不支持（如 ${examplesText}）`);
      else if (k === 'models/block' || k === 'blockstates') w.push(`${t.name}：${k} 覆盖 ${n} 个没用上（方块形状照原版方块表；如 ${examplesText}）`);
      else if (k === 'shaders') w.push(`${t.name}：core shaders ${n} 个不支持`);
    }
    return w;
  });

/** 建覆盖层：按给的选用（默认环境变量或作品的 "pack"），返回覆盖层锁、写到哪、报告 */
export const buildResourcePackOverride = (workRoot: string, packSelection = readResourcePackSelection(workRoot)) => {
  if (!packSelection.pack.length) throw new Error(`这部作品没选用材质包：在 ${path.join(workRoot, '材质包.toml')} 写 "pack" = ["材质包/<名>"]，或试样时前面带 ANIM_PACKS=<名>`);
  const assetLock = readWorkAssetLock(workRoot, { pack: [], source: '无' }); // 原版锁：覆盖层只照原版建
  const assetTable = readAssetRegistryBoth(workRoot).entryMap;
  const packs = packSelection.pack.map((id) => {
    const e = assetTable.get(id);
    if (!e || e.category !== '材质包') throw new Error(`${id} 没在资产表登记成 类别 = "材质包"（assets/registry/材质包.toml），先登记、anim assets add ${id} <包.zip>`);
    return { id, name: id.slice('材质包/'.length), visibility: e.visibility, license: e.license, entry: assetLock[id]!, zip: resolveAsset(id, assetLock).file };
  });
  const blockTable = JSON.parse(fs.readFileSync(resolveAsset(blockTableId, assetLock).file, 'utf8')) as { 贴图: string[] };
  const singleTextures = [...copyTextures(fs.readFileSync(path.join(codeRoot(), 'sourcing', 'extract.toml'), 'utf8'), Object.keys(assetLock))]
    .filter(([id, { packPath }]) => id in assetLock && id.startsWith('贴图/') && (uiReplaceable.has(id) || !noReplacePrefixes.some((q) => id.startsWith(q))) && packPath.startsWith(swappablePrefix) && !noSwapPrefixes.some((q) => packPath.startsWith(q)))
    .map(([id, { packPath, group: group }]) => ({ id, 原图: resolveAsset(id, assetLock).file, 包内: packPath, group: group, ...(originalSizeIds.has(id) ? { 倍上限: 1 } : {}) }));
  const artStylePath = path.join(workRoot, '画风.ts');
  const limit = maxUpscale(fs.existsSync(artStylePath) ? fs.readFileSync(artStylePath, 'utf8') : null, packSelection.resolutionCap, packSelection.trial ?? packSelection.resolution);
  const jar = jarPath(readManifest(), vanillaJar);
  if (!fs.existsSync(jar)) throw new Error(`原版 jar 不在 ${jar}（群系色要它的色图和群系温度湿度）：anim extract --download`);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
  try {
    const rendered = runImageRender(
      {
        包们: packs.map((p) => ({ zip: p.zip, name: p.name })),
        原版jar: jar,
        倍上限: limit.factor,
        图集: [{ id: atlasId, 原图: resolveAsset(atlasId, assetLock).file, 贴图名: blockTable.贴图, cell: 16 }],
        singleTextures: singleTextures,
        biome: { id: biomeColorId, 原表: resolveAsset(biomeColorId, assetLock).file },
      },
      outDir,
    );
    const storage = packs.some((p) => p.visibility === '私有') ? '私有' : 'store';
    const overrides: Record<string, LockEntry> = {};
    for (const p of rendered.artifacts) {
      const entry = importToStore(p.file, storage);
      if (entry.sha256 !== assetLock[p.id]!.sha256) overrides[p.id] = entry;
    }
    const resourcePackLock: ResourcePackLock = {
      pack: packs.map((p) => ({ id: p.id, sha256: p.entry.sha256 })),
      ...(packSelection.resolutionCap !== undefined ? { resolutionCap: packSelection.resolutionCap } : {}),
      ...(packSelection.trial !== undefined ? { trial: packSelection.trial } : {}),
      ...(packSelection.resolution !== undefined ? { resolution: packSelection.resolution } : {}),
      overrides: Object.fromEntries(Object.keys(overrides).sort().map((k) => [k, overrides[k]!])) as AssetLock,
      report: {
        license: Object.fromEntries(packs.map((p) => [p.id, `${p.license}（${p.visibility}）`])),
        resolution: { policy: limit.basis, blockAtlasCell: rendered.图集格[atlasId] ?? 16 },
        blockAtlas: { replaced: rendered.artifacts.find((x) => x.id === atlasId)?.replaced ?? 0, total: blockTable.贴图.length, notInPack: rendered.图集缺, mismatched: rendered.图集不合.length },
        singleTextures: { total: singleTextures.length, replaced: rendered.artifacts.filter((x) => x.id !== atlasId && x.id !== biomeColorId && x.replaced > 0).length, notInPack: rendered.单张缺.length, missingUpscaledInGroup: rendered.单张原版放大, mismatched: rendered.单张不合 },
        scale: rendered.scale,
        perPackContribution: rendered.perPackContribution,
        biomeColor: rendered.biomeColor ?? null,
        warnings: warnings(rendered.体检),
      },
    };
    const lockFile = resourcePackLockPath(workRoot, packSelection);
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(lockFile, JSON.stringify(resourcePackLock, null, 2) + '\n', 'utf8');
    return { 选: packSelection, packs, resourcePackLock, result: rendered, lockFile };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
};
