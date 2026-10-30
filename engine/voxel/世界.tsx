// 体素世界：整片地形，看得到的地方全是 MC 里真实的方块，照 Voxy 的结构做：近处一格一格，远处 2、4、8… 格合一格，一直到雾的尽头。
// 视频级和关键帧级是同一套，只差参数（lib/渲染级别.ts：换细一级的像素、最远距离、超采样）。分层，每层单独一个文件：
//   lib/真实方块表.ts、lib/真实方块图集.ts  方块 id → jar 里的真实模型、贴图、染色
//   lib/体素/区段.ts    切区段、每帧按画面大小挑哪几块用哪一级（纯函数）
//   lib/体素/生成.ts    一个区段的方块：体素值 + 染色的色板和每格的色板号（纯函数，粗格子照 Voxy Mipper 合并）
//   lib/体素/导入地形.ts  存档导入的地形：区段从烘焙好的区段包里取（体素来源.区段、预取），不走 生成.ts
//   lib/体素/网格.ts    方块 → 几何（纯函数：面剔除、贪心合并、按朝向分组）
//   lib/体素/材质.ts    three 的材质（原版贴图图集、镂空、染色）和只进阴影图的投影网格
//   lib/体素/网格池.ts  几个 Web Worker 并行跑 网格.ts
//   这里：每帧挑区段、交给网格池建网格并缓存（每块每级一次，跨帧复用）、挑画哪几组朝向、画。
// 投影（给了 `shadowLightDir` 时，暮色主光的地形软投影，见 lib/级联阴影.ts）：每块的方块另有一份只进阴影图、只画背光面的网格（lib/体素/材质.ts 的 `shadowMesh`），
// 挑区段时视野往背着光的方向多留 300 米：画面外、光源那边的块（树、山）也会把影子投进画面。
import { useThree } from '@react-three/fiber';
import React, { useEffect, useRef, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import { newSurface } from './地表.ts';
import { makeFrustumTest } from './视锥.ts';
import type { V3 } from '../model/parts.tsx';
import { shadowMesh, pickDirs, backlitDirs, voxelMaterial, faceGroupMesh, type VoxelMesh, type MaterialClass } from './材质.ts';
import { visibleDirs, type SectionMesh } from './网格.ts';
import { buildMeshInPool } from './网格池.ts';
import { pickSections, sectionKey, sectionBounds, type SectionId } from './区段.ts';
import type { VoxelGrid, VoxelSource } from './生成.ts';

// 缓存的总面数上限：超过就丢最久没用的区段（Remotion 每个并发标签页各有一份）
const maxCachedFaces = 6_000_000;
const materialClasses: MaterialClass[] = ['实心', '镂空', '实心树叶', '水', '花草'];

// 投影：和 meshes 共用顶点的只进阴影图的网格（花草、水不投影）
type Entry = { meshes: VoxelMesh[]; shadowMeshes: VoxelMesh[]; plants: VoxelMesh | null; box: number[]; faceCount: number; used: number };
type World = { cache: Map<string, Entry>; group: THREE.Group; clock: number; faceCount: number };
// 按渲染器分：区段网格上传后放掉了 CPU 数组（见 releaseCpuArray），换了 WebGL 上下文（拼段的下一截是新的 Canvas）没法再上传，要重建
const worlds = new WeakMap<THREE.WebGLRenderer, Map<string, World>>();
// 还在后台建区段、这一帧画不全的体素世界：屏幕AO 看到不空就跳过这一次绘制（反正截图前建齐了还要再画一次），省掉一整遍画半截场景的 GPU 活
export const voxelsPending = new Set<object>();
const probe = newSurface();

// 显存里有了就把 CPU 这边的数组放掉（区段网格只上传一次，之后只改画哪几组朝向）
function releaseCpuArray(this: THREE.BufferAttribute) {
  (this as unknown as { array: null }).array = null;
}

// 区段直接用包里解出来的（没有这一块就是空的，见 体素来源.区段）
const emptyEntry = (): Entry => ({ meshes: [], shadowMeshes: [], plants: null, box: [], faceCount: 0, used: 0 });
// 树叶：第 0 级照游戏「高品质」镂空，粗级照 Voxy 画成实心（区段出网格 的第二个参数 q.L >= 1）
const meshToEntry = (sectionMesh: SectionMesh, voxels: Pick<VoxelGrid, '原点' | '格' | 'nz'>, section: SectionId): Entry => {
  const [x0, y0, sizeM] = sectionBounds(section);
  const box = [x0, y0, voxels.原点[2], x0 + sizeM, y0 + sizeM, voxels.原点[2] + voxels.nz * voxels.格];
  const meshes: VoxelMesh[] = [];
  const shadowMeshes: VoxelMesh[] = [];
  let plantMesh: VoxelMesh | null = null;
  for (const materialClass of materialClasses) {
    const mesh = faceGroupMesh(sectionMesh[materialClass], materialClass, voxels.原点, voxels.格, box);
    if (!mesh) continue;
    for (const attr of Object.values(mesh.geometry.attributes)) (attr as THREE.BufferAttribute).onUpload(releaseCpuArray);
    meshes.push(mesh);
    if (materialClass === '花草') plantMesh = mesh;
    if (materialClass !== '花草' && materialClass !== '水') shadowMeshes.push(shadowMesh(mesh));
  }
  return { meshes, shadowMeshes, plants: plantMesh, box, faceCount: sectionMesh.面数, used: 0 };
};

export type VoxelWorldProps = {
  键: string; // 缓存用，不同的世界不能重名
  来源: VoxelSource;
  中心: number[]; // 镜头位置（场景坐标）
  像素: number; // 细一级的一格在画面上还有这么多像素（画面的 CSS 像素）就细分，见 lib/渲染级别.ts
  远: number; // 最远画到多远（米）
  高度?: [number, number]; // 地面和树最低、最高大概在哪（米），判断区段在不在视野里用
  shadowLightDir?: V3; // 地形投影的光向（指向光源）：给了才建投影网格
};
// 投影要多留的距离（米）：仰角 32° 时影长是高度的 1.6 倍，够 180 米高的东西
const shadowMarginM = 300;
// 小网格七组朝向全画、交给 GPU 背面剔除（一次 draw call，顶点多算一倍），大网格在 CPU 上挑朝着镜头 / 背着光的几组（多次 draw call）。
// 体素材质都是单面，两种画法画面和阴影图逐像素一样；大网格全画会卡 GPU，所以面数超过 `drawAllMaxFaces` 的才挑朝向
const drawAllMaxFaces = 3000;
const allDirs = [true, true, true, true, true, true, true];
// 远处的草不画（用户 10-11 定：花草约占一半，接受远处颜色和近处不一致）。
// 只去掉花草这一类里十字模型的斜面（第 6 组，朝向不沿轴的面）：草、花、蕨、树苗、蜘蛛网；积雪层、栅栏、火把、地毯的面都沿轴，照画（整类按距离剔会把远处的雪一起剔掉）。
// 区段离镜头（盒子最近点）超过 `plantFarM` 米就不画；256 米是用户 10-12 比过 64、128、256 后定的（平原上远处去了草，地面台阶纹路会露出来，有草没草有一条分界）。
const plantFarM = 256;
const distToBox = (b: number[], p: number[]) =>
  Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[3]), Math.max(b[1] - p[1], 0, p[1] - b[4]), Math.max(b[2] - p[2], 0, p[2] - b[5]));

