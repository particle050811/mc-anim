// 导入地形：把存档导入的区段包（格式见 engine/voxel/区段包.ts）接进体素世界。
// 包在数据根的 terrain/<包名>/<版本>/ 下（engine/voxel/区段包位置.ts），经 engine/core/数据源.ts 取（取包时定下版本目录，同一个包的文件都从这一版取）：
//   包.json 一开始就取（粗高度图要同步查）；区段按每帧要的现取：块文件先按 Range 取头部索引，要的区段按偏移排好、挨着的并成一次 Range 请求，
//   交给区段工人（区段工人池.ts）取回、解开 gzip、换成体素块（导入区段.ts）；主线程只收结果。工人换好的体素块用一次就交出去（`区段` 返回、体素世界转交给网格工人），
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
import { dataUrl, fetchJson, fetchRange, loadOnce } from '../core/数据源.ts';
import type { V3 } from '../model/parts.tsx';
import type { TerrainSampler } from './地表.ts';
import { sectionKey, type SectionId } from './区段.ts';
import { sectionInTile, tileFileName, tileHeaderLen, buildPackTables, hasSection, coarseHeightAt, decodeTileHeader, decodeCoarseHeight, type 包信息, type 包表, type SectionData, type 粗高度图 } from './区段包.ts';
import { checkFrozenCoarse } from './冻结粗高度.ts';
import { packDir } from './区段包位置.ts';
import { variesByPos } from './群系色.ts';
import { globRegex, importedSectionVoxels, type CutBox, type FlattenArea, type LandmarkCutout, type 区段上下文 } from './导入区段.ts';
import { fetchSectionsInPool, registerSource, type 区段结果 } from './区段工人池.ts';
import type { VoxelGrid, VoxelSource } from './生成.ts';

export type { LandmarkCutout, FlattenArea } from './导入区段.ts';

// 维度的下界（游戏 y）：暮色森林的维度从 y −32 起，主世界 −64
const dimensionMinY: Record<string, number> = { 暮色: -32, 主世界: -64 };

// 解开的区段总共留多少（字节，一个标签页）：取过的全留着会一直涨。
// 区段建成网格后数据就用不到了，只有网格被体素世界缓存挤掉、镜头又回来时要重建。超了在下一次 `prefetch` 时丢最久没用到的，这一次要的不丢（一帧要的比上限多也不会来回丢了重取）
const maxCachedBytes = 256 * 1024 * 1024;
type CachedSection = { d: SectionData; bytes: number; lastRound: number }; // 次：最后一次被 预取 要到是第几次
type 包 = {
  name: string;
  dir: string; // 取的是哪一版：packDir 的结果，块文件都从这里取
  info: 包信息;
  tables: 包表;
  coarseHeights: 粗高度图;
  maxTop: number; // 粗高度图里最高的顶（场景 z）
  variesByPos: boolean[]; // 按包里的群系号
  index: Map<string, Promise<Uint32Array>>; // 块文件名 → 索引
  data: Map<string, CachedSection>; // 按最近用到的先后排（Map 按插入顺序，用到一次挪到最后）
  bytes: number;
  round: number; // 预取 调了几次
  inflight: Map<string, Promise<void>>;
};
const loadPack = (dir: string, packName: string): Promise<包> =>
  loadOnce(dir, async () => {
    const info = await fetchJson<包信息>(`${dir}/包.json`, '先烘焙：见 工具/导入/烘焙.ts');
    const coarseHeights = decodeCoarseHeight(info);
    checkFrozenCoarse(packName, coarseHeights);
    let maxTop = -Infinity;
    for (const height of coarseHeights.高) if (height !== -32768) maxTop = Math.max(maxTop, height);
    return { name: packName, dir: dir, info: info, tables: buildPackTables(info), coarseHeights: coarseHeights, maxTop: maxTop, variesByPos: info.群系.map(variesByPos), index: new Map(), data: new Map(), bytes: 0, round: 0, inflight: new Map() };
  });

const loadTileIndex = (pack: 包, fileName: string) => {
  let promise = pack.index.get(fileName);
  if (!promise) {
    promise = fetchRange(`${pack.dir}/${fileName}`, 0, tileHeaderLen).then((ab) => decodeTileHeader(new Uint8Array(ab)));
    pack.index.set(fileName, promise);
  }
  return promise;
};
// 一次活（一次 Range 请求）最多并几个区段、多长：太大了一个工人独占，别的工人闲着
const maxPartsPerJob = 16;
const maxJobBytes = 512 * 1024;
// 块文件里两个区段之间隔着不超过这么多字节也并进一次请求（中间那段白取）
const mergeGapBytes = 16 * 1024;
const absoluteUrl = (rel: string) => new URL(dataUrl(rel), location.href).href;

