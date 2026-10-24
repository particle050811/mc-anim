// 透明笔筒（SVG 片段，要放在 <svg> 里）：立着两支在用的笔，底下攒着用空的笔芯，满度 0～1 越堆越高（撕页.ts 的 笔筒满度）。
// 位置按底边给：x 是左边，底 是筒底最低点落在桌面上的 y；高由宽算（笔筒高）。
// 笔芯的摆放是按序号用哈希取的固定值：满度涨的时候只往上加新的，已经在里面的不动；根数的小数部分是正在落进去的那一根，从筒口上方掉下来
// （满度 × 笔芯满根 是整数时没有落着的，撕页.ts 的 笔筒满度 停在整数页上就是整数）。
import type React from 'react';
import { hash2 } from '@engine/core/噪声.ts';
import { 现实色 } from './色板.ts';
import { 齐, 线宽 } from './像素.ts';
import { 笔芯满根 } from './撕页.ts';

// 单位是筒宽。Agent 暂定：筒高 1.15，口和底的椭圆半高 0.12；笔芯长 0.95 个内宽、斜 28°～62°（再平就伸出筒壁）
const 比 = { 高: 1.15, 椭圆: 0.12, 壁: 0.05, 芯长: 0.95, 芯粗: 0.034, 根数: 笔芯满根 };

export const 笔筒高 = (宽: number) => 宽 * 比.高;

type 芯 = { cx: number; cy: number; 角: number; 反: boolean };

/** 第 i 根笔芯在筒里的位置（筒内坐标：内宽 1，y 从筒底往上量，单位内宽）；层 = 这根落在第几层（0～1） */
const 摆 = (i: number, 内高: number): 芯 => {
  const 角度 = 28 + 34 * hash2(i, 7, 1);
  const 角 = (角度 * Math.PI) / 180;
  const 横 = 比.芯长 * Math.cos(角);
  const cx = 横 / 2 + (1 - 横) * hash2(i, 7, 2);
  const 层 = (i + 0.5) / 比.根数;
  const cy = 层 * 内高 * 0.96 + 0.06 * (hash2(i, 7, 3) - 0.5);
  return { cx, cy, 角: hash2(i, 7, 4) < 0.5 ? 角 : Math.PI - 角, 反: hash2(i, 7, 5) < 0.5 };
};

