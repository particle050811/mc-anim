// 导入地形：把存档导入的区段包（格式见 engine/voxel/区段包.ts）接进体素世界。
// 包在数据根的 terrain/<包名>/<版本>/ 下（engine/voxel/区段包位置.ts），经 engine/core/数据源.ts 取（取包时定下版本目录，同一个包的文件都从这一版取）：
//   包.json、粗图.bin.gz 一开始就取（粗高度图要同步查）；区段按每帧要的现取：块文件先按 Range 取文件头（不定长，见 loadTileIndex），要的区段按偏移排好、挨着的并成一次 Range 请求，
//   交给区段工人（区段工人池.ts）取回、解码、换成体素块（导入区段.ts）；主线程只收结果。工人换好的体素块用一次就交出去（`区段` 返回、体素世界转交给网格工人），
//   要第二次的（网格被挤掉、镜头又回来）在主线程上从留着的区段数据重换，两边同一份纯函数，结果一样。
//   编排用的粗高度是冻结进仓库的那份（engine/voxel/冻结粗高度.ts），包.json 取到后和它比一次指纹，对不上只报警。
//   解开的区段留着给同标签页的各帧、各来源共用，按最近用到淘汰，总量有上限（见 `maxCachedBytes`）。
// 解出来的区段上再做两件事：
//   挖掉地标：地标是 mcai mesh 导出的网格（资产 网格/<地标>/…），范围里导入的方块和网格会画两遍互相闪，按网格的 from / to 挖掉。
//     格子中心在范围里就挖（粗级格子跨边时按中心归一边，最多差半格）。导出时 skip 掉、游戏里却看得到的方块（终焉高原城堡去掉的树和荆棘）不挖（见 `LandmarkCutout`）。
//   随位置变的群系色：原版沼泽、暮色魔法森林、黑暗森林中心、幽暗森林的草和树叶随方块坐标变，这里按格子坐标重算（engine/voxel/群系色.ts；
//     不做群系间混合，用户 10-04 定的颜色规则，和导出网格一致）。粗级按格子最小角那一块算。
import { useEffect, useRef, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import { dataUrl, fetchGunzip, fetchJson, fetchRange, loadOnce } from '../core/数据源.ts';
import type { V3 } from '../model/parts.tsx';
import type { TerrainSampler } from './地表.ts';
import { sectionKey, type SectionId } from './区段.ts';
import { readModel, modelFileName } from './区段模型.ts';
import { formatVersion, sectionInTile, tileFileName, tilePrefixLen, tileHeaderGuessCap, tileHeaderLength, buildPackTables, hasSection, coarseHeightAt, decodeTileHeader, decodePackMaps, decodeSplittable, findInTile, packMapsFileName, type PackageInfo, type PackTable, type SectionData, type CoarseHeightMap, type TileIndex } from './区段包.ts';
import { resolveRouteSections, type RouteIndex } from './航线区段包.ts';
import { checkFrozenCoarse } from './冻结粗高度.ts';
import { packDir } from './区段包位置.ts';
import { recordSectionRead, isCoverRun, noteCoverWorld } from './地形用量.ts';
import { variesByPos } from './群系色.ts';
import { globRegex, importedSectionVoxels, type CutBox, type FlattenArea, type LandmarkCutout, type SectionContext, type SectionPackInfo } from './导入区段.ts';
import { fetchSectionsInPool, registerSource, registerModel, type SectionResult } from './区段工人池.ts';
import type { VoxelGrid, VoxelSource } from './生成.ts';

export type { LandmarkCutout, FlattenArea } from './导入区段.ts';

// 维度的下界（游戏 y）：暮色森林的维度从 y −32 起，主世界 −64
const dimensionMinY: Record<string, number> = { 暮色: -32, 主世界: -64 };

// 解开的区段总共留多少（字节，一个标签页）：取过的全留着会一直涨。
// 区段建成网格后数据就用不到了，只有网格被体素世界缓存挤掉、镜头又回来时要重建。超了在下一次 `prefetch` 时丢最久没用到的，这一次要的不丢（一帧要的比上限多也不会来回丢了重取）
const maxCachedBytes = 256 * 1024 * 1024;
type CachedSection = { d: SectionData; bytes: number; lastRound: number }; // 次：最后一次被 预取 要到是第几次
type TerrainPack = {
  name: string;
  dir: string; // 取的是哪一版：packDir 的结果，块文件都从这里取
  info: PackageInfo;
  tables: PackTable;
  coarseHeights: CoarseHeightMap;
  route?: Omit<RouteIndex, 'keys' | 'simulated'> & { keys: Set<string>; simulated: Set<string> };
  overlay?: { pack: TerrainPack; keys: Set<string> };
  overlayKeys?: Set<string>;
  maxTop: number; // 粗高度图里最高的顶（场景 z）
  canSplit: ReturnType<typeof decodeSplittable>; // 各处最细级不一样的包才有
  variesByPos: boolean[]; // 按包里的群系号
  index: Map<string, Promise<TileIndex>>; // 块文件名 → 解开的块头
  data: Map<string, CachedSection>; // 按最近用到的先后排（Map 按插入顺序，用到一次挪到最后）
  bytes: number;
  round: number; // 预取 调了几次
  inflight: Map<string, Promise<void>>;
};
const loadPack = (dir: string, packName: string): Promise<TerrainPack> =>
  loadOnce(dir, async () => {
    const info = await fetchJson<PackageInfo>(`${dir}/包.json`, '本机没有这一版：anim assets pull 取，或 anim world bake 烘焙、anim world trim 裁（docs/世界.md）');
    if (info.version !== formatVersion) throw new Error(`地形包是格式 ${info.version}，这版代码只读格式 ${formatVersion}：anim assets pull，或 anim world transcode`);
    const url = absoluteUrl(`${dir}/${modelFileName}`), res = await fetch(url);
    if (!res.ok) throw new Error(`取地形模型 ${url}：${res.status}，anim assets pull`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    readModel(bytes);
    registerModel(url, bytes);
    const { coarse: coarseHeights, splittable } = decodePackMaps(info, new Uint8Array(await fetchGunzip(`${dir}/${packMapsFileName}`, 'anim assets pull')));
    checkFrozenCoarse(packName, coarseHeights);
    let maxTop = -Infinity;
    for (const height of coarseHeights.height) if (height !== -32768) maxTop = Math.max(maxTop, height);
    let route: TerrainPack['route'];
    const readKeys = async (all: string[]) => {
      if (!info.trim) return new Set(all);
      const res = await fetch(dataUrl(`${dir}/留表.tsv`));
      if (!res.ok) throw new Error(`取不到 ${dir}/留表.tsv`);
      return new Set((await res.text()).trimEnd().split('\n').filter(Boolean).map((row) => row.replaceAll('\t', '|')));
    };
    const overlayKeys = info.overlay && (await readKeys(info.overlay.keys));
    if (info.routeIndex) {
      const index = JSON.parse(new TextDecoder().decode(await fetchGunzip(`${dir}/${info.routeIndex}`))) as RouteIndex;
      const keys = await readKeys(index.keys);
      route = { ...index, keys, simulated: new Set(index.simulated) };
      maxTop = index.maxTop;
    }
    return { route, overlayKeys, name: packName, dir: dir, info: info, tables: buildPackTables(info), coarseHeights: coarseHeights, maxTop: maxTop, canSplit: decodeSplittable(splittable), variesByPos: info.biome.map(variesByPos), index: new Map(), data: new Map(), bytes: 0, round: 0, inflight: new Map() };
  });

// 块头不定长：第一次取 tileHeaderMax（本包最长的头）那么多，一次就够；比封顶还长的头才补取剩下的。越过文件尾的 Range 服务端截到文件尾
export const fetchTileIndex = async (rel: string, info: Pick<PackageInfo, 'tileHeaderMax' | 'coarsestLevel'>, ti: number, tj: number): Promise<TileIndex> => {
  let raw = new Uint8Array(await fetchRange(rel, 0, Math.max(tilePrefixLen, Math.min(info.tileHeaderMax, tileHeaderGuessCap))));
  const headerLen = tileHeaderLength(raw);
  if (headerLen > raw.length) {
    const all = new Uint8Array(headerLen);
    all.set(raw);
    all.set(new Uint8Array(await fetchRange(rel, raw.length, headerLen - raw.length)), raw.length);
    raw = all;
  }
  const index = decodeTileHeader(raw);
  if (index.coarsestLevel !== info.coarsestLevel || index.ti !== ti || index.tj !== tj) throw new Error(`${rel} 的块头（块 ${index.ti}.${index.tj}、最粗级 ${index.coarsestLevel}）和文件名、包.json（最粗级 ${info.coarsestLevel}）对不上：anim check --deep 核对地形包`);
  return index;
};
const loadTileIndex = (pack: TerrainPack, fileName: string, ti: number, tj: number) => {
  let promise = pack.index.get(fileName);
  if (!promise) pack.index.set(fileName, (promise = fetchTileIndex(`${pack.dir}/${fileName}`, pack.info, ti, tj)));
  return promise;
};
// 一次活（一次 Range 请求）最多并几个区段、多长：太大了一个工人独占，别的工人闲着
const maxPartsPerJob = 16;
const maxJobBytes = 512 * 1024;
// 块文件里两个区段之间隔着不超过这么多字节也并进一次请求（中间那段白取）
const mergeGapBytes = 16 * 1024;
const absoluteUrl = (rel: string) => new URL(dataUrl(rel), location.href).href;

const storeSection = (pack: TerrainPack, section: SectionId, data: SectionData, requestRound: number) => {
  const bytes = data.palette.byteLength + data.runCounts.byteLength + data.paletteIndex.byteLength + data.runLengths.byteLength;
  pack.data.set(sectionKey(section), { d: data, bytes: bytes, lastRound: requestRound });
  pack.bytes += bytes;
  pack.inflight.delete(sectionKey(section));
};
// 包里没有这个区段（块头里没有）、粗高度图又说有：裁过的包（包.json 的 trim）是缺级，留表没跟上镜头（docs/世界.md「裁级」）
const missingSectionError = (pack: TerrainPack, fileName: string, section: SectionId) =>
  new Error(
    pack.info.trim
      ? `缺级：地形包 ${pack.name}（${pack.dir}）是从完整包 ${pack.info.trim.from} 裁过的，没有区段 ${sectionKey(section)}（第 ${section.L} 级，粗高度图说那里有地）。` +
        `段的镜头或挑区段改过、留表没跟上：重裁 anim world trim ${pack.name}（先重量改过的段，再从完整包裁），anim check 的 地形覆盖 会列出缺的段和帧`
      : `${pack.dir}/${fileName} 里没有区段 ${sectionKey(section)}（粗高度图说有）`,
  );
// 取这几个区段：按块文件分组，块里按偏移排好、挨着的并成一次活交给工人；给了来源 `ctx` 的工人顺手换好体素块，放进 `ready`。返回每个区段取齐的 Promise。
// 包里没有的区段单独失败，不连累同一块里别的区段（猜的预取会要到裁过的包没留的级，别的帧真要的同块区段不能跟着失败）
const loadSections = (pack: TerrainPack, sections: SectionId[], requestRound: number, ctx: number | undefined, ready: Map<string, ReadyVoxels>): Map<string, Promise<void>> => {
  const byFile = new Map<string, { storage: TerrainPack; fileName: string; ti: number; tj: number; list: SectionId[] }>();
  for (const section of sections) {
    const { ti, tj } = sectionInTile(section, pack.info.coarsestLevel);
    const fileName = tileFileName(ti, tj);
    const storage = pack.overlay?.keys.has(sectionKey(section)) ? pack.overlay.pack : pack;
    const url = `${storage.dir}/${fileName}`;
    let tile = byFile.get(url);
    if (!tile) byFile.set(url, (tile = { storage, fileName, ti, tj, list: [] }));
    tile.list.push(section);
  }
  const promises = new Map<string, Promise<void>>();
  for (const { fileName, storage, ti, tj, list } of byFile.values()) {
    const done = loadTileIndex(storage, fileName, ti, tj).then((index) => {
      const all = list.map((section) => ({ section, ...(findInTile(index, section) ?? { off: 0, len: 0 }) }));
      const missing = new Set(all.filter((part) => !part.len).map((part) => sectionKey(part.section)));
      const parts = all.filter((part) => part.len).sort((a, b) => a.off - b.off);
      const jobs: { start: number; len: number; parts: typeof parts }[] = [];
      for (const part of parts) {
        const last = jobs[jobs.length - 1];
        if (last && part.off - (last.start + last.len) <= mergeGapBytes && last.parts.length < maxPartsPerJob && part.off + part.len - last.start <= maxJobBytes) {
          last.len = part.off + part.len - last.start;
          last.parts.push(part);
        } else jobs.push({ start: part.off, len: part.len, parts: [part] });
      }
      const url = absoluteUrl(`${storage.dir}/${fileName}`);
      const loaded = Promise.all(
        jobs.map((job) =>
          fetchSectionsInPool(url, job.start, job.len, job.parts.map((part) => ({ off: part.off - job.start, len: part.len, ctx, id: part.section }))).then((out: SectionResult[]) =>
            job.parts.forEach((part, i) => {
              storeSection(pack, part.section, out[i].data, requestRound);
              if (out[i].voxels) ready.set(sectionKey(part.section), { voxels: out[i].voxels!, lastRound: requestRound });
            }),
          ),
        ),
      ).then(() => undefined);
      return { missing, loaded };
    });
    for (const section of list) {
      const k = sectionKey(section);
      promises.set(
        k,
        done.then((r) => {
          if (r.missing.has(k)) throw missingSectionError(storage, fileName, section);
          return r.loaded;
        }),
      );
    }
  }
  return promises;
};

// 工人换好、还没交出去的体素块（次：最后一次被 预取 要到是第几次）
type ReadyVoxels = { voxels: VoxelGrid; lastRound: number };

export type ImportedTerrain = {
  route?: TerrainPack['route'];
  key: string; // 体素世界的缓存键（带版本，换了版本不会接着用旧版建的网格）；同一个包要分开缓存的（挖法、补水不同）在后面接后缀
  source: VoxelSource;
  heightRange: [number, number]; // 场景 z 的范围（维度下界 ～ 最高的方块顶），给 体素世界 的 高度
  位置: (gamePos: number[]) => V3; // 游戏坐标（连续）→ 场景坐标（摆地标网格：网格放在 位置(origin)）
  origin: [number, number, number]; // 包.json 的原点 [ox, oy, oz]（游戏坐标），换算见 区段包.ts 文件头
  coarse: CoarseHeightMap; // 粗高度图（16 米一格，−32768 = 这一格没数据，即导入范围外），engine/voxel/主世界地形.ts 拿它认导入范围
  // 旁路读者（光体，engine/light/光体组件.tsx）：取齐这几个区段解好的数据（包里没有的给 null），记进地形用量；不换体素块、不动体素世界的 `ready` 和预取的轮次。
  // 体素块由读者自己的工人按 `voxelContext` 换（同 区段工人.ts，同一份纯函数）
  sectionData: (qs: SectionId[]) => Promise<(SectionData | null)[]>;
  // 旁路读者用了这几个区段算出的缓存结果（光体缓存）、没真去取：照样记进地形用量（结果依赖它们，地形用量要收窄段的依赖）
  noteSections: (qs: SectionId[]) => void;
  voxelContext: { info: SectionPackInfo; cutBoxes: CutBox[]; flattenAreas: FlattenArea[] };
};

const buildTerrain = (pack: TerrainPack, cutouts: LandmarkCutout[], flattenAreas: FlattenArea[]): ImportedTerrain => {
  const [ox, oy, oz] = pack.info.origin;
  // 游戏方块范围（from、to 都含）→ 场景盒子 [x0, y0, z0, x1, y1, z1]
  const toSceneBox = (m: { from: number[]; to: number[] }) => [m.from[0] - ox, oz - 1 - m.to[2], m.from[1] - oy, m.to[0] + 1 - ox, oz - m.from[2], m.to[1] + 1 - oy];
  const cutBoxes: CutBox[] = cutouts.map((m) => ({ boxes: toSceneBox(m), 留: m.留 ? globRegex(m.留) : null }));
  // `选区段` 拿 `采样` 的 z 当这一带的地物顶。没数据的地方给 0 而不是 −Infinity：`选区段` 只在区段中心取一次，粗级大区段中心没数据、角上有数据时，按无限远算就永远不细分
  const sample: TerrainSampler = (x, y, out) => {
    const height = coarseHeightAt(pack.coarseHeights, x, y);
    out.z = height === -Infinity ? pack.route?.outside ?? 0 : height;
    out.crown = 0;
  };
  const ctx: SectionContext = { info: pack.info, tables: pack.tables, variesByPos: pack.variesByPos, cutBoxes, flattenAreas };
  // 工人那边只要换体素块用的几项，粗高度图不发
  const workerCtx = registerSource({ origin: pack.info.origin, state: pack.info.state, biome: pack.info.biome }, cutBoxes, flattenAreas);
  const ready = new Map<string, ReadyVoxels>();
  // 替下一帧先取、还没记进地形用量的区段：哪一帧真要到了才记，没用上的不记（用量只记画面真用到的）
  const unrecorded = new Set<string>();
  const contains = (q: SectionId) => pack.route ? pack.route.keys.has(sectionKey(q)) : hasSection(pack.coarseHeights, q);
  const resolve = pack.route ? resolveRouteSections(pack.route.keys, pack.info.coarsestLevel) : undefined;
  const recordReads = (keys: string[]) => {
    recordSectionRead(pack.name, keys); // 航线按世界的完整需求规划，含覆盖块。
    const layer = pack.overlay;
    if (layer) recordSectionRead(layer.pack.name, keys.filter((key) => layer.keys.has(key)));
  };
  const source: VoxelSource = {
    采样: sample,
    ...(resolve && !isCoverRun() ? { resolveSections: resolve } : {}),
    coarsestLevel: pack.info.coarsestLevel,
    toScene: (g) => [g[0]! - ox, oz - g[2]!, g[1]! - oy],
    sections: (section) => {
      if (!contains(section)) return null;
      const k = sectionKey(section);
      const done = ready.get(k);
      const voxels = done?.voxels ?? importedSectionVoxels(pack.data.get(k)!.d, ctx);
      if (done) ready.delete(k);
      if (pack.route?.simulated.has(k)) voxels.waterLevel = pack.route.waterLevel;
      return voxels;
    },
    transferOwnership: true,
    ...(pack.canSplit ? { canSplit: pack.canSplit } : {}),
    prefetch: (qs, guessed) => {
      // 地形覆盖（engine/voxel/地形用量.ts）：只记这一帧要的区段，不取
      if (isCoverRun()) {
        noteCoverWorld(pack.name);
        if (!guessed) recordReads((pack.route ? qs : qs.filter(contains)).map(sectionKey));
        return undefined;
      }
      const round = ++pack.round;
      const waits = new Set<Promise<void>>();
      const toLoad: SectionId[] = [];
      const lateRecords: string[] = [];
      for (const section of qs) {
        const k = sectionKey(section);
        if (!guessed && unrecorded.delete(k)) lateRecords.push(k);
        const done = ready.get(k);
        if (done) done.lastRound = round;
        const cached = pack.data.get(k);
        if (cached) {
          pack.data.delete(k); // 挪到最后
          pack.data.set(k, cached);
          cached.lastRound = round;
          continue;
        }
        if (!contains(section)) continue;
        const promise = pack.inflight.get(k);
        if (promise) waits.add(promise);
        else toLoad.push(section);
      }
      if (lateRecords.length) recordReads(lateRecords);
      if (toLoad.length) {
        if (guessed) for (const section of toLoad) unrecorded.add(sectionKey(section));
        else recordReads(toLoad.map(sectionKey));
        const loading = loadSections(pack, toLoad, round, workerCtx, ready);
        for (const [k, promise] of loading) {
          pack.inflight.set(k, promise);
          // 猜的取不到不报错（裁过的包没留猜到的那一级，见 docs/世界.md「裁级」）：撤出在取的表，哪一帧真要到时重取、在那一路报
          if (guessed) promise.catch(() => pack.inflight.get(k) === promise && pack.inflight.delete(k));
          else promise.catch((err) => cancelRender(err));
          waits.add(promise);
        }
      }
      for (const [k, cached] of pack.data) {
        if (pack.bytes <= maxCachedBytes || cached.lastRound === round) break;
        pack.data.delete(k);
        pack.bytes -= cached.bytes;
      }
      // 换好的体素块这两次都没人要（镜头走了）就丢掉，再要时在主线程上从区段数据重换
      for (const [k, done] of ready) if (done.lastRound < round - 1) ready.delete(k);
      return waits.size ? Promise.all(waits).then(() => undefined) : undefined;
    },
  };
  const sectionData = async (qs: SectionId[]): Promise<(SectionData | null)[]> => {
    const resolved = resolve ? qs.map(q => resolve([q])[0]) : qs;
    const present = resolved.filter((q): q is SectionId => !!q && contains(q));
    recordReads(present.map(sectionKey));
    // 取齐后这边拿到之前，体素世界的预取可能按缓存上限丢掉刚取的（只丢那一轮没要到的）：丢了再取
    for (;;) {
      const waits = new Set<Promise<void>>();
      const toLoad: SectionId[] = [];
      for (const q of present) {
        const k = sectionKey(q);
        if (pack.data.has(k)) continue;
        const promise = pack.inflight.get(k);
        if (promise) waits.add(promise);
        else toLoad.push(q);
      }
      if (!waits.size && !toLoad.length) break;
      if (toLoad.length) {
        const loading = loadSections(pack, toLoad, pack.round, undefined, ready);
        for (const [k, promise] of loading) pack.inflight.set(k, promise);
        for (const promise of loading.values()) waits.add(promise);
      }
      await Promise.all(waits);
    }
    return resolved.map((q) => (q && contains(q) ? pack.data.get(sectionKey(q))!.d : null));
  };
  return {
    route: pack.route,
    sectionData,
    noteSections: (qs) => recordReads(qs.filter((q) => contains(q)).map(sectionKey)),
    voxelContext: { info: { origin: pack.info.origin, state: pack.info.state, biome: pack.info.biome }, cutBoxes, flattenAreas },
    key: `导入:${pack.dir}${pack.overlay ? `+${pack.overlay.pack.dir}` : ''}`,
    source: source,
    heightRange: [dimensionMinY[pack.info.dimension] - oy, pack.maxTop],
    位置: (g) => [g[0] - ox, oz - g[2], g[1] - oy],
    origin: pack.info.origin,
    coarse: pack.coarseHeights,
  };
};

// 未迁移的世界仍可传本地挖框、整平；挂作品覆盖层时只读预烘区段。
const noFlatten: FlattenArea[] = [];
/** 配对底包、作品覆盖层；选级仍以世界的粗高度图和级链为准。 */
const withOverlay = (base: TerrainPack, layer: TerrainPack): TerrainPack => {
  const overlay = layer.info.overlay, keys = layer.overlayKeys;
  const baseVersion = base.info.trim?.from ?? base.dir.split('/').at(-1);
  if (!base.route || !keys || overlay?.base !== base.name || overlay.from !== baseVersion)
    throw Error(`作品覆盖层 ${layer.dir} 与底包 ${base.dir} 不配套，请重烘覆盖层`);
  // 完整底包配本机仅有的裁级覆盖层时，缺的覆盖级不能偷换成未挖的底包，沿用同一条缺级回退规则。
  const present = new Set(base.route.keys);
  for (const key of overlay.keys) if (!keys.has(key)) present.delete(key);
  // 覆盖层状态表是底包编号的超集。解码和网格缓存按这对版本隔离，块头仍按物理文件复用。
  return {
    ...base,
    info: { ...base.info, state: layer.info.state, biome: layer.info.biome },
    tables: layer.tables,
    variesByPos: layer.variesByPos,
    route: { ...base.route, keys: present },
    overlay: { pack: layer, keys },
    data: new Map(),
    inflight: new Map(),
    bytes: 0,
    round: 0,
  };
};
export const openImportedTerrain = async (packName: string, cutouts: LandmarkCutout[], flattenAreas: FlattenArea[] = noFlatten, overlayName?: string): Promise<ImportedTerrain> => {
  const base = loadPack(packDir(packName), packName);
  if (!overlayName) return buildTerrain(await base, cutouts, flattenAreas);
  const [world, layer] = await Promise.all([base, loadPack(packDir(overlayName), overlayName)]);
  return buildTerrain(withOverlay(world, layer), [], []);
};
export const useImportedTerrain = (packName: string, cutouts: LandmarkCutout[], flattenAreas: FlattenArea[] = noFlatten, overlayName?: string): ImportedTerrain | null => {
  const [terrain, setTerrain] = useState<ImportedTerrain | null>(null);
  const dir = packDir(packName), overlayDir = overlayName && packDir(overlayName);
  const [handle] = useState(() => delayRender(`导入地形：取 ${dir}/包.json`));
  const released = useRef(false);
  useEffect(() => {
    openImportedTerrain(packName, cutouts, flattenAreas, overlayName)
      .then(setTerrain)
      .catch((e) => cancelRender(e));
  }, [dir, packName, overlayDir, overlayName, cutouts, flattenAreas]);
  // 放行要等用到地形的子组件（体素世界）这一次渲染完、挂上它自己的 delayRender 以后（子组件先渲染，effect 后跑）
  useEffect(() => {
    if (!terrain || released.current) return;
    released.current = true;
    continueRender(handle);
  }, [terrain, handle]);
  return terrain;
};
