// 下界魔杖细做：本片自己做的下界魔杖，三个候选等用户挑（用户 11-10：原模型「没有什么辨识度」；上一版像素方盒的三个候选「像素颗粒感很重」，
// 「我这个应该是偏向更真实、更细腻的风格」，rules/通用.toml「自制模型贴图风格」）。照 库/物品/拔刀剑.tsx 的路子：全部是顺滑的真几何
// （车削、扫掠、管、环），纹样是真几何不是贴图，金属和黑亮的料靠杖自带的反射环境出高光（物品/杖材质.ts），芯自发光、外面一团只在杖头的柔光晕。
// 三款都留着 Goety 原版 goety:nether_staff（物品/下界魔杖.tsx）的母题：黑杆、杖头的笼、发亮的黄橙芯、尖刺。
//   甲 忠实细做：原版的结构按真器物重做。黑曜石车削的细杆（铁箍、缠丝握把），铁托上四根弯的圆铁条和两道箍围成笼，里面悬一颗熔融的晶体，四角各一片外张的锻刃
//   乙 下界器物：黑杆镶金。握把是金丝菱格，上段有发光的熔岩裂纹，颈上两道金箍夹一圈烈焰柱；黑曜杯上六爪的金冠围着一颗熔核
//   丙 权杖：最长。金球节上托一弯朝上开口的黑曜新月（金尖、金线、外沿带刺），月心悬一颗晶体，前后各一只金爪
// 杖空间：单位是模型像素（16 像素 = 1 格），杖身的轴是 Y 轴，杖尾在原点、杖头朝 +Y。
// 接口：<细做魔杖 款="甲" />      单位格的杖空间（杖尾在原点），核对图用
//       <手持细做魔杖 款="甲" />  挂在手部定位骨上，握点落在原版握点的位置（同 物品/下界魔杖.tsx 的 手持下界魔杖）
//       细做杖款('甲')            交给 角色/娘化亚波伦.tsx 的 杖 属性：她拿这根，持杖位姿 也按这根算
import { useMemo, type FC, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heldStaffMatrix } from './下界魔杖.tsx';
import { haloMaterial, buildStaffMaterials, crystalMaterial, moltenGlowMaterial, moltenCoreMaterial, type MaterialName } from './杖材质.ts';

type P2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
const radPerDeg = Math.PI / 180;

// ── 颜色 ──
const wandColors = {
  obsidian: '#131217',
  iron: '#5c5b64',
  darkIron: '#403f47',
  gold: '#c99a50',
  熔: '#ff7c16', // 熔岩纹
  flame: '#ff8f1c', // 烈焰柱
};

// ── 几何工具 ──
/**
 * 车削：轮廓 [半径, y] 从下到上描外表面，绕 Y 轴转一圈。相邻两段的夹角小于 硬角 的地方法线取平均（曲面），大于的断开（棱）。
 * 不用 three 的 LatheGeometry：它的法线一律平均，一段直筒接一个倒角时整段直筒的明暗会被带歪
 */
export const lathe = (profile: readonly P2[], segments = 96, hardAngle = 32): THREE.BufferGeometry => {
  const pts = profile.filter((p, i) => i === 0 || Math.hypot(p[0] - profile[i - 1]![0], p[1] - profile[i - 1]![1]) > 1e-6);
  const normals = pts.slice(1).map((p, i) => {
    const [dr, dy] = [p[0] - pts[i]![0], p[1] - pts[i]![1]];
    const l = Math.hypot(dr, dy);
    return [dy / l, -dr / l] as const;
  });
  const smoothNormal = (a: P2, b: P2 | undefined): P2 => {
    if (!b || a[0] * b[0] + a[1] * b[1] < Math.cos(hardAngle * radPerDeg)) return a;
    const l = Math.hypot(a[0] + b[0], a[1] + b[1]);
    return [(a[0] + b[0]) / l, (a[1] + b[1]) / l];
  };
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < normals.length; i++) {
    const [p0, p1] = [pts[i]!, pts[i + 1]!];
    const [n0, n1] = [smoothNormal(normals[i]!, normals[i - 1]), smoothNormal(normals[i]!, normals[i + 1])];
    const bottomIndex = pos.length / 3;
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      pos.push(p0[0] * c, p0[1], p0[0] * s, p1[0] * c, p1[1], p1[0] * s);
      nor.push(n0[0] * c, n0[1], n0[0] * s, n1[0] * c, n1[1], n1[0] * s);
    }
    for (let j = 0; j < segments; j++) {
      const a = bottomIndex + 2 * j;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
};

/** 过这些点的顺滑曲线，取 n 段 */
const spline = (pts: readonly P2[], n: number): P2[] =>
  new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal').getPoints(n).map((p) => [p.x, p.y] as const);
