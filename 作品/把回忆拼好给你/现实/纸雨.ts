// 纸雨（第 14 句 47.41「放」：右屏楼上撒手，卷子和撕下来的书页往下飘）和飘过分屏线的那一张（47.83 起飘进服务器那半，变成一片樱花瓣混进樱花风）。纯模块，测试也读。
// 坐标是 楼上 那一镜的「画面格」：x 同场景 x，z 是画面上的高（场景 z 加上斜投影的上抬），纸雨层.tsx 按 楼上取景 换成页面坐标。时间按歌上的秒。
// 纸片是 2D 叠层（像素纸片按贴图像素画，同樱花风的花瓣）：只往下飘、晃，不做三维翻转；翻转用四个形状轮着换（平、斜、侧、斜）演绎。参数全是 Agent 暂定。

export type 纸片 = {
  /** 生出来那一刻（歌上的秒）、位置（画面格） */
  生: number;
  x0: number;
  z0: number;
  /** 初速（格/秒，z 正 = 往上）；终 = 飘落的终速（往下）；摆 = 左右晃的幅度（格）、频 = 每秒晃几下、相 = 0～1 */
  vx: number;
  vz: number;
  终: number;
  摆: number;
  频: number;
  相: number;
};

export const 纸雨参数 = {
  种子: 1427,
  /** 撒手那一下散出去几张卷子；撕书那一下掉出来几张书页 */
  撒手张数: 56,
  撕书张数: 4,
  /** 撕书那几张是从撕口里掉出来的，不是抛出去的：初速乘 撕书速 */
  撕书速: 0.2,
  /** 速度往终速靠的时间常数（秒）：纸轻，三分之一秒就从往外甩变成往下飘 */
  τ: 0.35,
  /** 初速范围（格/秒）：往两边甩得开（撒手到樱花风盖满只有 0.8 秒，初稿 ±2.5 时一直挤成一团），往上只带一点：
   *  照片方案「和右屏撒手、纸雨同拍，方向都是往下」（左屏合照同一帧落进手里） */
  vx: [-10, 10],
  vz: [-0.5, 3],
  终: [2.0, 3.5],
  摆: [0.15, 0.45],
  频: [1.5, 3.5],
  /** 樱花风起来以后（挂铃）纸也被风带着往右上走：位移 = 推 × t²（格/秒²） */
  风推: { x: 4, z: 0.5 },
} as const;

/** 同 engine/model/parts.tsx 的 rng（mulberry32；纯模块不引 tsx） */
const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 在 源（画面格的矩形）里生 数 张纸，生在 生 那一刻；初速乘 速 */
export const 造纸片 = (种子: number, 数: number, 生: number, 源: { x0: number; x1: number; z0: number; z1: number }, 速 = 1): 纸片[] => {
  const r = rng(种子);
  const 取 = (a: readonly [number, number]) => a[0] + r() * (a[1] - a[0]);
  const p = 纸雨参数;
  return Array.from({ length: 数 }, () => ({
    生,
    x0: 源.x0 + r() * (源.x1 - 源.x0),
    z0: 源.z0 + r() * (源.z1 - 源.z0),
    vx: 取(p.vx) * 速,
    vz: 取(p.vz) * 速,
    终: 取(p.终),
    摆: 取(p.摆),
    频: 取(p.频),
    相: r(),
  }));
};

/** 翻转的四个形状轮着换：0 平、1 斜、2 侧、3 斜（反） */
export type 纸形 = 0 | 1 | 2 | 3;

/** 一张纸在 秒 时的位置（画面格）和形状；还没生给 null。风起 = 樱花风起来那一刻（歌上的秒） */
export const 纸片在 = (q: 纸片, 秒: number, 风起: number): { x: number; z: number; 形: 纸形 } | null => {
  const t = 秒 - q.生;
  if (t < 0) return null;
  const p = 纸雨参数;
  const e = 1 - Math.exp(-t / p.τ);
  let x = q.x0 + q.vx * p.τ * e + q.摆 * Math.sin(2 * Math.PI * (q.频 * t + q.相)) * e;
  let z = q.z0 + (q.vz + q.终) * p.τ * e - q.终 * t;
  const w = 秒 - 风起;
  if (w > 0) {
    x += p.风推.x * w * w;
    z += p.风推.z * w * w;
  }
  const 形 = (((Math.floor((q.频 * t + q.相) * 4) % 4) + 4) % 4) as 纸形;
  return { x, z, 形 };
};

/** 飘过分屏线的那一张：起 时从卷子摞上飘起来往左上走，过线 那一刻越过分屏线（x = 0）变成樱花瓣，之后被樱花风卷着往上、打一个旋。
 *  从 源 到线走 ease-in-out；过线以后往左再走 余走 格、往上 余升 格，绕一圈半径 旋 格 */
export const 飘纸 = { 余走: 0.8, 余升: 1.2, 旋: 0.35, 旋频: 1.6 } as const;

export const 飘纸在 = (秒: number, 时: { 起: number; 过线: number }, 源: { x: number; z: number }): { x: number; z: number; 成瓣: boolean; 形: 纸形 } | null => {
  if (秒 < 时.起) return null;
  if (秒 < 时.过线) {
    const u = (秒 - 时.起) / (时.过线 - 时.起);
    const s = u * u * (3 - 2 * u);
    const x = 源.x * (1 - s);
    const z = 源.z + 0.9 * s + 0.12 * Math.sin(u * Math.PI * 3);
    return { x, z, 成瓣: false, 形: ((Math.floor(u * 10) % 4) as 纸形) };
  }
  const τ = 秒 - 时.过线;
  const a = 2 * Math.PI * 飘纸.旋频 * τ;
  const k = 1 - Math.exp(-τ / 0.25);
  return {
    x: -飘纸.余走 * k - 飘纸.旋 * Math.sin(a),
    z: 源.z + 0.9 + 飘纸.余升 * k + 飘纸.旋 * (1 - Math.cos(a)),
    成瓣: true,
    形: 0,
  };
};
