// 方块飞溅：扫帚撞穿墙时，被撞开的那几格方块翻滚着飞出去（进塔向内、出塔向外）。第 1 场（6-1-5、6-1-7b、6-1-8、6-1-8b）在用。
// 碎块就是墙上原来那几格：工具/游戏取材/网格碎块.py 从场景网格取出洞里每一格和各面贴图，镜头里同一片区域用 `BlockMesh` 的 `hide` 藏掉，碎块从原位飞；洞旁方块朝洞的那面游戏没画，由同份数据补上（`lining`），洞壁才有厚度。
// 运动按时间参数算（无状态）：初速度 = 撞击方向×速度 + 从撞击点往外散开 + 随机，重力下落，绕随机轴匀速翻滚；另有几块 0.2～0.45 格的小碎渣。
// 穿墙分两部分（用户 10-02）：被动力钻头矛直接碰到的方块（矛尖连钻头虚影扫过的那一管，各段 编排.ts 给的 `管`）当场崩掉，原地画原版破坏粒子（方块破坏粒子.tsx；钻头再顺着离开矛轴的方向甩一把），矛尖扫到那刻崩；周围没被碰到的才整块飞出。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng, V3 } from '../../engine/model/parts.tsx';
import type { Png } from '../../engine/model/贴图.ts';
import { spawnBlockBreak, BreakParticle, collectBreakParticles, BreakParticleQuads } from './方块破坏粒子.tsx';
import { Particle, particleTexture } from './粒子面片.tsx';

export type DebrisFace = number[]; // [u0, v0, u1, v1, r, g, b]
// cells：盒子里的格子是碎块；ring 的是盒子外扩一圈、留在原地的完整方块（洞壁）。hide：场景网格里要藏掉的范围（每个盒子一个，外扩以后的）。
// lining：旧格式的洞壁面片（只补一张面），新导出的数据没有（整块六面都画，见 工具/游戏取材/网格碎块.py）
export type DebrisData = {
  atlas: number[];
  cells: { box: number; p: number[]; faces: Record<string, DebrisFace>; ring?: boolean; size?: number[]; off?: number[] }[];
  hide?: number[][];
  lining?: { p: number[]; d: string; f: DebrisFace }[];
};

const LIN = (v: number) => Math.pow(v / 255, 2.2);
export const DIRS: Record<string, { n: V3; u: V3; v: V3 }> = {
  // 每个方向的面：法线、贴图 u 方向、贴图 v 方向（v 朝下）
  '+x': { n: [1, 0, 0], u: [0, -1, 0], v: [0, 0, -1] },
  '-x': { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, -1] },
  '+y': { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  '-y': { n: [0, -1, 0], u: [-1, 0, 0], v: [0, 0, -1] },
  '+z': { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
  '-z': { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
};
const OPP: Record<string, string> = { '+x': '-x', '-x': '+x', '+y': '-y', '-y': '+y', '+z': '-z', '-z': '+z' };

type Buf = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] };
export const newBuf = (): Buf => ({ pos: [], nor: [], uv: [], col: [], idx: [] });
// 一张面：中心 c、半边长 h、方向 d、贴图 f。
// 绕向：±z 这两面按 `DIRS` 的 u、v 排出来是顺时针，材质两面都画，从外面看是「背面」，three 把法线翻过来算光，顶面被照成底面那么暗、底面反之。`fix` 时这两面倒过来排。
// 第 1 场几段的画面是按原来的样子定的，不给 `fix` 就照旧；6-4-3 在暗处仰拍底面，发亮很扎眼，传 `fix`
export const face = (buf: Buf, center: number[], half: number, dir: string, faceData: DebrisFace, fix = false) => {
  const { n: normal, u: uAxis, v: vAxis } = DIRS[dir];
  const base = buf.pos.length / 3;
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const [u0, v0, u1, v1] = faceData;
  for (const [cornerU, bb] of corners) {
    buf.pos.push(center[0] + normal[0] * half + uAxis[0] * half * cornerU + vAxis[0] * half * bb, center[1] + normal[1] * half + uAxis[1] * half * cornerU + vAxis[1] * half * bb, center[2] + normal[2] * half + uAxis[2] * half * cornerU + vAxis[2] * half * bb);
    buf.nor.push(...normal);
    buf.uv.push(cornerU < 0 ? u0 : u1, bb < 0 ? v0 : v1);
    buf.col.push(LIN(faceData[4]), LIN(faceData[5]), LIN(faceData[6]));
  }
  if (fix && (dir === '+z' || dir === '-z')) buf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
};
export const toGeo = (buf: Buf) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  geometry.setIndex(buf.idx);
  return geometry;
};

