// 墙上的课表：一张照原版地图纸画的纸（米黄、一圈深浅不一的棕边），挂在物品展示框里（框是白桦木板的贴图），用本作品的游戏像素字写，格子能一格一格亮。
// 放在 <像素空间> 里（单位贴图像素），正面朝南贴在墙上，框凸出墙面 2 个贴图像素。内容见 课表数据.ts。
// 版式（Agent 暂定）：左边一列节次、右边七天，一行 10 个贴图像素（字 8 高）；原来那列「时间」去掉，N = 6 时半屏 213 个贴图像素宽放不下九列，
// 开始的钟点在下面的「注」里还有。只占一列的合并格字放不下就竖着排（两个字一行，疏排的一个字一行）。
import type React from 'react';
import type * as THREE from 'three';
import { pixelFont } from '../界面/像素字.ts';
import { realColors } from './色板.ts';
import { newPixelArt, makeTexture, canvasScale, mixColor, type PixelArt } from './像素图.ts';
import { FrontFace, TopFace } from './像素块.tsx';
import { findCell, periods, weekdays, timetableTitle, timetableCells, timetableNote, type LitCell, type TimetableCell } from './课表数据.ts';
import { timetableFrame } from './课桌布局.ts';

export type { LitCell };

const lineGap = 10;
const dayWidth = 19;
const periodWidth = Math.max(...periods.map((n) => pixelFont.textWidth(n.节))) + 2;
const colWidths = [periodWidth, ...weekdays.map(() => dayWidth)];
/** 格线的 x（从表的左边起，第 i 条竖线；线占一个贴图像素，格里面从线的右边一格起） */
const vertLines = colWidths.reduce<number[]>((a, w) => [...a, a.at(-1)! + w + 1], [0]);
const tableWidth = vertLines.at(-1)! + 1;
const rowCount = periods.length + 1;
const tableHeight = rowCount * lineGap + 1;
const noteLines = (() => {
  const textSegs = timetableNote.split('；');
  return textSegs.map((s, i) => (i === 0 ? s : s.replace(/^\s*/, '')) + (i < textSegs.length - 1 ? '；' : ''));
})();
const noteIndent = pixelFont.textWidth('注：');

/** 纸：四边各留 6（地图那圈棕边 3 + 空 3）；从上往下 标题 9、空 3、表、空 3、注 */
const margin = 6;
const paperWidth = tableWidth + 2 * margin;
const paperHeight = margin + 9 + 3 + tableHeight + 3 + noteLines.length * 9 + margin - 1;
/** 框（白桦木板）每边 2，凸出墙面 2 */
const border = 2;
export const timetableSize = { 宽: paperWidth + 2 * border, 高: paperHeight + 2 * border, depth: 2 } as const;
const S = timetableSize;
if (S.宽 !== timetableFrame.宽 || S.高 !== timetableFrame.高) throw new Error(`课表排出来 ${S.宽}×${S.高}，课桌布局.ts 的 课表框 写的是 ${timetableFrame.宽}×${timetableFrame.高}：改那边（镜头按它对准）`);

const textCenterOffset = (s: string) => pixelFont.textWidth(s) - 1;
/** 在方框 [x0, x1) × [y0, y1)（贴图像素）里居中写一行 */
const writeCentered = (p: PixelArt, s: string, x0: number, x1: number, y0: number, y1: number, color: string) =>
  pixelFont.draw(p.ctx, s, { x: Math.round((x0 + x1 - textCenterOffset(s)) / 2) * canvasScale, y: Math.round((y0 + y1 - 8) / 2) * canvasScale }, 0, 0, color, canvasScale);

/** 一格里的字排成几行：放得下就一行（疏排的字间空一个全角空格）；放不下就两个字一行，疏排的一个字一行 */
const layoutLines = (g: TimetableCell, innerWidth: number): string[] => {
  const chars = [...g.字];
  const oneLine = g.sparse ? chars.join('　') : g.字;
  if (textCenterOffset(oneLine) <= innerWidth) return [oneLine];
  const perRow = g.sparse ? 1 : Math.max(1, Math.floor((innerWidth + 1) / 9));
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += perRow) out.push(chars.slice(i, i + perRow).join(''));
  return out;
};