export const VoxelWorld: React.FC<VoxelWorldProps> = ({ 键: worldKey, 来源: source, 中心: camPos, 像素: splitPixels, 远: farM, 高度: heightRange = [-30, 140], shadowLightDir }) => {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const size = useThree((st) => st.size);
  const advance = useThree((st) => st.advance);
  const gl = useThree((st) => st.gl);
  // 五类材质第一次渲染就建好，不等建第一块区段时才建：three 按材质编号定不透明物体的先后，地标网格和导入的地形有深度一样的地方，
  // 谁盖谁看先后；用到才建的话，材质编号随文件取到的先后变，同一帧换个时候渲染会差几个像素
  for (const materialClass of materialClasses) voxelMaterial(materialClass);
  const [, forceRedraw] = useState(0);
  const delayHandle = useRef<number | null>(null); // 拦着截图的 delayRender
  const toBuild = useRef<SectionId[]>([]); // 最近一次渲染还没建的，每次渲染整个换掉
  const building = useRef(false); // 后台在建
  let glWorlds = worlds.get(gl);
  if (!glWorlds) worlds.set(gl, (glWorlds = new Map()));
  let maybeWorld = glWorlds.get(worldKey);
  if (!maybeWorld) glWorlds.set(worldKey, (maybeWorld = { cache: new Map(), group: new THREE.Group(), clock: 0, faceCount: 0 }));
  const world = maybeWorld;
  const { cache, group } = world;
  const inView = makeFrustumTest(camera);
  // 区段往背着光的方向扫 投影余量 米以后还碰得到视野，它的影子就可能落进画面
  const lh = shadowLightDir ? Math.hypot(shadowLightDir[0], shadowLightDir[1]) : 0;
  const sx = lh ? (-shadowLightDir![0] / lh) * shadowMarginM : 0;
  const sy = lh ? (-shadowLightDir![1] / lh) * shadowMarginM : 0;
  const backlit = shadowLightDir ? backlitDirs(shadowLightDir) : null;
  const list: SectionId[] = pickSections({
    camPos: camPos,
    pixelAngle: (camera.fov * Math.PI) / 180 / size.height,
    splitPixels: splitPixels,
    farM: farM,
    inView: (x0, y0, x1, y1) => inView(Math.min(x0, x0 + sx) - 8, Math.min(y0, y0 + sy) - 8, heightRange[0], Math.max(x1, x1 + sx) + 8, Math.max(y1, y1 + sy) + 8, heightRange[1]),
    featureTop: (x, y) => {
      source.采样(x, y, probe);
      return probe.z + probe.crown + 5;
    },
  });
  const putEntry = (section: SectionId, entry: Entry) => {
    const k = sectionKey(section);
    if (cache.has(k)) return;
    cache.set(k, entry);
    world.faceCount += entry.faceCount;
  };
  // 没建的区段都交给网格池在后台建（见 网格池.ts）：这一帧先不画、用 delayRender 拦住截图，建齐了重画一次再放行。
  // 导入的地形要先从包里取区段（fetch），没取到的等取齐了再建
  const unbuilt = list.filter((q) => !cache.has(sectionKey(q)));
  if (unbuilt.length) source.prefetch?.(unbuilt);
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
          const prefetching = source.prefetch?.(qs);
          if (prefetching) {
            await prefetching;
            continue;
          }
          // 主线程按 qs 的先后取体素块、交给网格池；建好的按同样的先后建 three 网格、进缓存（three 的物体编号跟着建的先后走，
          // 同一帧深度一样的物体按编号定先后，先后不能变）。同时在算的最多 窗口 块，不然第一帧几千块的体素块一起压在内存里
          const windowSize = 32;
          const inFlight: { q: SectionId; V: Pick<VoxelGrid, '原点' | '格' | 'nz'> | null; m: Promise<SectionMesh> | null }[] = [];
          const collectOne = async () => {
            const x = inFlight.shift()!;
            putEntry(x.q, x.V && x.m ? meshToEntry(await x.m, x.V, x.q) : emptyEntry());
          };
          const t = performance.now();
          for (const section of qs) {
            if (inFlight.length >= windowSize) await collectOne();
            const voxels = source.区段(section);
            inFlight.push({ q: section, V: voxels && { 原点: voxels.原点, 格: voxels.格, nz: voxels.nz }, m: voxels ? buildMeshInPool(voxels, section.L >= 1, source.转交) : null });
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
  // 不用 group.clear()：three 的 remove 对每个子物体 indexOf + splice，一帧上万个网格时是平方级
  for (const child of group.children) (child as { parent: THREE.Object3D | null }).parent = null;
  group.children.length = 0;
  const frameClock = world.clock;
  // 裙边（lib/体素/网格.ts 文件头）：这一侧同一级的邻居这一帧也在画，裙边就藏在它的地面底下，不画
  const drawnKeys = new Set(list.map(sectionKey));
  const skirtFlags = (q: SectionId) => [
    !drawnKeys.has(sectionKey({ L: q.L, i: q.i + 1, j: q.j })),
    !drawnKeys.has(sectionKey({ L: q.L, i: q.i - 1, j: q.j })),
    !drawnKeys.has(sectionKey({ L: q.L, i: q.i, j: q.j + 1 })),
    !drawnKeys.has(sectionKey({ L: q.L, i: q.i, j: q.j - 1 })),
  ];
  for (const section of list) {
    const entry = cache.get(sectionKey(section));
    if (!entry) continue;
    entry.used = ++world.clock;
    const skirts = skirtFlags(section);
    const facingDirs = visibleDirs(entry.box, camPos, skirts);
    const allWithSkirts = [...allDirs, ...skirts]; // 裙边全画时也照邻居挑
    const farPlants = entry.plants !== null && distToBox(entry.box, camPos) > plantFarM;
    for (const mesh of entry.meshes) {
      const dirs = mesh.geometry.drawRange.count / 6 > drawAllMaxFaces ? facingDirs : allWithSkirts;
      pickDirs(mesh, farPlants && mesh === entry.plants ? dirs.map((x, k) => x && k !== 6) : dirs);
      if (mesh.visible) group.add(mesh);
    }
    if (backlit)
      for (const mesh of entry.shadowMeshes) {
        pickDirs(mesh, mesh.geometry.drawRange.count / 6 > drawAllMaxFaces ? backlit : allDirs);
        if (mesh.visible) group.add(mesh);
      }
  }
  // 这一帧用到的块不能被清掉
  if (world.faceCount > maxCachedFaces) {
    const all = [...cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, entry] of all) {
      if (world.faceCount <= maxCachedFaces * 0.8 || entry.used > frameClock) break;
      for (const mesh of [...entry.meshes, ...entry.shadowMeshes]) mesh.geometry.dispose();
      world.faceCount -= entry.faceCount;
      cache.delete(k);
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
  return <primitive object={group} />;
};