// 一格方块的六个面都要有贴图，缺的面用这一格已有的面补：侧面缺了用别的侧面（先对面），顶 / 底缺了用顶 / 底，再不行用侧面。
// 颜色按游戏的面朝向亮度重算（上 1.0、南北 0.8、东西 0.6、下 0.5）：导出的顶点色带环境光遮蔽，整块拿出来当碎块、洞壁会发黑（用户 10-02 指出雪怪洞窟撞穿洞顶时有深色方块）。
// 染色按贴图（uv 区域）在整份碎块数据里取：这张贴图所有面的颜色 ÷ 朝向亮度，取最亮的（只在一格里取不够：推出来的实心里层六面抄的都是洞顶朝下那面）
const SIDES = ['+x', '-x', '+y', '-y'];
const SHADE: Record<string, number> = { '+z': 1, '-z': 0.5, '+y': 0.8, '-y': 0.8, '+x': 0.6, '-x': 0.6 };
const texKey = (f: DebrisFace) => f.slice(0, 4).join(',');
const tintCache = new WeakMap<DebrisData, Map<string, number[]>>();
export const tintsOf = (data: DebrisData) => {
  let tint = tintCache.get(data);
  if (!tint) {
    tint = new Map();
    for (const cell of data.cells)
      for (const [dir, faceData] of Object.entries(cell.faces)) {
        const t = [faceData[4], faceData[5], faceData[6]].map((v) => Math.min(255, v / SHADE[dir]));
        const old = tint.get(texKey(faceData));
        if (!old || t[0] + t[1] + t[2] > old[0] + old[1] + old[2]) tint.set(texKey(faceData), t);
      }
    tintCache.set(data, tint);
  }
  return tint;
};
export const fullFaces = (faces: Record<string, DebrisFace>, tint: Map<string, number[]>) => {
  const any = Object.values(faces)[0];
  const side = SIDES.map((d) => faces[d]).find(Boolean);
  const cap = faces['+z'] ?? faces['-z'];
  const pick = Object.fromEntries(
    Object.keys(DIRS).map((d) => [d, faces[d] ?? (d === '+z' || d === '-z' ? faces[OPP[d]] ?? side : faces[OPP[d]] ?? side ?? cap) ?? any]),
  ) as Record<string, DebrisFace>;
  return Object.fromEntries(
    Object.entries(pick).map(([dir, faceData]) => {
      const t = tint.get(texKey(faceData)) ?? [faceData[4], faceData[5], faceData[6]];
      return [dir, [faceData[0], faceData[1], faceData[2], faceData[3], ...t.map((v) => Math.min(255, v * SHADE[dir]))]];
    }),
  ) as Record<string, DebrisFace>;
};

