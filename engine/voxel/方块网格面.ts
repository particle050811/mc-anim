// 方块网格 .bin 里的面（bin 坐标，见 方块网格补面.ts 文件头）：六个方向和面上的 (tu, tv) 坐标系、按方块列分桶的盒子查询、
// 读一个面、按格切开、把一块搬到别的格别的方向写成新面。方块网格补面.ts 用。
// 加出来的面：每个面 4 个顶点，pos 12 个数（bin 坐标）、uv 8 个、col 12 个（顶点色 0～255）、r 1 个（贴图号），同 .bin
export type ExtraFaces = { pos: number[]; uv: number[]; col: number[]; r: number[] };

// ---------- 方向和面上的坐标系 ----------
// 方向 0 +x、1 −x、2 +y（上）、3 −y（下）、4 +z（南）、5 −z（北）（bin / 游戏坐标）
export const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// 每个方向的面上取右手系 (tu, tv, n)：tu × tv = n，(0,0)→(1,0)→(1,1)→(0,1) 从外面看逆时针（three 的正面）。
// 侧面 tv 一律朝上，侧面之间搬贴图不会倒
export const TU = [[0, 0, -1], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [1, 0, 0], [-1, 0, 0]];
export const TV = [[0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, -1], [0, 1, 0], [0, 1, 0]];
export const HORIZ_DIRS = [0, 1, 4, 5];
export const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// 一格 C（游戏坐标的方块格）d 方向那一面的 (s, t) = (0, 0) 角（游戏坐标）
const faceCorner = (C: number[], d: number) => [0, 1, 2].map((i) => C[i] + (NORMALS[d][i] !== 0 ? (NORMALS[d][i] > 0 ? 1 : 0) : TU[d][i] < 0 || TV[d][i] < 0 ? 1 : 0));

// ---------- 盒子查询 ----------
// 盒子按水平方块列分桶（网格范围内），查一点只试这一列；网格范围外的点试全部。判法：严格在盒子里
export class BoxBuckets {
  private boxes: number[][]; // bin 坐标 [x0, y0, z0, x1, y1, z1]
  private buckets: (number[] | undefined)[];
  constructor(modelBoxes: number[][], private gx0: number, private gz0: number, private nx: number, private nz: number, private o: number[]) {
    // 参考模型 [x, y, z] = bin [x, −z, y]
    this.boxes = modelBoxes.map(([x0, y0, z0, x1, y1, z1]) => [x0, z0, -y1, x1, z1, -y0]);
    this.buckets = new Array(nx * nz);
    this.boxes.forEach((box, i) => {
      const cx0 = Math.max(0, Math.floor(box[0] + o[0]) - gx0), cx1 = Math.min(nx - 1, Math.ceil(box[3] + o[0]) - 1 - gx0);
      const cz0 = Math.max(0, Math.floor(box[2] + o[2]) - gz0), cz1 = Math.min(nz - 1, Math.ceil(box[5] + o[2]) - 1 - gz0);
      for (let cx = cx0; cx <= cx1; cx++)
        for (let cz = cz0; cz <= cz1; cz++) {
          const k = cx * nz + cz;
          (this.buckets[k] ??= []).push(i);
        }
    });
  }
  get empty() {
    return this.boxes.length === 0;
  }
  // bin 坐标的一点
  has(x: number, y: number, z: number) {
    const cx = Math.floor(x + this.o[0]) - this.gx0, cz = Math.floor(z + this.o[2]) - this.gz0;
    const inBox = (b: number[]) => x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5];
    if (cx < 0 || cz < 0 || cx >= this.nx || cz >= this.nz) return this.boxes.some(inBox);
    const t = this.buckets[cx * this.nz + cz];
    if (!t) return false;
    for (const i of t) if (inBox(this.boxes[i])) return true;
    return false;
  }
}

// ---------- 读面 ----------
export type Face = {
  d: number; // 方向，−1 = 不是轴向的面（花草的十字面、斜面）
  w: number; // 面所在平面在法向上的坐标（bin）
  s0: number; s1: number; t0: number; t1: number; // 面在 (tu, tv) 上的范围（bin）
  c: number[]; // 四个角在顶点里的序号：(s0,t0) (s1,t0) (s1,t1) (s0,t1)
};
export const readFace = (dv: DataView, at: number, stride: number): Face | null => {
  const corners: number[][] = [];
  for (let k = 0; k < 4; k++) corners.push([dv.getFloat32(at + k * stride, true), dv.getFloat32(at + k * stride + 4, true), dv.getFloat32(at + k * stride + 8, true)]);
  const edgeU = [corners[1][0] - corners[0][0], corners[1][1] - corners[0][1], corners[1][2] - corners[0][2]];
  const edgeV = [corners[3][0] - corners[0][0], corners[3][1] - corners[0][1], corners[3][2] - corners[0][2]];
  const normal = [edgeU[1] * edgeV[2] - edgeU[2] * edgeV[1], edgeU[2] * edgeV[0] - edgeU[0] * edgeV[2], edgeU[0] * edgeV[1] - edgeU[1] * edgeV[0]];
  const normalLen = Math.hypot(normal[0], normal[1], normal[2]);
  if (normalLen < 1e-9) return null;
  let dir = -1;
  for (let i = 0; i < 6; i++) if (dot(NORMALS[i], normal) / normalLen > 0.999) dir = i;
  if (dir < 0) return { d: dir, w: 0, s0: 0, s1: 0, t0: 0, t1: 0, c: [] };
  const sVals = corners.map((q) => dot(q, TU[dir])), t = corners.map((q) => dot(q, TV[dir]));
  const s0 = Math.min(...sVals), s1 = Math.max(...sVals), t0 = Math.min(...t), t1 = Math.max(...t);
  const nearestCorner = (ss: number, tt: number) => {
    let best = 0, bd = Infinity;
    for (let k = 0; k < 4; k++) {
      const dist = Math.abs(sVals[k] - ss) + Math.abs(t[k] - tt);
      if (dist < bd) { bd = dist; best = k; }
    }
    return best;
  };
  return { d: dir, w: dot(corners[0], NORMALS[dir]), s0, s1, t0, t1, c: [nearestCorner(s0, t0), nearestCorner(s1, t0), nearestCorner(s1, t1), nearestCorner(s0, t1)] };
};

