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

export type 点 = { p: readonly number[]; uv: readonly number[]; n: readonly number[] };
export type 三角 = readonly [点, 点, 点];

/** 顶点表（每顶点 8 个数：x y z、u v、法线 x y z；四个顶点一个四边形，同 库/角色/网格盔甲.tsx）→ 三角，绕向照 (0,1,2)(0,2,3) */
export const 顶点表转三角 = (顶点: readonly number[]): 三角[] => {
  if (顶点.length % 32) throw new Error(`顶点表转三角：长度 ${顶点.length} 不是 32 的倍数`);
  const 取 = (i: number): 点 => ({ p: 顶点.slice(i * 8, i * 8 + 3), uv: 顶点.slice(i * 8 + 3, i * 8 + 5), n: 顶点.slice(i * 8 + 5, i * 8 + 8) });
  const 出: 三角[] = [];
  for (let q = 0; q < 顶点.length / 8; q += 4) {
    const [a, b, c, d] = [取(q), 取(q + 1), 取(q + 2), 取(q + 3)];
    出.push([a, b, c], [a, c, d]);
  }
  return 出;
};

const 插 = (a: 点, b: 点, t: number): 点 => ({ p: lerpV(a.p, b.p, t), uv: lerpV(a.uv, b.uv, t), n: lerpV(a.n, b.n, t) });

type 面 = { ny: number; nz: number; d: number };
const 容差 = 1e-7;
const 侧 = (面: 面, v: 点) => {
  const f = 面.ny * v.p[1]! + 面.nz * v.p[2]! - 面.d;
  return Math.abs(f) < 容差 ? 0 : f;
};
// 边和面的交点：一律从 f < 0 的那头往 f > 0 的那头插，两侧各裁一遍算出来的是同一个数（接缝不裂）
const 交 = (a: 点, fa: number, b: 点, fb: number): 点 => (fa < 0 ? 插(a, b, fa / (fa - fb)) : 插(b, a, fb / (fb - fa)));

/** 留下 面 的一侧（留 = −1：ny·y + nz·z ≤ d；+1：≥ d）。裁出来的多边形照原来的绕向扇形拆回三角 */
export const 裁 = (三角们: readonly 三角[], 面: 面, 留: 1 | -1): 三角[] => {
  const 出: 三角[] = [];
  for (const 三 of 三角们) {
    const f = [侧(面, 三[0]) * 留, 侧(面, 三[1]) * 留, 侧(面, 三[2]) * 留];
    if (f[0]! >= 0 && f[1]! >= 0 && f[2]! >= 0) {
      出.push(三);
      continue;
    }
    if (f[0]! <= 0 && f[1]! <= 0 && f[2]! <= 0) continue;
    const 多: 点[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (f[i]! >= 0) 多.push(三[i]!);
      if (f[i]! * f[j]! < 0) 多.push(交(三[i]!, f[i]! * 留, 三[j]!, f[j]! * 留));
    }
    for (let i = 1; i + 1 < 多.length; i++) 出.push([多[0]!, 多[i]!, 多[i + 1]!]);
  }
  return 出;
};

const 转点 = (p: readonly number[], 切: number, 铰z: number, cos: number, sin: number): number[] => {
  const [dy, dz] = [p[1]! - 切, p[2]! - 铰z];
  return [p[0]!, 切 + dy * cos - dz * sin, 铰z + dy * sin + dz * cos];
};
const 转向 = (n: readonly number[], cos: number, sin: number): number[] => [n[0]!, n[1]! * cos - n[2]! * sin, n[1]! * sin + n[2]! * cos];

// (q − p) × (r − p)
const 叉 = (p: readonly number[], q: readonly number[], r: readonly number[]): number[] => {
  const [ux, uy, uz, wx, wy, wz] = [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!, r[0]! - p[0]!, r[1]! - p[1]!, r[2]! - p[2]!];
  return [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
};
const 加 = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v + b[i]!);

type 口点 = { p: readonly number[]; n: readonly number[]; uv上: readonly number[]; uv下: readonly number[] };
/** 贴图坐标往切线两边各让多少像素取（切线正好在两行贴图像素的边上） */
const 让 = 0.02;

// 三角和切面 y = 切 的交线（两个端点）；不跨过切面的没有
const 切线 = (三: 三角, 切: number): [口点, 口点] | null => {
  const 面 = { ny: 1, nz: 0, d: 切 };
  const f = [侧(面, 三[0]), 侧(面, 三[1]), 侧(面, 三[2])];
  if (!(f.some((v) => v < 0) && f.some((v) => v > 0))) return null;
  const 点们: 口点[] = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    if (f[i] === 0) 点们.push({ p: 三[i]!.p, n: 三[i]!.n, uv上: 三[i]!.uv, uv下: 三[i]!.uv });
    if (f[i]! * f[j]! < 0) {
      const [上, 下, f上, f下] = f[i]! < 0 ? [三[i]!, 三[j]!, f[i]!, f[j]!] : [三[j]!, 三[i]!, f[j]!, f[i]!];
      const t = f上 / (f上 - f下);
      const 步 = 让 / (f下 - f上);
      const 中 = 交(上, f上, 下, f下);
      点们.push({ p: 中.p, n: 中.n, uv上: lerpV(上.uv, 下.uv, Math.max(0, t - 步)), uv下: lerpV(上.uv, 下.uv, Math.min(1, t + 步)) });
    }
  }
  return 点们.length === 2 ? [点们[0]!, 点们[1]!] : null;
};

