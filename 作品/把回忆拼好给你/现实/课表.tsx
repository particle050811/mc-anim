// 贴在教室墙上的课表（SVG 片段，要放在 <svg> 里）：一张纸、两角透明胶，内容见 课表数据.ts。格子能一格一格亮（亮格）。
// 版式比例照 01 的打印件（时间、内容两列加七天，16 行），纸的宽高比固定，高由宽算（课表高）。
import type React from 'react';
import { 现实色, 混色 } from './色板.ts';
import { 印刷宋 } from './字体.ts';
import { 齐, 线宽 } from './像素.ts';
import { 找格, 节们, 星期们, 课表标题, 课表格们, 课表注, 课表表头, type 亮格, type 课表格 } from './课表数据.ts';

export type { 亮格 };

// 纸上的版式，单位是纸宽。列宽照 01 的像素量（时间 270、内容 162、每天 195），行高 = 表宽 × 52.6 / 1797
const 版 = { 边: 0.035, 标题高: 0.075, 注高: 0.045, 底边: 0.025 };
const 列宽们 = [270, 162, ...星期们.map(() => 195)];
const 列宽总 = 列宽们.reduce((a, b) => a + b, 0);
const 行高比 = 52.6 / 列宽总;
const 行数 = 节们.length + 1; // 加表头

/** 纸宽 → 纸高 */
export const 课表高 = (宽: number) => 宽 * (版.边 + 版.标题高 + (1 - 2 * 版.边) * 行高比 * 行数 + 版.注高 + 版.底边);

const 疏排 = (字: string) => [...字].join('　');

type 方 = { x0: number; y0: number; x1: number; y1: number };

