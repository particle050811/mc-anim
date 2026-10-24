// 墙上的课表：一张照原版地图纸画的纸（米黄、一圈深浅不一的棕边），挂在物品展示框里（框是白桦木板的贴图），用本作品的游戏像素字写，格子能一格一格亮。
// 放在 <像素空间> 里（单位贴图像素），正面朝南贴在墙上，框凸出墙面 2 个贴图像素。内容见 课表数据.ts。
// 版式（Agent 暂定）：左边一列节次、右边七天，一行 10 个贴图像素（字 8 高）；原来那列「时间」去掉，左屏 213 个贴图像素宽放不下九列，
// 开始的钟点在下面的「注」里还有。只占一列的合并格字放不下就竖着排（两个字一行，疏排的一个字一行）。
import type React from 'react';
import type * as THREE from 'three';
import { 像素字 } from '../界面/像素字.ts';
import { 现实色 } from './色板.ts';
import { 新像素画, 成贴图, 画布倍, 混色, type 像素画 } from './像素图.ts';
import { 正面, 顶面 } from './像素块.tsx';
import { 找格, 节们, 星期们, 课表标题, 课表格们, 课表注, type 亮格, type 课表格 } from './课表数据.ts';
import { 课表框 } from './课桌布局.ts';

export type { 亮格 };

const 行距 = 10;
const 日宽 = 19;
const 节宽 = Math.max(...节们.map((n) => 像素字.字宽(n.节))) + 2;
const 列宽们 = [节宽, ...星期们.map(() => 日宽)];
/** 格线的 x（从表的左边起，第 i 条竖线；线占一个贴图像素，格里面从线的右边一格起） */
const 竖线 = 列宽们.reduce<number[]>((a, w) => [...a, a.at(-1)! + w + 1], [0]);
const 表宽 = 竖线.at(-1)! + 1;
const 行数 = 节们.length + 1;
const 表高 = 行数 * 行距 + 1;
const 注行们 = (() => {
  const 段 = 课表注.split('；');
  return 段.map((s, i) => (i === 0 ? s : s.replace(/^\s*/, '')) + (i < 段.length - 1 ? '；' : ''));
})();
const 注缩进 = 像素字.字宽('注：');

/** 纸：四边各留 6（地图那圈棕边 3 + 空 3）；从上往下 标题 9、空 3、表、空 3、注 */
const 边 = 6;
const 纸宽 = 表宽 + 2 * 边;
const 纸高 = 边 + 9 + 3 + 表高 + 3 + 注行们.length * 9 + 边 - 1;
/** 框（白桦木板）每边 2，凸出墙面 2 */
const 框 = 2;
export const 课表尺寸 = { 宽: 纸宽 + 2 * 框, 高: 纸高 + 2 * 框, 深: 2 } as const;
const S = 课表尺寸;
if (S.宽 !== 课表框.宽 || S.高 !== 课表框.高) throw new Error(`课表排出来 ${S.宽}×${S.高}，课桌布局.ts 的 课表框 写的是 ${课表框.宽}×${课表框.高}：改那边（镜头按它对准）`);

const 字中 = (s: string) => 像素字.字宽(s) - 1;
/** 在方框 [x0, x1) × [y0, y1)（贴图像素）里居中写一行 */
const 居中写 = (p: 像素画, s: string, x0: number, x1: number, y0: number, y1: number, 色: string) =>
  像素字.画(p.ctx, s, { x: Math.round((x0 + x1 - 字中(s)) / 2) * 画布倍, y: Math.round((y0 + y1 - 8) / 2) * 画布倍 }, 0, 0, 色, 画布倍);

/** 一格里的字排成几行：放得下就一行（疏排的字间空一个全角空格）；放不下就两个字一行，疏排的一个字一行 */
const 排行 = (g: 课表格, 内宽: number): string[] => {
  const 字们 = [...g.字];
  const 一行 = g.疏 ? 字们.join('　') : g.字;
  if (字中(一行) <= 内宽) return [一行];
  const 每行 = g.疏 ? 1 : Math.max(1, Math.floor((内宽 + 1) / 9));
  const out: string[] = [];
  for (let i = 0; i < 字们.length; i += 每行) out.push(字们.slice(i, i + 每行).join(''));
  return out;
};

