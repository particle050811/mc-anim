// 桌上立着的撕页倒计时（SVG 片段，要放在 <svg> 里）：顶上一条装订，页上「距高考还有 / 大数字 / 天」。
// 位置按底边给：x 是正面左边，底 是正面下沿落在桌面上的 y；高由宽算（撕页本高），顶面（装订条的上面）的进深随剩下的页数变薄。
// 撕页由 翻页 驱动（撕页.ts 的约定）；飞走的纸画在本子上面，可能飞出本子、盖到墙上，外面由调用方裁。
// 撕的手还没做（第 13 句「只画手和物件」）：手要跟纸，用 撕页本几何 拿到页面的位置，用 算撕页态 拿到每张纸的进度。
import type React from 'react';
import { 现实色 } from './色板.ts';
import { 印刷黑, 数字体 } from './字体.ts';
import { 齐, 线宽 } from './像素.ts';
import { 算撕页态, 默认页们, type 飞纸 } from './撕页.ts';

// 单位是本子宽。Agent 暂定的比例：正面 1 × 0.88，装订占正面上 13%，顶面进深 0.025～0.075（剩 1 页到剩满第一页；一百页大约一厘米厚，再按俯角压扁）
const 比 = { 面高: 0.88, 装订: 0.13, 顶最薄: 0.025, 顶最厚: 0.075 };

export const 撕页本高 = (宽: number) => 宽 * 比.面高;

/** 页面（装订条以下、能撕的那块）相对 (x, 底) 的方框，给手对位用 */
export const 撕页本几何 = (x: number, 底: number, 宽: number) => {
  const 面高 = 撕页本高(宽);
  const 页顶 = 底 - 面高 * (1 - 比.装订);
  return { 面: { x, y: 底 - 面高, 宽, 高: 面高 }, 页: { x, y: 页顶, 宽, 高: 底 - 页顶 } };
};

/** 一张页（不含位置）：页面左上角是原点，宽 w、高 h；锯齿 = 上沿画成撕开的锯齿 */
const 页: React.FC<{ w: number; h: number; 数: number; 锯齿?: boolean }> = ({ w, h, 数, 锯齿 }) => {
  const 齿 = w * 0.035;
  const 齿高 = w * 0.014;
  let d = `M0 ${h} L${w} ${h} L${w} 0`;
  if (锯齿) {
    const n = Math.max(2, Math.round(w / 齿));
    for (let i = n - 1; i >= 0; i--) d += ` L${((i + 0.5) * w) / n} ${i % 2 ? 齿高 : -齿高 * 0.3} L${(i * w) / n} 0`;
  } else d += ' L0 0';
  d += ' Z';
  return (
    <>
      <path d={d} fill={现实色.纸} stroke={现实色.纸边} strokeWidth={线宽(0.5)} />
      <text x={w / 2} y={h * 0.15} textAnchor="middle" dominantBaseline="central" fontFamily={印刷黑} fontSize={w * 0.088} fontWeight={500} letterSpacing={w * 0.01} fill={现实色.页字}>
        距高考还有
      </text>
      <text x={w / 2} y={h * 0.58} textAnchor="middle" dominantBaseline="central" fontFamily={数字体} fontSize={w * (数 >= 100 ? 0.5 : 0.56)} fontWeight={700} fill={现实色.倒计时}>
        {数}
      </text>
      <text x={w * 0.88} y={h * 0.88} textAnchor="middle" dominantBaseline="central" fontFamily={印刷黑} fontSize={w * 0.088} fontWeight={500} fill={现实色.页字}>
        天
      </text>
    </>
  );
};

// 飞走一张纸：先从下沿翘起来（竖向压扁一点，像纸往上掀），再往右上甩出去、转、淡掉。Agent 暂定的轨迹
const 飞姿 = (t: number, w: number) => {
  const 缓 = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  const e = t * t;
  return {
    dx: w * (0.1 * t + 1.15 * e),
    dy: -w * (0.14 * t + 0.22 * e),
    转: 22 * 缓(0.1, 1, t),
    压: 1 - 0.25 * 缓(0, 0.35, t),
    透: 1 - 缓(0.62, 1, t),
  };
};

export const 撕页本: React.FC<{
  x: number;
  底: number;
  宽: number;
  /** 撕页.ts 的翻页值：整数停在 页们[k]，小数正在撕 */
  翻页: number;
  页们?: readonly number[];
}> = ({ x, 底, 宽, 翻页, 页们 = 默认页们 }) => {
  const 态 = 算撕页态(翻页, 页们);
  const X = 齐(x);
  const B = 齐(底);
  const W = 齐(宽);
  const 面高 = 齐(撕页本高(宽));
  const 装订高 = 齐(面高 * 比.装订);
  const 页顶 = B - 面高 + 装订高;
  const 页高 = B - 页顶;
  const 满 = Math.max(1, 页们[0]!);
  const 顶深 = 齐(宽 * (比.顶最薄 + (比.顶最厚 - 比.顶最薄) * Math.min(1, 态.顶 / 满)));
  const 顶y = B - 面高;
  const 影长 = 宽 * 0.34;
  const 细 = 线宽(0.5);

  return (
    <g>
      {/* 桌面上的平涂投影，往右后方（墙那边）落 */}
      <polygon points={`${X},${B} ${X + W},${B} ${X + W + 影长},${B - 影长 * 0.32} ${X + 影长},${B - 影长 * 0.32}`} fill={现实色.桌影} />
      {/* 顶面：装订条的上面，进深 = 剩下的纸有多厚；几道细线是纸层 */}
      <rect x={X} y={顶y - 顶深} width={W} height={顶深} fill={现实色.装订顶} shapeRendering="crispEdges" />
      {Array.from({ length: Math.max(0, Math.floor(顶深 / Math.max(1.5, 宽 * 0.022)) - 1) }, (_, i) => (
        <rect key={i} x={X} y={齐(顶y - 顶深 + (i + 1) * Math.max(1.5, 宽 * 0.022))} width={W} height={细} fill={现实色.装订} opacity={0.55} shapeRendering="crispEdges" />
      ))}
      {/* 正面：装订条 + 最上面那张 */}
      <rect x={X} y={顶y} width={W} height={装订高} fill={现实色.装订} shapeRendering="crispEdges" />
      <g transform={`translate(${X} ${页顶})`}>
        <页 w={W} h={页高} 数={态.顶} />
      </g>
      {/* 装订条压着纸的那道暗缝 */}
      <rect x={X} y={页顶} width={W} height={细} fill={现实色.装订} opacity={0.6} shapeRendering="crispEdges" />
      {[...态.飞].reverse().map((纸: 飞纸, i) => {
        const 姿 = 飞姿(纸.t, W);
        // 先撕下的那张原本在上面，最后画；绕页面右上角转、压
        return (
          <g key={i} opacity={姿.透} transform={`translate(${X + 姿.dx} ${页顶 + 姿.dy}) translate(${W} 0) rotate(${姿.转}) scale(1 ${姿.压}) translate(${-W} 0)`}>
            <页 w={W} h={页高} 数={纸.数} 锯齿 />
          </g>
        );
      })}
    </g>
  );
};
