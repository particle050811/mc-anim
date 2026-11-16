// 俯视图、高度图、切面图：从 方块源 读，画到 坐标图 上。北在上（z 往下变大）、x 往右变大；切面图 y 往上变大。
import { segmentAt, type BlockSource, type QueryRect } from './源.ts';
import { CoordChart, ratioFor } from './图.ts';
import { skyRgb, noDataColor, type RGB, type BlockPalette } from './颜色.ts';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const scaleColor = (c: RGB, f: number): RGB => [clamp(Math.round(c[0] * f), 0, 255), clamp(Math.round(c[1] * f), 0, 255), clamp(Math.round(c[2] * f), 0, 255)];

export type ImageResult = { png: Buffer; width: number; height: number; pixel: number; step: number; withData: number; total: number; minY?: number; maxY?: number };

/** 俯视图：每列最高的非空气方块朝上那面的颜色，按和北边、西边的高差打明暗 */
export const drawTopView = (blockSource: BlockSource, r: QueryRect, palette: BlockPalette, specifiedPixel?: number): ImageResult => {
  const { pixel, step: stride } = ratioFor(Math.max(r.x2 - r.x1 + 1, r.z2 - r.z1 + 1), specifiedPixel);
  const colCount = Math.floor((r.x2 - r.x1) / stride) + 1, rows = Math.floor((r.z2 - r.z1) / stride) + 1;
  const coordChart = new CoordChart({ 列: colCount, 行: rows, pixel, step: stride, horizStart: r.x1, vertStart: r.z1, vertDir: 1, horizontalLabel: 'x', verticalLabel: 'z' });
  const heights = new Float64Array(colCount * rows).fill(NaN);
  let count = 0, lo = Infinity, hi = -Infinity;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < colCount; i++) {
      const x = r.x1 + i * stride, z = r.z1 + j * stride;
      const t = blockSource.topBlockAt(x, z);
      if (!t) {
        coordChart.cell(i, j, noDataColor);
        continue;
      }
      count++;
      heights[j * colCount + i] = t.y;
      lo = Math.min(lo, t.y);
      hi = Math.max(hi, t.y);
      const northHeight = j > 0 ? heights[(j - 1) * colCount + i]! : NaN, westHeight = i > 0 ? heights[j * colCount + i - 1]! : NaN;
      const d = (Number.isNaN(northHeight) ? 0 : t.y - northHeight) + (Number.isNaN(westHeight) ? 0 : t.y - westHeight);
      coordChart.cell(i, j, scaleColor(palette.色(t.state, t.biome, x, z, 'top'), clamp(1 + (0.08 * d) / stride, 0.6, 1.35)));
    }
  coordChart.grid();
  return { png: coordChart.canvas.png(), width: coordChart.canvas.width, height: coordChart.canvas.height, pixel, step: stride, withData: count, total: colCount * rows, minY: count ? lo : undefined, maxY: count ? hi : undefined };
};

/** 高度图：每列最高的非空气方块的 y；灰度从最低到最高，海平面（63）以下偏蓝 */
export const drawHeight = (blockSource: BlockSource, r: QueryRect, specifiedPixel?: number): ImageResult & { 表: (number | null)[][] } => {
  const { pixel, step: stride } = ratioFor(Math.max(r.x2 - r.x1 + 1, r.z2 - r.z1 + 1), specifiedPixel);
  const colCount = Math.floor((r.x2 - r.x1) / stride) + 1, rows = Math.floor((r.z2 - r.z1) / stride) + 1;
  const heightTable: (number | null)[][] = [];
  let lo = Infinity, hi = -Infinity, count = 0;
  for (let j = 0; j < rows; j++) {
    const rowValues: (number | null)[] = [];
    for (let i = 0; i < colCount; i++) {
      const t = blockSource.topBlockAt(r.x1 + i * stride, r.z1 + j * stride);
      rowValues.push(t ? t.y : null);
      if (t) (count++, (lo = Math.min(lo, t.y)), (hi = Math.max(hi, t.y)));
    }
    heightTable.push(rowValues);
  }
  const coordChart = new CoordChart({ 列: colCount, 行: rows, pixel, step: stride, horizStart: r.x1, vertStart: r.z1, vertDir: 1, horizontalLabel: 'x', verticalLabel: 'z' });
  heightTable.forEach((rowValues, j) =>
    rowValues.forEach((h, i) => {
      if (h === null) return coordChart.cell(i, j, noDataColor);
      const g = 30 + Math.round((225 * (h - lo)) / Math.max(1, hi - lo));
      coordChart.cell(i, j, h < 63 ? [Math.round(g * 0.6), Math.round(g * 0.75), Math.min(255, g + 40)] : [g, g, g]);
    }),
  );
  coordChart.grid();
  return { png: coordChart.canvas.png(), width: coordChart.canvas.width, height: coordChart.canvas.height, pixel, step: stride, withData: count, total: colCount * rows, minY: count ? lo : undefined, maxY: count ? hi : undefined, 表: heightTable };
};

