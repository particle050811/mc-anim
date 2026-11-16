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
  private gx0: number;
  private gz0: number;
  private nx: number;
  private nz: number;
  private o: number[];
  constructor(modelBoxes: number[][], gx0: number, gz0: number, nx: number, nz: number, o: number[]) {
    this.gx0 = gx0;
    this.gz0 = gz0;
    this.nx = nx;
    this.nz = nz;
    this.o = o;
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
  // 每个面都要查，不在里面建闭包、数组
  has(x: number, y: number, z: number) {
    const boxes = this.boxes;
    const cx = Math.floor(x + this.o[0]) - this.gx0, cz = Math.floor(z + this.o[2]) - this.gz0;
    if (cx < 0 || cz < 0 || cx >= this.nx || cz >= this.nz) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) return true;
      }
      return false;
    }
    const t = this.buckets[cx * this.nz + cz];
    if (!t) return false;
    for (let j = 0; j < t.length; j++) {
      const b = boxes[t[j]];
      if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) return true;
    }
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
// 网格的每个面都读一遍：四个角、叉积都放在局部变量里，不建临时数组（算式和顺序不动，结果逐位不变）
const cornerS = new Float64Array(4);
const cornerT = new Float64Array(4);
const nearestCorner = (ss: number, tt: number) => {
  let best = 0, bd = Infinity;
  for (let k = 0; k < 4; k++) {
    const dist = Math.abs(cornerS[k] - ss) + Math.abs(cornerT[k] - tt);
    if (dist < bd) { bd = dist; best = k; }
  }
  return best;
};
// out：结果写进这个对象（连它的 c）再返回它，逐面调的地方复用一个；要留着的自己拷一份
export const readFace = (dv: DataView, at: number, stride: number, out?: Face): Face | null => {
  const at1 = at + stride, at2 = at + 2 * stride, at3 = at + 3 * stride;
  const x0 = dv.getFloat32(at, true), y0 = dv.getFloat32(at + 4, true), z0 = dv.getFloat32(at + 8, true);
  const x1 = dv.getFloat32(at1, true), y1 = dv.getFloat32(at1 + 4, true), z1 = dv.getFloat32(at1 + 8, true);
  const x2 = dv.getFloat32(at2, true), y2 = dv.getFloat32(at2 + 4, true), z2 = dv.getFloat32(at2 + 8, true);
  const x3 = dv.getFloat32(at3, true), y3 = dv.getFloat32(at3 + 4, true), z3 = dv.getFloat32(at3 + 8, true);
  const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
  const vx = x3 - x0, vy = y3 - y0, vz = z3 - z0;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const normalLen = Math.hypot(nx, ny, nz);
  if (normalLen < 1e-9) return null;
  let dir = -1;
  for (let i = 0; i < 6; i++) {
    const n = NORMALS[i];
    if ((n[0] * nx + n[1] * ny + n[2] * nz) / normalLen > 0.999) dir = i;
  }
  if (dir < 0) {
    if (!out) return { d: dir, w: 0, s0: 0, s1: 0, t0: 0, t1: 0, c: [] };
    out.d = dir;
    return out;
  }
  const tu = TU[dir], tv = TV[dir], n = NORMALS[dir];
  const sA = x0 * tu[0] + y0 * tu[1] + z0 * tu[2], sB = x1 * tu[0] + y1 * tu[1] + z1 * tu[2], sC = x2 * tu[0] + y2 * tu[1] + z2 * tu[2], sD = x3 * tu[0] + y3 * tu[1] + z3 * tu[2];
  const tA = x0 * tv[0] + y0 * tv[1] + z0 * tv[2], tB = x1 * tv[0] + y1 * tv[1] + z1 * tv[2], tC = x2 * tv[0] + y2 * tv[1] + z2 * tv[2], tD = x3 * tv[0] + y3 * tv[1] + z3 * tv[2];
  const s0 = Math.min(sA, sB, sC, sD), s1 = Math.max(sA, sB, sC, sD), t0 = Math.min(tA, tB, tC, tD), t1 = Math.max(tA, tB, tC, tD);
  cornerS[0] = sA; cornerS[1] = sB; cornerS[2] = sC; cornerS[3] = sD;
  cornerT[0] = tA; cornerT[1] = tB; cornerT[2] = tC; cornerT[3] = tD;
  const w = x0 * n[0] + y0 * n[1] + z0 * n[2];
  if (!out) return { d: dir, w, s0, s1, t0, t1, c: [nearestCorner(s0, t0), nearestCorner(s1, t0), nearestCorner(s1, t1), nearestCorner(s0, t1)] };
  out.d = dir; out.w = w; out.s0 = s0; out.s1 = s1; out.t0 = t0; out.t1 = t1;
  out.c[0] = nearestCorner(s0, t0); out.c[1] = nearestCorner(s1, t0); out.c[2] = nearestCorner(s1, t1); out.c[3] = nearestCorner(s0, t1);
  return out;
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
// 同 `splitIntoCells`，不建数组：一面沿 s、t 各切成几格，和第 i 格的范围 [cellLo, cellHi]（逐面调的地方用）
export const cellCount = (lo: number, hi: number) => (hi - lo <= 1.001 ? 1 : Math.round(hi - lo));
export const cellLo = (lo: number, hi: number, i: number) => (hi - lo <= 1.001 ? lo : lo + i);
export const cellHi = (lo: number, hi: number, n: number, i: number) => (hi - lo <= 1.001 || i === n - 1 ? hi : lo + i + 1);
// 一块（面上的范围）中心沿法向往里退 0.01 的点（bin）：落在这个面所属的那一格里。out：写进这个数组（逐面调的地方复用一个）
export const innerPoint = (face: Face, sa: number, sb: number, ta: number, tb: number, out: number[] = [0, 0, 0]) => {
  const sMid = (sa + sb) / 2, t = (ta + tb) / 2;
  const n = NORMALS[face.d], tu = TU[face.d], tv = TV[face.d];
  for (let i = 0; i < 3; i++) out[i] = (face.w - 0.01) * n[i] + sMid * tu[i] + t * tv[i];
  return out;
};
