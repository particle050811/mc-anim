// 第 4 句海面上原版没有、Agent 加的两样（参数.ts 的 远档、光路）：远处分档往地平色靠，太阳底下一行一行的光路。纯模块。
// 按屏幕上的块（海块 个成片像素见方，同 天.tsx 的天色块）逐块算视线，出一张「盖在水上的颜色」图：rgb = 颜色，a = 盖多少（0 = 原样的水）。
// 海面着色器按片元在屏幕上的位置取这张图（海面.tsx），所以边是块的台阶，船和人在水前面照样挡住它。
import { 光路, 远档 } from './参数.ts';
import { 仰角方位差, 太阳本体, 视线, type 透视 } from './编排.ts';
import { 地平色, type RGB } from './天色.ts';

const 解 = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const 芯色 = 解(光路.芯);
const 边色 = 解(光路.边);
/** 太阳本体的半张角（度） */
const 日半 = (Math.atan(太阳本体.半边 / 太阳本体.距) * 180) / Math.PI;

/** 固定的伪随机：两个整数 → 0～1（同一行同一步每次一样） */
const 散 = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** 下视角 下（度）、离太阳方位差 差（度）处光路的颜色，没有就 null。刻：游戏刻（闪的节奏） */
export const 光路色 = (下: number, 差: number, 刻: number): RGB | null => {
  if (下 <= 0 || 下 >= 光路.近) return null;
  if (下 < 光路.贴) {
    // 贴着海平线那一道：连成一片，和太阳本体差不多宽
    const w = 日半 * 光路.宽;
    const a = Math.abs(差);
    return a < w * 光路.芯宽 ? 芯色 : a < w ? 边色 : null;
  }
  // 行：贴着海平线的几行按比例越往近越高，过了 厚起 每行一样高（不然近处一行有几十个像素高，成了一块一块的砖）
  const 对数行 = (d: number) => Math.log(d / 光路.贴) / Math.log(光路.比);
  const 行 = Math.floor(下 < 光路.厚起 ? 对数行(下) : 对数行(光路.厚起) + (下 - 光路.厚起) / (光路.厚起 * (光路.比 - 1)));
  if (行 % 2 === 1) return null; // 行与行之间隔一行水
  // 每行自己的相位，轮着换，不一起跳
  const 步 = Math.floor(刻 / 光路.换刻 + 散(行, 7));
  const W = 日半 * (光路.宽 + 光路.张 * 下);
  const 去 = 光路.缺 + (1 - 光路.缺) * (下 / 光路.近) * 0.8;
  for (let i = 0; i < 光路.截; i++) {
    const n = 步 * 16 + i * 4;
    if (散(行, n) < 去) continue;
    const x = 差 - W * 光路.抖 * (2 * 散(行, n + 1) - 1);
    const l = W * (0.2 + 0.35 * 散(行, n + 2));
    if (Math.abs(x) < l) return Math.abs(x) < l * 光路.芯宽 ? 芯色 : 边色;
  }
  return null;
};

/** 远档：下视角 下 度处往地平色混多少 */
export const 远混 = (下: number): number => {
  if (下 <= 0) return 0;
  for (const [角, 混] of 远档) if (下 < 角) return 混;
  return 0;
};

/** 一整帧的图：块数 列 × 行，RGBA 字节，第 0 行是画面最上面。宽、高：页面尺寸；块：一块多少页面像素。
 *  光路在太阳的方位（正西）底下，下视角从海平线量（太阳往下落几分之一度，光路不跟着变） */
export const 海面图案 = (机: 透视, 刻: number, 宽: number, 高: number, 块: number) => {
  const 列 = Math.ceil(宽 / 块);
  const 行数 = Math.ceil(高 / 块);
  const 字节 = new Uint8Array(列 * 行数 * 4);
  for (let j = 0; j < 行数; j++)
    for (let i = 0; i < 列; i++) {
      const { 仰, 差 } = 仰角方位差(视线(机, (i + 0.5) * 块, (j + 0.5) * 块, 宽, 高));
      const 下 = -仰;
      if (下 <= 0) continue;
      const o = (j * 列 + i) * 4;
      const 光 = 光路色(下, 差, 刻);
      if (光) {
        字节.set([光[0], 光[1], 光[2], 255], o);
        continue;
      }
      const m = 远混(下);
      if (m > 0) {
        const c = 地平色(差);
        字节.set([Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), Math.round(m * 255)], o);
      }
    }
  return { 字节, 列, 行: 行数 };
};
