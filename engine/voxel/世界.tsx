// 体素世界：整片地形，看得到的地方全是 MC 里真实的方块，照 Voxy 的结构做：近处一格一格，远处 2、4、8… 格合一格，一直到雾的尽头。
// 视频级和关键帧级是同一套，只差参数（lib/渲染级别.ts：换细一级的像素、最远距离、超采样）。分层，每层单独一个文件：
//   lib/真实方块表.ts、lib/真实方块图集.ts  方块 id → jar 里的真实模型、贴图、染色
//   lib/体素/区段.ts    切区段、每帧按画面大小挑哪几块用哪一级（纯函数）
//   lib/体素/生成.ts    一个区段的方块：体素值 + 染色的色板和每格的色板号（纯函数，粗格子照 Voxy Mipper 合并）
//   lib/体素/导入地形.ts  存档导入的地形：区段从烘焙好的区段包里取（体素来源.区段、预取），不走 生成.ts
//   lib/体素/网格.ts    方块 → 几何（纯函数：面剔除、贪心合并、按朝向分组）
//   lib/体素/材质.ts    three 的材质（原版贴图图集、镂空、染色）和只进阴影图的投影网格
//   lib/体素/网格池.ts  几个 Web Worker 并行跑 网格.ts
//   lib/体素/批绘制.ts  一类材质一个代理物体，这一类的区段由它一次画完（水类还是逐网格）
//   这里：每帧挑区段、交给网格池建网格并缓存（每块每级一次，跨帧复用；建好的区段网格另按世界键跨 WebGL 上下文留着，见 `kept`）、挑画哪几组朝向、交给代理物体画。
// 投影（给了 `shadowLightDir` 时，暮色主光的地形软投影，见 lib/级联阴影.ts）：方块另有一个只进阴影图的代理物体，只画背光面，
// 挑区段时视野往背着光的方向多留 300 米：画面外、光源那边的块（树、山）也会把影子投进画面。
import { useThree } from '@react-three/fiber';
import React, { useEffect, useRef, useState } from 'react';
import { cancelRender, continueRender, delayRender, getRemotionEnvironment, Internals } from 'remotion';
import { useFrameRate, useSecLeft, useSecSinceStart } from '../段/时间.tsx';
import * as THREE from 'three';
import { newSurface } from './地表.ts';
import { makeFrustumTest } from './视锥.ts';
import type { V3 } from '../model/parts.tsx';
import { pickDirs, backlitDirs, faceGroupMesh, releaseVoxelMeshes, voxelMaterial, type VoxelMesh, type MaterialClass } from './材质.ts';
import { buildBatchItem, releaseBatchItems, clearBatchState, ClassBatch, shadowMaterial, type BatchItem } from './批绘制.ts';
import { clearBufferPool } from './容器池.ts';
import { useTerrainDebug, TerrainMarkers } from './调试.tsx';
import { posScale, crossGroup, visibleDirs, type SectionMesh } from './网格.ts';
import { buildMeshInPool } from './网格池.ts';
import { sectionKey, sectionBounds, type SectionId } from './区段.ts';
import type { VoxelGrid, VoxelSource } from './生成.ts';
import { trialOff, trialParams } from '../core/试看.ts';
import { RouteTable, routeDecide, type RouteView } from './航线定级.ts';
import { coarsenessStats, switchStats, type FramePick } from './航线定级统计.ts';
import { isCoverRun, setCoverFrame } from './地形用量.ts';

// 缓存的总面数上限：超过就丢最久没用的区段（Remotion 每个并发标签页各有一份）
const maxCachedFaces = 6_000_000;
const materialClasses: MaterialClass[] = ['实心', '镂空', '实心树叶', '水', '花草'];

// 区段网格（CPU 这边的数组）按世界键跨渲染器留着：拼段的下一截是新的 Canvas、新的 WebGL 上下文，前一截建过的区段不用再取、再换体素块、再建网格，只重新上传。
// 显存里那份归各上下文（faceGroupMesh 传完不留 CPU 数组），这里留的就是这批数组。总面数有上限（每面 88 字节），超了丢最久没画的。
// 上限要装得下一整帧（飞越边城一帧约 560 万面），装不下的话切截时只有一部分接得上
// 猜的：替下一帧预取进来、还没有哪一帧真要过（见「预取下一帧」）
type Kept = { mesh: SectionMesh | null; V: Pick<VoxelGrid, 'origin' | 'cell' | 'nz'> | null; used: number; guessed?: boolean };
const kept = new Map<string, Kept>();
const maxKeptFaces = 7_000_000;
let keptFaces = 0;
let keptClock = 0;
const keptKey = (worldKey: string, section: SectionId) => `${worldKey}|${sectionKey(section)}`;
// 空区段也占一条记录（几百字节，按 4 面算），免得只进不出
const keptCost = (rec: Kept) => (rec.mesh?.faceCount ?? 0) + 4;
const keep = (k: string, rec: Kept) => {
  const old = kept.get(k);
  if (old) return old;
  kept.set(k, rec);
  keptFaces += keptCost(rec);
  return rec;
};
const trimKept = () => {
  if (keptFaces <= maxKeptFaces) return;
  for (const [k, rec] of [...kept.entries()].sort((a, b) => a[1].used - b[1].used)) {
    if (keptFaces <= maxKeptFaces * 0.8) break;
    kept.delete(k);
    keptFaces -= keptCost(rec);
    // 缓存里的 Entry 还指着这条记录（记最近画过用）：数组不放掉就一直被它钉着，一帧画 1900 万面时 CPU 这边多留一千多兆，上限等于没管住
    rec.mesh = null;
    rec.V = null;
  }
};

