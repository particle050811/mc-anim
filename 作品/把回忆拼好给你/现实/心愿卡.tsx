// 用透明胶平贴在桌角的心愿卡（SVG 片段，要放在 <svg> 里）：手写「____大学等我！」，大学名留空（不出真实信息）。三稿第 13 句它一直不动。
// 位置按卡片中心给；卡平躺在桌面上，所以竖向按 透视 压扁（桌面的透视比，课桌.tsx 里定），再在桌面内转 斜 度。
import type React from 'react';
import { 现实色 } from './色板.ts';
import { 手写 } from './字体.ts';
import { 线宽 } from './像素.ts';

// 单位是卡宽。Agent 暂定：卡 1 × 0.46，字号 0.105，空格线 2.6 个字宽
const 比 = { 高: 0.46, 字号: 0.105, 空格: 2.6, 空隙: 0.15 };

export const 心愿卡: React.FC<{ x: number; y: number; 宽: number; 透视: number; 斜?: number; 字?: string }> = ({ x, y, 宽: w, 透视, 斜 = -4, 字 = '大学等我！' }) => {
  const h = w * 比.高;
  const 字号 = w * 比.字号;
  const 字宽 = [...字].length * 字号; // 全是全角字
  const 总宽 = (比.空格 + 比.空隙) * 字号 + 字宽;
  const 起 = -总宽 / 2;
  const 基线 = 字号 * 0.36;
  const 线起 = 起;
  const 线止 = 起 + 比.空格 * 字号;
  const 线y = 基线 + 字号 * 0.08;
  // 手画的横线：两段微微起伏
  const 横线 = `M${线起} ${线y} Q${(线起 * 2 + 线止) / 3} ${线y - 字号 * 0.08} ${(线起 + 线止) / 2} ${线y} T${线止} ${线y - 字号 * 0.04}`;
  const 细 = 线宽(0.5);
  const 胶宽 = w * 0.24;
  const 胶高 = w * 0.085;

  return (
    <g transform={`translate(${x} ${y}) scale(1 ${透视}) rotate(${斜})`}>
      {/* 平涂投影：卡很薄，只错开一点 */}
      <rect x={-w / 2 + w * 0.012} y={-h / 2 + w * 0.02} width={w} height={h} rx={w * 0.02} fill={现实色.桌影} />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={w * 0.02} fill={现实色.卡} />
      <rect x={-w / 2 + w * 0.04} y={-h / 2 + w * 0.04} width={w - w * 0.08} height={h - w * 0.08} rx={w * 0.012} fill="none" stroke={现实色.卡框} strokeWidth={Math.max(细, w * 0.006)} strokeDasharray={`${w * 0.025} ${w * 0.018}`} />
      <path d={横线} fill="none" stroke={现实色.卡字} strokeWidth={Math.max(细, 字号 * 0.07)} strokeLinecap="round" />
      <text x={线止 + 比.空隙 * 字号} y={基线} fontFamily={手写} fontSize={字号} fill={现实色.卡字}>
        {字}
      </text>
      {[
        { cx: -w / 2 + w * 0.05, cy: -h / 2 + w * 0.03, 角: -32 },
        { cx: w / 2 - w * 0.05, cy: -h / 2 + w * 0.03, 角: 32 },
      ].map((t, i) => (
        <rect
          key={i}
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