/** 圆弧上的点：圆心 (cx, cy)、半径 r，从 a0 度到 a1 度（0 度朝 +x，90 度朝 +y） */
const arcPoints = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): P2[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (a0 + ((a1 - a0) * i) / n) * radPerDeg;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
/** 杆上的一道鼓箍（半个椭圆的截面）：贴着半径 r0 的杆，鼓到 r1，高 h，正中在 y */
const bulgeHoop = (y: number, r0: number, r1: number, h: number) => lathe(Array.from({ length: 13 }, (_, i) => [r0 + (r1 - r0) * Math.cos((-90 + 15 * i) * radPerDeg), y + (h / 2) * Math.sin((-90 + 15 * i) * radPerDeg)] as const));
/** 杆上的一道线脚箍：上下各一道圆线，中间一条微鼓的带（比圆线低一点） */
const flatHoop = (y0: number, y1: number, r0: number, r1: number) => {
  const q = Math.min(0.14, (y1 - y0) / 4);
  const roundEdge = (y: number): P2[] => Array.from({ length: 9 }, (_, i) => [r1 - q + q * Math.cos((-90 + 22.5 * i) * radPerDeg), y + q * Math.sin((-90 + 22.5 * i) * radPerDeg)] as const);
  const bandPoints = Array.from({ length: 7 }, (_, i): P2 => [r1 - 0.07 + 0.035 * Math.sin((i / 6) * Math.PI), y0 + 2 * q + ((y1 - y0 - 4 * q) * i) / 6]);
  return lathe([[r0, y0], ...roundEdge(y0 + q), ...bandPoints, ...roundEdge(y1 - q), [r0, y1]], 96, 50);
};
/** 直杆的轮廓：半径 r，y0～y1，在 槽 的各个高度刻一道 V 形细槽（深 0.06、宽 0.14） */
const rodProfile = (r: number, y0: number, y1: number, slots: readonly number[] = []): P2[] => [
  [r, y0],
  ...[...slots].sort((a, b) => a - b).flatMap((y): P2[] => [[r, y - 0.07], [r - 0.06, y], [r, y + 0.07]]),
  [r, y1],
];

/** 梭形：两段弧对扣，u 方向两头是刃口（顶点 0 和 n 是硬点），两面微鼓。a 半宽、b 半厚 */
const spindle = (a: number, b: number, n = 7): P2[] => {
  const upperArc = Array.from({ length: n + 1 }, (_, i) => { const u = a * Math.cos((i / n) * Math.PI); return [u, b * (1 - (u / a) ** 2)] as const; });
  return [...upperArc, ...upperArc.slice(1, n).reverse().map(([u, w]) => [u, -w] as const)];
};
const spindleHard = (n = 7) => [0, n];
const roundSection = (r: number, n = 14): P2[] => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * Math.PI * 2), r * Math.sin((i / n) * Math.PI * 2)] as const);
/**
 * 在一个过杖轴的平面里扫掠：路 是这个平面里的中心线 [x, y]（x 朝外、y 朝上），截面(t) 给沿线 t（0～1，按弧长）处的截面多边形 [u, w]
 * （u 沿平面内垂直于中心线的方向、朝外为正，w 垂直于平面）。硬点 = 截面上哪几个顶点是棱（法线在那儿断开，刃口、脊线）；别处整圈顺滑
 */
