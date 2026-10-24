// 窗外远山（参数 远山）：樱花林那一圈平地外面起伏成山、坡上的樱花树和花簇、原版的雾和天色。纯函数，不 import react、three（窗外.tsx 搭网格，测试核）。
// 坐标同 参数.ts（网格本地，Z 朝上）；一列 (x, y) 指 x～x+1、y～y+1，高 h = 那一列草方块顶面的 z（平地 0）。
// 地形整个压低 0.01（同樱花林的草地：藏在结构方块顶面底下），树、花簇照整格放。
import { clamp01 } from '@engine/anim/anim.ts';
import { rng } from '@engine/model/parts.tsx';
import { 机位, 樱花林, 远山 } from './参数.ts';
import { 樱花树, type 格 } from './樱花树.ts';

const 缓 = (t: number) => t * t * (3 - 2 * t);

/** 结构占地 [x0, y0, x1, y1]（模板 21×26）：这里面的地面由 窗外.tsx 按结构地面层的缺口铺，远山不铺 */
export const 结构占地 = [0, -26, 21, 0] as const;

/** 平地框 [x0, y0, x1, y1]：樱花林撒树那一圈（内框 中心 ± 外半径）再让 平地留边 格 */
export const 平地框 = (() => {
  const [x0, y0, x1, y1] = 樱花林.内框;
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const r = 樱花林.外半径 + 远山.平地留边;
  return [cx - r, cy - r, cx + r, cy + r] as const;
})();

/** 点 (px, py) 出平地框多远（格；框里是 0） */
export const 出平地 = (px: number, py: number) => {
  const [x0, y0, x1, y1] = 平地框;
  return Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1));
};