const paintPaper = (brightMap: ReadonlyMap<TimetableCell, number>): PixelArt => {
  const p = newPixelArt(S.宽, S.高);
  // 框：白桦木板的四色噪点，外沿一圈暗
  p.noise(0, 0, S.宽, S.高, realColors.框, 201, [4, 3, 2, 1]);
  p.fillRect(0, 0, S.宽, 1, realColors.框[3]);
  p.fillRect(0, S.高 - 1, S.宽, 1, realColors.框[3]);
  p.fillRect(0, 0, 1, S.高, realColors.框[3]);
  p.fillRect(S.宽 - 1, 0, 1, S.高, realColors.框[3]);
  // 纸：米黄噪点，棕边按位置哈希宽 2～3，外圈最深
  const [ox, oy] = [border, border];
  p.noise(ox, oy, paperWidth, paperHeight, realColors.drawingPaper, 202, [5, 3, 2]);
  p.noise(ox, oy, paperWidth, 1, [realColors.drawingEdge[0], realColors.drawingEdge[1]], 203);
  p.noise(ox, oy + paperHeight - 1, paperWidth, 1, [realColors.drawingEdge[0], realColors.drawingEdge[1]], 204);
  p.noise(ox, oy, 1, paperHeight, [realColors.drawingEdge[0], realColors.drawingEdge[1]], 205);
  p.noise(ox + paperWidth - 1, oy, 1, paperHeight, [realColors.drawingEdge[0], realColors.drawingEdge[1]], 206);
  p.noise(ox + 1, oy + 1, paperWidth - 2, 1, realColors.drawingEdge.slice(1), 207);
  p.noise(ox + 1, oy + paperHeight - 2, paperWidth - 2, 1, realColors.drawingEdge.slice(1), 208);
  p.noise(ox + 1, oy + 1, 1, paperHeight - 2, realColors.drawingEdge.slice(1), 209);
  p.noise(ox + paperWidth - 2, oy + 1, 1, paperHeight - 2, realColors.drawingEdge.slice(1), 210);
  // 第三圈稀疏的几点，边就不是一条直线
  for (let i = 2; i < paperWidth - 2; i++)
    for (const [y, k] of [[2, 211], [paperHeight - 3, 212]] as const) if ((i * 7 + k) % 5 < 2) p.点(ox + i, oy + y, realColors.drawingEdge[2]);
  for (let j = 2; j < paperHeight - 2; j++)
    for (const [x, k] of [[2, 213], [paperWidth - 3, 214]] as const) if ((j * 7 + k) % 5 < 2) p.点(ox + x, oy + j, realColors.drawingEdge[2]);

  const ink = realColors.drawingInk;
  writeCentered(p, timetableTitle, ox, ox + paperWidth, oy + margin, oy + margin + 9, ink);
  const tx = ox + margin;
  const ty = oy + margin + 9 + 3;
  // 格子的方框（贴图像素，含左上那条线）：表格行 r（0 是表头）、列 c（0 是节次）
  const boxAt = (r: number, c: number, rowSpan = 1, colSpan = 1) => ({ x0: tx + vertLines[c]!, y0: ty + r * lineGap, x1: tx + vertLines[c + colSpan]!, y1: ty + (r + rowSpan) * lineGap });
  p.fillRect(tx + 1, ty + 1, tableWidth - 2, lineGap - 1, realColors.tableHeaderColor);
  for (const g of timetableCells) {
    const k = brightMap.get(g) ?? 0;
    if (k <= 0) continue;
    const b = boxAt(g.行 + 1, g.列 + 1, g.rowSpan, g.colSpan);
    p.fillRect(b.x0 + 1, b.y0 + 1, b.x1 - b.x0 - 1, b.y1 - b.y0 - 1, mixColor(realColors.drawingPaper[0], realColors.litCellColor, k));
    const frameColor = mixColor(realColors.litCellColor, realColors.litFrameColor, k);
    p.fillRect(b.x0 + 2, b.y0 + 2, b.x1 - b.x0 - 3, 1, frameColor);
    p.fillRect(b.x0 + 2, b.y1 - 2, b.x1 - b.x0 - 3, 1, frameColor);
    p.fillRect(b.x0 + 2, b.y0 + 2, 1, b.y1 - b.y0 - 3, frameColor);
    p.fillRect(b.x1 - 2, b.y0 + 2, 1, b.y1 - b.y0 - 3, frameColor);
  }
  // 格线：外框、表头、节次列的每一行，再按合并格画各自的框
  const gridLine = (b: { x0: number; y0: number; x1: number; y1: number }) => {
    p.fillRect(b.x0, b.y0, b.x1 - b.x0 + 1, 1, realColors.tableLine);
    p.fillRect(b.x0, b.y1, b.x1 - b.x0 + 1, 1, realColors.tableLine);
    p.fillRect(b.x0, b.y0, 1, b.y1 - b.y0 + 1, realColors.tableLine);
    p.fillRect(b.x1, b.y0, 1, b.y1 - b.y0 + 1, realColors.tableLine);
  };
  for (let c = 0; c <= weekdays.length; c++) gridLine(boxAt(0, c));
  periods.forEach((_, i) => gridLine(boxAt(i + 1, 0)));
  for (const g of timetableCells) gridLine(boxAt(g.行 + 1, g.列 + 1, g.rowSpan, g.colSpan));
  // 字
  weekdays.forEach((weekday, i) => {
    const b = boxAt(0, i + 1);
    writeCentered(p, weekday, b.x0 + 1, b.x1, b.y0 + 1, b.y1, ink);
  });
  periods.forEach((n, i) => {
    const b = boxAt(i + 1, 0);
    writeCentered(p, n.节, b.x0 + 1, b.x1, b.y0 + 1, b.y1, ink);
  });
  for (const g of timetableCells) {
    if (!g.字) continue;
    const b = boxAt(g.行 + 1, g.列 + 1, g.rowSpan, g.colSpan);
    const rows = layoutLines(g, b.x1 - b.x0 - 1);
    const rowDistance = rows.length > 1 && g.sparse ? lineGap : 9;
    const totalHeight = (rows.length - 1) * rowDistance + 8;
    if (totalHeight > b.y1 - b.y0 - 1) throw new Error(`课表格「${g.字}」排出来 ${totalHeight} 像素高，格子里只有 ${b.y1 - b.y0 - 1}`);
    const y0 = Math.round((b.y0 + 1 + b.y1 - totalHeight) / 2);
    rows.forEach((s, j) => writeCentered(p, s, b.x0 + 1, b.x1, y0 + j * rowDistance, y0 + j * rowDistance + 8, ink));
  }
  // 注：第一行带「注：」，后面几行缩进对齐
  const ny = ty + tableHeight + 3;
  noteLines.forEach((s, i) => pixelFont.draw(p.ctx, s, { x: (tx + (i ? noteIndent : 0)) * canvasScale, y: (ny + i * 9) * canvasScale }, 0, 0, ink, canvasScale));
  return p;
};

