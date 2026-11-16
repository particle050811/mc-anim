// 弯折：把挂在一根肢体上的面（皮肤方盒、外层、盔甲网格）在关节处折一个角，给史蒂夫的肘和膝用。纯计算、不碰 three。
// 用户 11-10 定：史蒂夫要改绑骨骼、加关节，不再完全照原版（原版玩家模型手臂、腿各是一整根方盒）。
// 坐标是部件里的模型像素（y 朝下 = 顺着肢体往手、脚去，z 朝后）。铰链是一条平行 x 轴的线，过 (y = 切, z = 铰z)；
// 角（弧度）按绕 +x 的右手方向：正 = 下半节往 +z（后）折（膝），负 = 往 −z（前）折（肘）。
// 做法：
// - 上半节 = 原来的面留下 y ≤ 切、又在角平分面上侧的部分；下半节 = y ≥ 切、又在角平分面下侧的部分，再绕铰链转过去。
//   折的内侧两节本来会互相吃进去，各让到角平分面（斜接），不重叠，侧面不会两层贴在一起闪。
// - 折的外侧张开一个楔形的口：把切面上那一圈切线绕铰链从 0 扫到 角，补一圈弧面（桥）。桥的贴图坐标沿扫的方向不变：
//   前一半用切线上方一点点那一行，后一半用下方一点点那一行（正好取在两行贴图像素的边上会抖）。
// - 角 = 0 时原样返回，一个三角都不动。
// 只认真正跨过切面的三角：有一条边正好躺在切面上的（模型本来就在这里分了块）不出桥。
import { lerpV } from '@engine/core/数学.ts';

export type Vertex = { p: readonly number[]; uv: readonly number[]; n: readonly number[] };
export type Triangle = readonly [Vertex, Vertex, Vertex];

/** 顶点表（每顶点 8 个数：x y z、u v、法线 x y z；四个顶点一个四边形，同 库/角色/网格盔甲.tsx）→ 三角，绕向照 (0,1,2)(0,2,3) */
export const vertexTableToTriangles = (vertices: readonly number[]): Triangle[] => {
  if (vertices.length % 32) throw new Error(`顶点表转三角：长度 ${vertices.length} 不是 32 的倍数`);
  const vertexAt = (i: number): Vertex => ({ p: vertices.slice(i * 8, i * 8 + 3), uv: vertices.slice(i * 8 + 3, i * 8 + 5), n: vertices.slice(i * 8 + 5, i * 8 + 8) });
  const triangles: Triangle[] = [];
  for (let q = 0; q < vertices.length / 8; q += 4) {
    const [a, b, c, d] = [vertexAt(q), vertexAt(q + 1), vertexAt(q + 2), vertexAt(q + 3)];
    triangles.push([a, b, c], [a, c, d]);
  }
  return triangles;
};

const lerpVertex = (a: Vertex, b: Vertex, t: number): Vertex => ({ p: lerpV(a.p, b.p, t), uv: lerpV(a.uv, b.uv, t), n: lerpV(a.n, b.n, t) });

type Face = { ny: number; nz: number; d: number };
const tolerance = 1e-7;
const sideOf = (face: Face, v: Vertex) => {
  const f = face.ny * v.p[1]! + face.nz * v.p[2]! - face.d;
  return Math.abs(f) < tolerance ? 0 : f;
};
// 边和面的交点：一律从 f < 0 的那头往 f > 0 的那头插，两侧各裁一遍算出来的是同一个数（接缝不裂）
const intersect = (a: Vertex, fa: number, b: Vertex, fb: number): Vertex => (fa < 0 ? lerpVertex(a, b, fa / (fa - fb)) : lerpVertex(b, a, fb / (fb - fa)));

/** 留下 面 的一侧（留 = −1：ny·y + nz·z ≤ d；+1：≥ d）。裁出来的多边形照原来的绕向扇形拆回三角 */
export const clipByPlane = (triangles: readonly Triangle[], face: Face, keepSide: 1 | -1): Triangle[] => {
  const kept: Triangle[] = [];
  for (const triangle of triangles) {
    const f = [sideOf(face, triangle[0]) * keepSide, sideOf(face, triangle[1]) * keepSide, sideOf(face, triangle[2]) * keepSide];
    if (f[0]! >= 0 && f[1]! >= 0 && f[2]! >= 0) {
      kept.push(triangle);
      continue;
    }
    if (f[0]! <= 0 && f[1]! <= 0 && f[2]! <= 0) continue;
    const clippedPolygon: Vertex[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (f[i]! >= 0) clippedPolygon.push(triangle[i]!);
      if (f[i]! * f[j]! < 0) clippedPolygon.push(intersect(triangle[i]!, f[i]! * keepSide, triangle[j]!, f[j]! * keepSide));
    }
    for (let i = 1; i + 1 < clippedPolygon.length; i++) kept.push([clippedPolygon[0]!, clippedPolygon[i]!, clippedPolygon[i + 1]!]);
  }
  return kept;
};