const storeSection = (pack: 包, section: SectionId, data: SectionData, requestRound: number) => {
  const bytes = data.palette.byteLength + data.runCounts.byteLength + data.paletteIndex.byteLength + data.runLengths.byteLength;
  pack.data.set(sectionKey(section), { d: data, bytes: bytes, lastRound: requestRound });
  pack.bytes += bytes;
  pack.inflight.delete(sectionKey(section));
};
// 取这几个区段：按块文件分组，块里按偏移排好、挨着的并成一次活交给工人；工人顺手按来源 `ctx` 换好体素块，放进 `ready`。返回每个区段取齐的 Promise
const loadSections = (pack: 包, sections: SectionId[], requestRound: number, ctx: number, ready: Map<string, ReadyVoxels>): Map<string, Promise<void>> => {
  const byFile = new Map<string, { section: SectionId; slot: number }[]>();
  for (const section of sections) {
    const { ti, tj, slot } = sectionInTile(section);
    const fileName = tileFileName(ti, tj);
    let list = byFile.get(fileName);
    if (!list) byFile.set(fileName, (list = []));
    list.push({ section, slot });
  }
  const promises = new Map<string, Promise<void>>();
  for (const [fileName, list] of byFile) {
    const done = loadTileIndex(pack, fileName).then((index) => {
      const parts = list.map(({ section, slot }) => ({ section, off: index[2 * slot], len: index[2 * slot + 1] })).sort((a, b) => a.off - b.off);
      const jobs: { start: number; len: number; parts: typeof parts }[] = [];
      for (const part of parts) {
        if (!part.len) throw new Error(`${pack.dir}/${fileName} 里没有区段 ${sectionKey(part.section)}（粗高度图说有）`);
        const last = jobs[jobs.length - 1];
        if (last && part.off - (last.start + last.len) <= mergeGapBytes && last.parts.length < maxPartsPerJob && part.off + part.len - last.start <= maxJobBytes) {
          last.len = part.off + part.len - last.start;
          last.parts.push(part);
        } else jobs.push({ start: part.off, len: part.len, parts: [part] });
      }
      const url = absoluteUrl(`${pack.dir}/${fileName}`);
      return Promise.all(
        jobs.map((job) =>
          fetchSectionsInPool(url, job.start, job.len, job.parts.map((part) => ({ off: part.off - job.start, len: part.len, ctx }))).then((out: 区段结果[]) =>
            job.parts.forEach((part, i) => {
              storeSection(pack, part.section, out[i].data, requestRound);
              if (out[i].voxels) ready.set(sectionKey(part.section), { voxels: out[i].voxels!, lastRound: requestRound });
            }),
          ),
        ),
      ).then(() => undefined);
    });
    for (const { section } of list) promises.set(sectionKey(section), done);
  }
  return promises;
};

// 工人换好、还没交出去的体素块（次：最后一次被 预取 要到是第几次）
type ReadyVoxels = { voxels: VoxelGrid; lastRound: number };

export type ImportedTerrain = {
  键: string; // 体素世界的缓存键（带版本，换了版本不会接着用旧版建的网格）；同一个包要分开缓存的（挖法、补水不同）在后面接后缀
  来源: VoxelSource;
  高度: [number, number]; // 场景 z 的范围（维度下界 ～ 最高的方块顶），给 体素世界 的 高度
  位置: (gamePos: number[]) => V3; // 游戏坐标（连续）→ 场景坐标（摆地标网格：网格放在 位置(origin)）
  原点: [number, number, number]; // 包.json 的原点 [ox, oy, oz]（游戏坐标），换算见 区段包.ts 文件头
  粗: 粗高度图; // 粗高度图（16 米一格，−32768 = 这一格没数据，即导入范围外），engine/voxel/主世界地形.ts 拿它认导入范围
};

