// 加载计划：照段的地形视图（地形视图.ts）逐帧挑区段，记下每个区段头一次用到是段内第几帧。
// 挑区段和体素世界每帧调的是同一个函数（选区段.ts 的 prepareSelection），地形源也照渲染那份搭（主世界地形.ts 的 buildOverworld），只是不取区段字节，
// 所以 Node 里几秒算完的就是渲染时会要的，不用开 4K 页面逐帧过（anim world cover 每帧要等 100 多毫秒的合成，选级本身不到 1%）。
import * as THREE from 'three';
import type { DataSource } from '../core/数据读取.ts';
import { readPackMeta } from './地形元数据.ts';
import { readDistantGrid } from './远景网格.ts';
import { readSeam } from './交界修正.ts';
import { fallbackHeightRange, fallbackSampler } from './远景兜底采样.ts';
import { prepareSelection, type RouteState, type SelectionSource } from './选区段.ts';
import { sectionKey, type SectionId } from './区段.ts';
import type { TerrainViewDecl, TerrainWorld } from './地形视图.ts';

/** 选级要的那份地形源，和记用量时认哪些区段算这个包的（同 导入地形.ts 的 contains） */
export type PlanWorld = { pack: string; source: SelectionSource; heightRange: [number, number]; contains: (q: SectionId) => boolean };

/** dirOf：包名 → 版本目录（数据源里的相对路径，如 terrain/主世界-116/<版本>） */
export const openPlanWorld = async (src: DataSource, world: TerrainWorld, dirOf: (pack: string) => string): Promise<PlanWorld> => {
  const meta = await readPackMeta(src, dirOf(world.pack));
  const distantDir = dirOf(world.distant);
  const [grid, seam] = await Promise.all([readDistantGrid(src, distantDir, world.distant), readSeam(src, distantDir, world.pack)]);
  const origin = meta.info.origin;
  const groundAt = fallbackSampler(meta.coarse, grid, seam, origin);
  return {
    pack: world.pack,
    source: {
      采样: (x, y, out) => {
        out.z = groundAt(x, y);
        out.crown = 0;
      },
      coarsestLevel: meta.info.coarsestLevel, // buildOverworld 不往下传 canSplit：主世界按整包最细级挑
    },
    heightRange: fallbackHeightRange(meta.heightRange, grid, origin, 26),
    contains: meta.hasSection,
  };
};

const worldKey = (w: TerrainWorld) => `${w.kind}:${w.pack}+${w.distant}`;

/** 每个包：区段键 → 头一次用到的段内帧（同 地形覆盖 的 first） */
export type PlanFirstUse = Record<string, Record<string, number>>;

export const planSegment = async (decl: TerrainViewDecl, frameCount: number, fps: number, open: (w: TerrainWorld) => Promise<PlanWorld>): Promise<PlanFirstUse> => {
  const worlds = new Map<string, Promise<PlanWorld>>();
  const holders = new Map<string, { route?: RouteState }>();
  const camera = new THREE.PerspectiveCamera();
  const size = { width: decl.width, height: decl.height };
  const aspect = decl.width / decl.height;
  const first: PlanFirstUse = {};
  for (let frame = 0; frame < frameCount; frame++) {
    for (const view of decl.at(frame / fps)) {
      const key = worldKey(view.world);
      if (!worlds.has(key)) worlds.set(key, open(view.world));
      const w = await worlds.get(key)!;
      let holder = holders.get(view.canvas);
      if (!holder) holders.set(view.canvas, (holder = {}));
      camera.aspect = aspect; // R3F 给它自己的相机设，这里自己设
      const camPos = view.place(camera, aspect);
      camera.updateMatrixWorld();
      const { list } = prepareSelection({ camera, size, source: w.source, splitPixels: view.pixel, farM: view.farM, heightRange: view.heightRange ?? w.heightRange, shadowLightDir: view.shadowLightDir, camPos, holder });
      const into = (first[w.pack] ??= {});
      for (const q of list) {
        if (!w.contains(q)) continue;
        const k = sectionKey(q);
        if (!(k in into)) into[k] = frame;
      }
    }
  }
  return first;
};