export const sweepSection = (curve: readonly P2[], section: (t: number) => readonly P2[], hardPoints: readonly number[] = []): THREE.BufferGeometry => {
  const m = curve.length;
  const cumLengths = [0];
  for (let i = 1; i < m; i++) cumLengths.push(cumLengths[i - 1]! + Math.hypot(curve[i]![0] - curve[i - 1]![0], curve[i]![1] - curve[i - 1]![1]));
  const rings = curve.map(([x, y], i) => {
    const [a, b] = [curve[Math.max(0, i - 1)]!, curve[Math.min(m - 1, i + 1)]!];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [nx, ny] = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
    return section(cumLengths[i]! / cumLengths[m - 1]!).map(([u, w]): Vec3 => [x + u * nx, y + u * ny, w]);
  });
  const k = rings[0]!.length;
  // 绕向：拿头一个不退化的三角形和「中心线 → 三角形」的方向比
  let sign = 1;
  search: for (let i = 0; i < m - 1; i++)
    for (let e = 0; e < k; e++) {
      const [A, B, C] = [rings[i]![e]!, rings[i + 1]![e]!, rings[i]![(e + 1) % k]!].map((p) => new THREE.Vector3(...p));
      const n = B!.clone().sub(A!).cross(C!.clone().sub(A!));
      if (n.length() < 1e-9) continue;
      const edgeCenter = new THREE.Vector3((curve[i]![0] + curve[i + 1]![0]) / 2, (curve[i]![1] + curve[i + 1]![1]) / 2, 0);
      const outerFacing = A!.clone().add(B!).add(C!).divideScalar(3).sub(edgeCenter);
      if (Math.abs(n.dot(outerFacing)) < 1e-9) continue;
      sign = n.dot(outerFacing) > 0 ? 1 : -1;
      break search;
    }
  // 一条带：截面上连着的几个顶点（闭 = 整圈首尾相接），带内顶点共用、法线顺滑
  const band = (columns: readonly number[], closed: boolean) => {
    const colCount = columns.length;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < m; i++) for (const e of columns) pos.push(...rings[i]![e]!);
    for (let i = 0; i < m - 1; i++)
      for (let e = 0; e < (closed ? colCount : colCount - 1); e++) {
        const [a, b, c, d] = [i * colCount + e, i * colCount + ((e + 1) % colCount), (i + 1) * colCount + e, (i + 1) * colCount + ((e + 1) % colCount)];
        if (sign > 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g.toNonIndexed();
  };
  const hardSorted = [...new Set(hardPoints)].sort((a, b) => a - b);
  if (!hardSorted.length) return band(Array.from({ length: k }, (_, e) => e), true);
  return mergeGeometries(
    hardSorted.map((startPos, i) => {
      const stopVertex = hardSorted[(i + 1) % hardSorted.length]!;
      const columns = [startPos];
      for (let e = (startPos + 1) % k; ; e = (e + 1) % k) {
        columns.push(e);
        if (e === stopVertex) break;
      }
      return band(columns, false);
    }),
  )!;
};

/** 空间里一条线上的圆管（缠丝、熔岩纹、金线） */
const tubeGeometry = (points: readonly Vec3[], r: number, radialSegments = 8) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal'), Math.max(8, points.length * 2), r, radialSegments, false);
/** 绕着半径 r 的杆的螺旋线：y0～y1 转 圈 圈，起始角 相位（度） */
const helix = (r: number, y0: number, y1: number, turns: number, phaseDeg = 0, pointsPerTurn = 20): Vec3[] => {
  const n = Math.max(2, Math.round(Math.abs(turns) * pointsPerTurn));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = phaseDeg * radPerDeg + (i / n) * turns * Math.PI * 2;
    return [r * Math.cos(a), y0 + ((y1 - y0) * i) / n, r * Math.sin(a)] as const;
  });
};
/** 水平的一道环（圆截面） */
const ring = (y: number, R: number, r: number) => new THREE.TorusGeometry(R, r, 14, 96).rotateX(Math.PI / 2).translate(0, y, 0);
/** 一条 面内 的路在高度 y 处的半径（线性插值） */
const pathRadiusAt = (curve: readonly P2[], y: number) => {
  for (let i = 1; i < curve.length; i++) {
    const [a, b] = [curve[i - 1]!, curve[i]!];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  }
  return curve[curve.length - 1]![0];
};
/** 绕杖轴复制 n 份，头一份转 相位 度 */
const rotateCopies = (g: THREE.BufferGeometry, n: number, phaseDeg = 0) => Array.from({ length: n }, (_, i) => g.clone().rotateY((phaseDeg + (360 * i) / n) * radPerDeg));

/**
 * 晶体：上下两个尖、腰上一圈错开的刻面（反棱柱），每面是平的。R 腰的半径，上、下 是尖到中心的高，腰 是腰的半高，边 是腰一圈几条边。
 * 带重心坐标 bary（晶体材质画棱上的亮线）
 */
export const crystalGeometry = (R: number, topHeight: number, lowerHeight: number, waistY: number, sides = 6): THREE.BufferGeometry => {
  const bottomRing = Array.from({ length: sides }, (_, i): Vec3 => [R * Math.cos((i / sides) * Math.PI * 2), -waistY, R * Math.sin((i / sides) * Math.PI * 2)]);
  const topRing = Array.from({ length: sides }, (_, i): Vec3 => [0.86 * R * Math.cos(((i + 0.5) / sides) * Math.PI * 2), waistY, 0.86 * R * Math.sin(((i + 0.5) / sides) * Math.PI * 2)]);
  const faces: Vec3[][] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push([[0, -lowerHeight, 0], bottomRing[i]!, bottomRing[j]!], [bottomRing[i]!, topRing[i]!, bottomRing[j]!], [bottomRing[j]!, topRing[i]!, topRing[j]!], [topRing[i]!, [0, topHeight, 0], topRing[j]!]);
  }
  const pos: number[] = [];
  const bary: number[] = [];
  for (const [a, b, c] of faces) {
    // 朝外：法线和面心同向
    const [A, B, C] = [new THREE.Vector3(...a!), new THREE.Vector3(...b!), new THREE.Vector3(...c!)];
    const outerFacing = B.clone().sub(A).cross(C.clone().sub(A)).dot(A.clone().add(B).add(C)) > 0;
    pos.push(...a!, ...(outerFacing ? b! : c!), ...(outerFacing ? c! : b!));
    bary.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('bary', new THREE.Float32BufferAttribute(bary, 3));
  g.computeVertexNormals();
  return g;
};