const buildTerrain = (pack: 包, cutouts: LandmarkCutout[], flattenAreas: FlattenArea[]): ImportedTerrain => {
  const [ox, oy, oz] = pack.info.原点;
  // 游戏方块范围（from、to 都含）→ 场景盒子 [x0, y0, z0, x1, y1, z1]
  const toSceneBox = (m: { from: number[]; to: number[] }) => [m.from[0] - ox, oz - 1 - m.to[2], m.from[1] - oy, m.to[0] + 1 - ox, oz - m.from[2], m.to[1] + 1 - oy];
  const cutBoxes: CutBox[] = cutouts.map((m) => ({ 盒: toSceneBox(m), 留: m.留 ? globRegex(m.留) : null }));
  // `选区段` 拿 `采样` 的 z 当这一带的地物顶。没数据的地方给 0 而不是 −Infinity：`选区段` 只在区段中心取一次，粗级大区段中心没数据、角上有数据时，按无限远算就永远不细分
  const sample: TerrainSampler = (x, y, out) => {
    const height = coarseHeightAt(pack.coarseHeights, x, y);
    out.z = height === -Infinity ? 0 : height;
    out.crown = 0;
  };
  const ctx: 区段上下文 = { info: pack.info, tables: pack.tables, variesByPos: pack.variesByPos, cutBoxes, flattenAreas };
  // 工人那边只要换体素块用的几项，粗高度图不发
  const workerCtx = registerSource({ 原点: pack.info.原点, 状态: pack.info.状态, 群系: pack.info.群系 }, cutBoxes, flattenAreas);
  const ready = new Map<string, ReadyVoxels>();
  const source: VoxelSource = {
    采样: sample,
    区段: (section) => {
      if (!hasSection(pack.coarseHeights, section)) return null;
      const k = sectionKey(section);
      const done = ready.get(k);
      if (done) {
        ready.delete(k);
        return done.voxels;
      }
      return importedSectionVoxels(pack.data.get(k)!.d, ctx);
    },
    转交: true,
    prefetch: (qs) => {
      const round = ++pack.round;
      const waits = new Set<Promise<void>>();
      const toLoad: SectionId[] = [];
      for (const section of qs) {
        const k = sectionKey(section);
        const done = ready.get(k);
        if (done) done.lastRound = round;
        const cached = pack.data.get(k);
        if (cached) {
          pack.data.delete(k); // 挪到最后
          pack.data.set(k, cached);
          cached.lastRound = round;
          continue;
        }
        if (!hasSection(pack.coarseHeights, section)) continue;
        const promise = pack.inflight.get(k);
        if (promise) waits.add(promise);
        else toLoad.push(section);
      }
      if (toLoad.length) {
        const loading = loadSections(pack, toLoad, round, workerCtx, ready);
        for (const [k, promise] of loading) pack.inflight.set(k, promise);
        for (const promise of new Set(loading.values())) {
          promise.catch((err) => cancelRender(err));
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
  return {
    键: `导入:${pack.dir}`,
    来源: source,
    高度: [dimensionMinY[pack.info.维度] - oy, pack.maxTop],
    位置: (g) => [g[0] - ox, oz - g[2], g[1] - oy],
    原点: pack.info.原点,
    粗: pack.coarseHeights,
  };
};

// 包名：区段包的名字（数据根 渲染/区段包/ 下的目录名，版本按 区段包版本.json），如 '暮色-远景片场'。挖掉：要挖掉的地标网格（见 地标挖框）；平整：按列整平的地（见 平整）。
// 包.json 取到之前返回 null，并用 delayRender 拦住截图。挖掉、平整 在各帧要是同一个数组（放在模块顶层）：换了要异步重建来源，中间那一帧还是旧的
const noFlatten: FlattenArea[] = [];
export const useImportedTerrain = (packName: string, cutouts: LandmarkCutout[], flattenAreas: FlattenArea[] = noFlatten): ImportedTerrain | null => {
  const [terrain, setTerrain] = useState<ImportedTerrain | null>(null);
  const dir = packDir(packName);
  const [handle] = useState(() => delayRender(`导入地形：取 ${dir}/包.json`));
  const released = useRef(false);
  useEffect(() => {
    loadPack(dir, packName)
      .then((b) => setTerrain(buildTerrain(b, cutouts, flattenAreas)))
      .catch((e) => cancelRender(e));
  }, [dir, packName, cutouts, flattenAreas]);
  // 放行要等用到地形的子组件（体素世界）这一次渲染完、挂上它自己的 delayRender 以后（子组件先渲染，effect 后跑）
  useEffect(() => {
    if (!terrain || released.current) return;
    released.current = true;
    continueRender(handle);
  }, [terrain, handle]);
  return terrain;
};
