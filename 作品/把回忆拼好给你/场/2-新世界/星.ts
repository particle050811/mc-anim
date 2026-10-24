// 原版 1.20.1 的星星（LevelRenderer.createStars、renderSky）：撒在哪、多大、这一刻转到哪、多亮。纯计算（不 import react、three），测试直接引。
// 随机数是 LegacyRandomSource（同 java.util.Random 的 48 位线性同余），这里用 BigInt 照算，撒出来的方向和游戏里一样。
import { 天球角 } from '../../地点/天体.ts';
import { 星 } from './参数.ts';

const 乘子 = 0x5deece66dn, 增量 = 0xbn, 掩码 = (1n << 48n) - 1n;

/** LegacyRandomSource：nextFloat = next(24) × 2⁻²⁴；nextDouble 连取 next(26)、next(27) */
const 原版随机 = (种子: number) => {
  let s = (BigInt(种子) ^ 乘子) & 掩码;
  const next = (位: number) => {
    s = (s * 乘子 + 增量) & 掩码;
    return Number(s >> BigInt(48 - 位));
  };
  return { 小数: () => next(24) / 2 ** 24, 双精度: () => (next(26) * 2 ** 27 + next(27)) * 2 ** -53 };
};

/** 一颗星：方向（原版坐标 x 东、y 上、z 南，单位向量，天球还没转）、半边长（格，离眼睛 星.距离 格） */
export type 一颗星 = { 向: readonly [number, number, number]; 半边: number };

/** createStars：1500 次各取三个 −1～1 和一个半边长，落在单位球壳里（0.01 < 长² < 1）的才算一颗，再取一个自转角（这里不画转角，只把随机数取掉） */
export const 星们: readonly 一颗星[] = (() => {
  const r = 原版随机(星.种子);
  const out: 一颗星[] = [];
  for (let n = 0; n < 星.个数; n++) {
    const x = r.小数() * 2 - 1, y = r.小数() * 2 - 1, z = r.小数() * 2 - 1;
    const 半边 = 0.15 + r.小数() * 0.1;
    const 长2 = x * x + y * y + z * z;
    if (!(长2 < 1 && 长2 > 0.01)) continue;
    const k = 1 / Math.sqrt(长2);
    out.push({ 向: [x * k, y * k, z * k], 半边 });
    r.双精度();
  }
  return out;
})();

/** 第 刻 刻这颗星在场景里的方向（x 东、y 北、z 上）：renderSky 先绕 y 转 −90°、再绕 x 转 天球角 × 360°（太阳也这么转：日出在东） */
export const 星向在 = (s: 一颗星, 刻: number): [number, number, number] => {
  const a = 天球角(刻) * Math.PI * 2;
  const [x, y, z] = s.向;
  const y1 = y * Math.cos(a) - z * Math.sin(a), z1 = y * Math.sin(a) + z * Math.cos(a);
  // 绕 y 转 −90°：原版 x' = −z1、z' = x；场景 y 北 = 原版 −z'
  return [-z1, -x, y1];
};

/** ClientLevel.getStarBrightness：夜里 0.5，白天 0 */
export const 星亮 = (刻: number) => {
  const f = Math.min(1, Math.max(0, 1 - (Math.cos(天球角(刻) * Math.PI * 2) * 2 + 0.25)));
  return f * f * 0.5;
};