// ── 零件箱：同一种料的零件并成一个网格，颜色走顶点色 ──
type GlowMaterialName = '熔光';
class GeoBin {
  private geometriesByMaterial = new Map<MaterialName | GlowMaterialName, THREE.BufferGeometry[]>();
  加(material: MaterialName | GlowMaterialName, color: string, ...geometries: THREE.BufferGeometry[]) {
    const c = new THREE.Color(color);
    for (const g0 of geometries) {
      const g = g0.index ? g0.toNonIndexed() : g0;
      g.deleteAttribute('uv');
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const colList = this.geometriesByMaterial.get(material) ?? [];
      colList.push(g);
      this.geometriesByMaterial.set(material, colList);
    }
    return this;
  }
  出() {
    return [...this.geometriesByMaterial].map(([material, gs]) => ({ material, geometry: mergeGeometries(gs)! }));
  }
}

type CorePart = { 类: '晶体' | '熔核'; geometry: THREE.BufferGeometry; 位: Vec3 };
type VariantDef = {
  名: string;
  /** 全长（像素）：杖尾 y = 0 到最高处 */
  fullLength: number;
  /** 握点的高度 */
  grip: number;
  /** 芯的中心高度 */
  coreHeight: number;
  /** 光晕半径（像素）、亮度 */
  halo: readonly [number, number];
  /** 拿在手上时绕杖轴转几度（不给 = 0）：丙的新月是扁的，转 45 度后斜举、伸臂指出去时月面都大致朝镜头（对着核对段的静帧取的） */
  selfRotation?: number;
  /** 芯照到杖自己身上的光有多强 */
  coreGlow: number;
  build: () => { bin: GeoBin; core: CorePart };
};

// ── 甲 忠实细做 ──
const buildVariantFirst = () => {
  const k = new GeoBin();
  const R = 0.6;
  // 尾锥
  k.加('铁', wandColors.iron, lathe([[0.001, 0], [0.2, 0.5], [0.36, 1.2], [0.5, 1.8], [0.8, 2.0], [0.88, 2.2], [0.8, 2.4], [0.66, 2.55], [0.62, 2.9]]));
  // 杆：黑曜石，刻几道细槽
  k.加('黑曜', wandColors.obsidian, lathe(rodProfile(R, 2.6, 30, [4.6, 4.9, 6.9, 23.6, 23.9, 24.2, 28.2, 28.5])));
  // 两个节：一对鼓箍
  for (const y of [9.2, 26.4]) k.加('铁', wandColors.iron, bulgeHoop(y - 0.27, R - 0.03, 0.84, 0.44), bulgeHoop(y + 0.27, R - 0.03, 0.84, 0.44), bulgeHoop(y, R - 0.03, 0.7, 0.2));
  // 握把：两道平箍之间缠一路细铁丝
  k.加('铁', wandColors.iron, flatHoop(12.1, 12.6, R - 0.03, 0.86), flatHoop(21.4, 21.9, R - 0.03, 0.86));
  k.加('铁', wandColors.darkIron, tubeGeometry(helix(R + 0.04, 12.55, 21.45, 36, 0, 16), 0.076, 8));
  // 托：收腰的铁座，往上张开成一圈唇
  k.加('铁', wandColors.iron, lathe([[R - 0.03, 29.1], [0.74, 29.2], [0.8, 29.42], [0.74, 29.64], [0.68, 29.8], [0.7, 30.5], [0.92, 31.2], [1.4, 31.72], [1.78, 31.95], [1.92, 32.15], [1.82, 32.4], [1.3, 32.48], [0.75, 32.75], [0.4, 33.2], [0.16, 33.75], [0.001, 34.1]]));
  // 笼：四根弯铁条（圆截面，往上收细）在对角上，两道箍
  const stripPath = spline([[1.5, 32.2], [2.75, 33.3], [3.3, 35.2], [3.25, 37.3], [2.55, 39.3], [1.3, 40.6], [0.45, 41.0]], 56);
  k.加('铁', wandColors.iron, ...rotateCopies(sweepSection(stripPath, (t) => roundSection(0.22 * (1 - 0.3 * t), 16)), 4, 45));
  for (const y of [34.0, 38.5]) k.加('铁', wandColors.iron, ring(y, pathRadiusAt(stripPath, y), 0.15));
  // 顶帽和顶针
  k.加('铁', wandColors.iron, lathe([[0.3, 40.2], [0.95, 40.4], [1.06, 40.7], [0.92, 41.0], [0.5, 41.25], [0.32, 41.6], [0.42, 41.9], [0.3, 42.2], [0.17, 42.7], [0.001, 44]]));
  // 四片外张的锻刃：贴着笼条外侧往上、往外挑
  const bladePath = spline([[2.2, 32.25], [3.4, 33.5], [3.95, 35.5], [4.15, 37.7], [4.55, 40.1], [5.25, 42.7]], 48);
  const bladeWidth = (t: number) => 0.54 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.75);
  k.加('铁', wandColors.iron, ...rotateCopies(sweepSection(bladePath, (t) => spindle(Math.max(1e-3, bladeWidth(t)), Math.max(1e-3, 0.16 * Math.sqrt(bladeWidth(t) / 0.54))), spindleHard()), 4, 45));
  return { bin: k, core: { 类: '晶体', geometry: crystalGeometry(1.4, 2.5, 2.5, 0.45, 8), 位: [0, 36.3, 0] } satisfies CorePart };
};