export const 课表: React.FC<{ x: number; y: number; 宽: number; 亮格?: readonly 亮格[] }> = ({ x, y, 宽, 亮格 = [] }) => {
  const W = 宽;
  const H = 课表高(W);
  const 表x = x + 版.边 * W;
  const 表y = y + (版.边 + 版.标题高) * W;
  const 表宽 = (1 - 2 * 版.边) * W;
  const 行高 = 表宽 * 行高比;
  // 格线吸到成片整像素：第 i 条竖线、第 j 条横线
  const 竖: number[] = [齐(表x)];
  let 累 = 0;
  for (const w of 列宽们) {
    累 += w;
    竖.push(齐(表x + (表宽 * 累) / 列宽总));
  }
  const 横 = Array.from({ length: 行数 + 1 }, (_, j) => 齐(表y + j * 行高));
  const 细 = 线宽(0.5);
  const 粗 = 线宽(W / 560);
  const 字号 = 行高 * 0.54;

  // 表格行列 → 方框（课表格的行、列从数据区算起：数据行 = 格网行 − 1，星期列 = 格网列 − 2）
  const 框 = (行: number, 列: number, 跨行 = 1, 跨列 = 1): 方 => ({ x0: 竖[列]!, y0: 横[行]!, x1: 竖[列 + 跨列]!, y1: 横[行 + 跨行]! });
  const 格框 = (g: 课表格) => 框(g.行 + 1, g.列 + 2, g.跨行, g.跨列);

  const 亮度 = new Map<课表格, number>();
  for (const l of 亮格) {
    const g = 找格(l.周, l.节);
    亮度.set(g, Math.max(亮度.get(g) ?? 0, Math.min(1, Math.max(0, l.亮))));
  }

  const 线框 = (b: 方, key: string) => (
    <g key={key}>
      <rect x={b.x0} y={b.y0} width={b.x1 - b.x0 + 细} height={细} />
      <rect x={b.x0} y={b.y1} width={b.x1 - b.x0 + 细} height={细} />
      <rect x={b.x0} y={b.y0} width={细} height={b.y1 - b.y0 + 细} />
      <rect x={b.x1} y={b.y0} width={细} height={b.y1 - b.y0 + 细} />
    </g>
  );
  const 字 = (b: 方, s: string, key: string, 粗体 = false) => (
    <text
      key={key}
      x={(b.x0 + b.x1 + 细) / 2}
      y={(b.y0 + b.y1 + 细) / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={印刷宋}
      fontSize={字号}
      fontWeight={粗体 ? 700 : 400}
      fill={现实色.墨}
    >
      {s}
    </text>
  );

  const 表头们: { b: 方; s: string }[] = [
    { b: 框(0, 0), s: 课表表头.时间 },
    { b: 框(0, 1), s: 课表表头.内容 },
    ...星期们.map((周, i) => ({ b: 框(0, i + 2), s: 周 })),
  ];
  const 行头们 = 节们.flatMap((n, i) => [
    { b: 框(i + 1, 0), s: n.时段, 粗: false },
    { b: 框(i + 1, 1), s: n.节, 粗: true },
  ]);

  const 纸x = 齐(x);
  const 纸y = 齐(y);
  const 纸宽 = 齐(W);
  const 纸高 = 齐(H);
  const 影 = 齐(Math.max(1, W * 0.007));
  const 胶宽 = W * 0.11;
  const 胶高 = W * 0.032;

  return (
    <g>
      {/* 平涂投影：纸往右下错开一点，一个色 */}
      <rect x={纸x + 影} y={纸y + 影 * 1.5} width={纸宽} height={纸高} fill={现实色.墙影} />
      <rect x={纸x} y={纸y} width={纸宽} height={纸高} fill={现实色.纸} />
      <text
        x={x + W / 2}
        y={y + (版.边 + 版.标题高 / 2) * W}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={印刷宋}
        fontSize={W * 0.034}
        fontWeight={700}
        letterSpacing={W * 0.004}
        fill={现实色.墨}
      >
        {课表标题}
      </text>
      <g shapeRendering="crispEdges">
        {/* 表头一行浅灰底（01 就是这样） */}
        <rect x={竖[0]} y={横[0]} width={竖[竖.length - 1]! - 竖[0]!} height={横[1]! - 横[0]!} fill={现实色.纸背} />
        {课表格们.map((g, i) => {
          const 亮 = 亮度.get(g) ?? 0;
          if (亮 <= 0) return null;
          const b = 格框(g);
          const 内 = 线宽(Math.max(1, 行高 * 0.08));
          return (
            <g key={`亮${i}`}>
              <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill={混色(现实色.纸, 现实色.亮格, 亮)} />
              <rect x={b.x0 + 细 + 内} y={b.y0 + 细 + 内} width={b.x1 - b.x0 - 细 - 2 * 内} height={b.y1 - b.y0 - 细 - 2 * 内} fill="none" stroke={现实色.亮框} strokeWidth={细} strokeOpacity={亮} />
            </g>
          );
        })}
        <g fill={现实色.表线}>
          {表头们.map((t, i) => 线框(t.b, `头${i}`))}
          {行头们.map((t, i) => 线框(t.b, `行${i}`))}
          {课表格们.map((g, i) => 线框(格框(g), `格${i}`))}
          {/* 外框加粗 */}
          <rect x={竖[0]} y={横[0]} width={竖[竖.length - 1]! - 竖[0]! + 细} height={粗} />
          <rect x={竖[0]} y={横[行数]! + 细 - 粗} width={竖[竖.length - 1]! - 竖[0]! + 细} height={粗} />
          <rect x={竖[0]} y={横[0]} width={粗} height={横[行数]! - 横[0]! + 细} />
          <rect x={竖[竖.length - 1]! + 细 - 粗} y={横[0]} width={粗} height={横[行数]! - 横[0]! + 细} />
        </g>
      </g>
      {表头们.map((t, i) => 字(t.b, t.s, `头字${i}`, true))}
      {行头们.map((t, i) => 字(t.b, t.s, `行字${i}`, t.粗))}
      {课表格们.map((g, i) => (g.字 ? 字(格框(g), g.疏 ? 疏排(g.字) : g.字, `格字${i}`) : null))}
      <text x={表x} y={横[行数]! + 版.注高 * W * 0.55} dominantBaseline="central" fontFamily={印刷宋} fontSize={W * 0.0128} fill={现实色.墨}>
        {课表注}
      </text>
      {/* 两个上角各一条透明胶，斜着贴 */}
      {[
        { cx: x + W * 0.035, cy: y + W * 0.012, 角: -38 },
        { cx: x + W * 0.965, cy: y + W * 0.012, 角: 38 },
      ].map((t, i) => (
        <rect
          key={`胶${i}`}
          x={t.cx - 胶宽 / 2}
          y={t.cy - 胶高 / 2}
          width={胶宽}
          height={胶高}
          fill={现实色.胶带}
          stroke={现实色.胶带边}
          strokeWidth={细}
          transform={`rotate(${t.角} ${t.cx} ${t.cy})`}
        />
      ))}
    </g>
  );
};