const rotatePoint = (p: readonly number[], cut: number, hingeZ: number, cos: number, sin: number): number[] => {
  const [dy, dz] = [p[1]! - cut, p[2]! - hingeZ];
  return [p[0]!, cut + dy * cos - dz * sin, hingeZ + dy * sin + dz * cos];
};
const rotateNormal = (n: readonly number[], cos: number, sin: number): number[] => [n[0]!, n[1]! * cos - n[2]! * sin, n[1]! * sin + n[2]! * cos];

// (q − p) × (r − p)
const crossPoints = (p: readonly number[], q: readonly number[], r: readonly number[]): number[] => {
  const [ux, uy, uz, wx, wy, wz] = [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!, r[0]! - p[0]!, r[1]! - p[1]!, r[2]! - p[2]!];
  return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
};
const addVec = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v + b[i]!);

type OpenPoint = { p: readonly number[]; n: readonly number[]; uvUpper: readonly number[]; uvLower: readonly number[] };
/** 贴图坐标往切线两边各让多少像素取（切线正好在两行贴图像素的边上） */
const stepTotal = 0.02;

// 三角和切面 y = 切 的交线（两个端点）；不跨过切面的没有
const cutTangent = (triangle: Triangle, cut: number): [OpenPoint, OpenPoint] | null => {
  const face = { ny: 1, nz: 0, d: cut };
  const f = [sideOf(face, triangle[0]), sideOf(face, triangle[1]), sideOf(face, triangle[2])];
  if (!(f.some((v) => v < 0) && f.some((v) => v > 0))) return null;
  const points: OpenPoint[] = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    if (f[i] === 0) points.push({ p: triangle[i]!.p, n: triangle[i]!.n, uvUpper: triangle[i]!.uv, uvLower: triangle[i]!.uv });
    if (f[i]! * f[j]! < 0) {
      const [upperVertex, lowerVert, fUpper, fLower] = f[i]! < 0 ? [triangle[i]!, triangle[j]!, f[i]!, f[j]!] : [triangle[j]!, triangle[i]!, f[j]!, f[i]!];
      const t = fUpper / (fUpper - fLower);
      const epsilon = stepTotal / (fLower - fUpper);
      const crossVert = intersect(upperVertex, fUpper, lowerVert, fLower);
      points.push({ p: crossVert.p, n: crossVert.n, uvUpper: lerpV(upperVertex.uv, lowerVert.uv, Math.max(0, t - epsilon)), uvLower: lerpV(upperVertex.uv, lowerVert.uv, Math.min(1, t + epsilon)) });
    }
  }
  return points.length === 2 ? [points[0]!, points[1]!] : null;
};

export type BendParams = {
  /** 关节在肢体上的位置（部件里的 y，像素） */
  cut: number;
  /** 铰链的 z（像素）：比它更靠折的内侧的料两节各让到角平分面，外侧的张口补弧面 */
  hingeZ: number;
  /** 弧度，正 = 下半节往 +z 折 */
  angle: number;
  /** 弧面每多少弧度分一段（默认 15 度）；段数取偶数，至少 2 */
  每段?: number;
};