// ── 乙 下界器物 ──
const buildVariantSecond = () => {
  const k = new GeoBin();
  const R = 0.68;
  k.加('金', wandColors.gold, lathe([[0.001, 0], [0.25, 0.25], [0.5, 0.7], [0.6, 1.1], [0.5, 1.5], [0.38, 1.75], [0.5, 1.95], [0.85, 2.1], [0.93, 2.35], [0.85, 2.6], [0.7, 2.8]]));
  k.加('黑曜', wandColors.obsidian, lathe(rodProfile(R, 2.6, 28.3, [4.4, 4.7, 10.6, 10.9])));
  k.加('金', wandColors.gold, bulgeHoop(7.6, R - 0.03, 0.94, 0.5), bulgeHoop(7.15, R - 0.03, 0.78, 0.22), bulgeHoop(8.05, R - 0.03, 0.78, 0.22));
  // 握把：金丝菱格（正反各三路）
  k.加('金', wandColors.gold, flatHoop(12.5, 13.0, R - 0.03, 0.94), flatHoop(22.0, 22.5, R - 0.03, 0.94));
  for (let i = 0; i < 3; i++) for (const side of [1, -1]) k.加('金', wandColors.gold, tubeGeometry(helix(R + 0.02, 12.95, 22.05, side * 1.5, i * 120, 28), 0.06, 8));
  // 熔岩裂纹：嵌在杆面上的细缝（管心在杆面里面，只露出一线），折着往上走，两头沉进杆里；每道带一小岔
  const pseudoRandom = (n: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const lavaVein = (phaseDeg: number, y0: number, y1: number, seed: number, pieces = 9): Vec3[] => {
    let a = phaseDeg * radPerDeg;
    return Array.from({ length: pieces + 1 }, (_, i) => {
      const endInset = Math.min(i, pieces - i) === 0 ? 0.1 : 0;
      a += (pseudoRandom(seed * 7.1 + i) - 0.5) * 1.5;
      const r = R - 0.03 - endInset;
      return [r * Math.cos(a), y0 + ((y1 - y0) * (i + (i > 0 && i < pieces ? (pseudoRandom(seed + i * 3.3) - 0.5) * 0.5 : 0))) / pieces, r * Math.sin(a)] as const;
    });
  };
  const bentTube = (points: readonly Vec3[], r: number) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.12), points.length * 8, r, 8, false);
  for (let i = 0; i < 4; i++) {
    k.加('熔光', wandColors.熔, bentTube(lavaVein(i * 90 + 10, 22.6, 28.2, i * 1.9 + 0.3), 0.07));
    k.加('熔光', wandColors.熔, bentTube(lavaVein(i * 90 + 55, 23.6 + i * 0.6, 25.6 + i * 0.6, i * 3.1 + 1, 4), 0.055));
  }
  // 颈：两道金箍夹一圈烈焰柱
  k.加('金', wandColors.gold, lathe([[R - 0.03, 28.0], [1.1, 28.05], ...arcPoints(1.34, 28.4, 0.2, -90, 90, 10), [1.2, 28.75], [0.5, 28.85]], 96, 50));
  k.加('黑曜', wandColors.obsidian, lathe([[0.44, 28.7], [0.44, 30.8]]));
  for (let i = 0; i < 8; i++) {
    const a = i * 45 * radPerDeg;
    k.加('熔光', wandColors.flame, new THREE.CapsuleGeometry(0.13, 1.7, 6, 16).translate(1.05 * Math.cos(a), 29.75, 1.05 * Math.sin(a)));
  }
  k.加('金', wandColors.gold, lathe([[0.5, 30.65], [1.2, 30.75], ...arcPoints(1.34, 31.1, 0.2, -90, 90, 10), [1.1, 31.42], [0.9, 31.45]], 96, 50));
  // 托：黑曜的杯，杯口一道金环，杯里一个金座
  k.加('黑曜', wandColors.obsidian, lathe([[0.85, 31.3], [0.95, 31.7], [1.45, 32.35], [2.05, 32.85], [2.28, 33.05], [2.18, 33.3], [1.5, 33.36]]));
  k.加('金', wandColors.gold, lathe([[1.6, 33.3], [1.2, 33.5], [0.75, 33.95], [0.5, 34.4], [0.42, 34.75], [0.001, 34.85]]));
  k.加('金', wandColors.gold, ring(33.1, 2.26, 0.1));
  // 冠：六爪往上合拢、爪尖再往外挑；爪是梭形截面，内外各一道脊
  const clawPath = spline([[1.1, 33.25], [2.15, 33.6], [3.1, 34.4], [3.8, 36.3], [3.7, 38.6], [2.95, 40.6], [2.35, 42.0], [2.5, 43.6], [3.1, 45.4]], 72);
  const clawThickness = (t: number) => Math.max(1e-3, 0.3 * Math.min(1, (1 - t) / 0.3) ** 0.8);
  k.加('金', wandColors.gold, ...rotateCopies(sweepSection(clawPath, (t) => spindle(clawThickness(t), clawThickness(t) * 0.62), spindleHard()), 6, 0));
  k.加('金', wandColors.gold, ring(41.0, pathRadiusAt(clawPath, 41.0), 0.12));
  return { bin: k, core: { 类: '熔核', geometry: new THREE.SphereGeometry(2.1, 56, 40), 位: [0, 37.3, 0] } satisfies CorePart };
};

