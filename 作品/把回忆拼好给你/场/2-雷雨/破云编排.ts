// 第 7 句「拨」起那个镜头（段 2-拨开阴霾，照片「光柱破云」也取这里）每一帧的样子：镜头、魔法阵、光柱、云洞、调子、阳光、雨。
// 按歌曲帧算（照片按歌上的时刻取帧，不归哪一段），时刻取 分镜.ts 的正片事件，分寸取 参数.ts。纯模块（测试也引）。
import { clamp01 } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { 插调子, type 调子 } from '@engine/三渲二/调子.ts';
import { fps, 段窗口, 正片事件 } from '../../分镜.ts';
import { 色板 } from '../../色板.ts';
import * as 参 from './参数.ts';
import { 抗爆, 坑, 远地方块 } from './弹坑.ts';
import type { 雨片 } from './雨.tsx';
import { 混色 } from './调子.ts';

const 事 = (名: keyof typeof 正片事件) => 正片事件[名].帧;
/** 这个镜头放到哪一帧为止（歌曲帧，不含）：段 2-拨开阴霾 的止 */
export const 破云止帧 = 段窗口('2-拨开阴霾').止帧;
/** 照片「光柱破云」取的那一帧 */
export const 照片帧 = 事('照片-光柱破云');

const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 插3 = (a: readonly number[], b: readonly number[], t: number): V3 => [插(a[0]!, b[0]!, t), 插(a[1]!, b[1]!, t), 插(a[2]!, b[2]!, t)];
const 缓 = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
/** 缓出（先快后慢） */
const 缓出 = (t: number) => 1 - (1 - clamp01(t)) ** 2;
/** 从 起 那一帧开始、n 帧走完的进度：起那一帧已经走了 1/n */
const 走 = (帧: number, 起: number, n: number) => clamp01((帧 - 起 + 1) / n);

const 她 = 参.破云站位.她;

// ---------- 镜头 ----------
export type 破云机位 = { 种: '透视'; 眼: V3; 看: V3; 视角: number; 远: number };
/** 拨 那一帧起先停在近机位（阵展开、停住），再拉远、抬头：眼在两个机位之间插，水平朝着她，俯仰在两头之间插 */
export const 破云机位 = (帧: number): 破云机位 => {
  const { 近, 远, 视角, 停, 帧: n } = 参.破云镜头;
  const t = 缓(走(帧, 事('拨') + 停, n));
  const 偏 = 插3(近.眼, 远.眼, t);
  const 眼: V3 = [她[0] + 偏[0], 她[1] + 偏[1], 她[2] + 偏[2]];
  const 仰 = (插(近.俯仰, 远.俯仰, t) * Math.PI) / 180;
  const [dx, dy] = [她[0] - 眼[0], 她[1] - 眼[1]];
  const l = Math.hypot(dx, dy);
  return { 种: '透视', 眼, 看: [眼[0] + (dx / l) * Math.cos(仰) * 10, 眼[1] + (dy / l) * Math.cos(仰) * 10, 眼[2] + Math.sin(仰) * 10], 视角, 远: 1500 };
};