/** 整数格点上的随机数（0～1），同一组 (i, j, 种) 每次一样 */
const 散 = (i: number, j: number, 种: number) => {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(种, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** 值噪声（0～1）：格点上取 散，格子里缓过去 */
const 值噪声 = (x: number, y: number, 尺度: number, 种: number) => {
  const [u, v] = [x / 尺度, y / 尺度];
  const [i, j] = [Math.floor(u), Math.floor(v)];
  const [a, b] = [缓(u - i), 缓(v - j)];
  const 下 = 散(i, j, 种) + (散(i + 1, j, 种) - 散(i, j, 种)) * a;
  const 上 = 散(i, j + 1, 种) + (散(i + 1, j + 1, 种) - 散(i, j + 1, 种)) * a;
  return 下 + (上 - 下) * b;
};

/** 这一列的高（整格）：平地框里 0，出框以后按 坡长 慢慢起伏 */
export const 高度 = (x: number, y: number) => {
  const [px, py] = [x + 0.5, y + 0.5];
  const d = 出平地(px, py);
  if (d <= 0) return 0;
  const { 种子, 坡长, 起伏, 尺度, 细 } = 远山;
  const n = (1 - 细) * 值噪声(px, py, 尺度[0], 种子) + 细 * 值噪声(px, py, 尺度[1], 种子 + 1);
  return Math.round(缓(clamp01(d / 坡长)) * (起伏[0] + 起伏[1] * d) * n);
};

/** 地形铺的范围 [x0, y0, x1, y1]：西门脚下那一列 ± 铺到 */
export const 地形范围 = (() => {
  const [cx, cy] = [Math.floor(机位.脚[0]), Math.floor(机位.脚[1])];
  return [cx - 远山.铺到, cy - 远山.铺到, cx + 远山.铺到, cy + 远山.铺到] as const;
})();

export type 面们 = { 位: number[]; uv: number[]; 法: number[]; 序: number[] };
const 新面们 = (): 面们 => ({ 位: [], uv: [], 法: [], 序: [] });
const 加四边形 = (f: 面们, 点: readonly (readonly number[])[], uv: readonly (readonly number[])[], 法: readonly number[]) => {
  const n = f.位.length / 3;
  for (let i = 0; i < 4; i++) {
    f.位.push(...点[i]!);
    f.uv.push(...uv[i]!);
    f.法.push(...法);
  }
  f.序.push(n, n + 1, n + 2, n, n + 2, n + 3);
};

const 压低 = 0.01;
const 在占地里 = (x: number, y: number) => x >= 结构占地[0] && x < 结构占地[2] && y >= 结构占地[1] && y < 结构占地[3];

/** 四个方向的侧面：法线、这一面左右两头（从外面看，左到右）、贴图横向坐标（左、右）。贴图竖向 v = 0 在面的上沿（DataTexture 不翻转，第一行在上） */
const 侧向们 = [
  { d: [1, 0], 法: [1, 0, 0], 端: (x: number, y: number) => [[x + 1, y], [x + 1, y + 1]], u: (x: number, y: number) => [y, y + 1] },
  { d: [-1, 0], 法: [-1, 0, 0], 端: (x: number, y: number) => [[x, y + 1], [x, y]], u: (x: number, y: number) => [-(y + 1), -y] },
  { d: [0, 1], 法: [0, 1, 0], 端: (x: number, y: number) => [[x + 1, y + 1], [x, y + 1]], u: (x: number, y: number) => [-(x + 1), -x] },
  { d: [0, -1], 法: [0, -1, 0], 端: (x: number, y: number) => [[x, y], [x + 1, y]], u: (x: number, y: number) => [x, x + 1] },
] as const;

/** 地形的面：顶（草方块顶，同高的一行并成一条）、草侧（每个台阶最上面那一格的侧面）、土侧（再往下露出来的泥土，几格并成一块、贴图竖向重复）。
 *  结构占地里不铺顶（窗外.tsx 按缺口铺）；范围最外一圈不画朝外的侧面（在雾外面） */
export const 地形 = () => {
  const [x0, y0, x1, y1] = 地形范围;
  const 宽 = x1 - x0;
  const 高们 = new Int16Array(宽 * (y1 - y0));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) 高们[(y - y0) * 宽 + (x - x0)] = 高度(x, y);
  const 高 = (x: number, y: number) => (x < x0 || x >= x1 || y < y0 || y >= y1 ? null : 高们[(y - y0) * 宽 + (x - x0)]!);
  const 顶 = 新面们();
  const 草侧 = 新面们();
  const 土侧 = 新面们();
  for (let y = y0; y < y1; y++) {
    let 起: number | null = null;
    let 起高 = 0;
    for (let x = x0; x <= x1; x++) {
      const h = x < x1 && !在占地里(x, y) ? 高(x, y)! : null;
      if (起 !== null && h !== 起高) {
        const z = 起高 - 压低;
        加四边形(顶, [[起, y, z], [x, y, z], [x, y + 1, z], [起, y + 1, z]], [[起, y], [x, y], [x, y + 1], [起, y + 1]], [0, 0, 1]);
        起 = null;
      }
      if (h !== null && 起 === null) [起, 起高] = [x, h];
    }
  }
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const h = 高(x, y)!;
      for (const s of 侧向们) {
        const hn = 高(x + s.d[0], y + s.d[1]);
        if (hn === null || hn >= h) continue;
        const [[lx, ly], [rx, ry]] = s.端(x, y);
        const [ul, ur] = s.u(x, y);
        const 面 = (f: 面们, 底: number, 顶z: number) =>
          加四边形(f, [[lx, ly, 底 - 压低], [rx, ry, 底 - 压低], [rx, ry, 顶z - 压低], [lx, ly, 顶z - 压低]], [[ul, 顶z - 底], [ur, 顶z - 底], [ur, 0], [ul, 0]], s.法);
        面(草侧, h - 1, h);
        if (h - 1 > hn) 面(土侧, hn, h - 1);
      }
    }
  return { 顶, 草侧, 土侧 };
};

/** 点 (px, py) 在不在从西门往东看的扇形里、离西门多远 */
const 扇形里 = (px: number, py: number, 到: number) => {
  const [dx, dy] = [px - 机位.脚[0], py - 机位.脚[1]];
  return Math.hypot(dx, dy) <= 到 && Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) <= 远山.扇形半角;
};

/** 坡上的樱花树：按 树格 的格子撒，每格 有树 的机会、格里随机挪；只在扇形里、出平地框 4 格以外（不挨着樱花林那一圈的树干）。
 *  树根在那一列的草上；埋进坡里的叶子不放（原版树叶不替换实心方块） */