/** 上半节、转过去的下半节、外侧的桥，都在部件坐标里（下半节已经转好，直接和上半节放一起画） */
export const bend = (triangles: readonly Triangle[], bendParams: BendParams): { 上: Triangle[]; 下: Triangle[]; bridge: Triangle[] } => {
  const { cut, hingeZ, angle: bendAngle } = bendParams;
  if (bendAngle === 0) return { 上: [...triangles], 下: [], bridge: [] };
  const cutPlane = { ny: 1, nz: 0, d: cut };
  const [halfCos, halfSin] = [Math.cos(bendAngle / 2), Math.sin(bendAngle / 2)];
  // 角平分面过铰链，法线 = ŷ 绕 x 转半个角；下半节在自己没转的坐标里是往回转半个角的那一面
  const upper = clipByPlane(clipByPlane(triangles, cutPlane, -1), { ny: halfCos, nz: halfSin, d: halfCos * cut + halfSin * hingeZ }, -1);
  const lowerOrig = clipByPlane(clipByPlane(triangles, cutPlane, 1), { ny: halfCos, nz: -halfSin, d: halfCos * cut - halfSin * hingeZ }, 1);
  const [cos, sin] = [Math.cos(bendAngle), Math.sin(bendAngle)];
  const rotateVertex = (v: Vertex): Vertex => ({ p: rotatePoint(v.p, cut, hingeZ, cos, sin), uv: v.uv, n: rotateNormal(v.n, cos, sin) });
  const lower = lowerOrig.map((triangle): Triangle => [rotateVertex(triangle[0]), rotateVertex(triangle[1]), rotateVertex(triangle[2])]);

  const segCount = Math.max(2, 2 * Math.ceil(Math.abs(bendAngle) / (bendParams.每段 ?? Math.PI / 12) / 2));
  const sign = Math.sign(bendAngle);
  const bridge: Triangle[] = [];
  for (const triangle of triangles) {
    const tangent = cutTangent(triangle, cut);
    if (!tangent) continue;
    // 只扫张口那一侧（角为正时是 z < 铰z）：跨过铰链的切线截到铰链上
    let [a, b] = tangent;
    const [ga, gb] = [sign * (a.p[2]! - hingeZ), sign * (b.p[2]! - hingeZ)];
    if (ga >= -tolerance && gb >= -tolerance) continue;
    if (ga > tolerance || gb > tolerance) {
      const t = ga / (ga - gb);
      const clipVert: OpenPoint = { p: lerpV(a.p, b.p, t), n: lerpV(a.n, b.n, t), uvUpper: lerpV(a.uvUpper, b.uvUpper, t), uvLower: lerpV(a.uvLower, b.uvLower, t) };
      if (ga > 0) a = clipVert;
      else b = clipVert;
    }
    for (let i = 0; i < segCount; i++) {
      const [α0, α1] = [(bendAngle * i) / segCount, i + 1 === segCount ? bendAngle : (bendAngle * (i + 1)) / segCount];
      const [c0, s0, c1, s1] = [Math.cos(α0), Math.sin(α0), Math.cos(α1), Math.sin(α1)];
      const uv = (q: OpenPoint) => (i < segCount / 2 ? q.uvUpper : q.uvLower);
      const bendPoint = (q: OpenPoint, c: number, s: number): Vertex => ({ p: rotatePoint(q.p, cut, hingeZ, c, s), uv: uv(q), n: rotateNormal(q.n, c, s) });
      // 第一圈原样用切线上的点（和上半节的切口是同一个数），最后一圈和下半节用同一个 cos、sin
      const startVertex = (q: OpenPoint): Vertex => (i === 0 ? { p: q.p, uv: uv(q), n: q.n } : bendPoint(q, c0, s0));
      const [a0, b0, a1, b1] = [startVertex(a), startVertex(b), bendPoint(a, c1, s1), bendPoint(b, c1, s1)];
      // 绕向和法线对上（材质两面都画，背面的法线会被翻过来算光照）；一头在铰链上时有一个三角是退化的，两个三角的法向加起来看
      const normal = addVec(crossPoints(a0.p, b0.p, b1.p), crossPoints(a0.p, b1.p, a1.p));
      const aligned = normal[0]! * a0.n[0]! + normal[1]! * a0.n[1]! + normal[2]! * a0.n[2]! >= 0;
      if (aligned) bridge.push([a0, b0, b1], [a0, b1, a1]);
      else bridge.push([a0, b1, b0], [a0, a1, b1]);
    }
  }
  return { 上: upper, 下: lower, bridge };
};

/** 三角 → 不带索引的顶点数组（位置、法线、贴图坐标），法线归一 */
export const trianglesToArrays = (triGroups: readonly (readonly Triangle[])[]): { 位置: Float32Array; normals: Float32Array; uv: Float32Array } => {
  const count = triGroups.reduce((sum, triangles) => sum + triangles.length, 0) * 3;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let k = 0;
  for (const triangles of triGroups)
    for (const triangle of triangles)
      for (const v of triangle) {
        positions.set(v.p, k * 3);
        const vecLength = Math.hypot(v.n[0]!, v.n[1]!, v.n[2]!) || 1;
        normals.set([v.n[0]! / vecLength, v.n[1]! / vecLength, v.n[2]! / vecLength], k * 3);
        uv.set(v.uv, k * 2);
        k++;
      }
  return { 位置: positions, normals, uv };
};
