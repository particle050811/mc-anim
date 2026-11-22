// 每帧挑区段：给定摆好的相机、画幅、视距、地形源（只用选级那几项）和航线登记，挑出这一帧要的区段。
// 体素世界（世界.tsx）每次渲染调它；加载计划（pipeline/世界/加载计划.ts）在 Node 里照段的地形视图逐帧调同一个函数，所以两边挑出来的一定一样。
// 不碰 React、不碰 WebGL：相机只读位姿和投影矩阵，地形源只读 采样、canSplit、coarsestLevel、resolveSections。
import * as THREE from 'three';
import { newSurface } from './地表.ts';
import { makeFrustumTest } from './视锥.ts';
import type { V3 } from '../model/parts.tsx';
import { backlitDirs } from './材质.ts';
import { outputScale } from '../core/渲染级别.ts';
import { pickSections as rawPickSections, type PickSectionsParams, type SectionId } from './区段.ts';
import type { VoxelSource } from './生成.ts';
import { trialOff, trialParams } from '../core/试看.ts';
import { RouteTable, routeDecide, type RouteView } from './航线定级.ts';

// `range`：这条航线从哪一秒到哪一秒是连着飞的。一条航线拆成几截拼（飞越 6-2-5、6-2-6）时给：航线定级往后看、留细按它算，不在截与截的接缝处断
// （不给就按这一层 Sequence 的头尾）。按航线提前备区段不看它，照旧不越过这一截。
// `lod`：这个镜头的地形按航线定级（下面「航线定级」），不给就每帧按画质门槛现选。
export type Route = { sec: number; at: (sec: number, camera: THREE.PerspectiveCamera) => number[] | null; range?: readonly [number, number]; lod?: RouteLod };
/** 航线定级的参数：往后看几秒、留不留细；门槛、提前细分的下限是这个镜头画质门槛（VoxelWorld 的 pixel）的几倍 */
export type RouteLod = { lookSec: number; hold: boolean; thresholdScale: number; floorScale: number };
export type Lookahead = { route: Route; frameSec: number; secLeft: number; secSinceStart: number };


// ---------- 航线定级（做法见 航线定级.ts）----------
// 登记航线的镜头给了 `lod` 就按航线定级：往后 T 秒里会按门槛细分的块现在就细分（换级挪到远处、一格还小的时候），细分过的在视野里不变粗。
// 下限：提前细分只做到「细一级的一格这一帧还有这么多像素」为止。不设时往后看 T 秒会把 0 级一路铺到 v·T 远（巡航 1 km/s），
// 远处一格不到半个像素，面数白花还起摩尔纹；设了以后切级都发生在「粗的一格 = 2 × 下限」像素上，面数有上限、和 T 多长无关。
// 试看 `航线定级` 逐项盖掉镜头给的：{"秒": 往后看几秒 | "整段", "门槛": 输出像素, "留细": true|false, "下限": 输出像素, "格": 每秒几个格点（2 的幂）}；
// 没登记航线的镜头只认「门槛」。试看 {"关": ["航线定级"]} 整个关掉，回到每帧按画质门槛现选。
// 试看参数用到时才取，不在模块顶层读成常量：这样 Node、vitest 里直接 import 就能测，改环境变量不用重载模块。一页的环境变量开页就定了，同一页每次取都一样
export const routeTrial = () => trialParams<Record<string, unknown>>('航线定级');
// 每秒几个格点：往后各时刻取在这些格点上。太稀会漏掉「只在两个格点之间才到门槛、马上又出画」的块（贴着画面下沿飞过去的近处），漏掉的到门槛那一帧才换，一格是门槛的两倍。
// 门槛是画质门槛 2 倍时（飞越 1 km/s、穿塔）16 和 64 的换级面积、换级时一格的像素都一样，8 开始变差；门槛再粗（块到门槛时离得更近、待得更短）要更密：4 倍要 64。
// 表是每个标签页、每截画布各算一次，从航线头算到这一帧，所以取够用里最稀的
const defaultGridHz = 16;
/** 这一帧航线定级实际用的参数：镜头登记的 `lod`，试看逐项盖。splitPixels 是镜头的画质门槛（页面像素）；
 *  scale = 输出像素对页面像素的倍数，试看给了「门槛」「下限」才调（试看按输出像素给，换成页面像素） */