/** 切面图：竖直面 x = 位置（横轴 z）或 z = 位置（横轴 x），y 从 y1 到 y2；不给 y 就按这段的地表上下各留一些 */
export const drawCrossSection = (blockSource: BlockSource, axis: 'x' | 'z', planePos: number, a1: number, a2: number, palette: BlockPalette, o: { y1?: number; y2?: number; pixel?: number } = {}): ImageResult & { y1: number; y2: number } => {
  const [lo, hi] = [Math.min(a1, a2), Math.max(a1, a2)];
  const columns = Array.from({ length: hi - lo + 1 }, (_, i) => {
    const a = lo + i;
    const [x, z] = axis === 'x' ? [planePos, a] : [a, planePos];
    return { x, z, c: blockSource.列(x, z), t: blockSource.topBlockAt(x, z) };
  });
  const tops = columns.flatMap((c) => (c.t ? [c.t.y] : []));
  const y2 = o.y2 ?? (tops.length ? Math.max(...tops) + 8 : 100);
  const y1 = o.y1 ?? (tops.length ? Math.min(...tops) - 24 : 0);
  const widthCells = columns.length, heightCells = y2 - y1 + 1;
  const pixel = o.pixel ?? Math.max(1, Math.min(16, Math.floor(1024 / Math.max(widthCells, heightCells))));
  const coordChart = new CoordChart({ 列: widthCells, 行: heightCells, pixel, step: 1, horizStart: lo, vertStart: y2, vertDir: -1, horizontalLabel: axis === 'x' ? 'z' : 'x', verticalLabel: 'y' });
  let count = 0;
  columns.forEach(({ x, z, c }, i) => {
    for (let y = y2; y >= y1; y--) {
      const j = y2 - y;
      if (!c) {
        coordChart.cell(i, j, noDataColor);
        continue;
      }
      if (y < c.yBottom) {
        // 包里 k底 以下没存（渲染当实心），存档是世界底以下：画斜纹
        coordChart.cell(i, j, (i + j) % 4 < 2 ? [90, 90, 96] : [70, 70, 76]);
        continue;
      }
      const s = segmentAt(c, y);
      if (!s || !s.state) {
        coordChart.cell(i, j, s ? noDataColor : skyRgb);
        continue;
      }
      count++;
      if (s.state === 'minecraft:air') {
        coordChart.cell(i, j, skyRgb);
        continue;
      }
      // 上面一格是空气的用朝上那面的颜色（草方块顶是绿的），否则用侧面
      const blockAbove = segmentAt(c, y + 1);
      const openAir = !blockAbove || blockAbove.state === 'minecraft:air';
      coordChart.cell(i, j, palette.色(s.state, s.biome, x, z, openAir ? 'top' : 'side'));
    }
  });
  coordChart.grid();
  return { png: coordChart.canvas.png(), width: coordChart.canvas.width, height: coordChart.canvas.height, pixel, step: 1, withData: count, total: widthCells * heightCells, y1, y2 };
};
