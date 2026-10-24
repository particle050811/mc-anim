// 龙死时掉的经验球：照 1.20.1 原版逐刻模拟（EnderDragon.tickDeath、ExperienceOrb.award / 构造 / tick、Player 的 touch）。纯模块，测试能引。
// - 死亡第 150 刻以后每 5 刻在龙的位置掉一把（第一次杀龙 12000 × 8% = 960），第 200 刻掉 20%；一把按 getExperienceValue 拆成几颗（960 = 617 + 307 + 17 + 17 + 1 + 1）；
// - 球出生速度：水平各 (随机×0.2 − 0.1)×2，向上 随机×0.2×2（格/刻）；每刻先 −0.03 重力，再按 move 撞地（落地时竖直速度清零，末地石上不弹），
//   再乘 0.98（着地时水平乘 末地石摩擦 0.6 × 0.98）；每 20 刻（tickCount % 20 == 1）找 8 格内最近的玩家，找到了每刻往他半身高处加 (1 − 距离/8)² × 0.1 的速度；
// - 掉进出口传送门（顶面以下）就被传走；碰到你（你的碰撞箱四周放大 1、上下放大 0.5）而且你两刻内没吃过，就被你吃掉，吃掉后 3 刻里往你身上飞（ItemPickupParticle）。
// 原版每颗球的随机数是实体自己的，拿不到，这里用定种子的随机数（Agent 定）。只模拟要画的这一段，不处理撞柱子（球不往那边去）。
import { rng, type V3 } from '@engine/model/parts.tsx';

export type 经验球出生 = { 刻: number; 位: V3; 值: number };

/** ExperienceOrb.getExperienceValue：不超过 余 的最大一档 */
const 档们 = [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3, 1];
export const 拆经验 = (总: number): number[] => {
  const r: number[] = [];
  let 余 = 总;
  while (余 > 0) {
    const v = 档们.find((x) => x <= 余)!;
    r.push(v);
    余 -= v;
  }
  return r;
};

/** ExperienceOrb.getIcon：值越大图标越大（0～10） */
export const 球图标 = (值: number) => {
  const 界 = [3, 7, 17, 37, 73, 149, 307, 617, 1237, 2477];
  let i = 0;
  while (i < 界.length && 值 >= 界[i]!) i++;
  return i;
};

/** 龙死亡各刻掉经验：第 t 刻（t > 150 且 t % 5 == 0，到 199）掉 总×8%，第 200 刻掉 总×20%。龙位(t) 给那一刻龙的位置 */
export const 龙掉经验 = (总: number, 龙位: (刻: number) => V3, 到刻 = 200): 经验球出生[] => {
  const r: 经验球出生[] = [];
  for (let t = 151; t <= Math.min(200, 到刻); t++) {
    const 量 = t === 200 ? Math.floor(总 * 0.2) : t % 5 === 0 ? Math.floor(总 * 0.08) : 0;
    for (const 值 of 量 ? 拆经验(量) : []) r.push({ 刻: t, 位: 龙位(t), 值 });
  }
  return r;
};

export type 玩家 = {
  /** 第 刻 刻时脚底的位置、潜没潜行 */
  位: (刻: number) => V3;
  蹲: (刻: number) => boolean;
};

/** 地形：(x, y) 处地面的高度（球落到这里停）、是不是传送门（落到 z 以下就被传走） */
export type 地面 = { 高: (x: number, y: number) => number; 门: (x: number, y: number) => { 面: number } | null };

export type 球态 = { 位: V3; 值: number; 龄: number; 被吃: number | null };

const 球半宽 = 0.25;
const 球高 = 0.5;
/** 玩家碰撞箱：宽 0.6、站高 1.8、潜行 1.5；眼高 1.62、潜行 1.27 */
const 人半宽 = 0.3;
const 人高 = (蹲: boolean) => (蹲 ? 1.5 : 1.8);
const 眼高 = (蹲: boolean) => (蹲 ? 1.27 : 1.62);
const 吃后飞刻 = 3;

/**
 * 逐刻模拟，返回每颗球在 第 刻 刻末（刻 从 起刻 到 止刻）的样子。
 * 返回 表[颗][刻 − 起刻]：null = 还没出生或已经没了（掉进传送门、吃完飞到身上）。
 */