export const resolveRouteLod = (registered: RouteLod | undefined, splitPixels: number, scale: () => number) => {
  const trial = routeTrial();
  const trialNumber = (key: string) => (typeof trial?.[key] === 'number' ? (trial[key] as number) : undefined);
  const lod = trialOff('航线定级') ? undefined : registered;
  const trialThreshold = trialNumber('门槛');
  const trialFloor = trialNumber('下限');
  return {
    splitCssPixels: trialThreshold !== undefined ? trialThreshold / scale() : splitPixels * (lod?.thresholdScale ?? 1),
    floorCssPixels: trialFloor !== undefined ? trialFloor / scale() : splitPixels * (lod?.floorScale ?? 0),
    lookSec: trial?.['秒'] === '整段' ? Infinity : (trialNumber('秒') ?? lod?.lookSec ?? 0),
    hold: typeof trial?.['留细'] === 'boolean' ? (trial['留细'] as boolean) : (lod?.hold ?? false),
    gridHz: trialNumber('格') ?? defaultGridHz,
  };
};
// 试看 `航线定级统计`：true = 每帧一行进浏览器日志（bench --verbose 的 .log）：区段数、面数、和上一帧比画面里换了级的区段；
// {"扫帧": n} = 只算不画：从这一帧起按航线往后 n 帧逐帧挑区段、统计切级，汇总成一行 warn 打到终端（still 出一帧就量完一段）
// {"选级偏帧": n} = 这一帧照「航线上往后 n 帧（负数往前）那一刻」定的级画，视野还是这一帧的。同一帧出偏 0 和偏 −30 两张拿 anim diff 比，
// 差的就是这半秒里切级改掉的像素（镜头没动，差里没有运动）
const routeStatsTrial = () => trialParams<boolean | Record<string, unknown>>('航线定级统计');
const routeStatsNumber = (stats: ReturnType<typeof routeStatsTrial>, key: '扫帧' | '选级偏帧') => (typeof stats === 'object' && typeof stats[key] === 'number' ? stats[key] : 0);
// 一格超过这么多输出像素算「比现状最粗的还粗」：现状门槛 2.25，细一级到 2.25 就换，所以画出来的一格最多 4.5
export const baselineMaxCellPixels = 4.5;
export const routeCamera = new THREE.PerspectiveCamera();
export const statCamera = new THREE.PerspectiveCamera();
// 自己带一个视锥：视锥.ts 的判断函数共用一个模块级视锥，再建一个前一个就作废，按航线取样时不能把这一帧的冲掉
export const ownFrustumTest = (camera: THREE.Camera): ReturnType<typeof makeFrustumTest> => {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const box = new THREE.Box3();
  return (x0, y0, z0, x1, y1, z1) => {
    box.min.set(x0, z0, -y1);
    box.max.set(x1, z1, -y0);
    return frustum.intersectsBox(box);
  };
};

export type RouteState = { key: string; table: RouteTable; viewAt: (sec: number) => RouteView | null };
// 投影要多留的距离（米）：仰角 32° 时影长是高度的 1.6 倍，够 180 米高的东西
export const shadowMarginM = 300;
const probe = newSurface();

/** 选级只用地形源的这几项（Node 里的加载计划只搭这些，不取区段） */
export type SelectionSource = Pick<VoxelSource, '采样' | 'coarsestLevel' | 'canSplit' | 'resolveSections'>;
export type SelectionInput = {
  camera: THREE.PerspectiveCamera; // 摆好了的相机（位姿、投影矩阵都是这一帧的）
  size: { width: number; height: number }; // 页面 CSS 像素
  source: SelectionSource;
  splitPixels: number; // 体素世界的 pixel（输出像素）
  farM: number;
  heightRange: [number, number];
  shadowLightDir?: V3;
  camPos: number[];
  look?: Lookahead; // 这台相机登记的航线（useLookahead）
  holder: { route?: RouteState }; // 航线定级表跨帧留着的地方（一个画布一份）
  pickSections?: (params: PickSectionsParams) => SectionId[]; // 地形调试包过一层的，不给用 区段.ts 的
  inView?: ReturnType<typeof makeFrustumTest>;
};

