// 电弧折线的形状（纯数学）：照 Goety 的 LightningParticleOptions.generate / createQuads（出自 Mekanism 的 BoltEffect）。
// 震撼、雷霆、释放、索命、闪电类都走它，只是参数不同（ClientProxy.shock / thunderBolt / lightningBolt）：
//   shock：       粗 0.04，散开 正弦（两头收、中间散）
//   thunderBolt： 粗 0.25，散开 线性升（越往终点越散）
//   lightningBolt：粗 0.5，散开 线性升，平行噪声 1、散开系数 0.001
// 段数默认 (int)sqrt(距离 × 100)，一条（count 1），寿命由发包的地方给（雷霆 10 刻），淡入淡出各占寿命的一半（FadeFunction.fade(0.5)）。
// 游戏用 java.util.Random 不带种子，每次形状都不同；这里换成带种子的随机数，形状固定。
import { 场景到游戏, 游戏到场景 } from '@engine/core/坐标.ts';
import { gaussian, mulberry32 } from '@engine/core/数学.ts';
import type { 点 } from '../接口.ts';

export type 散开函数 = '正弦' | '线性升' | '线性升降';
export interface 电弧设定 {
  /** 一段的粗细（格），越靠终点越细：粗 × (0.5 + (1 − 进度) × 0.5) */
  readonly 粗: number;
  readonly 散开: 散开函数;
  readonly 段数?: number;
  readonly 条数?: number;
  /** parallelNoise：每段沿主方向走多远的随机量，默认 0.1 */
  readonly 平行噪声?: number;
  /** spreadFactor：横向最多偏出 距离 × 它 × 散开函数，默认 0.1 */
  readonly 散开系数?: number;
  /** branchInitiationFactor、branchContinuationFactor：分叉，默认都是 0（Goety 的三种都没开） */
  readonly 分叉起?: number;
  readonly 分叉续?: number;
}
export const 电弧预设 = {
  shock: { 粗: 0.04, 散开: '正弦' },
  thunderBolt: { 粗: 0.25, 散开: '线性升' },
  lightningBolt: { 粗: 0.5, 散开: '线性升', 平行噪声: 1, 散开系数: 0.001 },
} as const satisfies Record<string, 电弧设定>;

type 三 = [number, number, number];
const 加 = (a: 三, b: 三): 三 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const 减 = (a: 三, b: 三): 三 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const 乘 = (a: 三, k: number): 三 => [a[0] * k, a[1] * k, a[2] * k];
const 叉 = (a: 三, b: 三): 三 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const 长 = (a: 三) => Math.hypot(a[0], a[1], a[2]);
// Vec3.normalize：长度 < 1e-4 返回零向量
const 归一 = (a: 三): 三 => {
  const l = 长(a);
  return l < 1e-4 ? [0, 0, 0] : 乘(a, 1 / l);
};
// 游戏坐标（y 朝上、z 朝南）↔ 场景坐标（z 朝上、y 朝北）：截面朝哪边是按游戏坐标叉出来的，在游戏坐标里算完再换回来
const 进游戏 = (p: 点): 三 => 场景到游戏(p);
const 出游戏 = (p: 三): 点 => 游戏到场景(p);

const 随机 = (种子: number) => {
  const 浮 = mulberry32(种子);
  return { 浮, 高斯: () => gaussian(浮) };
};

const 散开值 = (f: 散开函数, 进度: number) =>
  f === '正弦' ? Math.sin(Math.PI * 进度) : f === '线性升' ? 进度 : (进度 - Math.max(0, 2 * 进度 - 1)) / 0.5;

/** 一段 = 4 个四边形（两个面各画正反）共 16 个顶点，场景坐标；按生成顺序排，淡入淡出按这个顺序截 */
export type 电弧段 = readonly 点[];

export const 默认段数 = (起: 点, 终: 点) => Math.floor(Math.sqrt(Math.hypot(终[0] - 起[0], 终[1] - 起[1], 终[2] - 起[2]) * 100));