// items：水以外各类的面（交给代理物体画），类号是 materialClasses 里的下标；casters：其中投影的（花草不投影），再加只进阴影图的挡光面（网格.ts 文件头）；
// shadowOnly：挡光面那一项（不在 items 里，释放时另放）；water：水类的网格（逐网格画）
type Entry = { items: [number, BatchItem][]; casters: BatchItem[]; shadowOnly: BatchItem | null; water: VoxelMesh | null; plants: BatchItem | null; box: number[]; faceCount: number; used: number; kept: Kept };
// batches：各类的代理物体（下标同 materialClasses，水那一格空着）；shadowBatch：只进阴影图的
// 投、像素角：变焦的镜头（穿塔加速时视角一帧宽 1.4%）细分门槛跟着视角走，不一起外推就猜不中
type CameraPose = { 位: THREE.Vector3; dirQuat: THREE.Quaternion; 心: number[]; projection: THREE.Matrix4; pixelAngle: number };
type RouteState = { key: string; table: RouteTable; viewAt: (sec: number) => RouteView | null };
type World = { route?: RouteState; routeStatsPose?: CameraPose; routeScanned?: boolean; prevPrev?: CameraPose; 上?: CameraPose; 本?: CameraPose; prefetchedPose?: CameraPose; cache: Map<string, Entry>; group: THREE.Group; clock: number; faceCount: number; batches: (ClassBatch | null)[]; shadowBatch: ClassBatch };
// 按渲染器分：three 网格的顶点在显存里，属于这个 WebGL 上下文（容器池.ts），换了上下文（拼段的下一截是新的 Canvas）要重建（区段网格还在 `kept` 里就从那里拿）
const worlds = new WeakMap<THREE.WebGLRenderer, Map<string, World>>();
// 还在后台建区段、这一帧画不全的体素世界：屏幕AO 看到不空就跳过这一次绘制（反正截图前建齐了还要再画一次），省掉一整遍画半截场景的 GPU 活
export const voxelsPending = new Set<object>();
const probe = newSurface();

// 区段直接用包里解出来的（没有这一块就是空的，见 体素来源.区段）
const emptyEntry = (rec: Kept): Entry => ({ items: [], casters: [], shadowOnly: null, water: null, plants: null, box: [], faceCount: 0, used: 0, kept: rec });
// 树叶：第 0 级照游戏「高品质」镂空，粗级照 Voxy 画成实心（区段出网格 的第二个参数 q.L >= 1）
const meshToEntry = (ctx: WebGL2RenderingContext, sectionMesh: SectionMesh, voxels: Pick<VoxelGrid, 'origin' | 'cell' | 'nz'>, section: SectionId, rec: Kept): Entry => {
  const [x0, y0, sizeM] = sectionBounds(section);
  const box = [x0, y0, voxels.origin[2], x0 + sizeM, y0 + sizeM, voxels.origin[2] + voxels.nz * voxels.cell];
  const items: [number, BatchItem][] = [];
  const casters: BatchItem[] = [];
  let water: VoxelMesh | null = null;
  let plants: BatchItem | null = null;
  materialClasses.forEach((materialClass, classNo) => {
    const faces = sectionMesh[materialClass];
    if (!faces.n) return;
    if (materialClass === '水') {
      water = faceGroupMesh(ctx, faces, materialClass, voxels.origin, voxels.cell, box);
      return;
    }
    const item = buildBatchItem(ctx, faces, materialClass === '花草', voxels.origin, posScale / voxels.cell, box);
    items.push([classNo, item]);
    if (materialClass === '花草') plants = item;
    else casters.push(item);
  });
  const shadowOnly = sectionMesh.shadowPlanes.n ? buildBatchItem(ctx, sectionMesh.shadowPlanes, false, voxels.origin, posScale / voxels.cell, box) : null;
  if (shadowOnly) casters.push(shadowOnly);
  return { items, casters, shadowOnly, water, plants, box, faceCount: sectionMesh.faceCount, used: 0, kept: rec };
};

// ---------- 预取下一帧（用户 11-15 定做）----------
// 一帧画完放行截图后，显卡还在画、Node 在等截图的两三百毫秒里页面主线程空着；镜头在动时下一帧又要等新进视野的区段取、解、建网格（每帧 40～60 ms）。
// 所以放行后按前几帧镜头的变化（位置、朝向、细分中心、视角；步长在变时带上二阶）外推下一帧的视野，把那时要的新区段先取、先建好网格放进 `kept`。
// 只动 `kept`（CPU 这边的数组）：不进 `cache`、不传显存、不挂场景。下一帧照旧自己挑区段、按挑的先后建，要的在 `kept` 里就直接用，不在（猜错、没猜、还没建完）就照旧取、照旧等，
// 所以画出来的和没预取时一样，跳着渲、单出静帧也一样，只是省不到。猜的区段多取了也不进地形用量（来源的 prefetch 带 猜的，见 生成.ts）。
const prefetchInFlight = new Map<string, Promise<void>>(); // keptKey → 这一块预取结束（进了 kept，或者失败）
// 镜头一帧里挪了视距的 `预取最远比` 以上、转了 `预取最大转角` 弧度以上、视角变了 `预取最大变焦` 以上，当成切镜头，不猜（飞越一帧走 17 米，不能按固定米数卡）；
// 外推出来要新建的块比 `预取最多块` 多也不猜（切镜头后漏过来的；同时压在内存里的体素块也有个数）
const prefetchMaxFarRatio = 0.25;
const prefetchMaxTurn = 0.2;
const prefetchMaxZoom = 0.05;
const prefetchMaxSections = 128;
// 记下的「最近用过」：按航线备的是往后第 k 帧要的，记成那一帧的时钟（`keptClock + k`），`trimKept` 先挤掉画过的、后挤掉还没轮到的
const prefetch = (worldKey: string, source: VoxelSource, toPrefetch: SectionId[], usedStamp = keptClock) => {
  const prefetchPromise = (async () => {
    // 取齐的那一刻同步把体素块都拿出来：再等一轮，来源可能已经把它们丢了（导入地形.ts 的 ready、缓存上限）
    for (let pending = source.prefetch?.(toPrefetch, true); pending; pending = source.prefetch?.(toPrefetch, true)) await pending;
    await Promise.all(
      toPrefetch.map(async (q) => {
        const voxels = source.sections(q);
        const V = voxels && { origin: voxels.origin, cell: voxels.cell, nz: voxels.nz };
        const mesh = voxels ? await buildMeshInPool(voxels, q.L >= 1, source.transferOwnership) : null;
        keep(keptKey(worldKey, q), { mesh, V, used: usedStamp, guessed: true });
      }),
    );
  })()
    // 失败不报：哪一帧真要到这一块，照旧那一路会再取一遍，错在那里报
    .catch(() => undefined)
    .finally(() => {
      for (const q of toPrefetch) prefetchInFlight.delete(keptKey(worldKey, q));
    });
  for (const q of toPrefetch) prefetchInFlight.set(keptKey(worldKey, q), prefetchPromise);
};
const predictCamera = new THREE.PerspectiveCamera();