const texCache = new WeakMap<Png, THREE.DataTexture>();
export const atlasTex = (atlas: Png) => {
  let t = texCache.get(atlas);
  if (!t) {
    t = new THREE.DataTexture(atlas.px, atlas.w, atlas.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    texCache.set(atlas, t);
  }
  return t;
};

// 一次撞击（一个盒子）的参数：sec = 撞开以后经过的秒数（< 0 墙还完整）；dir = 撞击方向；origin = 撞击中心；speed = 沿撞击方向的速度（格/秒）；spread = 往外散开的速度；
// stagger = 离撞击中心远的方块晚多少秒才碎；chips = 小碎渣的块数
// hidden：场景网格里这片已经藏掉但还没撞到（sec < 0），碎块先原样画在原位补上；skip：只藏不出碎块（看不到的隧道）
export type DebrisBurst = {
  sec: number;
  dir: V3;
  origin: V3;
  speed: number;
  spread: number;
  seed: number;
  gravity?: number;
  stagger?: number;
  chips?: number;
  spin?: number;
  hidden?: boolean;
  skip?: boolean;
  管?: 矛管; // 矛尖（连钻头虚影）扫过的那一管：管里的方块崩成粒子，不飞
  地面?: number; // 落地的高度（场景 z）：给了就让碎块、碎渣掉到这个高度停住；不给就一直往下掉
};
// 从 z0 以竖直速度 vz、重力 g 往下掉，底面（离中心 half）碰到 `地面` 的时刻；碰不到（地面在上面）就是 Infinity
const landingSec = (z0: number, vz: number, gravity: number, half: number, groundZ?: number) => {
  if (groundZ === undefined) return Infinity;
  const dropHeight = z0 - half - groundZ;
  if (dropHeight < 0 || gravity <= 0) return Infinity;
  return (vz + Math.sqrt(vz * vz + 2 * gravity * dropHeight)) / gravity;
};
// 矛管：点 = 矛尖路线上的点 [x, y, z, 相对这次撞击的物理秒数]，半径 = 管的半径（格）；粒子倍速：粒子时钟比物理时钟快多少（慢放的近景按特效倍速）；
// 密度：每格每轴几份粒子（原版 4）。各段 编排.ts 里做成常量（同一个对象），哪些格子在管里只算一次
export type 矛管 = { 点: number[][]; 半径: number; particleClockScale: number; 密度?: number };
const open = (B?: DebrisBurst) => !!B && (B.sec >= 0 || !!B.hidden);

// 一格（中心、尺寸）离矛尖路线最近的那一点：距离、矛尖到那一点的时刻（相对撞击）、位置和路线方向。路线按 0.1 格细分。一镜到底/声音.tsx 也用它定每一格破坏声什么时候响
export const closestOnTube = (center: number[], size: number[], tube: 矛管) => {
  let best = Infinity;
  let bt = 0;
  let bq: number[] = center;
  let bdir: number[] = [0, 1, 0];
  const dist = (point: number[]) => {
    const gaps = [0, 1, 2].map((k) => Math.max(0, Math.abs(point[k] - center[k]) - size[k] / 2));
    return Math.hypot(gaps[0], gaps[1], gaps[2]);
  };
  for (let i = 0; i + 1 < tube.点.length; i++) {
    const segStart = tube.点[i];
    const segEnd = tube.点[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(segEnd[0] - segStart[0], segEnd[1] - segStart[1], segEnd[2] - segStart[2]) / 0.1));
    for (let k = 0; k <= steps; k++) {
      const frac = k / steps;
      const point = [segStart[0] + (segEnd[0] - segStart[0]) * frac, segStart[1] + (segEnd[1] - segStart[1]) * frac, segStart[2] + (segEnd[2] - segStart[2]) * frac, segStart[3] + (segEnd[3] - segStart[3]) * frac];
      const distance = dist(point);
      if (distance < best) {
        best = distance;
        bt = point[3];
        bq = point;
        const segLen = Math.hypot(segEnd[0] - segStart[0], segEnd[1] - segStart[1], segEnd[2] - segStart[2]) || 1;
        bdir = [(segEnd[0] - segStart[0]) / segLen, (segEnd[1] - segStart[1]) / segLen, (segEnd[2] - segStart[2]) / segLen];
      }
    }
  }
  return { d: best, t: bt, q: bq, dir: bdir };
};
// 高速旋转的钻头把扫到的方块往外甩：粒子在原版速度上再加一份离开矛轴的速度（0.15～0.35 格/刻）
const drillFling = (q: number[], dir: number[]) => (p0: V3, rand: () => number): V3 => {
  const rel = [p0[0] - q[0], p0[1] - q[1], p0[2] - q[2]];
  const axial = rel[0] * dir[0] + rel[1] * dir[1] + rel[2] * dir[2];
  let radial = [rel[0] - dir[0] * axial, rel[1] - dir[1] * axial, rel[2] - dir[2] * axial];
  let radialLen = Math.hypot(radial[0], radial[1], radial[2]);
  if (radialLen < 1e-3) {
    radial = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
    radialLen = Math.hypot(radial[0], radial[1], radial[2]) || 1;
  }
  const scale = (0.15 + 0.2 * rand()) / radialLen;
  return [radial[0] * scale, radial[1] * scale, radial[2] * scale];
};
type TubeCells = Map<number, { t: number; ps: BreakParticle[] }>;
const tubeCache = new WeakMap<DebrisData, WeakMap<矛管, TubeCells>>();

const matCache = new WeakMap<THREE.Texture, THREE.MeshStandardMaterial>();
// 两面都画（树叶这种镂空方块从窟窿里看得到里面的面）；打底的自发光也乘上顶点色（染色），不然草、树叶这类靠顶点色染绿的贴图会发灰（同 lib/方块网格.tsx）
export const debrisMat = (tex: THREE.Texture) => {
  let material = matCache.get(tex);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.95, alphaTest: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35, side: THREE.DoubleSide });
    material.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
    };
    matCache.set(tex, material);
  }
  return material;
};