export const 生成电弧 = (起点: 点, 终点: 点, 设: 电弧设定, 种子: number): 电弧段[] => {
  const 机 = 随机(种子);
  const 起 = 进游戏(起点);
  const 终 = 进游戏(终点);
  const 差 = 减(终, 起);
  const 总长 = 长(差);
  const 段数 = 设.段数 ?? 默认段数(起点, 终点);
  const 平行噪声 = 设.平行噪声 ?? 0.1;
  const 散开系数 = 设.散开系数 ?? 0.1;
  const 出: 电弧段[] = [];
  if (段数 < 1 || 总长 === 0) return 出;
  type 缓存 = { 末: 三; 末右: 三; 末后: 三 };
  type 指令 = { 起: 三; 进度: number; 缓: 缓存 | null; 支: boolean };
  for (let 条 = 0; 条 < (设.条数 ?? 1); 条++) {
    const 队: 指令[] = [{ 起, 进度: 0, 缓: null, 支: false }];
    while (队.length > 0) {
      const 令 = 队.shift()!;
      const 进度 = 令.进度 + (1 / 段数) * (1 - 平行噪声 + 机.浮() * 平行噪声 * 2);
      const 散 = 散开值(设.散开, 进度);
      let 段终: 三;
      if (进度 >= 1 && 散 <= 0) {
        段终 = 终;
      } else {
        const 最大偏 = 散开系数 * 散 * 总长;
        const 随向 = 归一(叉(差, [-0.5 + 机.浮(), -0.5 + 机.浮(), -0.5 + 机.浮()]));
        // SegmentSpreader.NO_MEMORY：每段的横偏各算各的，不累加
        段终 = 加(加(起, 乘(差, 进度)), 乘(随向, 最大偏 * 机.高斯()));
      }
      const 粗 = 设.粗 * (0.5 + (1 - 进度) * 0.5);
      // createQuads
      const 段差 = 减(段终, 令.起);
      const 右 = 乘(归一(叉(段差, [0.5, 0.5, 0.5])), 粗);
      const 后 = 乘(归一(叉(段差, 右)), 粗);
      const 半右 = 乘(右, 0.5);
      const 始 = 令.缓 ? 令.缓.末 : 令.起;
      const 始右 = 令.缓 ? 令.缓.末右 : 加(始, 右);
      const 始后 = 令.缓 ? 令.缓.末后 : 加(加(始, 半右), 后);
      const 终右 = 加(段终, 右);
      const 终后 = 加(加(段终, 半右), 后);
      出.push([始, 段终, 终右, 始右, 始右, 终右, 段终, 始, 始右, 终右, 终后, 始后, 始后, 终后, 终右, 始右].map(出游戏));
      if (进度 >= 1) break;
      const 缓: 缓存 = { 末: 段终, 末右: 终右, 末后: 终后 };
      if (!令.支) 队.push({ 起: 段终, 进度, 缓, 支: false });
      else if (机.浮() < (设.分叉续 ?? 0)) 队.push({ 起: 段终, 进度, 缓, 支: true });
      while (机.浮() < (设.分叉起 ?? 0) * (1 - 进度)) 队.push({ 起: 段终, 进度, 缓, 支: true });
    }
  }
  return 出;
};

/** FadeFunction.fade(淡)：活了寿命的几分之几时，画第 [始, 止) 段。前 淡 的时间从起点一段段长出来，最后 淡 的时间从起点一段段消失 */
export const 电弧可见段 = (总段: number, 寿命比: number, 淡 = 0.5): readonly [number, number] => [
  寿命比 > 1 - 淡 ? Math.trunc((总段 * (寿命比 - (1 - 淡))) / 淡) : 0,
  寿命比 < 淡 ? Math.trunc(总段 * (寿命比 / 淡)) : 总段,
];