const 画纸 = (亮: ReadonlyMap<课表格, number>): 像素画 => {
  const p = 新像素画(S.宽, S.高);
  // 框：白桦木板的四色噪点，外沿一圈暗
  p.噪(0, 0, S.宽, S.高, 现实色.框, 201, [4, 3, 2, 1]);
  p.方(0, 0, S.宽, 1, 现实色.框[3]);
  p.方(0, S.高 - 1, S.宽, 1, 现实色.框[3]);
  p.方(0, 0, 1, S.高, 现实色.框[3]);
  p.方(S.宽 - 1, 0, 1, S.高, 现实色.框[3]);
  // 纸：米黄噪点，棕边按位置哈希宽 2～3，外圈最深
  const [ox, oy] = [框, 框];
  p.噪(ox, oy, 纸宽, 纸高, 现实色.图纸, 202, [5, 3, 2]);
  p.噪(ox, oy, 纸宽, 1, [现实色.图边[0], 现实色.图边[1]], 203);
  p.噪(ox, oy + 纸高 - 1, 纸宽, 1, [现实色.图边[0], 现实色.图边[1]], 204);
  p.噪(ox, oy, 1, 纸高, [现实色.图边[0], 现实色.图边[1]], 205);
  p.噪(ox + 纸宽 - 1, oy, 1, 纸高, [现实色.图边[0], 现实色.图边[1]], 206);
  p.噪(ox + 1, oy + 1, 纸宽 - 2, 1, 现实色.图边.slice(1), 207);
  p.噪(ox + 1, oy + 纸高 - 2, 纸宽 - 2, 1, 现实色.图边.slice(1), 208);
  p.噪(ox + 1, oy + 1, 1, 纸高 - 2, 现实色.图边.slice(1), 209);
  p.噪(ox + 纸宽 - 2, oy + 1, 1, 纸高 - 2, 现实色.图边.slice(1), 210);
  // 第三圈稀疏的几点，边就不是一条直线
  for (let i = 2; i < 纸宽 - 2; i++)
    for (const [y, k] of [[2, 211], [纸高 - 3, 212]] as const) if ((i * 7 + k) % 5 < 2) p.点(ox + i, oy + y, 现实色.图边[2]);
  for (let j = 2; j < 纸高 - 2; j++)
    for (const [x, k] of [[2, 213], [纸宽 - 3, 214]] as const) if ((j * 7 + k) % 5 < 2) p.点(ox + x, oy + j, 现实色.图边[2]);

  const 墨 = 现实色.图墨;
  居中写(p, 课表标题, ox, ox + 纸宽, oy + 边, oy + 边 + 9, 墨);
  const tx = ox + 边;
  const ty = oy + 边 + 9 + 3;
  // 格子的方框（贴图像素，含左上那条线）：表格行 r（0 是表头）、列 c（0 是节次）
  const 框于 = (r: number, c: number, 跨行 = 1, 跨列 = 1) => ({ x0: tx + 竖线[c]!, y0: ty + r * 行距, x1: tx + 竖线[c + 跨列]!, y1: ty + (r + 跨行) * 行距 });
  p.方(tx + 1, ty + 1, 表宽 - 2, 行距 - 1, 现实色.表头);
  for (const g of 课表格们) {
    const k = 亮.get(g) ?? 0;
    if (k <= 0) continue;
    const b = 框于(g.行 + 1, g.列 + 1, g.跨行, g.跨列);
    p.方(b.x0 + 1, b.y0 + 1, b.x1 - b.x0 - 1, b.y1 - b.y0 - 1, 混色(现实色.图纸[0], 现实色.亮格, k));
    const 框色 = 混色(现实色.亮格, 现实色.亮框, k);
    p.方(b.x0 + 2, b.y0 + 2, b.x1 - b.x0 - 3, 1, 框色);
    p.方(b.x0 + 2, b.y1 - 2, b.x1 - b.x0 - 3, 1, 框色);
    p.方(b.x0 + 2, b.y0 + 2, 1, b.y1 - b.y0 - 3, 框色);
    p.方(b.x1 - 2, b.y0 + 2, 1, b.y1 - b.y0 - 3, 框色);
  }
  // 格线：外框、表头、节次列的每一行，再按合并格画各自的框
  const 线 = (b: { x0: number; y0: number; x1: number; y1: number }) => {
    p.方(b.x0, b.y0, b.x1 - b.x0 + 1, 1, 现实色.表线);
    p.方(b.x0, b.y1, b.x1 - b.x0 + 1, 1, 现实色.表线);
    p.方(b.x0, b.y0, 1, b.y1 - b.y0 + 1, 现实色.表线);
    p.方(b.x1, b.y0, 1, b.y1 - b.y0 + 1, 现实色.表线);
  };
  for (let c = 0; c <= 星期们.length; c++) 线(框于(0, c));
  节们.forEach((_, i) => 线(框于(i + 1, 0)));
  for (const g of 课表格们) 线(框于(g.行 + 1, g.列 + 1, g.跨行, g.跨列));
  // 字
  星期们.forEach((周, i) => {
    const b = 框于(0, i + 1);
    居中写(p, 周, b.x0 + 1, b.x1, b.y0 + 1, b.y1, 墨);
  });
  节们.forEach((n, i) => {
    const b = 框于(i + 1, 0);
    居中写(p, n.节, b.x0 + 1, b.x1, b.y0 + 1, b.y1, 墨);
  });
  for (const g of 课表格们) {
    if (!g.字) continue;
    const b = 框于(g.行 + 1, g.列 + 1, g.跨行, g.跨列);
    const 行们 = 排行(g, b.x1 - b.x0 - 1);
    const 距 = 行们.length > 1 && g.疏 ? 行距 : 9;
    const 总高 = (行们.length - 1) * 距 + 8;
    const y0 = Math.round((b.y0 + 1 + b.y1 - 总高) / 2);
    行们.forEach((s, j) => 居中写(p, s, b.x0 + 1, b.x1, y0 + j * 距, y0 + j * 距 + 8, 墨));
  }
  // 注：第一行带「注：」，后面几行缩进对齐
  const ny = ty + 表高 + 3;
  注行们.forEach((s, i) => 像素字.画(p.ctx, s, { x: (tx + (i ? 注缩进 : 0)) * 画布倍, y: (ny + i * 9) * 画布倍 }, 0, 0, 墨, 画布倍));
  return p;
};