// ── 丙 权杖 ──
const crescent = { 心: 47.9, R: 5.5, r: 4.5, d: 1.5, halfThickness: 0.42 };
/** 新月在 φ 度处（0 = 正下方，往两边到 ±月角）的中线半径和半宽：外圆（心、R）和往上偏 d 的内圆（r）之间的那一段 */
const crescentSection = (φ: number) => {
  const c = -crescent.d * Math.cos(φ * radPerDeg);
  const innerRadius = c + Math.sqrt(Math.max(0, c * c - crescent.d ** 2 + crescent.r ** 2));
  return { 中: (crescent.R + innerRadius) / 2, 半宽: Math.max(0, (crescent.R - innerRadius) / 2) };
};
const crescentAngle = (() => {
  const y = (crescent.R ** 2 - crescent.r ** 2 + crescent.d ** 2) / (2 * crescent.d);
  return Math.acos(-y / crescent.R) / radPerDeg;
})();
const crescentPoint = (φ: number, ρ: number): P2 => [ρ * Math.sin(φ * radPerDeg), crescent.心 - ρ * Math.cos(φ * radPerDeg)];
const buildVariantThird = () => {
  const k = new GeoBin();
  const R = 0.64;
  k.加('金', wandColors.gold, lathe([[0.001, 0], [0.2, 0.8], [0.42, 2.0], [0.55, 3.0], [0.5, 3.5], [0.62, 3.7], [0.95, 3.85], [1.02, 4.1], [0.92, 4.35], [0.7, 4.55]]));
  k.加('黑曜', wandColors.obsidian, lathe(rodProfile(R, 4.4, 37.4, [7.6, 7.9, 30.2, 30.5, 30.8])));
  k.加('金', wandColors.gold, bulgeHoop(11.6, R - 0.03, 0.9, 0.46), bulgeHoop(12.15, R - 0.03, 0.76, 0.22), bulgeHoop(33.4, R - 0.03, 0.9, 0.46), bulgeHoop(32.85, R - 0.03, 0.76, 0.22));
  // 握把：四股拧在一起的黑铁绳纹
  k.加('金', wandColors.gold, flatHoop(15.4, 15.95, R - 0.03, 0.92), flatHoop(27.05, 27.6, R - 0.03, 0.92));
  for (let i = 0; i < 4; i++) k.加('铁', wandColors.iron, tubeGeometry(helix(R - 0.02, 15.9, 27.1, 2.4, i * 90, 28), 0.17, 12));
  // 金球节：上下各一道箍，球面上八道黑筋
  const bulb = { y: 39.3, r: 1.55 };
  k.加('金', wandColors.gold, lathe([[R - 0.03, 37.2], [0.9, 37.3], [1.0, 37.55], [0.9, 37.8], [0.74, 37.95], ...arcPoints(0, bulb.y, bulb.r, -61, 61, 28), [0.74, 40.65], [0.9, 40.8], [1.0, 41.05], [0.9, 41.3], [0.7, 41.4]]));
  k.加('铁', wandColors.darkIron, ...rotateCopies(sweepSection(arcPoints(0, bulb.y, bulb.r + 0.01, -56, 56, 24), () => roundSection(0.075, 10)), 8));
  // 座：黑铁，往上张开夹住新月
  k.加('铁', wandColors.iron, lathe([[0.7, 41.3], [0.78, 41.9], [1.15, 42.5], [1.7, 42.85], [1.8, 43.05], [1.7, 43.25], [1.1, 43.45], [0.001, 43.7]]));
  // 新月：黑曜，平的两面、内外两边磨出刃；立在 XY 平面里
  const margin = 4; // 月尖前这几度交给金尖
  const φs = Array.from({ length: 121 }, (_, i) => -(crescentAngle - margin) + (2 * (crescentAngle - margin) * i) / 120);
  k.加('黑曜', wandColors.obsidian, sweepSection(φs.map((φ) => crescentPoint(φ, crescentSection(φ).中)), (t) => { const s = crescentSection(φs[Math.round(t * 120)] ?? 0); return spindle(Math.max(0.02, s.半宽), crescent.halfThickness * Math.min(1, 0.3 + s.半宽 / 0.7), 9); }, spindleHard(9)));
  // 金尖：包住月尖最后一截，再往前伸出一个尖
  for (const sign of [1, -1]) {
    const startAngle = crescentAngle - 24;
    const curve = Array.from({ length: 25 }, (_, i) => sign * (startAngle + ((crescentAngle + 5 - startAngle) * i) / 24)).map((φ) => crescentPoint(φ, crescentSection(Math.min(Math.abs(φ), crescentAngle)).中));
    k.加('金', wandColors.gold, sweepSection(curve, (t) => { const w = crescentSection(startAngle + (crescentAngle - startAngle) * Math.min(1, t / 0.83)).半宽; const a = t < 0.83 ? w + 0.07 : Math.max(1e-3, (0.09 * (1 - t)) / 0.17); return spindle(a, Math.max(1e-3, Math.min(crescent.halfThickness * Math.min(1, 0.3 + w / 0.7) + 0.07, 0.12 + a))); }, spindleHard()));
  }
  // 金线：两面各一道，顺着新月的中线
  for (const z of [1, -1]) {
    const arcPoints = Array.from({ length: 61 }, (_, i) => -108 + (216 * i) / 60).map((φ): Vec3 => [...crescentPoint(φ, crescentSection(φ).中), z * (crescent.halfThickness + 0.005)]);
    k.加('金', wandColors.gold, tubeGeometry(arcPoints, 0.075, 8));
  }
  // 外沿的刺：两边各三根，往外上方挑
  for (const sign of [1, -1])
    for (const φ of [42, 76, 108]) {
      const root = crescentPoint(sign * φ, crescent.R - 0.35);
      const angleRad = (sign * (φ - 22)) * radPerDeg;
      const curve = spline([root, [root[0] + 0.6 * Math.sin(sign * φ * radPerDeg), root[1] - 0.6 * Math.cos(sign * φ * radPerDeg)], [root[0] + 1.35 * Math.sin(angleRad) + 0.05 * sign, root[1] - 1.35 * Math.cos(angleRad) + 0.35]], 14);
      k.加('铁', wandColors.iron, sweepSection(curve, (t) => roundSection(Math.max(1e-3, 0.27 * (1 - t) ** 0.8), 14)));
    }
  // 前后各一只金爪，和新月一起把芯围住
  const clawPath = spline([[1.2, 42.9], [2.45, 44.3], [2.95, 46.7], [2.6, 49.1], [1.85, 50.7]], 40);
  k.加('金', wandColors.gold, ...rotateCopies(sweepSection(clawPath, (t) => spindle(Math.max(1e-3, 0.27 * Math.min(1, (1 - t) / 0.4) ** 0.8), Math.max(1e-3, 0.17 * Math.min(1, (1 - t) / 0.4) ** 0.8)), spindleHard()), 2, 90));
  return { bin: k, core: { 类: '晶体', geometry: crystalGeometry(1.5, 2.9, 2.9, 0.5, 8), 位: [0, 48.5, 0] } satisfies CorePart };
};