const timetableTextureCache = new Map<string, THREE.Texture>();
let frameTop: THREE.Texture | null = null;

/** 格子亮度取 4 档（一格一格亮，像游戏里的状态切换，不做连续渐变） */
const quantizeLevel = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 4) / 4;

export const Timetable: React.FC<{
  /** 框正面的左下角（贴图像素），y 是正面所在的深（墙面往外 深） */
  x: number;
  y: number;
  z: number;
  litCells?: readonly LitCell[];
}> = ({ x, y, z, litCells = [] }) => {
  const brightMap = new Map<TimetableCell, number>();
  for (const l of litCells) {
    const g = findCell(l.周, l.节);
    brightMap.set(g, Math.max(brightMap.get(g) ?? 0, quantizeLevel(l.brightness)));
  }
  const cacheKey = timetableCells.map((g) => brightMap.get(g) ?? 0).join(',');
  let image = timetableTextureCache.get(cacheKey);
  if (!image) timetableTextureCache.set(cacheKey, (image = makeTexture(paintPaper(brightMap))));
  frameTop ??= (() => {
    const p = newPixelArt(S.宽, S.depth);
    p.noise(0, 0, S.宽, S.depth, realColors.框, 215, [4, 3, 2, 1]);
    return makeTexture(p);
  })();
  return (
    <group>
      <FrontFace x={x} y={y} z={z} 宽={S.宽} 高={S.高} 图={image} />
      <TopFace x={x} y={y} z={z + S.高} 宽={S.宽} depth={S.depth} 图={frameTop} />
    </group>
  );
};