// 一面里 (s, t) ∈ [sa, sb] × [ta, tb] 那一块（双线性插值顶点属性）；搬到 (目标格, 目标方向) 给 `FaceTransfer`，
// 匀色：四个顶点都用最亮那个的颜色（原来那面的环境光遮蔽是照它自己的邻居烘的，搬过来不对，当没有遮挡）
type FaceTransfer = { srcCell: number[]; srcDir: number; cell: number[]; d: number; o: number[] };
export const emitSubFace = (dv: DataView, at: number, stride: number, face: Face, sa: number, sb: number, ta: number, tb: number, out: ExtraFaces, transfer?: FaceTransfer, uniformColor = false, colorOverride?: number[]) => {
  const vertFloat = (k: number, off: number) => dv.getFloat32(at + face.c[k] * stride + off, true);
  const vertColor = (k: number, j: number) => dv.getUint8(at + face.c[k] * stride + 20 + j);
  const ds = face.s1 - face.s0 || 1, dt = face.t1 - face.t0 || 1;
  let maxLuma = 0, brightColor = [0, 0, 0];
  if (uniformColor)
    for (let k = 0; k < 4; k++) {
      const y = vertColor(k, 0) * 0.3 + vertColor(k, 1) * 0.59 + vertColor(k, 2) * 0.11;
      if (y >= maxLuma) { maxLuma = y; brightColor = [vertColor(k, 0), vertColor(k, 1), vertColor(k, 2)]; }
    }
  if (colorOverride) brightColor = colorOverride;
  const srcCorner = transfer ? faceCorner(transfer.srcCell, transfer.srcDir) : null;
  const dstCorner = transfer ? faceCorner(transfer.cell, transfer.d) : null;
  for (const [sCoord, t] of [[sa, ta], [sb, ta], [sb, tb], [sa, tb]]) {
    const sFrac = (sCoord - face.s0) / ds, tFrac = (t - face.t0) / dt;
    const w00 = (1 - sFrac) * (1 - tFrac), w10 = sFrac * (1 - tFrac), w11 = sFrac * tFrac, w01 = (1 - sFrac) * tFrac;
    const mix = (off: number) => w00 * vertFloat(0, off) + w10 * vertFloat(1, off) + w11 * vertFloat(2, off) + w01 * vertFloat(3, off);
    // 位置：bin = w·n + s·tu + t·tv
    let pos = [0, 1, 2].map((i) => face.w * NORMALS[face.d][i] + sCoord * TU[face.d][i] + t * TV[face.d][i]);
    if (transfer) {
      // 源格那一面上的 (s', t') → 目标格那一面
      const gamePos = [pos[0] + transfer.o[0], pos[1] + transfer.o[1], pos[2] + transfer.o[2]];
      const rel = [gamePos[0] - srcCorner![0], gamePos[1] - srcCorner![1], gamePos[2] - srcCorner![2]];
      const ss = dot(rel, TU[transfer.srcDir]), tt = dot(rel, TV[transfer.srcDir]);
      pos = [0, 1, 2].map((i) => dstCorner![i] + ss * TU[transfer.d][i] + tt * TV[transfer.d][i] - transfer.o[i]);
    }
    out.pos.push(pos[0], pos[1], pos[2]);
    out.uv.push(mix(12), mix(16));
    if (uniformColor) out.col.push(brightColor[0], brightColor[1], brightColor[2]);
    else for (let j = 0; j < 3; j++) out.col.push(w00 * vertColor(0, j) + w10 * vertColor(1, j) + w11 * vertColor(2, j) + w01 * vertColor(3, j));
  }
  out.r.push(stride >= 28 ? dv.getUint32(at + 24, true) : 0);
};

// 一面按方块格切成几块：沿 s、t 各自超过一格的切成一格一块（合并出来的大面），不超过的就是一块
export const splitIntoCells = (face: Face) => {
  const splitRange = (lo: number, hi: number) => {
    if (hi - lo <= 1.001) return [[lo, hi]];
    const cellCount = Math.round(hi - lo);
    return Array.from({ length: cellCount }, (_, i) => [lo + i, i === cellCount - 1 ? hi : lo + i + 1]);
  };
  const out: number[][] = [];
  for (const [sa, sb] of splitRange(face.s0, face.s1)) for (const [ta, tb] of splitRange(face.t0, face.t1)) out.push([sa, sb, ta, tb]);
  return out;
};
// 一块（面上的范围）中心沿法向往里退 0.01 的点（bin）：落在这个面所属的那一格里
export const innerPoint = (face: Face, sa: number, sb: number, ta: number, tb: number) => {
  const sMid = (sa + sb) / 2, t = (ta + tb) / 2;
  return [0, 1, 2].map((i) => (face.w - 0.01) * NORMALS[face.d][i] + sMid * TU[face.d][i] + t * TV[face.d][i]);
};