export const 坡上的树 = () => {
  const { 种子, 树到, 树格: 间, 有树 } = 远山;
  const [x0, y0, x1, y1] = 地形范围;
  const 木: 格[] = [];
  const 叶: 格[] = [];
  let 棵 = 0;
  for (let gy = Math.floor(y0 / 间); gy * 间 < y1; gy++)
    for (let gx = Math.floor(x0 / 间); gx * 间 < x1; gx++) {
      if (散(gx, gy, 种子 + 2) >= 有树) continue;
      const x = gx * 间 + 1 + Math.floor(散(gx, gy, 种子 + 3) * (间 - 2));
      const y = gy * 间 + 1 + Math.floor(散(gx, gy, 种子 + 4) * (间 - 2));
      if (!扇形里(x + 0.5, y + 0.5, 树到) || 出平地(x + 0.5, y + 0.5) <= 4) continue;
      const h = 高度(x, y);
      const t = 樱花树(x, y, rng(种子 * 1009 + x * 131 + y * 7));
      木.push(...t.木.map(([a, b, c]): 格 => [a, b, c + h]));
      for (const [a, b, c] of t.叶) if (c + h >= 高度(a, b)) 叶.push([a, b, c + h]);
      棵++;
    }
  return { 木, 叶, 棵 };
};

/** 坡上的粉红色花簇 [x, y, 高, 转几个 90°]：扇形里、离西门 花簇到 格以内、出平地框的列，每列 花簇密度 的机会 */
export const 坡上的花 = () => {
  const { 种子, 花簇到, 花簇密度 } = 远山;
  const [x0, y0, x1, y1] = 地形范围;
  const 花: [number, number, number, number][] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!扇形里(x + 0.5, y + 0.5, 花簇到) || 出平地(x + 0.5, y + 0.5) <= 0) continue;
      if (散(x, y, 种子 + 5) >= 花簇密度) continue;
      花.push([x, y, 高度(x, y), Math.floor(散(x, y, 种子 + 6) * 4)]);
    }
  return 花;
};

// ---------- 原版的雾和天色（1.20.1 FogRenderer、LevelRenderer.renderSky、fog.glsl 的 linear_fog） ----------
const 十六进 = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];

/** 雾色（sRGB 数值 0～1）：生物群系雾色往天色靠 1 − (0.25 + 0.75 × 视距/32)^0.25（FogRenderer.setupColor，白天亮度 1：归隐之地锁在 2000 刻） */
export const 原版雾色 = (天: string, 雾: string, 视距: number): [number, number, number] => {
  const k = 1 - Math.pow(0.25 + (0.75 * 视距) / 32, 0.25);
  const [a, b] = [十六进(雾), 十六进(天)];
  return a.map((v, i) => v + (b[i]! - v) * k) as [number, number, number];
};

/** 地形雾从哪儿起、到哪儿全是雾（格）：视距 × 16 往回让 视距×16/10（夹在 4～64） */
export const 地形雾起止 = (视距: number): [number, number] => {
  const 远 = 视距 * 16;
  return [远 - Math.min(64, Math.max(4, 远 / 10)), 远];
};

/** 雾多浓（0～1）：linear_fog，起以内 0、起到止 smoothstep、止以外 1；距离是柱形的（水平距离和竖直距离取大的） */
export const 雾浓 = (距离: number, 起: number, 止: number) => {
  if (距离 <= 起) return 0;
  if (距离 >= 止) return 1;
  const t = (距离 - 起) / (止 - 起);
  return t * t * (3 - 2 * t);
};

/** 天上仰角 仰（度）那一圈混进多少雾色：天盘在镜头上方 16 格、半径 512，盘心雾距 16、盘边 512，片元上按位置线性插（天雾 0 起、视距×16 止）；
 *  盘边（仰角 1.79° 以下）外面是清屏色 = 雾色 */
export const 天雾 = (仰: number, 视距: number) => {
  if (仰 <= 0) return 1;
  const r = 16 / Math.tan((仰 * Math.PI) / 180);
  if (r >= 512) return 1;
  return 雾浓(16 + ((512 - 16) * r) / 512, 0, 视距 * 16);
};