// ---------- 魔法阵、光柱、云洞 ----------
/** 魔法阵展开到多大（0～1） */
export const 阵大小 = (帧: number) => 缓出(走(帧, 事('拨'), 参.破云阵.展开帧));
/** 魔法阵转了几度 */
export const 阵转 = (帧: number) => (帧 / fps) * 参.破云阵.每秒转;
/** 光柱顶（z，格）：从底往上冲，光柱到云 那一帧碰到云底；之后停在云层顶面（洞没开时被云挡着，开了从洞里看到它到头） */
export const 光柱顶 = (帧: number, 底: number) => {
  if (帧 < 事('拨')) return 底;
  if (帧 >= 事('光柱到云')) return 参.云.高 + 参.云.厚;
  return 插(底, 参.云.高, (帧 - 事('拨') + 1) / (事('光柱到云') - 事('拨') + 1));
};
/** 光柱的不透明度：阳光铺地 起 退帧 帧退掉（法术放完，交给阳光；顶停在云层顶面，洞开大以后不退就是半空里断掉的一截） */
export const 光柱透 = (帧: number) => 1 - 缓(走(帧, 事('阳光铺地'), 参.光柱.退帧));
/** 云洞半径（格）：破云 起开，云洞开大 到 r1（缓出），之后按比例长到 r2（段尾），越开越快 */
export const 洞半径 = (帧: number) => {
  if (帧 < 事('破云')) return 0;
  if (帧 < 事('云洞开大')) return 参.云洞.r1 * 缓出((帧 - 事('破云') + 1) / (事('云洞开大') - 事('破云') + 1));
  const t = clamp01((帧 - 事('云洞开大')) / (破云止帧 - 1 - 事('云洞开大')));
  return 参.云洞.r1 * (参.云洞.r2 / 参.云洞.r1) ** t;
};
/** 洞外的云没掉了多少（0～散云.到）：云洞开大 起，到段尾 */
export const 散了 = (帧: number) => 参.散云.到 * 缓(clamp01((帧 - 事('云洞开大') + 1) / (破云止帧 - 事('云洞开大'))));
/** 0～1 的格子哈希 */
const 哈希 = (a: number, b: number, 盐: number) => ((((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(盐, 83492791)) >>> 0) % 1000) / 1000);
/** 云这一格（中心 x, y）还在不在：离洞心比半径近就没了，半径按格子哈希抖 ±(毛边 + 毛边比·r)/2，洞口参差；
 *  洞外按 散 一团一团没掉（团的哈希占七成、单格占三成，团边也碎） */
export const 云在 = (x: number, y: number, 心: readonly [number, number], r: number, 散 = 0) => {
  if (r <= 0) return true;
  const [a, b] = [Math.round(x * 2), Math.round(y * 2)];
  const 抖 = (哈希(a, b, 0) - 0.5) * (参.云洞.毛边 + 参.云洞.毛边比 * r);
  if (Math.hypot(x - 心[0], y - 心[1]) < r + 抖) return false;
  if (散 <= 0) return true;
  const 团 = 参.散云.团 * 2;
  const h = 0.7 * 哈希(Math.floor(a / 团), Math.floor(b / 团), 1) + 0.3 * 哈希(a, b, 2);
  return h >= 散;
};
/** 光柱撞云：光柱四周的云底亮多少（0～1）、亮到多远（格）。光柱到云 起亮，破云 以后 退帧 帧退掉 */
export const 撞亮 = (帧: number): { 强: number; 半径: number } => {
  if (帧 < 事('光柱到云')) return { 强: 0, 半径: 0 };
  const { 起, 到, 帧: n, 退帧 } = 参.撞云;
  return { 强: 1 - 缓(走(帧, 事('破云'), 退帧)), 半径: 插(起, 到, 缓出(走(帧, 事('光柱到云'), n))) };
};

// ---------- 调子 ----------
/** 从灰往暖走了多少（0～1）：破云 起，阳光铺地 走完 */
export const 转暖 = (帧: number) => 缓((帧 - 事('破云') + 1) / (事('阳光铺地') - 事('破云') + 1));
/** 这一帧的调子：整片后期用全程（雷雨 → 雨后暖阳）；3D 受光面只走 破云色调走，剩下的交给阳光那块发光区 */
export const 破云调子 = (帧: number): { 后期: 调子; 色调: string; 地平: string; 云色: string } => {
  const k = 转暖(帧);
  const 后期 = 插调子(色板.雷雨, 色板.雨后暖阳, k);
  return {
    后期,
    色调: 插调子(色板.雷雨, 色板.雨后暖阳, k * 参.破云色调走).色调,
    地平: 混色(参.雷雨天色.地平, 色板.雨后暖阳.天, k * 参.破云地平混),
    云色: 混色(参.云.色, 参.云.晴色, k * 参.云.晴混),
  };
};