// 离镜头太近的飞散碎块淡出（一镜到底近景：镜头和扫帚一样快，会追上往前飞的碎块、从碎块云中穿过，整屏一块灰石砖）。
// 镜头：镜头在这份数据本地坐标里的位置；碎块（外接球）离镜头 `近` 米内不画，`近`～`远` 之间按距离淡出。只管已飞起来的碎块和小碎渣，
// 还在原位的是墙，镜头离墙多远由编排和孔道管，淡掉会在墙上开窟窿。矛管里崩出的破坏粒子离镜头 1 米内不画（零点一几米的方片贴镜头前就是半个画面）。
export type NearHide = { 镜头: number[]; 近: number; 远: number };
// 一镜到底近景用的距离（米，碎块外接球的面到镜头）：0.6 米以内不画，0.6～1.6 米淡出
export const debrisNearHide = { 近: 0.6, 远: 1.6 };
const fadeCache = new WeakMap<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial[]>();
const fadeSteps = 8;
const fadeMat = (baseMat: THREE.MeshStandardMaterial, alpha: number) => {
  let list = fadeCache.get(baseMat);
  if (!list) {
    list = Array.from({ length: fadeSteps }, (_, k) => {
      const faded = baseMat.clone();
      faded.onBeforeCompile = baseMat.onBeforeCompile;
      faded.transparent = true;
      faded.depthWrite = false;
      faded.opacity = (k + 0.5) / fadeSteps;
      faded.alphaTest = baseMat.alphaTest * faded.opacity; // 镂空贴图的透明像素照样丢（alphaTest 比的是 贴图 alpha × opacity）
      return faded;
    });
    fadeCache.set(baseMat, list);
  }
  return list[Math.min(fadeSteps - 1, Math.floor(alpha * fadeSteps))];
};
export const BlockDebris: React.FC<{ data: DebrisData; atlas: Png; bursts: DebrisBurst[]; fixWinding?: boolean; nearHide?: NearHide }> = ({ data, atlas, bursts, fixWinding = false, nearHide }) => {
  const tex = atlasTex(atlas);
  const mat = debrisMat(tex);
  const visibleFrac = (pos: number[], radius: number) => {
    if (!nearHide) return 1;
    const camPos = nearHide.镜头;
    const dist = Math.hypot(pos[0] - camPos[0], pos[1] - camPos[1], pos[2] - camPos[2]) - radius;
    const frac = Math.min(1, Math.max(0, (dist - nearHide.近) / (nearHide.远 - nearHide.近)));
    return frac * frac * (3 - 2 * frac);
  };
  // 外圈（`ring`）：每个盒子合成一个几何，原地画（往里收一丝，和场景网格里没藏掉的同一个面重合时让网格的面在前面）
  const rings = useMemo(() => {
    const per = bursts.map(() => newBuf());
    for (const cell of data.cells) {
      if (!cell.ring || !per[cell.box]) continue;
      const ff = fullFaces(cell.faces, tintsOf(data));
      const sz = cell.size ?? [1, 1, 1];
      const offset = cell.off ?? [0, 0, 0];
      const buf = per[cell.box];
      for (const dir of Object.keys(DIRS)) {
        const start = buf.pos.length;
        face(buf, [0, 0, 0], 0.4995, dir, ff[dir], fixWinding);
        for (let k = start; k < buf.pos.length; k += 3) {
          buf.pos[k] = buf.pos[k] * sz[0] + cell.p[0] + offset[0];
          buf.pos[k + 1] = buf.pos[k + 1] * sz[1] + cell.p[1] + offset[1];
          buf.pos[k + 2] = buf.pos[k + 2] * sz[2] + cell.p[2] + offset[2];
        }
      }
    }
    return per.map(toGeo);
  }, [data, bursts.length, fixWinding]);
  const pieces = useMemo(
    () =>
      data.cells.filter((c) => !c.ring).map((cell) => {
        const buf = newBuf();
        const ff = fullFaces(cell.faces, tintsOf(data));
        for (const dir of Object.keys(DIRS)) face(buf, [0, 0, 0], 0.5, dir, ff[dir], fixWinding);
        const geometry = toGeo(buf);
        // 不是整格的东西（画是 1/16 厚的板）：按实际大小缩
        if (cell.size) geometry.scale(cell.size[0], cell.size[1], cell.size[2]);
        return { cell, geo: geometry, faces: ff };
      }),
    [data, fixWinding],
  );
  const lining = useMemo(() => {
    const per = bursts.map(() => newBuf());
    for (const liningFace of data.lining ?? []) {
      let best = 0;
      let bd = Infinity;
      data.cells.forEach((cell) => {
        const dist = Math.hypot(cell.p[0] - liningFace.p[0], cell.p[1] - liningFace.p[1], cell.p[2] - liningFace.p[2]);
        if (dist < bd) {
          bd = dist;
          best = cell.box;
        }
      });
      const normal = DIRS[liningFace.d].n;
      // 面中心往背面退半格当方块中心，`face()` 会把面放回到中心 + 法线 × 0.5 处
      if (per[best]) face(per[best], [liningFace.p[0] - normal[0] * 0.5, liningFace.p[1] - normal[1] * 0.5, liningFace.p[2] - normal[2] * 0.5], 0.5, liningFace.d, liningFace.f, fixWinding);
    }
    return per.map(toGeo);
  }, [data, bursts.length, fixWinding]);
  const tubes = bursts.map((burst, bi) => {
    if (!burst.管 || burst.skip) return null;
    let byTube = tubeCache.get(data);
    if (!byTube) tubeCache.set(data, (byTube = new WeakMap()));
    let tubeCells = byTube.get(burst.管);
    if (!tubeCells) {
      tubeCells = new Map();
      const tint = tintsOf(data);
      pieces.forEach((pc, i) => {
        if (pc.cell.box !== bi) return;
        const size = pc.cell.size ?? [1, 1, 1];
        const offset = pc.cell.off ?? [0, 0, 0];
        const center = [pc.cell.p[0] + offset[0], pc.cell.p[1] + offset[1], pc.cell.p[2] + offset[2]];
        const nearest = closestOnTube(center, size, burst.管!);
        if (nearest.d > burst.管!.半径) return;
        // 粒子贴图取这一格的侧面；颜色原版 0.6，再乘这张贴图的染色（树叶、草）
        const sideFace = pc.faces['+x'];
        const t = tint.get(texKey(sideFace)) ?? [255, 255, 255];
        const col = t.map((v) => (0.6 * Math.min(255, v)) / 255) as [number, number, number];
        tubeCells!.set(i, { t: nearest.t, ps: spawnBlockBreak(center as V3, size as V3, [sideFace[0], sideFace[1], sideFace[2], sideFace[3]], col, burst.seed * 97 + i, burst.管!.密度 ?? 4, drillFling(nearest.q, nearest.dir)) });
      });
      byTube.set(burst.管, tubeCells);
    }
    return tubeCells;
  });
  const chipGeos = useMemo(() => {
    const out: { geo: THREE.BufferGeometry; size: number; from: number }[] = [];
    bursts.forEach((burst, bi) => {
      const rand = rng(burst.seed * 31 + 7);
      const mine = pieces.filter((p, i) => p.cell.box === bi && !tubes[bi]?.has(i));
      if (!mine.length) return;
      for (let k = 0; k < (burst.chips ?? 0); k++) {
        const src = mine[Math.floor(rand() * mine.length)];
        const size = 0.2 + rand() * 0.25;
        const buf = newBuf();
        for (const dir of Object.keys(DIRS)) {
          const faceData = src.faces[dir];
          const du = (faceData[2] - faceData[0]) * size;
          const dv = (faceData[3] - faceData[1]) * size;
          face(buf, [0, 0, 0], size / 2, dir, [faceData[0], faceData[1], faceData[0] + du, faceData[1] + dv, faceData[4], faceData[5], faceData[6]], fixWinding);
        }
        out.push({ geo: toGeo(buf), size, from: pieces.indexOf(src) });
      }
    });
    return out;
  }, [pieces, bursts, fixWinding]);

  const nodes: React.ReactNode[] = [];
  const particles: Particle[] = [];
  pieces.forEach((pc, i) => {
    const burst = bursts[pc.cell.box];
    if (!burst || burst.skip || !open(burst)) return;
    const tc = tubes[pc.cell.box]?.get(i);
    if (tc) {
      const sec = burst.sec - tc.t;
      if (sec < 0) {
        const offset = pc.cell.off ?? [0, 0, 0];
        nodes.push(<mesh key={`c${i}`} geometry={pc.geo} material={mat} position={[pc.cell.p[0] + offset[0], pc.cell.p[1] + offset[1], pc.cell.p[2] + offset[2]]} castShadow receiveShadow />);
      } else collectBreakParticles(tc.ps, sec * burst.管!.particleClockScale, particles);
      return;
    }
    const rand = rng(burst.seed * 1000 + i * 17 + 3);
    const offset = pc.cell.off ?? [0, 0, 0];
    const p0 = [pc.cell.p[0] + offset[0], pc.cell.p[1] + offset[1], pc.cell.p[2] + offset[2]];
    const rel = [p0[0] - burst.origin[0], p0[1] - burst.origin[1], p0[2] - burst.origin[2]];
    const along = rel[0] * burst.dir[0] + rel[1] * burst.dir[1] + rel[2] * burst.dir[2];
    const side = [rel[0] - burst.dir[0] * along, rel[1] - burst.dir[1] * along, rel[2] - burst.dir[2] * along];
    const sl = Math.hypot(...side) || 1;
    const t = burst.sec - (burst.stagger ?? 0) * sl;
    if (t < 0) {
      nodes.push(<mesh key={`c${i}`} geometry={pc.geo} material={mat} position={p0 as V3} castShadow receiveShadow />);
      return;
    }
    const sp = burst.speed * (0.45 + 0.65 * rand());
    const out = burst.spread * (0.4 + 0.9 * rand());
    const vel = [0, 1, 2].map((k) => burst.dir[k] * sp + (side[k] / sl) * out + (rand() - 0.5) * burst.spread * 0.5);
    vel[2] += burst.spread * 0.3 * rand();
    const gravity = burst.gravity ?? 16;
    const tt = Math.min(t, landingSec(p0[2], vel[2], gravity, 0.5, burst.地面));
    const pos: V3 = [p0[0] + vel[0] * tt, p0[1] + vel[1] * tt, p0[2] + vel[2] * tt - 0.5 * gravity * tt * tt];
    const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const spinRate = (burst.spin ?? 6) * (0.5 + rand());
    const quat = new THREE.Quaternion().setFromAxisAngle(axis, spinRate * tt);
    const alpha = visibleFrac(pos, (Math.max(...(pc.cell.size ?? [1, 1, 1])) / 2) * Math.sqrt(3));
    if (alpha <= 0) return;
    nodes.push(<mesh key={`c${i}`} geometry={pc.geo} material={alpha < 1 ? fadeMat(mat, alpha) : mat} position={pos} quaternion={quat} castShadow={alpha >= 1} receiveShadow />);
  });
  chipGeos.forEach((ch, k) => {
    const pc = pieces[ch.from];
    const burst = bursts[pc.cell.box];
    if (!burst || burst.skip || burst.sec < 0) return;
    const rand = rng(burst.seed * 7000 + k * 13 + 1);
    const t = burst.sec;
    const sp = burst.speed * (0.6 + 0.8 * rand());
    const vel = [0, 1, 2].map((kk) => burst.dir[kk] * sp + (rand() - 0.5) * burst.spread * 2.2);
    vel[2] += burst.spread * 0.5 * rand();
    const gravity = burst.gravity ?? 16;
    const p0 = [pc.cell.p[0] + (rand() - 0.5) * 0.8, pc.cell.p[1] + (rand() - 0.5) * 0.8, pc.cell.p[2] + (rand() - 0.5) * 0.8];
    const tt = Math.min(t, landingSec(p0[2], vel[2], gravity, ch.size / 2, burst.地面));
    const pos: V3 = [p0[0] + vel[0] * tt, p0[1] + vel[1] * tt, p0[2] + vel[2] * tt - 0.5 * gravity * tt * tt];
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), (burst.spin ?? 6) * 1.6 * (0.5 + rand()) * tt);
    const alpha = visibleFrac(pos, (ch.size / 2) * Math.sqrt(3));
    if (alpha <= 0) return;
    nodes.push(<mesh key={`k${k}`} geometry={ch.geo} material={alpha < 1 ? fadeMat(mat, alpha) : mat} position={pos} quaternion={quat} castShadow={alpha >= 1} />);
  });
  return (
    <>
      {nodes}
      {particles.length > 0 && <BreakParticleQuads tex={particleTexture(atlas.px, atlas.w, atlas.h, atlas)} items={nearHide ? particles.filter((q) => visibleFrac(q.p, q.half * 1.5 + 0.4) > 0) : particles} />}
      {lining.map((g, i) => (open(bursts[i]) ? <mesh key={`l${i}`} geometry={g} material={mat} receiveShadow castShadow /> : null))}
      {rings.map((g, i) => (open(bursts[i]) ? <mesh key={`r${i}`} geometry={g} material={mat} receiveShadow castShadow /> : null))}
    </>
  );
};