// ---------- 按航线提前备区段（用户 11-16 定做）----------
// 航线和镜头都是查表算的（各段的 编排.ts），往后几帧要哪些区段事先就算得出来。镜头组件（如 飞行镜头.tsx 的 FlightRig）用 `useLookahead` 登记
// 航线：这一帧的航线秒 `sec`，和按航线秒摆机位的 `at`（把那一刻的机位摆进给的相机、返回那时的镜头位置（同 `center`），算不出返回 null）。
// `at` 只许看航线秒：航线定级（航线定级.ts）按固定的航线秒记着算过的结果，哪一帧来问都得是同一个机位。登记了的画布不再按前几帧外推（上面「预取下一帧」），
// 放行一帧后按航线算往后 1～`aheadFrames` 帧，把那几帧要新建的区段先取、先建好网格放进 `kept`；不越过这一截的末尾（切到下一截是新的画布、新的航线）。
// 和预取下一帧一样只动 `kept`：每帧画出来的只取决于这一帧自己。
// 往后看几帧：一帧新进视野的区段取、解、建网格要 100～500 ms（飞越俯冲、穿塔加速），和一帧的出图时间差不多，提前两三帧就够把等的藏进前几帧的出图里；
// 再远只是多压内存（备好没用上的占着 `kept`）。块数另按 `预取最多块` 封顶（同时压在内存里的体素块有个数），超了就只备到前一帧；
// 最近一批不封顶：那一帧到时候反正要取这么多块，早取不多压内存（穿塔 649 帧一下进来 189 块，封顶时这一帧照旧要等近两秒）。
const aheadFrames = 4;
// `range`：这条航线从哪一秒到哪一秒是连着飞的。一条航线拆成几截拼（飞越 6-2-5、6-2-6）时给：航线定级往后看、留细按它算，不在截与截的接缝处断
// （不给就按这一层 Sequence 的头尾）。按航线提前备区段不看它，照旧不越过这一截。
// `lod`：这个镜头的地形按航线定级（下面「航线定级」），不给就每帧按画质门槛现选。
export type Route = { sec: number; at: (sec: number, camera: THREE.PerspectiveCamera) => number[] | null; range?: readonly [number, number]; lod?: RouteLod };
/** 航线定级的参数：往后看几秒、留不留细；门槛、提前细分的下限是这个镜头画质门槛（VoxelWorld 的 pixel）的几倍 */
export type RouteLod = { lookSec: number; hold: boolean; thresholdScale: number; floorScale: number };
type Lookahead = { route: Route; frameSec: number; secLeft: number; secSinceStart: number };
const lookaheads = new WeakMap<THREE.Camera, Lookahead>();
// 镜头组件每次渲染都调（不给 route 就撤掉登记），时间从这一层 Sequence 取
export const useLookahead = (camera: THREE.Camera, route: Route | undefined) => {
  const fps = useFrameRate();
  const secLeft = useSecLeft();
  const secSinceStart = useSecSinceStart();
  if (route) lookaheads.set(camera, { route, frameSec: 1 / fps, secLeft, secSinceStart });
  else lookaheads.delete(camera);
};
const aheadCamera = new THREE.PerspectiveCamera();

