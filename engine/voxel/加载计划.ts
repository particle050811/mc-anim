// 加载计划：照段的地形视图（地形视图.ts）逐帧挑区段，记下每个区段头一次用到是段内第几帧。
// 挑区段和体素世界每帧调的是同一个函数（选区段.ts 的 prepareSelection），地形源选级那几样也和页面上共用（导入选级.ts、远景兜底采样.ts 的 fallbackSelection），只是不取区段字节，
// 所以 Node 里几秒算完的就是渲染时会要的，不用开 4K 页面逐帧过（anim world cover 每帧要等 100 多毫秒的合成，选级本身不到 1%）。
// 记法照地形覆盖：航线包关掉 resolveSections、按世界的完整需求记（导入地形.ts 的 isCoverRun 那一路），光体照 sectionData。
import * as THREE from 'three';
import type { DataSource } from '../core/数据读取.ts';
import { topClock } from '../core/拼段时序.ts';
import { lightWindows, windowSections } from '../light/光体.ts';
import { readPackMeta } from './地形元数据.ts';
import { readDistantGrid } from './远景网格.ts';
import { readSeam } from './交界修正.ts';
import { fallbackSelection } from './远景兜底采样.ts';
import { importedContains, importedSampler, readsByPack } from './导入选级.ts';
import { resolveRouteSections, type RouteIndex } from './航线区段包.ts';
import { prepareSelection, type RouteState } from './选区段.ts';
import { sectionKey, type SectionId } from './区段.ts';
import type { PlanWorld, TerrainViewDecl, TerrainWorld } from './地形视图.ts';

const keysOf = (qs: SectionId[]) => qs.map(sectionKey);

/** 主世界（主世界地形.ts 的 buildOverworld）：区段包为主，导入范围外用远景网格兜底；远景只兜底，不出区段 */
export const overworldPlanWorld = (pack: string, distant: string): TerrainWorld => ({
  key: `主世界:${pack}+${distant}`,
  open: async (src, dirOf) => {
    const meta = await readPackMeta(src, dirOf(pack));
    const distantDir = dirOf(distant);
    const [grid, seam] = await Promise.all([readDistantGrid(src, distantDir, distant), readSeam(src, distantDir, pack)]);
    const { source, heightRange } = fallbackSelection(meta.coarse, meta.info.coarsestLevel, meta.heightRange, grid, seam, meta.info.origin);
    const own = (qs: SectionId[]): [string, string[]][] => [[pack, keysOf(qs.filter(meta.hasSection))]];
    return { source, heightRange, reads: own, bypassReads: own };
  },
});

/** 导入的区段包（导入地形.ts）：普通包按粗高度图认区段；航线包按区段索引，可配作品覆盖层（只记它换掉的那几块） */
export const importedPlanWorld = (pack: string, overlay?: string): TerrainWorld => ({
  key: `导入:${pack}${overlay ? `+${overlay}` : ''}`,
  open: async (src, dirOf) => {
    const dir = dirOf(pack);
    const meta = await readPackMeta(src, dir);
    const route = meta.info.routeIndex ? (JSON.parse(new TextDecoder().decode(await src.gunzip(`${dir}/${meta.info.routeIndex}`))) as RouteIndex) : undefined;
    const routeKeys = route && new Set(route.keys);
    const contains = importedContains(meta.coarse, routeKeys);
    const resolve = routeKeys && resolveRouteSections(routeKeys, meta.info.coarsestLevel);
    let layer: { pack: string; keys: ReadonlySet<string> } | undefined;
    if (overlay) {
      const info = (await readPackMeta(src, dirOf(overlay))).info.overlay;
      if (!info || info.base !== pack) throw Error(`${overlay} 不是 ${pack} 的覆盖层`);
      layer = { pack: overlay, keys: new Set(info.keys) };
    }
    return {
      source: { 采样: importedSampler(meta.coarse, route?.outside), coarsestLevel: meta.info.coarsestLevel, ...(meta.canSplit ? { canSplit: meta.canSplit } : {}) },
      heightRange: [meta.heightRange[0], route ? route.maxTop : meta.heightRange[1]],
      reads: (list) => readsByPack(pack, keysOf(route ? list : list.filter(contains)), layer),
      bypassReads: (qs) => {
        const resolved = resolve ? qs.map((q) => resolve([q])[0]) : qs;
        return readsByPack(pack, keysOf(resolved.filter((q): q is SectionId => !!q && contains(q))), layer);
      },
    };
  },
});

/** 每个包：区段键 → 头一次用到的段内帧（同 地形覆盖 的 sections） */
export type PlanFirstUse = Record<string, Record<string, number>>;

export const planSegment = async (decl: TerrainViewDecl, frameCount: number, fps: number, src: DataSource, dirOf: (pack: string) => string): Promise<PlanFirstUse> => {
  const worlds = new Map<string, Promise<PlanWorld>>();
  const holders = new Map<string, { route?: RouteState }>();
  const camera = new THREE.PerspectiveCamera();
  const size = { width: decl.width, height: decl.height };
  const aspect = decl.width / decl.height;
  const first: PlanFirstUse = {};
  const note = (frame: number, reads: [string, string[]][]) => {
    for (const [pack, keys] of reads) {
      const into = (first[pack] ??= {});
      for (const k of keys) if (!(k in into)) into[k] = frame;
    }
  };
  for (let frame = 0; frame < frameCount; frame++) {
    const clock = topClock(frame, frameCount, fps);
    for (const view of decl.at(clock.sec, clock)) {
      if (!worlds.has(view.world.key)) worlds.set(view.world.key, view.world.open(src, dirOf));
      const w = await worlds.get(view.world.key)!;
      let holder = holders.get(view.canvas);
      if (!holder) holders.set(view.canvas, (holder = {}));
      camera.aspect = aspect; // R3F 给它自己的相机设，这里自己设
      const camPos = view.place(camera, aspect);
      camera.updateMatrixWorld();
      const { list } = prepareSelection({ camera, size, source: w.source, splitPixels: view.pixel, farM: view.farM, heightRange: view.heightRange ?? w.heightRange, shadowLightDir: view.shadowLightDir, camPos, look: view.look, holder });
      note(frame, w.reads(list));
      if (view.light) note(frame, w.bypassReads(lightWindows(view.light.center, view.light.heightRange).flatMap(windowSections)));
    }
  }
  return first;
};
