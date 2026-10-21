// 方块网格加载时按方块整理面：`BlockMesh`（lib/方块网格.tsx）的 `clearPlants`、`hide`、`hideBlocks`、`patchEdges` 都在这里算，
// 结果是每层留哪些原始面（`keep`）、另加哪些面（`extra`）。不依赖 three，核查脚本也直接用（工具/地标巡检/核查/补面.ts）。
//
// 为什么有 `hideBlocks`、`patchEdges`（用户 10-05 要查迁到暮色新世界的地标网格和新地形对不上）：
// - `hide` 按「面心严格在盒子里」藏，核心边上的面心落在盒子边上藏不掉，立成悬空黑树叶墙；但孔道、碎块洞的盒子（6-1-5、6-1-7、6-1-8）按这个判法排，不能改，所以另给按方块藏的 `hideBlocks`。
// - 网格的边是空心的：导出时边上朝外的面被旧世界邻居剔掉了，网格地面比新地形高就是一道看得穿的缝（树冠、导出上限截平处也空心）。`patchEdges` 在边上补缺的面。
//
// 坐标：.bin 里是游戏坐标减 origin（y 朝上、南 = +z），叫「bin 坐标」；盒子（`hide`、`hideBlocks`、`clearPlants`）是参考模型坐标（Z 朝上、南 = −Y，同 `BlockMesh`）。
import type { BlockMeshInfo } from './方块网格.tsx';
import { BoxBuckets, dot, emitSubFace, HORIZ_DIRS, innerPoint, NORMALS, readFace, splitIntoCells, TV, type ExtraFaces, type Face } from './方块网格面.ts';

export type { ExtraFaces } from './方块网格面.ts';

export type ArrangeFacesResult = {
  keep: (number[] | null)[]; // 每层：留下的原始面的序号；null = 整层都留
  extra: ExtraFaces[]; // 每层另加的面（`hideBlocks` 切开的大面里留下的几格、补边补的面）
  stats: Record<string, number>;
};
export type ArrangeFacesParams = {
  clearPlants?: number[][];
  hide?: number[][];
  hideBlocks?: number[][];
  // true：补边，裙边往下最多 裙深默认 格；数字：裙边最多往下这么多格
  patchEdges?: boolean | number;
};

// 补边的裙边往下最多多少格：要伸到新地面以下。巡检量到网格地面比新地形高最多 7 米，幽冥高塔树冠底下 +5，再留一倍；埋进新地形的那截从里面看是背面，被剔掉
export const defaultSkirtDepth = 16;