// ---------- 航线定级（做法见 航线定级.ts）----------
// 登记航线的镜头给了 `lod` 就按航线定级：往后 T 秒里会按门槛细分的块现在就细分（换级挪到远处、一格还小的时候），细分过的在视野里不变粗。
// 下限：提前细分只做到「细一级的一格这一帧还有这么多像素」为止。不设时往后看 T 秒会把 0 级一路铺到 v·T 远（巡航 1 km/s），
// 远处一格不到半个像素，面数白花还起摩尔纹；设了以后切级都发生在「粗的一格 = 2 × 下限」像素上，面数有上限、和 T 多长无关。
// 试看 `航线定级` 逐项盖掉镜头给的：{"秒": 往后看几秒 | "整段", "门槛": 输出像素, "留细": true|false, "下限": 输出像素, "格": 每秒几个格点（2 的幂）}；
// 没登记航线的镜头只认「门槛」。试看 {"关": ["航线定级"]} 整个关掉，回到每帧按画质门槛现选。
// 试看参数用到时才取，不在模块顶层读成常量：这样 Node、vitest 里直接 import 就能测，改环境变量不用重载模块。一页的环境变量开页就定了，同一页每次取都一样
const routeTrial = () => trialParams<Record<string, unknown>>('航线定级');
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
// 输出像素对页面像素的倍数：渲染时是截图放大倍数（4K 成片 3），Studio 照 4K 算
const outputScale = () => (getRemotionEnvironment().isRendering ? window.devicePixelRatio || 1 : 3);
// 一格超过这么多输出像素算「比现状最粗的还粗」：现状门槛 2.25，细一级到 2.25 就换，所以画出来的一格最多 4.5
const baselineMaxCellPixels = 4.5;
const routeCamera = new THREE.PerspectiveCamera();
const statCamera = new THREE.PerspectiveCamera();
// 自己带一个视锥：视锥.ts 的判断函数共用一个模块级视锥，再建一个前一个就作废，按航线取样时不能把这一帧的冲掉
const ownFrustumTest = (camera: THREE.Camera): ReturnType<typeof makeFrustumTest> => {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const box = new THREE.Box3();
  return (x0, y0, z0, x1, y1, z1) => {
    box.min.set(x0, z0, -y1);
    box.max.set(x1, z1, -y0);
    return frustum.intersectsBox(box);
  };
};
const _position = new THREE.Vector3();
const _orientation = new THREE.Quaternion();
const _scale = new THREE.Vector3();

export type VoxelWorldProps = {
  // 缓存用，不同的世界不能重名；不能叫 key：React 不把 key 传进 props（11-16 盘键迁移改成 key 后全片共用一份缓存）
  worldKey: string;
  source: VoxelSource;
  center: number[]; // 镜头位置（场景坐标）
  pixel: number; // 细一级的一格在画面上还有这么多像素（画面的 CSS 像素）就细分，见 lib/渲染级别.ts
  far: number; // 最远画到多远（米）
  heightRange?: [number, number]; // 地面和树最低、最高大概在哪（米），判断区段在不在视野里用
  shadowLightDir?: V3; // 地形投影的光向（指向光源）：给了才建投影网格
};
// 投影要多留的距离（米）：仰角 32° 时影长是高度的 1.6 倍，够 180 米高的东西
const shadowMarginM = 300;
// 小网格八组朝向全画、交给 GPU 背面剔除（一次 draw call，顶点多算一倍），大网格在 CPU 上挑朝着镜头 / 背着光的几组（多次 draw call）。
// 体素材质除花草都是单面；花草两面画，但单面的面在着色器里丢背面（材质.ts），两种画法画面和阴影图逐像素一样；大网格全画会卡 GPU，所以面数超过 `drawAllMaxFaces` 的才挑朝向
const drawAllMaxFaces = 3000;
const allDirs = [true, true, true, true, true, true, true, true];
// 远处的草不画（用户 10-11 定：花草约占一半，接受远处颜色和近处不一致）。
// 只去掉花草这一类里十字模型的斜面（第 6 组，朝向不沿轴的面）：草、花、蕨、树苗、蜘蛛网；积雪层、栅栏、火把、地毯、海草的面都沿轴（海草这类两面画的在第 7 组），照画（整类按距离剔会把远处的雪一起剔掉）。
// 区段离镜头（盒子最近点）超过 `plantFarM` 米就不画；256 米是用户 10-12 比过 64、128、256 后定的（平原上远处去了草，地面台阶纹路会露出来，有草没草有一条分界）。
const plantFarM = 256;
const distToBox = (b: number[], p: number[]) =>
  Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[3]), Math.max(b[1] - p[1], 0, p[1] - b[4]), Math.max(b[2] - p[2], 0, p[2] - b[5]));