// ---------- 发光区：她被自己的阵照亮、阳光铺地 ----------
/** 阳光铺到多远（格，以她为心）：阳光铺地 前 前帧 帧起，从 起半径 按比例铺开，段尾最后一帧铺到 半径 */
export const 阳光半径 = (帧: number) => {
  const 起 = 事('阳光铺地') - 参.阳光.前帧;
  if (帧 < 起) return 0;
  const { 起半径, 半径 } = 参.阳光;
  return 起半径 * (半径 / 起半径) ** clamp01((帧 - 起) / (破云止帧 - 1 - 起));
};
/** 平涂的发光区（场景坐标的盒子）：她那一块从 拨 起；阳光那片用 条数 条横条拼成阶梯状的圆 */
export const 破云发光区 = (帧: number): number[][] => {
  const out: number[][] = [];
  if (帧 >= 事('拨')) {
    const { 半宽, 高 } = 参.她亮区;
    out.push([她[0] - 半宽, 她[1] - 半宽, 她[2] - 0.05, 她[0] + 半宽, 她[1] + 半宽, 她[2] + 高]);
  }
  const r = 阳光半径(帧);
  if (r > 0) {
    const n = 参.阳光.条数;
    for (let k = 0; k < n; k++) {
      const y0 = -r + (2 * r * k) / n, y1 = -r + (2 * r * (k + 1)) / n;
      const ym = Math.min(Math.abs(y0), Math.abs(y1));
      const 半 = Math.sqrt(Math.max(0, r * r - ym * ym));
      out.push([她[0] - 半, 她[1] + y0, -16, 她[0] + 半, 她[1] + y1, 64]);
    }
  }
  return out;
};

// ---------- 雨 ----------
let 地表缓存: Map<string, number> | undefined;
/** 每一列最高的挡雨方块顶面（花草、火把不挡；炸完的坑 + 远处的地） */
export const 地表 = () => {
  if (!地表缓存) {
    const m = new Map<string, number>();
    for (const b of [...坑().留下, ...远地方块()]) {
      if ((抗爆[b.状态.replace(/\[.*$/, '')] ?? 0) === 0) continue;
      const k = `${b.位[0]},${b.位[1]}`;
      m.set(k, Math.max(m.get(k) ?? -Infinity, b.位[2] + 1));
    }
    地表缓存 = m;
  }
  return 地表缓存;
};

/** 透视镜头的雨：照原版，镜头所在那格周围 透视雨半径 以内每一列一张竖片，正对镜头（片的横向垂直于镜头到那一列的方向），
 *  底在那一列的地表，顶在镜头以上 半径 格；越远越淡（(1 − d²/r²)·0.5 + 0.5） */
export const 透视雨片们 = (眼: V3): 雨片[] => {
  const r = 参.透视雨半径;
  const 表 = 地表();
  const [ci, cj] = [Math.round(眼[0]), Math.floor(眼[1])];
  const out: 雨片[] = [];
  for (let i = ci - r; i <= ci + r; i++)
    for (let j = cj - r; j <= cj + r; j++) {
      const [x, y] = [i, j + 0.5];
      const [dx, dy] = [x - 眼[0], y - 眼[1]];
      const d = Math.hypot(dx, dy);
      if (d > r || d < 0.01) continue;
      const 底 = Math.max(表.get(`${i},${j}`) ?? -Infinity, 眼[2] - r);
      if (!Number.isFinite(底)) continue;
      out.push({ i, j, 中心: [x, y], 半宽: [(-dy / d) * 0.5, (dx / d) * 0.5], 底, 顶: 眼[2] + r, 透: (1 - (d * d) / (r * r)) * 0.5 + 0.5 });
    }
  return out;
};