// ---------- 主函数 ----------
export const arrangeFaces = (info: Pick<BlockMeshInfo, 'from' | 'to' | 'origin' | 'vertexBytes' | 'atlas' | 'layers' | 'rects'>, dv: DataView, params: ArrangeFacesParams): ArrangeFacesResult => {
  const { clearPlants, hide, hideBlocks } = params;
  const skirtDepth = params.patchEdges === true ? defaultSkirtDepth : typeof params.patchEdges === 'number' ? params.patchEdges : 0;
  const doPatchEdges = !!params.patchEdges;
  const stride = info.vertexBytes;
  const origin = info.origin;
  const fromPos = info.from, toPos = info.to;
  const layerCount = info.layers.length;
  const extra: ExtraFaces[] = info.layers.map(() => ({ pos: [], uv: [], col: [], r: [] }));
  const stats: Record<string, number> = {};
  const tally = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);
  if (!clearPlants?.length && !hide?.length && !hideBlocks?.length && !doPatchEdges) return { keep: info.layers.map(() => null), extra, stats: stats };

  // 方块列的格子：网格范围外扩 1 列
  const gx0 = fromPos[0] - 1, gz0 = fromPos[2] - 1, nx = toPos[0] - fromPos[0] + 3, nz = toPos[2] - fromPos[2] + 3;
  const hideBoxes = new BoxBuckets(hide ?? [], gx0, gz0, nx, nz, origin);
  const hideBlockBoxes = new BoxBuckets(hideBlocks ?? [], gx0, gz0, nx, nz, origin);
  // 一格（游戏方块格）按方块藏不藏：格心在 hideBlocks 盒子里
  const blockHidden = (x: number, y: number, z: number) => !hideBlockBoxes.empty && hideBlockBoxes.has(x + 0.5 - origin[0], y + 0.5 - origin[1], z + 0.5 - origin[2]);
  // 格心在 `hide` 盒子里的格：补边、补光都不碰（核心外藏还放在 `hide` 里时，导出边上藏不掉的面不能再提亮；碎块洞里也不补）
  const cellCenterHidden = (x: number, y: number, z: number) => !hideBoxes.empty && hideBoxes.has(x + 0.5 - origin[0], y + 0.5 - origin[1], z + 0.5 - origin[2]);
  const inBounds = (x: number, y: number, z: number) => x >= fromPos[0] && x <= toPos[0] && y >= fromPos[1] && y <= toPos[1] && z >= fromPos[2] && z <= toPos[2];

  // 补边要看的格：边上的格往里几格的带子（学「这种方块往下是什么」也只在带子里学，就近）。按方块列算
  const bandWidth = 8;
  const bandMask = new Uint8Array(nx * nz);
  if (doPatchEdges) {
    // 边列：导出范围的四条边；`hideBlocks` 盒子水平范围的边，两边各一列
    const seedCols: number[] = [];
    const addSeedCol = (gx: number, gz: number) => {
      const cx = gx - gx0, cz = gz - gz0;
      if (cx >= 0 && cz >= 0 && cx < nx && cz < nz) seedCols.push(cx * nz + cz);
    };
    for (let x = fromPos[0]; x <= toPos[0]; x++) { addSeedCol(x, fromPos[2]); addSeedCol(x, toPos[2]); }
    for (let z = fromPos[2]; z <= toPos[2]; z++) { addSeedCol(fromPos[0], z); addSeedCol(toPos[0], z); }
    for (const [x0, y0, , x1, y1] of hideBlocks ?? []) {
      // 参考模型 x → 游戏 x = x + ox；参考模型 y → 游戏 z = oz − y
      const ax = Math.max(fromPos[0], Math.floor(x0 + origin[0])), bx = Math.min(toPos[0], Math.ceil(x1 + origin[0]) - 1);
      const az = Math.max(fromPos[2], Math.floor(origin[2] - y1)), bz = Math.min(toPos[2], Math.ceil(origin[2] - y0) - 1);
      if (ax > bx || az > bz) continue;
      for (let x = ax; x <= bx; x++) { addSeedCol(x, az); addSeedCol(x, az - 1); addSeedCol(x, bz); addSeedCol(x, bz + 1); }
      for (let z = az; z <= bz; z++) { addSeedCol(ax, z); addSeedCol(ax - 1, z); addSeedCol(bx, z); addSeedCol(bx + 1, z); }
    }
    // 往外扩 带宽 列（切比雪夫距离，一圈圈扩）
    let frontier = seedCols.filter((k) => !bandMask[k] && (bandMask[k] = 1));
    for (let ring = 0; ring < bandWidth && frontier.length; ring++) {
      const nextFrontier = [];
      for (const k of frontier) {
        const cx = Math.floor(k / nz), cz = k % nz;
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++) {
            const x = cx + dx, z = cz + dz;
            if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
            const kk = x * nz + z;
            if (!bandMask[kk]) { bandMask[kk] = 1; nextFrontier.push(kk); }
          }
      }
      frontier = nextFrontier;
    }
  }

  // 补边要的记录：带子里每一格每个方向上的轴向面（花草层、两面画的实体层不算）
  type FaceRecord = { L: number; at: number; f: Face; sa: number; sb: number; ta: number; tb: number; textureId: number; onGridPlane: boolean; fullWidth: boolean; full: boolean };
  const records: FaceRecord[] = [];
  const NY = toPos[1] - fromPos[1] + 3;
  const cellKey = (x: number, y: number, z: number) => ((x - fromPos[0] + 1) * NY + (y - fromPos[1] + 1)) * nz + (z - fromPos[2] + 1);
  const cellFaces = new Map<number, number[]>(); // 格键 × 6 + 方向 → 记录序号
  const colCellYs = new Map<number, Set<number>>(); // 列键 → 这一列里有记录的格的 y
  const [AW, AH] = info.atlas;
  const textureId = (dv2: DataView, at: number) => {
    // 图集贴图 16×16、按 16 对齐（见 方块网格.tsx 的 `TILE_FRAG`）：哪一格就是哪张贴图
    const rectIdx = stride >= 28 ? dv2.getUint32(at + 24, true) : 0;
    let texU: number, texV: number;
    if (rectIdx > 0) [texU, texV] = [info.rects![rectIdx - 1][0] + 1e-6, info.rects![rectIdx - 1][1] + 1e-6];
    else {
      texU = 0; texV = 0;
      for (let k = 0; k < 4; k++) { texU += dv2.getFloat32(at + k * stride + 12, true) / 4; texV += dv2.getFloat32(at + k * stride + 16, true) / 4; }
    }
    return Math.floor(texV * AH / 16) * 4096 + Math.floor(texU * AW / 16);
  };

  const keep: (number[] | null)[] = [];
  // 按方块藏切开过的大面（层 → 面序号）：补光不重画它们（整张重画会把藏掉的格画回来）
  const splitQuads: Set<number>[] = info.layers.map(() => new Set());
  for (let li = 0; li < layerCount; li++) {
    const layer = info.layers[li];
    const plants = layer.name === 'plants';
    const doClear = plants && !!clearPlants?.length;
    const shouldRecord = doPatchEdges && !plants && !layer.doubleSide;
    if (!doClear && !hide?.length && !hideBlocks?.length && !shouldRecord) {
      keep.push(null);
      continue;
    }
    const k: number[] = [];
    for (let quadIdx = 0; quadIdx < layer.quads; quadIdx++) {
      const at = layer.byteOffset + quadIdx * 4 * stride;
      if (doClear) {
        // 按面的第一个顶点（参考模型坐标）
        const x = dv.getFloat32(at, true), y = -dv.getFloat32(at + 8, true);
        if (clearPlants!.some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1)) continue;
      }
      if (hide?.length) {
        // 面心（四个顶点各除 4 再加）严格在盒子里就藏
        let cx = 0, cy = 0, cz = 0;
        for (let vert = 0; vert < 4; vert++) {
          cx += dv.getFloat32(at + vert * stride, true) / 4;
          cy += dv.getFloat32(at + vert * stride + 4, true) / 4;
          cz += dv.getFloat32(at + vert * stride + 8, true) / 4;
        }
        if (hideBoxes.has(cx, cy, cz)) continue;
      }
      const needFace = !hideBlockBoxes.empty || shouldRecord;
      const face = needFace ? readFace(dv, at, stride) : null;
      if (!hideBlockBoxes.empty && face) {
        if (face.d < 0) {
          // 斜面（花草十字面等）：面心沿法向往里退 0.01（法向 (v1 − v0) × (v3 − v0)，同 方块网格.tsx）
          const corners: number[][] = [];
          for (let vert = 0; vert < 4; vert++) corners.push([dv.getFloat32(at + vert * stride, true), dv.getFloat32(at + vert * stride + 4, true), dv.getFloat32(at + vert * stride + 8, true)]);
          const center = [0, 1, 2].map((i) => (corners[0][i] + corners[1][i] + corners[2][i] + corners[3][i]) / 4);
          const edgeU = [0, 1, 2].map((i) => corners[1][i] - corners[0][i]), edgeV = [0, 1, 2].map((i) => corners[3][i] - corners[0][i]);
          const normal = [edgeU[1] * edgeV[2] - edgeU[2] * edgeV[1], edgeU[2] * edgeV[0] - edgeU[0] * edgeV[2], edgeU[0] * edgeV[1] - edgeU[1] * edgeV[0]];
          const normalLen = Math.hypot(normal[0], normal[1], normal[2]) || 1;
          if (hideBlockBoxes.has(center[0] - (0.01 * normal[0]) / normalLen, center[1] - (0.01 * normal[1]) / normalLen, center[2] - (0.01 * normal[2]) / normalLen)) { tally('按方块藏'); continue; }
        } else {
          const cells = splitIntoCells(face);
          const hiddenFlags = cells.map(([sa, sb, ta, tb]) => {
            const innerPt = innerPoint(face, sa, sb, ta, tb);
            return hideBlockBoxes.has(innerPt[0], innerPt[1], innerPt[2]);
          });
          const hiddenCount = hiddenFlags.filter(Boolean).length;
          if (hiddenCount === cells.length) { tally('按方块藏'); continue; }
          if (hiddenCount > 0) {
            // 合并的大面跨在盒子边上：按格切开，盒子外的几格留下
            tally('大面切开');
            splitQuads[li].add(quadIdx);
            cells.forEach(([sa, sb, ta, tb], i) => {
              if (hiddenFlags[i]) return;
              emitSubFace(dv, at, stride, face, sa, sb, ta, tb, extra[li]);
              if (shouldRecord) recordCell(li, at, face, sa, sb, ta, tb);
            });
            continue;
          }
        }
      }
      k.push(quadIdx);
      if (shouldRecord && face && face.d >= 0) for (const [sa, sb, ta, tb] of splitIntoCells(face)) recordCell(li, at, face, sa, sb, ta, tb);
    }
    keep.push(k.length === layer.quads ? null : k);
  }

  function recordCell(layerIdx: number, at: number, face: Face, sa: number, sb: number, ta: number, tb: number) {
    const innerPt = innerPoint(face, sa, sb, ta, tb);
    const x = Math.floor(innerPt[0] + origin[0]), y = Math.floor(innerPt[1] + origin[1]), z = Math.floor(innerPt[2] + origin[2]);
    if (x < fromPos[0] - 1 || x > toPos[0] + 1 || y < fromPos[1] - 1 || y > toPos[1] + 1 || z < fromPos[2] - 1 || z > toPos[2] + 1) return;
    // 带子外面只记导出上限那一层（截平的树冠、尖顶在网格中间也有）
    if (!bandMask[(x - gx0) * nz + (z - gz0)] && y !== toPos[1]) return;
    // 在方块格的边界平面上（不是半砖顶、雪片顶、火把这类格子中间的面）
    const wg = face.w + dot(origin, NORMALS[face.d]);
    const onGridPlane = Math.abs(wg - Math.round(wg)) < 1e-3;
    const fullWidth = sb - sa >= 0.999;
    const fullSize = fullWidth && tb - ta >= 0.999;
    const isSide = face.d !== 2 && face.d !== 3;
    // 侧面：整格宽、从格底起（半砖、雪片的侧面算，栅栏柱、灯笼不算）；顶面、底面：整格大小
    if (isSide ? !(fullWidth && Math.abs(ta + dot(origin, TV[face.d]) - Math.floor(ta + dot(origin, TV[face.d]) + 1e-6)) < 1e-3) : !fullSize) return;
    const i = records.length;
    records.push({ L: layerIdx, at, f: face, sa, sb, ta, tb, textureId: textureId(dv, at), onGridPlane, fullWidth, full: fullSize });
    const key = cellKey(x, y, z) * 6 + face.d;
    let recIdxs = cellFaces.get(key);
    if (!recIdxs) cellFaces.set(key, (recIdxs = []));
    recIdxs.push(i);
    const colKey = (x - fromPos[0] + 1) * nz + (z - fromPos[2] + 1);
    let colYs = colCellYs.get(colKey);
    if (!colYs) colCellYs.set(colKey, (colYs = new Set()));
    colYs.add(y);
  }

  if (doPatchEdges) {
    const removedQuads = patchEdgeFaces(extra);
    // 补光换下来的原始面从 keep 里拿掉
    keep.forEach((k, li) => {
      const removed = removedQuads[li];
      if (!removed.size) return;
      keep[li] = (k ?? Array.from({ length: info.layers[li].quads }, (_, q) => q)).filter((q) => !removed.has(q));
    });
  }
  return { keep, extra, stats: stats };

  // ---------- 补边 ----------
  // 对贴着导出边、`hideBlocks` 边（核心边）的格：有面但朝外那面没有的，照同一格另一面的贴图补；
  // 每段实心（从一个顶面往下到底面或下一个顶面）在边上往下补，地面那段往下补 `裙深` 格，伸到新地面以下。
  // 补的面也照 `hide`、`hideBlocks` 再筛一遍：核心外、碎块洞里不补。返回每层要拿掉的原始面（补光重画过的）
  function patchEdgeFaces(out: ExtraFaces[]): Set<number>[] {
    const removedQuads: Set<number>[] = info.layers.map(() => new Set());
    // 记录只到网格范围外 1 格（裙边往下伸出网格底以后就没有记录了，不能拿越界的键去查）
    const facesAt = (x: number, y: number, z: number, d: number) => (y < fromPos[1] - 1 || y > toPos[1] + 1 ? undefined : cellFaces.get(cellKey(x, y, z) * 6 + d));
    const hasFace = (x: number, y: number, z: number, d: number) => !!facesAt(x, y, z, d)?.some((i) => records[i].onGridPlane);
    const hasAnyFace = (x: number, y: number, z: number) => {
      for (let dir = 0; dir < 6; dir++) if (facesAt(x, y, z, dir)?.some((i) => records[i].onGridPlane)) return true;
      return false;
    };
    // 顶面（整格大小，平面上或者格子中间：雪片、半砖、地毯的顶）：一段实心的顶
    const topFaceAt = (x: number, y: number, z: number) => facesAt(x, y, z, 2)?.find((i) => records[i].full);
    const hasBottomFace = (x: number, y: number, z: number) => !!facesAt(x, y, z, 3)?.some((i) => records[i].full);
    // 一格一个方向上的面拼成的贴图组（草方块侧面 = 底图 + 染色的那层，两张）
    const texGroupKey = (rs: number[]) => rs.map((i) => records[i].textureId).sort((a, b) => a - b).join(',');

    // 学：每种顶面（贴图）往下第 k 格的侧面是什么。看带子里露出侧面的竖直一溜（坑壁、台阶、树冠的边），
    // 顶上那格顶面贴图 K、往下第 k 格的侧面贴图组，数最多的；样本记一格、一个方向
    const learnCounts = new Map<string, Map<string, { n: number; cell: number[]; d: number }>>();
    const learn = (topTex: number, k: number, texGroup: string, cell: number[], dir: number) => {
      const key = `${topTex}|${k}`;
      let groupCounts = learnCounts.get(key);
      if (!groupCounts) learnCounts.set(key, (groupCounts = new Map()));
      const entry = groupCounts.get(texGroup);
      if (entry) entry.n++;
      else groupCounts.set(texGroup, { n: 1, cell: cell, d: dir });
    };
    for (const [key, rs] of cellFaces) {
      const dir = key % 6;
      if (dir === 2 || dir === 3) continue;
      const planarRecs = rs.filter((i) => records[i].onGridPlane);
      if (!planarRecs.length) continue;
      const cellIdx = Math.floor(key / 6);
      const z = (cellIdx % nz) - 1 + fromPos[2], y = (Math.floor(cellIdx / nz) % NY) - 1 + fromPos[1], x = Math.floor(cellIdx / nz / NY) - 1 + fromPos[0];
      let top = y;
      while (top - y < 32 && hasFace(x, top + 1, z, dir)) top++;
      const topRecIdx = topFaceAt(x, top, z);
      if (topRecIdx === undefined) continue;
      learn(records[topRecIdx].textureId, top - y, texGroupKey(planarRecs), [x, y, z], dir);
    }
    const mostCommon = (key: string) => {
      const groupCounts = learnCounts.get(key);
      if (!groupCounts) return null;
      let best: { n: number; cell: number[]; d: number } | null = null;
      for (const entry of groupCounts.values()) if (!best || entry.n > best.n) best = entry;
      return best;
    };
    // 往下第 k 格没学到的：用这种顶面学到的最深一层（泥土往下还是泥土），再没有就用所有顶面往下第 1～3 格里最多的
    let undergroundSample: { n: number; cell: number[]; d: number } | null = null;
    {
      const merged = new Map<string, { n: number; cell: number[]; d: number }>();
      for (const [key, groupCounts] of learnCounts) {
        const k = Number(key.split('|')[1]);
        if (k < 1 || k > 3) continue;
        for (const [texGroup, entry] of groupCounts) {
          const acc = merged.get(texGroup);
          if (acc) acc.n += entry.n;
          else merged.set(texGroup, { ...entry });
        }
      }
      for (const entry of merged.values()) if (!undergroundSample || entry.n > undergroundSample.n) undergroundSample = entry;
    }
    const maxDepthByTex = new Map<number, number>();
    for (const key of learnCounts.keys()) {
      const [topTex, k] = key.split('|').map(Number);
      maxDepthByTex.set(topTex, Math.max(maxDepthByTex.get(topTex) ?? 0, k));
    }
    const sampleFor = (topTex: number, k: number) => {
      const entry = mostCommon(`${topTex}|${k}`);
      if (entry) return entry;
      if (k === 0) return null;
      const maxDepth = maxDepthByTex.get(topTex) ?? 0;
      for (let kk = Math.min(k, maxDepth); kk >= 1; kk--) {
        const e2 = mostCommon(`${topTex}|${kk}`);
        if (e2) return e2;
      }
      return undergroundSample;
    };

    // 颜色参照：带子里每张贴图所有的面按最亮顶点色排，取四分之三位——这张贴图露天时的颜色。补的面照搬样本颜色，样本被 AO 压暗（比参照暗两成以上）就用参照
    const luma = (c: number[]) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    const brightestColor = (i: number) => {
      const rec = records[i];
      let best = [0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const at = rec.at + k * stride + 20;
        const color = [dv.getUint8(at), dv.getUint8(at + 1), dv.getUint8(at + 2)];
        if (luma(color) >= luma(best)) best = color;
      }
      return best;
    };
    const texRefColor = new Map<number, number[]>();
    {
      const colorsByTex: Map<number, number[][]> = new Map();
      for (const rs of cellFaces.values())
        for (const i of rs) {
          const t = records[i].textureId;
          let list = colorsByTex.get(t);
          if (!list) colorsByTex.set(t, (list = []));
          list.push(brightestColor(i));
        }
      for (const [t, cs] of colorsByTex) {
        cs.sort((a, b) => luma(a) - luma(b));
        texRefColor.set(t, cs[Math.floor(cs.length * 0.75)]);
      }
    }
    const patchColor = (i: number) => {
      const color = brightestColor(i), refColor = texRefColor.get(records[i].textureId);
      return refColor && luma(color) < 0.8 * luma(refColor) ? refColor : color;
    };

    // 补一面：把 源格 源d 那几张面搬到 格 d 上
    const copyFace = (srcCell: number[], srcDir: number, cell: number[], dir: number, statKey: string) => {
      const rs = facesAt(srcCell[0], srcCell[1], srcCell[2], srcDir)!.filter((i) => records[i].onGridPlane || srcDir === 2);
      let patched = 0;
      for (const i of rs) {
        const rec = records[i];
        const tmp: ExtraFaces = { pos: [], uv: [], col: [], r: [] };
        emitSubFace(dv, rec.at, stride, rec.f, rec.sa, rec.sb, rec.ta, rec.tb, tmp, { srcCell, srcDir, cell: cell, d: dir, o: origin }, true, patchColor(i));
        // 筛：所属格（面心沿法向往里退 0.01）在 hide、hideBlocks 里，或面心在 hide 里，不补
        const center = [0, 1, 2].map((j) => (tmp.pos[j] + tmp.pos[3 + j] + tmp.pos[6 + j] + tmp.pos[9 + j]) / 4);
        const innerPt = [0, 1, 2].map((j) => center[j] - 0.01 * NORMALS[dir][j]);
        if (hideBlockBoxes.has(innerPt[0], innerPt[1], innerPt[2]) || hideBoxes.has(innerPt[0], innerPt[1], innerPt[2]) || hideBoxes.has(center[0], center[1], center[2])) continue;
        const dest = out[rec.L];
        dest.pos.push(...tmp.pos);
        dest.uv.push(...tmp.uv);
        dest.col.push(...tmp.col);
        dest.r.push(...tmp.r);
        patched++;
      }
      if (patched) tally(statKey, patched);
      return patched > 0;
    };

    // 补光：边上已有的朝外的面（树叶挨树叶的面、导出上限那层树叶的顶）烘进去的 AO 照的是旧世界邻居，几乎全黑；
    // 邻居已换成新世界，这些面按露天重打光：比参照暗两成以上的换成参照色重画（原来那张拿掉）。
    // 参照：同一格别的方向有同一张贴图的面就取那几面里最亮的顶点色（染色才对：群系不同草色不同），比贴图参照暗就按比例提亮到贴图参照
    const relight = (x: number, y: number, z: number, dir: number) => {
      const rs = facesAt(x, y, z, dir)!.filter((i) => records[i].onGridPlane);
      for (const i of rs) {
        const rec = records[i];
        const quadIdx = (rec.at - info.layers[rec.L].byteOffset) / (4 * stride);
        if (removedQuads[rec.L].has(quadIdx)) continue;
        if (splitQuads[rec.L].has(quadIdx)) continue;
        let cellRef: number[] | null = null;
        for (let dd = 0; dd < 6; dd++) {
          if (dd === dir) continue;
          for (const j of facesAt(x, y, z, dd) ?? []) if (records[j].textureId === rec.textureId) { const color = brightestColor(j); if (!cellRef || luma(color) > luma(cellRef)) cellRef = color; }
        }
        const texRef = texRefColor.get(rec.textureId) ?? null;
        let refColor = cellRef ?? texRef;
        if (cellRef && texRef && luma(cellRef) > 0 && luma(cellRef) < luma(texRef)) {
          const k = luma(texRef) / luma(cellRef);
          refColor = cellRef.map((v) => Math.min(255, v * k));
        }
        if (!refColor || luma(brightestColor(i)) >= 0.8 * luma(refColor)) continue;
        // 整张面重画（合并出来的大面也整张，它在边界平面上、几格都是边上的格）
        emitSubFace(dv, rec.at, stride, rec.f, rec.f.s0, rec.f.s1, rec.f.t0, rec.f.t1, out[rec.L], undefined, true, refColor);
        removedQuads[rec.L].add(quadIdx);
        tally('补光');
      }
    };

    // 边上的格朝外的方向
    const outwardDirs = (x: number, y: number, z: number) => {
      const ds: number[] = [];
      if (x === toPos[0]) ds.push(0);
      if (x === fromPos[0]) ds.push(1);
      if (z === toPos[2]) ds.push(4);
      if (z === fromPos[2]) ds.push(5);
      if (!hideBlockBoxes.empty)
        for (const dir of HORIZ_DIRS) {
          const nx2 = x + NORMALS[dir][0], nz2 = z + NORMALS[dir][2];
          if (!ds.includes(dir) && inBounds(nx2, y, nz2) && blockHidden(nx2, y, nz2)) ds.push(dir);
        }
      return ds;
    };

    // 一、有面的格：朝外那面缺的，照这一格另一面补
    for (const [colKey, ys] of colCellYs) {
      const z = (colKey % nz) - 1 + fromPos[2], x = Math.floor(colKey / nz) - 1 + fromPos[0];
      for (const y of ys) {
        if (blockHidden(x, y, z) || cellCenterHidden(x, y, z) || !hasAnyFace(x, y, z)) continue;
        const ds = outwardDirs(x, y, z);
        if (y === toPos[1]) ds.push(2);
        for (const dir of ds) {
          if (hasFace(x, y, z, dir)) { relight(x, y, z, dir); continue; }
          const cell = [x, y, z];
          if (dir === 2) {
            // 导出上限截平的地方：照底面，没有就照一个侧面（树叶、冰、原木截开的顶）
            if (facesAt(x, y, z, 3)?.some((i) => records[i].full && records[i].onGridPlane)) copyFace(cell, 3, cell, 2, '补顶');
            else {
              const fullSideDir = HORIZ_DIRS.find((dd) => facesAt(x, y, z, dd)?.some((i) => records[i].full && records[i].onGridPlane));
              if (fullSideDir !== undefined) copyFace(cell, fullSideDir, cell, 2, '补顶');
            }
            continue;
          }
          const oppositeDir = dir ^ 1;
          if (hasFace(x, y, z, oppositeDir)) { copyFace(cell, oppositeDir, cell, dir, '补侧-对面'); continue; }
          const sideDir = HORIZ_DIRS.find((dd) => dd !== dir && dd !== oppositeDir && hasFace(x, y, z, dd));
          if (sideDir !== undefined) { copyFace(cell, sideDir, cell, dir, '补侧-旁边'); continue; }
          // 只有顶面、底面的格（平地上的草方块）：照学到的这种顶面的侧面（草方块顶 → 草方块侧面）
          const topRecIdx = topFaceAt(x, y, z);
          const sample = topRecIdx !== undefined ? sampleFor(records[topRecIdx].textureId, 0) : null;
          if (sample) { copyFace(sample.cell, sample.d, cell, dir, '补侧-学的'); continue; }
          if (topRecIdx !== undefined) { copyFace(cell, 2, cell, dir, '补侧-照顶'); continue; }
          if (hasFace(x, y, z, 3)) copyFace(cell, 3, cell, dir, '补侧-照底');
        }
      }
    }

    // 二、竖着补：每段实心从顶面那格往下补到这段的底面或下一段的顶；地面那段补 `裙深` 格，最多到网格底。中间没有面的格是实心里面，照学到的「这种顶面往下第 k 格」补
    for (const [colKey, ys] of colCellYs) {
      const z = (colKey % nz) - 1 + fromPos[2], x = Math.floor(colKey / nz) - 1 + fromPos[0];
      for (const topY of ys) {
        if (topFaceAt(x, topY, z) === undefined || blockHidden(x, topY, z) || cellCenterHidden(x, topY, z)) continue;
        const ds = outwardDirs(x, topY, z);
        if (!ds.length) continue;
        const topTex = records[topFaceAt(x, topY, z)!].textureId;
        for (let k = 0; k <= skirtDepth; k++) {
          const y = topY - k;
          if (y < fromPos[1] || (k > 0 && topFaceAt(x, y, z) !== undefined)) break;
          const cell = [x, y, z];
          // 有面的格在一里补过了
          if (!hasAnyFace(x, y, z))
            for (const dir of ds) {
              if (hasFace(x, y, z, dir)) continue;
              const sample = sampleFor(topTex, k);
              if (sample) copyFace(sample.cell, sample.d, cell, dir, k === 0 ? '顶格-学的' : '裙边');
              else if (k === 0) copyFace(cell, 2, cell, dir, '顶格-照顶');
              else tally('裙边-没样本');
            }
          if (hasBottomFace(x, y, z)) break;
        }
      }
    }
    return removedQuads;
  }
};