export const prepareSelection = (p: SelectionInput) => {
  const { camera, size, source, splitPixels, farM, heightRange, shadowLightDir, camPos, look } = p;
  const world = p.holder;
  const pickSections = p.pickSections ?? rawPickSections;
  const inView = p.inView ?? makeFrustumTest(camera);
  // 区段往背着光的方向扫 投影余量 米以后还碰得到视野，它的影子就可能落进画面
  const lh = shadowLightDir ? Math.hypot(shadowLightDir[0], shadowLightDir[1]) : 0;
  const sx = lh ? (-shadowLightDir![0] / lh) * shadowMarginM : 0;
  const sy = lh ? (-shadowLightDir![1] / lh) * shadowMarginM : 0;
  const backlit = shadowLightDir ? backlitDirs(shadowLightDir) : null;
  const pixelAngle = (camera.fov * Math.PI) / 180 / size.height;
  const featureTop = (x: number, y: number) => {
    source.采样(x, y, probe);
    return probe.z + probe.crown + 5;
  };
  const inViewOf =
    (test: ReturnType<typeof makeFrustumTest>) =>
    (x0: number, y0: number, x1: number, y1: number) =>
      test(Math.min(x0, x0 + sx) - 8, Math.min(y0, y0 + sy) - 8, heightRange[0], Math.max(x1, x1 + sx) + 8, Math.max(y1, y1 + sy) + 8, heightRange[1]);
  // 航线定级的参数：镜头登记航线时给的，试看逐项盖。试看的「门槛」「下限」按输出像素给，换成页面像素（pixelAngle 按页面高算；4K 上 2.25 ÷ 3 正好是画质门槛 0.75）
  const { splitCssPixels, floorCssPixels, lookSec, hold, gridHz } = resolveRouteLod(look?.route.lod, splitPixels / outputScale(), outputScale);
  const statsTrial = routeStatsTrial();
  const scanFrames = routeStatsNumber(statsTrial, '扫帧');
  const pickOffsetFrames = routeStatsNumber(statsTrial, '选级偏帧');
  // force：航线定级说要提前细分的块（门槛没到也细分，细出来的一格不小于下限）
  const pickThisFrame = (test: ReturnType<typeof makeFrustumTest>, center: number[], angle = pixelAngle, force?: (level: number, i: number, j: number) => boolean): SectionId[] =>
    pickSections({
      camPos: center,
      pixelAngle: angle,
      splitPixels: splitCssPixels,
      farM: farM,
      coarsestLevel: source.coarsestLevel,
      inView: inViewOf(test),
      featureTop,
      ...(force ? { decide: routeDecide(force, floorCssPixels) } : {}),
      ...(source.canSplit ? { canSplit: source.canSplit } : {}),
    });
  // 航线定级：这个镜头登记了航线、又要往后看或留细，才有 forceAt（航线秒 → 那一帧要提前细分的块）
  const routeSpan = look && (look.route.range ?? ([look.route.sec - look.secSinceStart, look.route.sec + look.secLeft] as const));
  let forceAt: ((sec: number) => (level: number, i: number, j: number) => boolean) | undefined;
  if (look && (lookSec > 0 || hold)) {
    const viewAt = (sec: number): RouteView | null => {
      const center = look.route.at(sec, routeCamera);
      if (!center) return null;
      routeCamera.updateMatrixWorld();
      return { camPos: center, pixelAngle: (routeCamera.fov * Math.PI) / 180 / size.height, inView: inViewOf(ownFrustumTest(routeCamera)) };
    };
    // 表按影响「格点上要细分哪些块」的参数分：换了就重建（航线本身不进键：一个画布一条航线）
    const routeKey = [size.width, size.height, splitCssPixels, farM, heightRange[0], heightRange[1], sx, sy, lookSec, hold, gridHz].join('|');
    if (world.route?.key !== routeKey) {
      const state: RouteState = { key: routeKey, viewAt, table: undefined as unknown as RouteTable };
      state.table = new RouteTable({ lookSec, hold, gridHz, splitPixels: splitCssPixels, farM, coarsestLevel: source.coarsestLevel, featureTop, canSplit: source.canSplit, viewAt: (sec) => state.viewAt(sec) });
      world.route = state;
    }
    const routeState = world.route;
    routeState.viewAt = viewAt; // 镜头组件每次渲染给的 at 是新的闭包，表里的取样总走最新的
    // 登记的航线秒得是这一帧的：镜头组件排在体素世界后面渲染的话，这里拿到的还是上一帧登记的，定出来的级就跟着渲染顺序走了
    const registered = look.route.at(look.route.sec, routeCamera);
    if (!registered || Math.hypot(registered[0]! - camPos[0]!, registered[1]! - camPos[1]!, registered[2]! - camPos[2]!) > 1e-6)
      throw new Error('航线定级：登记的航线秒算出来的机位不是这一帧的镜头（登记航线的镜头组件要排在体素世界前面，at 要和这一帧的机位同一个算法）');
    forceAt = (sec) => routeState.table.forFrame(sec, routeSpan![0], routeSpan![1]);
  }
  // 扫帧是只算不画：这一帧（和替后几帧备的区段）照门槛挑，整段往后看这种一帧几千万面的组合也量得了
  const drawForceAt = scanFrames > 0 ? undefined : forceAt;
  let list = pickThisFrame(inView, camPos, pixelAngle, drawForceAt?.(look!.route.sec));
  if (pickOffsetFrames && look) {
    const sec = look.route.sec + pickOffsetFrames * look.frameSec;
    const center = look.route.at(sec, statCamera);
    if (center) list = pickThisFrame(inView, center, (statCamera.fov * Math.PI) / 180 / size.height, drawForceAt?.(sec));
  }
  if (source.resolveSections) list = source.resolveSections(list);
  return { list, drawForceAt, inView, backlit, pixelAngle, featureTop, pickThisFrame, forceAt, routeSpan, look, statsTrial, scanFrames, splitCssPixels, floorCssPixels, lookSec, hold, gridHz, ownFrustumTest };
};
