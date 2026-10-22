// 思索（机械动力 6.0.8 内嵌的 Ponder-Forge-1.20.1-1.0.91）那种「从物品引出一根线连到说明框」的标注。
// 用户 10-03 定：保护四、五和古卷光看材质看不出来，加思索式的引线和说明文本。
// 样式照思索的 TextWindowElement（javap 读的常量）：说明框底色 PonderUI.BACKGROUND_FLAT 纯黑，
// 边框是 COLOR_WINDOW_BORDER 的上下渐变（#7A6000 金褐色，不透明度 0x60 → 0x20；高清图上太淡，这里提到 0xCC → 0x55），
// 字是白色（调色板 WHITE 和 #FFFFDD 各半）；
// 引线是 2 像素宽的灰线（上 #494949、下 #393939），从目标点拉到说明框。思索里还会给目标描一圈白框（OutlinerElement），这里给物品槽描一圈。
// 高清画法：线和框都按缩放 s 画，线外加一圈很淡的黑边，叠在 3D 画面上也看得清。
import React from 'react';
import { UiText, chatColors, type TooltipLine } from './基础.tsx';

const ponderTextColor = '#FFFFEE';

// 起：引线从哪个点出发（画面像素）；路径：中间的拐点（画面像素，可省）；框：说明框左上角（画面像素；框在上时是左下角）；
// 进度 0～1：先描框选中物品、再拉线、最后出说明框（思索里文字窗口也是淡入的）
export const PonderCallout: React.FC<{
  s: number;
  lineStart: [number, number];
  path?: [number, number][];
  boxPos: [number, number];
  boxWidth?: number;
  slotOutline?: [number, number, number]; // 选中框：左上角 x、y、边长（画面像素）
  lines: TooltipLine[];
  progress: number;
  boxAbove?: boolean; // 说明框放在物品上方（引线往上接框的下沿）
}> = ({ s: scale, lineStart: lineStart, path: bendPts = [], boxPos: boxPos, boxWidth, slotOutline, lines: lines, progress, boxAbove = false }) => {
  if (progress <= 0) return null;
  const outlineProgress = Math.min(1, progress / 0.25);
  const lineProgress = Math.max(0, Math.min(1, (progress - 0.15) / 0.45));
  const textProgress = Math.max(0, Math.min(1, (progress - 0.5) / 0.4));
  // 线的终点：说明框靠物品那条边、和最后一个拐点同一条竖线
  const pts: [number, number][] = [lineStart, ...bendPts];
  const last = pts[pts.length - 1];
  const end: [number, number] = [last[0], boxPos[1]];
  pts.push(end);
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = lens.reduce((a, b) => a + b, 0);
  const pathData = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const fs = 8.6 * scale;
  return (
    <>
      <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width={1} height={1}>
        {slotOutline && (
          <rect
            x={slotOutline[0]}
            y={slotOutline[1]}
            width={slotOutline[2]}
            height={slotOutline[2]}
            rx={1.2 * scale}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={0.9 * scale}
            opacity={0.9 * outlineProgress}
          />
        )}
        <path d={pathData} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={3.4 * scale} strokeDasharray={`${total * lineProgress} ${total}`} strokeLinejoin="round" />
        <path d={pathData} fill="none" stroke="#494949" strokeWidth={2 * scale} strokeDasharray={`${total * lineProgress} ${total}`} strokeLinejoin="round" />
        <path d={pathData} fill="none" stroke="#C9C9C9" strokeWidth={0.8 * scale} strokeDasharray={`${total * lineProgress} ${total}`} strokeLinejoin="round" transform={`translate(0,${-0.3 * scale})`} />
        <circle cx={lineStart[0]} cy={lineStart[1]} r={1.6 * scale * outlineProgress} fill="#FFFFFF" stroke="#393939" strokeWidth={0.6 * scale} />
      </svg>
      {textProgress > 0 && (
        <div
          style={{
            position: 'absolute',
            left: boxPos[0],
            top: boxPos[1],
            width: boxWidth,
            opacity: textProgress,
            transform: `translateY(${boxAbove ? '-100%' : '0px'}) translateY(${(1 - textProgress) * 3 * scale}px)`,
            background: 'rgba(0,0,0,0.93)',
            padding: `${3.5 * scale}px ${5 * scale}px ${3 * scale}px`,
            borderRadius: 1 * scale,
            boxShadow: `0 ${2 * scale}px ${6 * scale}px rgba(0,0,0,0.4)`,
          }}
        >
          <div style={{ position: 'absolute', inset: 0, borderRadius: 1 * scale, border: `${0.8 * scale}px solid`, borderImage: 'linear-gradient(#7A6000CC, #7A600055) 1' }} />
          {lines.map((l, i) => (
            <div key={i} style={{ position: 'relative', marginTop: i === 1 ? 1.5 * scale : 0 }}>
              <UiText fontSize={fs} color={l.color ?? ponderTextColor} italic={l.italic} style={{ whiteSpace: boxWidth ? 'normal' : 'pre' }}>
                {l.text}
              </UiText>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export { chatColors as 色 };