const 缓存 = new Map<string, THREE.Texture>();
let 框顶: THREE.Texture | null = null;

/** 格子亮度取 4 档（一格一格亮，像游戏里的状态切换，不做连续渐变） */
const 档 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 4) / 4;

export const 课表: React.FC<{
  /** 框正面的左下角（贴图像素），y 是正面所在的深（墙面往外 深） */
  x: number;
  y: number;
  z: number;
  亮格?: readonly 亮格[];
}> = ({ x, y, z, 亮格 = [] }) => {
  const 亮 = new Map<课表格, number>();
  for (const l of 亮格) {
    const g = 找格(l.周, l.节);
    亮.set(g, Math.max(亮.get(g) ?? 0, 档(l.亮)));
  }
  const 键 = 课表格们.map((g) => 亮.get(g) ?? 0).join(',');
  let 图 = 缓存.get(键);
  if (!图) 缓存.set(键, (图 = 成贴图(画纸(亮))));
  框顶 ??= (() => {
    const p = 新像素画(S.宽, S.深);
    p.噪(0, 0, S.宽, S.深, 现实色.框, 215, [4, 3, 2, 1]);
    return 成贴图(p);
  })();
  return (
    <group>
      <正面 x={x} y={y} z={z} 宽={S.宽} 高={S.高} 图={图} />
      <顶面 x={x} y={y} z={z + S.高} 宽={S.宽} 深={S.深} 图={框顶} />
    </group>
  );
};