export type 弯折参数 = {
  /** 关节在肢体上的位置（部件里的 y，像素） */
  切: number;
  /** 铰链的 z（像素）：比它更靠折的内侧的料两节各让到角平分面，外侧的张口补弧面 */
  铰z: number;
  /** 弧度，正 = 下半节往 +z 折 */
  角: number;
  /** 弧面每多少弧度分一段（默认 15 度）；段数取偶数，至少 2 */
  每段?: number;
};

/** 上半节、转过去的下半节、外侧的桥，都在部件坐标里（下半节已经转好，直接和上半节放一起画） */
export const 弯折 = (三角们: readonly 三角[], 参: 弯折参数): { 上: 三角[]; 下: 三角[]; 桥: 三角[] } => {
  const { 切, 铰z, 角 } = 参;
  if (角 === 0) return { 上: [...三角们], 下: [], 桥: [] };
  const 切面 = { ny: 1, nz: 0, d: 切 };
  const [半cos, 半sin] = [Math.cos(角 / 2), Math.sin(角 / 2)];
  // 角平分面过铰链，法线 = ŷ 绕 x 转半个角；下半节在自己没转的坐标里是往回转半个角的那一面
  const 上 = 裁(裁(三角们, 切面, -1), { ny: 半cos, nz: 半sin, d: 半cos * 切 + 半sin * 铰z }, -1);
  const 下原 = 裁(裁(三角们, 切面, 1), { ny: 半cos, nz: -半sin, d: 半cos * 切 - 半sin * 铰z }, 1);
  const [cos, sin] = [Math.cos(角), Math.sin(角)];
  const 转 = (v: 点): 点 => ({ p: 转点(v.p, 切, 铰z, cos, sin), uv: v.uv, n: 转向(v.n, cos, sin) });
  const 下 = 下原.map((三): 三角 => [转(三[0]), 转(三[1]), 转(三[2])]);

  const 段数 = Math.max(2, 2 * Math.ceil(Math.abs(角) / (参.每段 ?? Math.PI / 12) / 2));
  const 号 = Math.sign(角);
  const 桥: 三角[] = [];
  for (const 三 of 三角们) {
    const 线 = 切线(三, 切);
    if (!线) continue;
    // 只扫张口那一侧（角为正时是 z < 铰z）：跨过铰链的切线截到铰链上
    let [a, b] = 线;
    const [ga, gb] = [号 * (a.p[2]! - 铰z), 号 * (b.p[2]! - 铰z)];
    if (ga >= -容差 && gb >= -容差) continue;
    if (ga > 容差 || gb > 容差) {
      const t = ga / (ga - gb);
      const 中: 口点 = { p: lerpV(a.p, b.p, t), n: lerpV(a.n, b.n, t), uv上: lerpV(a.uv上, b.uv上, t), uv下: lerpV(a.uv下, b.uv下, t) };
      if (ga > 0) a = 中;
      else b = 中;
    }
    for (let i = 0; i < 段数; i++) {
      const [α0, α1] = [(角 * i) / 段数, i + 1 === 段数 ? 角 : (角 * (i + 1)) / 段数];
      const [c0, s0, c1, s1] = [Math.cos(α0), Math.sin(α0), Math.cos(α1), Math.sin(α1)];
      const uv = (q: 口点) => (i < 段数 / 2 ? q.uv上 : q.uv下);
      const 取 = (q: 口点, c: number, s: number): 点 => ({ p: 转点(q.p, 切, 铰z, c, s), uv: uv(q), n: 转向(q.n, c, s) });
      // 第一圈原样用切线上的点（和上半节的切口是同一个数），最后一圈和下半节用同一个 cos、sin
      const 起 = (q: 口点): 点 => (i === 0 ? { p: q.p, uv: uv(q), n: q.n } : 取(q, c0, s0));
      const [a0, b0, a1, b1] = [起(a), 起(b), 取(a, c1, s1), 取(b, c1, s1)];
      // 绕向和法线对上（材质两面都画，背面的法线会被翻过来算光照）；一头在铰链上时有一个三角是退化的，两个三角的法向加起来看
      const 法 = 加(叉(a0.p, b0.p, b1.p), 叉(a0.p, b1.p, a1.p));
      const 顺 = 法[0]! * a0.n[0]! + 法[1]! * a0.n[1]! + 法[2]! * a0.n[2]! >= 0;
      if (顺) 桥.push([a0, b0, b1], [a0, b1, a1]);
      else 桥.push([a0, b1, b0], [a0, a1, b1]);
    }
  }
  return { 上, 下, 桥 };
};

/** 三角 → 不带索引的顶点数组（位置、法线、贴图坐标），法线归一 */
export const 三角转数组 = (组: readonly (readonly 三角[])[]): { 位置: Float32Array; 法线: Float32Array; uv: Float32Array } => {
  const 数 = 组.reduce((和, 三角们) => 和 + 三角们.length, 0) * 3;
  const 位置 = new Float32Array(数 * 3);
  const 法线 = new Float32Array(数 * 3);
  const uv = new Float32Array(数 * 2);
  let k = 0;
  for (const 三角们 of 组)
    for (const 三 of 三角们)
      for (const v of 三) {
        位置.set(v.p, k * 3);
        const 长 = Math.hypot(v.n[0]!, v.n[1]!, v.n[2]!) || 1;
        法线.set([v.n[0]! / 长, v.n[1]! / 长, v.n[2]! / 长], k * 3);
        uv.set(v.uv, k * 2);
        k++;
      }
  return { 位置, 法线, uv };
};