export type RefinedVariant = '甲' | '乙' | '丙';
export const refinedVariants: Record<RefinedVariant, VariantDef> = {
  甲: { 名: '忠实细做', fullLength: 44, grip: 17, coreHeight: 36.3, halo: [11, 0.7], coreGlow: 2.2, build: buildVariantFirst },
  乙: { 名: '下界器物', fullLength: 45.4, grip: 17.5, coreHeight: 37.3, halo: [12, 0.65], coreGlow: 2.4, build: buildVariantSecond },
  丙: { 名: '权杖', fullLength: 52.4, grip: 21.5, coreHeight: 48.5, halo: [12, 0.7], coreGlow: 2.4, selfRotation: 45, build: buildVariantThird },
};

/** 一款在杖空间里的几个点（单位格，杖尾在原点）：尾、握点、芯、最高处 */
export const staffPoints = (variant: RefinedVariant) => {
  const k = refinedVariants[variant];
  return { tail: [0, 0, 0], grip: [0, k.grip / 16, 0], core: [0, k.coreHeight / 16, 0], tip: [0, k.fullLength / 16, 0] } as const;
};

// 建好的网格和材质，一款一份，头一回用到才建
type FinishedWand = { pieces: { material: MaterialName | GlowMaterialName; geometry: THREE.BufferGeometry }[]; core: CorePart; material: ReturnType<typeof buildStaffMaterials>; moltenGlow: THREE.Material; coreMaterial: THREE.Material; haloMaterial: THREE.Material };
const finishedCache = new Map<RefinedVariant, FinishedWand>();
const haloPlane = new THREE.PlaneGeometry(2, 2);
const getFinished = (variant: RefinedVariant): FinishedWand => {
  let c = finishedCache.get(variant);
  if (!c) {
    const k = refinedVariants[variant];
    const { bin: parts, core } = k.build();
    c = {
      pieces: parts.出(),
      core,
      material: buildStaffMaterials({ 位: core.位, 色: '#ff8a2a', 强: k.coreGlow }),
      moltenGlow: moltenGlowMaterial(),
      coreMaterial: core.类 === '晶体' ? crystalMaterial() : moltenCoreMaterial(),
      haloMaterial: haloMaterial('#ff7a1c', k.halo[1], k.halo[0]),
    };
    finishedCache.set(variant, c);
  }
  return c;
};
/** 一款的三角形数（核对用） */
export const faceCount = (variant: RefinedVariant) => getFinished(variant).pieces.reduce((n, p) => n + p.geometry.getAttribute('position').count / 3, 0);