export const 模拟经验球 = (出生们: readonly 经验球出生[], 起刻: number, 止刻: number, 人: 玩家, 地: 地面, 种子 = 1): (球态 | null)[][] => {
  type 球 = { p: V3; v: V3; 值: number; 龄: number; 着地: boolean; 跟: boolean; 没: boolean; 吃刻: number | null; 吃位: V3 | null };
  const 球们: (球 | null)[] = 出生们.map(() => null);
  const 表: (球态 | null)[][] = 出生们.map(() => []);
  let 吃冷却 = 0;
  for (let t = Math.min(起刻, ...出生们.map((b) => b.刻)); t <= 止刻; t++) {
    出生们.forEach((b, i) => {
      if (b.刻 !== t) return;
      const r = rng(种子 * 7919 + i * 104729 + 13);
      // 原版顺序：先 yRot，再 x、y、z 三个速度分量（原版坐标），换成场景坐标 (x, −z, y)
      r();
      const vx = (r() * 0.2 - 0.1) * 2;
      const vy = r() * 0.2 * 2;
      const vz = (r() * 0.2 - 0.1) * 2;
      球们[i] = { p: [...b.位], v: [vx, -vz, vy], 值: b.值, 龄: 0, 着地: false, 跟: false, 没: false, 吃刻: null, 吃位: null };
    });
    if (吃冷却 > 0) 吃冷却--;
    const 人位 = 人.位(t);
    const 蹲 = 人.蹲(t);
    for (const 球 of 球们) {
      if (!球 || 球.没 || 球.吃刻 !== null) continue;
      球.v[2] -= 0.03;
      // 原版 tickCount 在这一刻开头先加 1（这里 龄 刻末才加），tickCount % 20 == 1 时找人
      if ((球.龄 + 1) % 20 === 1) 球.跟 = Math.hypot(人位[0] - 球.p[0], 人位[1] - 球.p[1], 人位[2] - 球.p[2]) < 8;
      if (球.跟) {
        const d: V3 = [人位[0] - 球.p[0], 人位[1] - 球.p[1], 人位[2] + 眼高(蹲) / 2 - 球.p[2]];
        const 距 = Math.hypot(...d);
        if (距 < 8 && 距 > 0) {
          const k = (1 - 距 / 8) ** 2 * 0.1;
          for (let a = 0; a < 3; a++) 球.v[a] += (d[a]! / 距) * k;
        }
      }
      // move：水平直接走，竖直撞地停住、竖直速度清零（Block.updateEntityAfterFallOn）
      球.p[0] += 球.v[0];
      球.p[1] += 球.v[1];
      const 地高 = 地.高(球.p[0], 球.p[1]);
      const z = 球.p[2] + 球.v[2];
      if (z <= 地高 && 球.v[2] < 0) {
        球.p[2] = 地高;
        球.v[2] = 0;
        球.着地 = true;
      } else {
        球.p[2] = z;
        球.着地 = false;
      }
      const 门 = 地.门(球.p[0], 球.p[1]);
      if (门 && 球.p[2] <= 门.面) 球.没 = true;
      const f = 球.着地 ? 0.6 * 0.98 : 0.98;
      球.v = [球.v[0] * f, 球.v[1] * f, 球.v[2] * 0.98];
      if (球.着地) 球.v[2] *= -0.9;
      球.龄++;
    }
    // 玩家 touch：碰撞箱四周放大 1、上下放大 0.5，碰到的球两刻吃一颗
    for (const 球 of 球们) {
      if (!球 || 球.没 || 球.吃刻 !== null || 吃冷却 > 0) continue;
      const 碰 =
        Math.abs(球.p[0] - 人位[0]) < 人半宽 + 1 + 球半宽 &&
        Math.abs(球.p[1] - 人位[1]) < 人半宽 + 1 + 球半宽 &&
        球.p[2] < 人位[2] + 人高(蹲) + 0.5 &&
        球.p[2] + 球高 > 人位[2] - 0.5;
      if (碰) {
        球.吃刻 = t;
        球.吃位 = [...球.p];
        吃冷却 = 2;
      }
    }
    球们.forEach((球, i) => {
      if (!球 || 球.没) return void 表[i]!.push(null);
      if (球.吃刻 !== null) {
        const k = (t - 球.吃刻) / 吃后飞刻;
        if (k >= 1) return void 表[i]!.push(null);
        // ItemPickupParticle：往人身上（脚底往上 0.5）飞，3 刻到
        const 到: V3 = [人位[0], 人位[1], 人位[2] + 0.5];
        const p: V3 = [0, 1, 2].map((a) => 球.吃位![a]! + (到[a]! - 球.吃位![a]!) * k) as V3;
        return void 表[i]!.push({ 位: p, 值: 球.值, 龄: 球.龄, 被吃: k });
      }
      表[i]!.push({ 位: [...球.p], 值: 球.值, 龄: 球.龄, 被吃: null });
    });
  }
  // 截掉 起刻 之前的
  const 首 = Math.min(起刻, ...出生们.map((b) => b.刻));
  return 表.map((行) => 行.slice(起刻 - 首));
};
