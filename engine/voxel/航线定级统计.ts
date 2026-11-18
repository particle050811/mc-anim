// 航线定级的量化（试看 `航线定级统计`，不改画面）：前后两帧同一块地换了级的区段有几块、占画面几成、切级那一刻较粗的一格在输出画面上几个像素；
// 再加这一帧画的区段里最粗的一格几个像素（近处会不会方块化）。都按区段的范围和镜头算，不看遮挡、不看雾。
import * as THREE from 'three';
import { sectionCells, type SectionId } from './区段.ts';
import { diffPicks } from './航线定级.ts';

/** 一帧的镜头：投影 × 视图矩阵、镜头位置（场景坐标）、输出画面上一个像素的张角 */
export type StatView = { viewProj: THREE.Matrix4; camPos: number[]; outPixelAngle: number };
export type FramePick = { list: readonly SectionId[]; view: StatView };

const corner = new THREE.Vector4();
type ClipPoint = [number, number, number]; // 裁剪空间的 x、y、w
// 裁剪面：w ≥ 很小的正数（镜头前面）、−w ≤ x ≤ w、−w ≤ y ≤ w
const clipPlanes: ((p: ClipPoint) => number)[] = [(p) => p[2] - 1e-6, (p) => p[2] + p[0], (p) => p[2] - p[0], (p) => p[2] + p[1], (p) => p[2] - p[1]];
const clipPolygon = (points: ClipPoint[]): ClipPoint[] => {
  let poly = points;
  for (const side of clipPlanes) {
    if (!poly.length) break;
    const out: ClipPoint[] = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k]!;
      const b = poly[(k + 1) % poly.length]!;
      const da = side(a);
      const db = side(b);
      if (da >= 0) out.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    poly = out;
  }
  return poly;
};

/** 区段在 topZ 高的那块水平矩形占画面几成（0～1，视野外是 0） */
export const screenShare = (view: StatView, q: SectionId, topZ: number): number => {
  const sizeM = sectionCells * 2 ** q.L;
  const x0 = q.i * sizeM;
  const y0 = q.j * sizeM;
  const points: ClipPoint[] = [];
  for (const [x, y] of [[x0, y0], [x0 + sizeM, y0], [x0 + sizeM, y0 + sizeM], [x0, y0 + sizeM]] as const) {
    // 场景坐标 Z 朝上 → three 的 Y 朝上：(x, y, z) → (x, z, −y)
    corner.set(x, topZ, -y, 1).applyMatrix4(view.viewProj);
    points.push([corner.x, corner.y, corner.w]);
  }
  const poly = clipPolygon(points);
  let twiceArea = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    twiceArea += (a[0] / a[2]) * (b[1] / b[2]) - (b[0] / b[2]) * (a[1] / a[2]);
  }
  return Math.abs(twiceArea) / 8; // 整张画面在标准化坐标里是 2 × 2
};

/** 区段的一格在输出画面上几个像素（按离镜头最近的那一点算，和挑区段时同一个距离） */
export const cellPixels = (view: StatView, q: SectionId, topZ: number): number => {
  const sizeM = sectionCells * 2 ** q.L;
  const x0 = q.i * sizeM;
  const y0 = q.j * sizeM;
  const [cx, cy, cz] = view.camPos as [number, number, number];
  const dxy = Math.hypot(Math.max(x0 - cx, 0, cx - x0 - sizeM), Math.max(y0 - cy, 0, cy - y0 - sizeM));
  const dist = Math.max(1, Math.hypot(dxy, Math.max(0, cz - topZ)));
  return 2 ** q.L / (dist * view.outPixelAngle);
};

export type SwitchStats = {
  refine: number; // 画面里变细的区段数（按较粗那一块数）
  coarsen: number;
  share: number; // 这些区段占画面的面积（1 = 整张画面）
  bigShare: number; // 其中切级时较粗的一格 ≥ bigPixels 个输出像素的（看得出一格一格在变的）
  pixelShare: number; // Σ 面积 × 较粗一格的像素数（除以 share 是按面积加权的平均）
  maxPixels: number; // 切级的区段里较粗一格最多几个像素
  byLevel: number[]; // 按较粗那一级分的面积
};
/** 较粗的一格到这么多输出像素算「看得出」：门槛 2.25 时细一级的一格刚到 2.25、粗的一格 4.5；一格 3 个像素以上肉眼分得出块 */
export const bigPixels = 3;

/** 前一帧 → 这一帧在画面里换了级的区段（两帧都在画面里才算） */
export const switchStats = (prev: FramePick, cur: FramePick, featureTop: (x: number, y: number) => number, coarsestLevel: number): SwitchStats => {
  const st: SwitchStats = { refine: 0, coarsen: 0, share: 0, bigShare: 0, pixelShare: 0, maxPixels: 0, byLevel: Array.from({ length: coarsestLevel + 1 }, () => 0) };
  for (const sw of diffPicks(prev.list, cur.list)) {
    const sizeM = sectionCells * 2 ** sw.coarse.L;
    const topZ = featureTop((sw.coarse.i + 0.5) * sizeM, (sw.coarse.j + 0.5) * sizeM);
    const share = screenShare(cur.view, sw.coarse, topZ);
    if (!(share > 0) || !(screenShare(prev.view, sw.coarse, topZ) > 0)) continue;
    const px = cellPixels(cur.view, sw.coarse, topZ);
    st[sw.kind]++;
    st.share += share;
    if (px >= bigPixels) st.bigShare += share;
    st.pixelShare += share * px;
    st.maxPixels = Math.max(st.maxPixels, px);
    st.byLevel[sw.coarse.L]! += share;
  }
  return st;
};

/**
 * 这一帧画面里的区段：各级几块、合并过的格子（第 1 级起）最大的一格几个输出像素（近处方块化看这个）、一格超过 limitPixels 的占画面几成。
 * 第 0 级不算：那是游戏里的方块本身，贴到镜头前多大都不是分级弄粗的
 */
export const coarsenessStats = (pick: FramePick, featureTop: (x: number, y: number) => number, limitPixels: number, coarsestLevel: number) => {
  const levels = Array.from({ length: coarsestLevel + 1 }, () => 0);
  let maxPixels = 0;
  let overShare = 0;
  let inFrame = 0;
  for (const q of pick.list) {
    levels[q.L]!++;
    const sizeM = sectionCells * 2 ** q.L;
    const topZ = featureTop((q.i + 0.5) * sizeM, (q.j + 0.5) * sizeM);
    const share = screenShare(pick.view, q, topZ);
    if (!(share > 0)) continue;
    inFrame++;
    if (q.L === 0) continue;
    const px = cellPixels(pick.view, q, topZ);
    maxPixels = Math.max(maxPixels, px);
    if (px > limitPixels) overShare += share;
  }
  return { levels, inFrame, maxPixels, overShare };
};