export const 笔筒: React.FC<{ x: number; 底: number; 宽: number; 满度: number }> = ({ x, 底, 宽, 满度 }) => {
  const X = 齐(x);
  const B = 齐(底);
  const W = 齐(宽);
  const H = 齐(笔筒高(宽));
  const ry = 宽 * 比.椭圆;
  const 口y = B - H; // 筒口椭圆的中心
  const 底y = B - ry; // 筒底椭圆的中心
  const 壁 = 宽 * 比.壁;
  const 内x = X + 壁;
  const 内宽 = W - 2 * 壁;
  const 内高 = (底y - 口y) / 内宽; // 以内宽为单位
  const 细 = 线宽(0.5);
  const 边 = 线宽(Math.max(0.5, 宽 / 110));
  const 芯粗 = Math.max(1.5, 宽 * 比.芯粗);
  const 芯长 = 比.芯长 * 内宽;
  const id = `bitong-${Math.round(X * 2)}-${Math.round(B * 2)}`;

  const 筒身 = `M${X} ${口y} L${X} ${底y} A${W / 2} ${ry} 0 0 0 ${X + W} ${底y} L${X + W} ${口y} A${W / 2} ${ry} 0 0 1 ${X} ${口y} Z`;
  // 里面能看见的范围：筒壁以内，往上开口（落下来的笔芯在口上方也看得见）
  const 里面 = `M${内x} ${口y - H} L${内x} ${底y} A${内宽 / 2} ${ry * 0.85} 0 0 0 ${内x + 内宽} ${底y} L${内x + 内宽} ${口y - H} Z`;

  const n = Math.max(0, Math.min(比.根数, Math.round(满度 * 比.根数 * 1e6) / 1e6)); // 去掉浮点尾数，整数根时不冒出一根落着的
  const 满根 = Math.floor(n);
  const 落 = n - 满根; // 第 满根 根落到一半
  const 芯们: { 芯: 芯; 落差: number; 透: number }[] = [];
  for (let i = 0; i < 满根; i++) 芯们.push({ 芯: 摆(i, 内高), 落差: 0, 透: 1 });
  if (落 > 0 && 满根 < 比.根数) 芯们.push({ 芯: 摆(满根, 内高), 落差: (1 - 落) ** 2 * (内高 + 0.6) * 内宽, 透: Math.min(1, 落 * 4) });

  const 画芯 = ({ 芯: c, 落差, 透 }: (typeof 芯们)[number], i: number) => {
    const cx = 内x + c.cx * 内宽;
    const cy = 底y - c.cy * 内宽 - 落差;
    const dx = (Math.cos(c.角) * 芯长) / 2;
    const dy = (Math.sin(c.角) * 芯长) / 2;
    // 笔头那端：反 = 朝左下
    const [hx, hy, tx, ty] = c.反 ? [cx - dx, cy + dy, cx + dx, cy - dy] : [cx + dx, cy - dy, cx - dx, cy + dy];
    const 沿 = (k: number) => [hx + (tx - hx) * k, hy + (ty - hy) * k] as const;
    const [a1x, a1y] = 沿(0.06);
    const [b1x, b1y] = 沿(0.1);
    const [b2x, b2y] = 沿(0.3);
    return (
      <g key={i} opacity={透}>
        <line x1={hx} y1={hy} x2={tx} y2={ty} stroke={现实色.笔芯边} strokeWidth={芯粗 + 2 * 细} strokeLinecap="round" />
        <line x1={hx} y1={hy} x2={tx} y2={ty} stroke={现实色.笔芯} strokeWidth={芯粗} strokeLinecap="round" />
        <line x1={b1x} y1={b1y} x2={b2x} y2={b2y} stroke={现实色.余墨} strokeWidth={芯粗 * 0.5} strokeLinecap="round" />
        <line x1={hx} y1={hy} x2={a1x} y2={a1y} stroke={现实色.笔头} strokeWidth={芯粗 * 0.8} strokeLinecap="round" />
      </g>
    );
  };

  // 两支立着的笔：从筒底斜靠到筒口外面
  const 笔们 = [
    { 底x: 0.38, 角: -9, 长: 1.5, 色: 现实色.笔一 },
    { 底x: 0.6, 角: 11, 长: 1.38, 色: 现实色.笔二 },
  ];
  const 笔粗 = 宽 * 0.085;

  return (
    <g>
      {/* 桌面上的平涂投影 */}
      <ellipse cx={X + W * 0.72} cy={B - ry * 1.3} rx={W * 0.62} ry={ry * 1.25} fill={现实色.桌影} />
      {/* 里壁和筒口里面 */}
      <path d={筒身} fill={现实色.玻璃里} />
      <ellipse cx={X + W / 2} cy={口y} rx={W / 2} ry={ry} fill={现实色.玻璃里} />
      <path d={`M${X} ${口y} A${W / 2} ${ry} 0 0 1 ${X + W} ${口y}`} fill="none" stroke={现实色.玻璃边} strokeWidth={边} />
      {笔们.map((p, i) => {
        const bx = 内x + p.底x * 内宽;
        const by = 底y - ry * 0.3;
        const 长 = p.长 * H;
        return (
          <g key={`笔${i}`} transform={`rotate(${p.角} ${bx} ${by})`}>
            <rect x={bx - 笔粗 / 2} y={by - 长} width={笔粗} height={长} rx={笔粗 * 0.3} fill={p.色} />
            <rect x={bx - 笔粗 / 2} y={by - 长} width={笔粗} height={笔粗 * 1.6} rx={笔粗 * 0.3} fill={现实色.笔夹} opacity={0.35} />
            <rect x={bx + 笔粗 * 0.18} y={by - 长 + 笔粗 * 0.6} width={笔粗 * 0.22} height={长 * 0.22} rx={笔粗 * 0.1} fill={现实色.笔夹} />
          </g>
        );
      })}
      <defs>
        <clipPath id={id}>
          <path d={里面} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{芯们.map(画芯)}</g>
      {/* 前面的玻璃：一层淡青、一道竖高光、轮廓和筒口前沿 */}
      <path d={筒身} fill={现实色.玻璃} />
      <rect x={X + W * 0.12} y={口y + ry * 1.4} width={W * 0.07} height={底y - 口y - ry * 1.6} rx={W * 0.035} fill={现实色.玻璃光} />
      <path d={`M${X} ${口y} L${X} ${底y} A${W / 2} ${ry} 0 0 0 ${X + W} ${底y} L${X + W} ${口y}`} fill="none" stroke={现实色.玻璃边} strokeWidth={边} />
      <path d={`M${X} ${口y} A${W / 2} ${ry} 0 0 0 ${X + W} ${口y}`} fill="none" stroke={现实色.玻璃边} strokeWidth={边} />
    </g>
  );
};
