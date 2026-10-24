// 第 6、7 句的云：原版 1.20.1 fancy 云（LevelRenderer.buildClouds），clouds.png（256×256）每个不透明像素是一格 12×12 格见方、4 格厚的云，铺满整片天，跟着世界坐标平铺；
// 用户 10-24「这个云也太敷衍了」：要原版那种立体方块云，雨天整层压暗，光柱打上去一圈一圈散开、洞越开越大。这里只算哪几格云在哪、散了多少，画法在 云层.tsx。纯计算。
// 云洞是演绎（原版云不会散）：一格云中心离洞心比洞半径近就散掉（洞半径按格子哈希抖一点，洞口参差），散的时候几帧里变淡。
import * as 参 from './参数.ts';

/** 一格云多大、多厚（格） */
export const 云格 = 12;
export const 云厚 = 4;

/** 一格云：格号 (a, b)（世界里 x 从 a·12 起、y 从 b·12 起，再加飘的偏移），中心离光柱多远（水平，格，没飘时） */
export type 云格子 = { a: number; b: number };

/** clouds.png 的不透明像素表（行优先，1 = 有云）→ 铺得到的云格。贴图第 v 行往游戏南（+Z）走，场景北是 +y，所以 v = −b。
 *  偏 = 贴图在世界里平移几格（参.云偏），铺 = 以原点为心铺多大 */
export const 云格们 = (有: (u: number, v: number) => boolean, 偏: readonly [number, number] = 参.云偏, 铺 = 参.云铺): 云格子[] => {
  const out: 云格子[] = [];
  const 取 = (n: number) => ((n % 256) + 256) % 256;
  for (let a = Math.floor(铺.西 / 云格) - 1; a <= Math.ceil(铺.东 / 云格); a++)
    for (let b = Math.floor(铺.南 / 云格) - 1; b <= Math.ceil(铺.北 / 云格); b++)
      if (有(取(a + Math.floor(偏[0] / 云格)), 取(-b + Math.floor(偏[1] / 云格)))) out.push({ a, b });
  return out;
};

/** 0～1 的格子哈希 */
const 哈希 = (a: number, b: number, 盐: number) => (((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(盐, 83492791)) >>> 0) % 1000) / 1000;

/** 这一格云的中心（水平，格）：飘 = 往东挪了多少（原版云往西飘，给负数） */
export const 云心 = (c: 云格子, 飘: number): [number, number] => [c.a * 云格 + 云格 / 2 + 飘, c.b * 云格 + 云格 / 2];

/** 这一格云从哪个洞半径起开始散（离洞心的距离 + 哈希抖动） */
export const 散起半径 = (c: 云格子, 心: readonly [number, number], 飘: number) => {
  const [x, y] = 云心(c, 飘);
  return Math.hypot(x - 心[0], y - 心[1]) + (哈希(c.a, c.b, 0) - 0.5) * 参.云洞.毛边;
};