/** 单位像素的杖（杖尾在原点、杖头朝 +Y） */
const StaffBody: FC<{ variant: RefinedVariant }> = ({ variant }) => {
  const c = useMemo(() => getFinished(variant), [variant]);
  return (
    <>
      {c.pieces.map(({ material, geometry }) => (
        <mesh key={material} geometry={geometry} material={material === '熔光' ? c.moltenGlow : c.material[material]} castShadow={material !== '熔光'} receiveShadow={material !== '熔光'} />
      ))}
      <mesh geometry={c.core.geometry} material={c.coreMaterial} position={[...c.core.位]} />
      <mesh geometry={haloPlane} material={c.haloMaterial} position={[...c.core.位]} frustumCulled={false} renderOrder={20} />
    </>
  );
};

/** 杖空间（单位格，杖尾在原点、杖头朝 +Y）里的一根 */
export const RefinedWand: FC<{ variant: RefinedVariant }> = ({ variant }) => (
  <group scale={1 / 16}>
    <StaffBody variant={variant} />
  </group>
);

/**
 * 杖空间（单位格）→ 手部定位骨的骨骼坐标：握点、杖轴和原版落在同一处（原版的杖轴在物品空间 x = −0.5/16、z = 0.5/16，握在 y = 7/16），
 * 斜举这些手摆的姿势不用跟着改。自转 = 杖绕自己的轴再转几度，不给就用这一款自己的
 */
export const heldRefinedStaffMatrix = (variant: RefinedVariant, selfRotation = refinedVariants[variant].selfRotation ?? 0): THREE.Matrix4 =>
  heldStaffMatrix()
    .multiply(new THREE.Matrix4().makeTranslation(-0.5 / 16, (7 - refinedVariants[variant].grip) / 16, 0.5 / 16))
    .multiply(new THREE.Matrix4().makeRotationY(selfRotation * radPerDeg));

/** 拿在手上：挂到 RightHandLocator */
export const HeldRefinedWand: FC<{ variant: RefinedVariant; selfRotation?: number; children?: ReactNode }> = ({ variant, selfRotation, children }) => {
  const m = useMemo(() => heldRefinedStaffMatrix(variant, selfRotation), [variant, selfRotation]);
  return (
    <group matrix={m} matrixAutoUpdate={false}>
      <RefinedWand variant={variant} />
      {children}
    </group>
  );
};

/** 交给 <娘化亚波伦 杖={…}> 和 持杖位姿：她拿这一款 */
export const refinedStaffVariant = (variant: RefinedVariant, selfRotation?: number) => {
  const p = staffPoints(variant);
  return { 挂: <HeldRefinedWand variant={variant} selfRotation={selfRotation} />, matrix: heldRefinedStaffMatrix(variant, selfRotation), tip: p.tip, core: p.core, tail: p.tail };
};