export const VoxelWorld: React.FC<VoxelWorldProps> = ({ worldKey, source, center: camPos, pixel: splitPixels, far: farM, heightRange: heightRange = [-30, 140], shadowLightDir }) => {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const size = useThree((st) => st.size);
  const timelineFrame = Internals.Timeline.useTimelinePosition(); // 整段的帧号，地形覆盖记帧用
  const advance = useThree((st) => st.advance);
  const gl = useThree((st) => st.gl);
  const [, forceRedraw] = useState(0);
  const delayHandle = useRef<number | null>(null); // 拦着截图的 delayRender
  const toBuild = useRef<SectionId[]>([]); // 最近一次渲染还没建的，每次渲染整个换掉
  const building = useRef(false); // 后台在建
  const ctx = gl.getContext() as WebGL2RenderingContext;
  let glWorlds = worlds.get(gl);
  if (!glWorlds) {
    const newWorlds = (glWorlds = new Map<string, World>());
    worlds.set(gl, newWorlds);
    const canvas = gl.domElement;
    // 渲染时丢了上下文就整次报错：丢失期间 three 不画，Remotion 照常截图，空画布会当正常帧进母版。
    // 没法在丢失前提前拦，正在截的那一帧可能已经错了，只有整次失败才保证错帧不留下。
    // 换截时 R3F 卸载 Canvas 也会让旧上下文丢失（forceContextLoss），那时画布已经离开页面，不算。
    // delayRender 不放：cancelRender 抛的错帧与帧之间没人接，Remotion 又先看 renderReady 再看取消，占着句柄下一帧才一定报出来
    canvas.addEventListener('webglcontextlost', () => {
      if (!canvas.isConnected || !getRemotionEnvironment().isRendering) return;
      delayRender('WebGL 上下文丢失');
      cancelRender(new Error('WebGL 上下文丢失（GPU 重置或显存不够），这次渲染作废，要重渲'));
    });
    // Studio 里丢了接着看：恢复后旧容器全部作废，还拿它们画不报错、只是地形没了（three 重传不了：容器归 容器池.ts 管）。清掉，下一次渲染整个重建，网格从 `kept` 拿
    canvas.addEventListener('webglcontextrestored', () => {
      newWorlds.clear();
      clearBufferPool(ctx);
      clearBatchState(ctx);
    });
  }
  let maybeWorld = glWorlds.get(worldKey);
  if (!maybeWorld) {
    const batches = materialClasses.map((materialClass) => (materialClass === '水' ? null : new ClassBatch(voxelMaterial(materialClass), false)));
    glWorlds.set(worldKey, (maybeWorld = { cache: new Map(), group: new THREE.Group(), clock: 0, faceCount: 0, batches, shadowBatch: new ClassBatch(shadowMaterial, true) }));
  }
  const world = maybeWorld;
  const { cache, group } = world;
  // 有的镜头组件摆完没更新世界矩阵，不更新就要等下一次画图，挑区段会用上一帧的视野：硬切或隔帧出静帧时缺地形（用户 10-31 定修）
  camera.updateMatrixWorld();
  // 地形调试（试看参数，调试.tsx）：下面挑区段调的 pickSections 是它包过一层的；一项没开时就是 区段.ts 的原函数，别的几项也都是空的
  const debug = useTerrainDebug(source, camera);
  const pickSections = debug.pickSections;
  const inView = debug.inView ?? makeFrustumTest(camera);
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
  const look = lookaheads.get(camera);
  const { splitCssPixels, floorCssPixels, lookSec, hold, gridHz } = resolveRouteLod(look?.route.lod, splitPixels, outputScale);
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
      state.table = new RouteTable({ lookSec, hold, gridHz, splitPixels: splitCssPixels, farM, featureTop, canSplit: source.canSplit, viewAt: (sec) => state.viewAt(sec) });
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
  // 最近三个镜头位姿（预取下一帧用）：同一帧重画几次位姿不变，不算新的
  camera.matrixWorld.decompose(_position, _orientation, _scale);
  if (!world.本 || !world.本.位.equals(_position) || !world.本.dirQuat.equals(_orientation) || world.本.心.some((v, i) => v !== camPos[i]) || !world.本.projection.equals(camera.projectionMatrix)) {
    world.prevPrev = world.上;
    world.上 = world.本;
    world.本 = { 位: _position.clone(), dirQuat: _orientation.clone(), 心: [...camPos], projection: camera.projectionMatrix.clone(), pixelAngle: pixelAngle };
  }
  debug.logPick(list);
  // 地形覆盖（engine/voxel/地形用量.ts）：挑出来的照常报给来源记下（来源这时只记不取），这一帧什么都不建、不画、不预取。挑法和正常渲染是同一段代码，裁级的留表就从这里来。
  // 挑出 0 个也报：来源借此记下「有体素世界从这个包挑」，整段挑过却一个没记下时 pipeline 报错（pipeline/渲/地形覆盖.ts）
  const coverRun = isCoverRun();
  if (coverRun) {
    setCoverFrame(timelineFrame);
    source.prefetch?.(list);
  }
  const drawList = coverRun ? [] : list;
  const putEntry = (section: SectionId, entry: Entry) => {
    const k = sectionKey(section);
    if (cache.has(k)) return;
    cache.set(k, entry);
    world.faceCount += entry.faceCount;
  };
  // 没建的区段都交给网格池在后台建（见 网格池.ts）：这一帧先不画、用 delayRender 拦住截图，建齐了重画一次再放行。
  // 导入的地形要先从包里取区段（fetch），没取到的等取齐了再建
  const unbuilt = drawList.filter((q) => !cache.has(sectionKey(q)));
  // 预取进来的（猜的）这一帧真要了：也告诉来源一声，让它把这几块补记进地形用量
  const unkept = unbuilt.filter((q) => {
    const rec = kept.get(keptKey(worldKey, q));
    if (!rec?.guessed) return !rec;
    rec.guessed = false;
    return true;
  });
  if (unkept.length) source.prefetch?.(unkept);
  // 要建的都留着网格（预取好的）、块数又不多：当场传显存、进缓存，这一次渲染就画上，不绕后台那一圈（拦截图、等一轮定时器、重画一次）。
  // 先后和后台建的一样（都按 unbuilt 的顺序），所以画面一样；后台正在建时不插队
  if (unbuilt.length && unbuilt.length <= prefetchMaxSections && !building.current && delayHandle.current === null) {
    const recs = unbuilt.map((q) => kept.get(keptKey(worldKey, q)));
    if (recs.every((rec) => rec)) {
      unbuilt.forEach((q, i) => {
        const rec = recs[i]!;
        putEntry(q, rec.V && rec.mesh ? meshToEntry(ctx, rec.mesh, rec.V, q, rec) : emptyEntry(rec));
      });
      unbuilt.length = 0;
    }
  }
  // 后台建的是最近一次渲染要的（每次渲染都换成这一次的 `unbuilt`）：后台还没建完、要的区段变了，新的照样排进去，不会一直等到超时。
  // 后台每建一小批就回头看一次要建什么、要的齐不齐（`prefetch` 可能把没建的丢了要重取），都建完了重画一次，还有没建的就再开后台，都齐了才放行截图（见下面的 useEffect）
  toBuild.current = unbuilt;
  if (unbuilt.length) {
    if (delayHandle.current === null) {
      delayHandle.current = delayRender(`体素世界：还有 ${unbuilt.length} 块区段`, { timeoutInMilliseconds: 30 * 60 * 1000 });
      voxelsPending.add(delayHandle);
    }
    if (!building.current) {
      building.current = true;
      (async () => {
        for (;;) {
          const qs = toBuild.current.filter((q) => !cache.has(sectionKey(q)));
          if (!qs.length) break;
          // 还有预取没结束就等它：要的块多半就在里面，不重复建（建完进 `kept`，下一轮从那里拿）；
          // 也不让它和这里交错着问来源要区段（来源按「最近谁要过」丢缓存，交错会把这边正要用的丢掉）
          // 按航线往后备的批也一起等（不只等管着这几块的）：下面一块块取体素块中间有 await，别的批在这时问来源要区段会把这边取好没用的挤掉
          if (prefetchInFlight.size) {
            await Promise.all(new Set(prefetchInFlight.values()));
            continue;
          }
          // 留着网格的区段不取；这一轮先把网格拿在手上（被挤掉的记录数组会清掉，不能回头从记录上读），建到一半被挤掉也不用回头取
          const keptNow = new Map<string, { rec: Kept; mesh: SectionMesh | null; V: Kept['V'] }>();
          for (const q of qs) {
            const rec = kept.get(keptKey(worldKey, q));
            if (rec) keptNow.set(sectionKey(q), { rec, mesh: rec.mesh, V: rec.V });
          }
          const toFetch = keptNow.size ? qs.filter((q) => !keptNow.has(sectionKey(q))) : qs;
          const prefetching = toFetch.length ? source.prefetch?.(toFetch) : undefined;
          if (prefetching) {
            await prefetching;
            continue;
          }
          // 主线程按 qs 的先后取体素块、交给网格池；建好的按同样的先后建 three 网格、进缓存（three 的物体编号跟着建的先后走，
          // 同一帧深度一样的物体按编号定先后，先后不能变；留着网格的区段也排在同一个队里）。同时在算的最多 窗口 块，不然第一帧几千块的体素块一起压在内存里
          const windowSize = 32;
          const inFlight: { q: SectionId; V: Pick<VoxelGrid, 'origin' | 'cell' | 'nz'> | null; m: Promise<SectionMesh> | null; rec: Kept | null }[] = [];
          const collectOne = async () => {
            const x = inFlight.shift()!;
            const mesh = x.m && (await x.m);
            const rec = x.rec ?? keep(keptKey(worldKey, x.q), { mesh, V: x.V, used: keptClock });
            putEntry(x.q, x.V && mesh ? meshToEntry(ctx, mesh, x.V, x.q, rec) : emptyEntry(rec));
          };
          const t = performance.now();
          for (const section of qs) {
            if (inFlight.length >= windowSize) await collectOne();
            const had = keptNow.get(sectionKey(section));
            if (had) {
              inFlight.push({ q: section, V: had.V, m: had.mesh && Promise.resolve(had.mesh), rec: had.rec });
              continue;
            }
            const voxels = source.sections(section);
            inFlight.push({ q: section, V: voxels && { origin: voxels.origin, cell: voxels.cell, nz: voxels.nz }, m: voxels ? buildMeshInPool(voxels, section.L >= 1, source.transferOwnership) : null, rec: null });
            if (performance.now() - t > 1000) break; // 隔一会儿回头看一次要建的变没变
          }
          while (inFlight.length) await collectOne();
          await new Promise((r) => setTimeout(r, 0));
        }
        building.current = false;
        forceRedraw((v) => v + 1);
      })().catch((err) => cancelRender(err));
    }
  }
  // 不用 group.clear()：three 的 remove 对每个子物体 indexOf + splice，水面多时是平方级
  for (const child of group.children) (child as { parent: THREE.Object3D | null }).parent = null;
  group.children.length = 0;
  // 代理物体放在镜头附近的整数格点上（批绘制.ts 文件头）
  const { batches, shadowBatch } = world;
  const anchor = [Math.round(camPos[0]), Math.round(camPos[1]), Math.round(camPos[2])];
  for (const batch of batches) batch?.reset(anchor);
  shadowBatch.reset(anchor);
  const frameClock = world.clock;
  const keptStamp = ++keptClock;
  // 裙边（lib/体素/网格.ts 文件头）：这一侧同一级的邻居这一帧也在画，裙边就藏在它的地面底下，不画
  const drawnKeys = new Set(drawList.map(sectionKey));
  const skirtFlags = (q: SectionId) => [
    !drawnKeys.has(sectionKey({ L: q.L, i: q.i + 1, j: q.j })),
    !drawnKeys.has(sectionKey({ L: q.L, i: q.i - 1, j: q.j })),
    !drawnKeys.has(sectionKey({ L: q.L, i: q.i, j: q.j + 1 })),
    !drawnKeys.has(sectionKey({ L: q.L, i: q.i, j: q.j - 1 })),
  ];
  for (const section of drawList) {
    const entry = cache.get(sectionKey(section));
    if (!entry) continue;
    entry.used = ++world.clock;
    entry.kept.used = keptStamp;
    const skirts = skirtFlags(section);
    const facingDirs = debug.allFacing ? [...allDirs, ...skirts] : visibleDirs(entry.box, camPos, skirts);
    const allWithSkirts = [...allDirs, ...skirts]; // 裙边全画时也照邻居挑
    const farPlants = entry.plants !== null && distToBox(entry.box, camPos) > plantFarM;
    for (const [classNo, item] of entry.items) {
      const dirs = item.面 > drawAllMaxFaces ? facingDirs : allWithSkirts;
      batches[classNo]!.加(item, farPlants && item === entry.plants ? dirs.map((x, k) => x && k !== crossGroup) : dirs);
    }
    if (entry.water) {
      pickDirs(entry.water, entry.water.geometry.drawRange.count / 6 > drawAllMaxFaces ? facingDirs : allWithSkirts);
      if (entry.water.visible) group.add(entry.water);
    }
    if (backlit) for (const item of entry.casters) shadowBatch.加(item, item.面 > drawAllMaxFaces ? backlit : allDirs);
  }
  // 这一帧没有哪一类的面，那一类的材质就不在场景里（屏幕AO 按场景里有哪些材质定怎么画）
  for (const batch of batches) if (batch?.items.length) group.add(batch);
  if (shadowBatch.items.length && !debug.noShadow) group.add(shadowBatch);
  // 这一帧用到的块不能被清掉
  if (world.faceCount > maxCachedFaces) {
    const all = [...cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, entry] of all) {
      if (world.faceCount <= maxCachedFaces * 0.8 || entry.used > frameClock) break;
      releaseBatchItems(ctx, [...entry.items.map((x) => x[1]), ...(entry.shadowOnly ? [entry.shadowOnly] : [])]);
      if (entry.water) releaseVoxelMeshes(ctx, [entry.water]);
      world.faceCount -= entry.faceCount;
      cache.delete(k);
    }
  }
  trimKept();
  // 试看 航线定级统计（只算、只打日志，不动画面）
  if (statsTrial && look) {
    const scale = outputScale();
    // 航线秒 sec 那一帧挑出来的区段和镜头（先问表、再摆统计用的相机：表取样用的是另一台相机）
    const statPickAt = (sec: number): FramePick | null => {
      const force = forceAt?.(sec);
      const center = look.route.at(sec, statCamera);
      if (!center) return null;
      statCamera.updateMatrixWorld();
      const angle = (statCamera.fov * Math.PI) / 180 / size.height;
      return {
        list: pickThisFrame(ownFrustumTest(statCamera), center, angle, force),
        view: { viewProj: new THREE.Matrix4().multiplyMatrices(statCamera.projectionMatrix, statCamera.matrixWorldInverse), camPos: center, outPixelAngle: angle / scale },
      };
    };
    if (scanFrames > 0 && !world.routeScanned && routeSpan) {
      world.routeScanned = true;
      const t0 = performance.now();
      const frameCount = Math.min(scanFrames, Math.floor((routeSpan[1] - look.route.sec) / look.frameSec + 1e-6));
      // 按航线秒的整秒分桶：[帧数, 区段数之和, 区段数最大, 变细, 变粗, 切级面积, 较粗一格 ≥3 像素的切级面积, 面积 × 像素, 最大一格像素（第 1 级起）, 比现状粗的占屏之和, 各级块数之和 × 7]
      const buckets = new Map<number, number[]>();
      let prev = statPickAt(look.route.sec);
      let counted = 0;
      for (let k = 1; k <= frameCount && prev; k++) {
        const sec = look.route.sec + k * look.frameSec;
        const cur = statPickAt(sec);
        if (!cur) break;
        const sw = switchStats(prev, cur, featureTop);
        const coarse = coarsenessStats(cur, featureTop, baselineMaxCellPixels);
        const bucketSec = Math.floor(sec + 1e-9);
        let b = buckets.get(bucketSec);
        if (!b) buckets.set(bucketSec, (b = new Array<number>(17).fill(0)));
        b[0]! += 1;
        b[1]! += cur.list.length;
        b[2] = Math.max(b[2]!, cur.list.length);
        b[3]! += sw.refine;
        b[4]! += sw.coarsen;
        b[5]! += sw.share;
        b[6]! += sw.bigShare;
        b[7]! += sw.pixelShare;
        b[8] = Math.max(b[8]!, coarse.maxPixels);
        b[9]! += coarse.overShare;
        coarse.levels.forEach((v, level) => (b![10 + level]! += v));
        prev = cur;
        counted++;
      }
      const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;
      // warn：still、film 只把浏览器的 warn、error 打到终端。面积是占整张画面的比例（1 = 整张）
      console.warn(
        `[航线定级扫] ${JSON.stringify({
          trial: routeTrial() ?? null,
          // 实际用的参数（门槛、下限换回输出像素）
          params: { lookSec: Number.isFinite(lookSec) ? lookSec : '整段', hold, threshold: round(splitCssPixels * scale, 4), floor: round(floorCssPixels * scale, 4), gridHz },
          fromSec: round(look.route.sec, 4),
          span: [round(routeSpan[0], 3), round(routeSpan[1], 3)],
          frames: counted,
          fps: round(1 / look.frameSec),
          samples: world.route?.table.sampleCount ?? 0,
          routeMs: round(world.route?.table.spentMs ?? 0, 0),
          ms: round(performance.now() - t0, 0),
          perSec: [...buckets].map(([sec, b]) => [sec, ...b.map((v, at) => (at >= 5 && at <= 9 ? round(v, 5) : v))]),
        })}`,
      );
    }
    if (unbuilt.length === 0 && world.routeStatsPose !== world.本) {
      world.routeStatsPose = world.本;
      let faces = 0;
      const facesByLevel = [0, 0, 0, 0, 0, 0, 0];
      for (const section of list) {
        const faceCount = cache.get(sectionKey(section))?.faceCount ?? 0;
        faces += faceCount;
        facesByLevel[section.L]! += faceCount;
      }
      const cur: FramePick = { list, view: { viewProj: new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camPos, outPixelAngle: pixelAngle / scale } };
      const prev = routeSpan && look.route.sec - look.frameSec >= routeSpan[0] - 1e-9 ? statPickAt(look.route.sec - look.frameSec) : null;
      const sw = prev && switchStats(prev, cur, featureTop);
      const coarse = coarsenessStats(cur, featureTop, baselineMaxCellPixels);
      console.log(
        `[航线定级] ${JSON.stringify({
          sec: look.route.sec,
          sections: list.length,
          faces,
          facesByLevel,
          levels: coarse.levels,
          maxCellPixels: coarse.maxPixels,
          overShare: coarse.overShare,
          ...(sw ? { refine: sw.refine, coarsen: sw.coarsen, share: sw.share, bigShare: sw.bigShare, pixelShare: sw.pixelShare } : {}),
          samples: world.route?.table.sampleCount ?? 0,
          routeMs: Math.round(world.route?.table.spentMs ?? 0),
        })}`,
      );
    }
  }
  // 异步建完、这一次全都挂上了：手动再画一次，画完才放行截图
  const allBuilt = unbuilt.length === 0;
  useEffect(() => () => void voxelsPending.delete(delayHandle), []);
  useEffect(() => {
    if (!allBuilt || delayHandle.current === null) return;
    voxelsPending.delete(delayHandle);
    advance(performance.now());
    continueRender(delayHandle.current);
    delayHandle.current = null;
  });
  // 预取下一帧：这一帧放行以后（排在上面那个 effect 后面，再让出一轮）才开始，不占出这一帧的时间
  useEffect(() => {
    const { prevPrev, 上: prevPose, 本: current } = world;
    if (coverRun || !allBuilt || !current || world.prefetchedPose === current || !getRemotionEnvironment().isRendering) return;
    world.prefetchedPose = current;
    const look = lookaheads.get(camera);
    if (look) {
      setTimeout(() => {
        if (voxelsPending.size) return;
        let total = 0;
        for (let k = 1; k <= aheadFrames && k * look.frameSec <= look.secLeft + 1e-9; k++) {
          const aheadSec = look.route.sec + k * look.frameSec;
          const center = look.route.at(aheadSec, aheadCamera);
          if (!center) break;
          aheadCamera.updateMatrixWorld();
          const toPrefetch = pickThisFrame(makeFrustumTest(aheadCamera), center, (aheadCamera.fov * Math.PI) / 180 / size.height, drawForceAt?.(aheadSec)).filter(
            (q) => !cache.has(sectionKey(q)) && !kept.has(keptKey(worldKey, q)) && !prefetchInFlight.has(keptKey(worldKey, q)),
          );
          if (total && total + toPrefetch.length > prefetchMaxSections) break;
          total += toPrefetch.length;
          // 一帧一批：近的先取齐先建好（工人按先后排），下一帧要的不用等后面几帧的
          if (toPrefetch.length) prefetch(worldKey, source, toPrefetch, keptClock + k);
        }
      }, 0);
      return;
    }
    if (!prevPose || current.位.distanceTo(prevPose.位) > farM * prefetchMaxFarRatio || current.dirQuat.angleTo(prevPose.dirQuat) > prefetchMaxTurn || Math.abs(current.pixelAngle / prevPose.pixelAngle - 1) > prefetchMaxZoom) return;
    setTimeout(() => {
      // 有体素世界还在建（同一个来源可能两个世界共用）就不猜，理由同上
      if (voxelsPending.size) return;
      // 外推：位置、投影矩阵、每像素张角逐项再变一步，朝向再转一步（本 × 上⁻¹ × 本）。
      // 前两步差不多大（镜头在匀着加速、变焦）时，位置和视角把步长的变化也带上：只照最近一步外推，穿塔加速那段每帧有一两块猜不中，当场建就用不上
      const spacing = current.位.distanceTo(prevPose.位);
      const zoomDelta = current.pixelAngle - prevPose.pixelAngle;
      const secondOrderPose = prevPrev && Math.abs(spacing - prevPose.位.distanceTo(prevPrev.位)) <= spacing / 2 && Math.abs(zoomDelta - (prevPose.pixelAngle - prevPrev.pixelAngle)) <= Math.abs(zoomDelta) / 2 ? prevPrev : null;
      const extrapolate = (readField: (p: CameraPose) => number) => (secondOrderPose ? 3 * readField(current) - 3 * readField(prevPose) + readField(secondOrderPose) : 2 * readField(current) - readField(prevPose));
      for (let i = 0; i < 16; i++) predictCamera.projectionMatrix.elements[i] = extrapolate((p) => p.projection.elements[i]!);
      predictCamera.projectionMatrixInverse.copy(predictCamera.projectionMatrix).invert();
      predictCamera.position.set(extrapolate((p) => p.位.x), extrapolate((p) => p.位.y), extrapolate((p) => p.位.z));
      predictCamera.quaternion.copy(current.dirQuat).multiply(_orientation.copy(prevPose.dirQuat).invert()).multiply(current.dirQuat).normalize();
      predictCamera.updateMatrixWorld();
      const toPrefetch = pickThisFrame(
        makeFrustumTest(predictCamera),
        current.心.map((_, i) => extrapolate((p) => p.心[i]!)),
        extrapolate((p) => p.pixelAngle),
      ).filter((q) => !cache.has(sectionKey(q)) && !kept.has(keptKey(worldKey, q)) && !prefetchInFlight.has(keptKey(worldKey, q)));
      if (toPrefetch.length && toPrefetch.length <= prefetchMaxSections) prefetch(worldKey, source, toPrefetch);
    }, 0);
  });
  return debug.markers.length ? (
    <>
      <primitive object={group} />
      <TerrainMarkers markers={debug.markers} />
    </>
  ) : (
    <primitive object={group} />
  );
};
