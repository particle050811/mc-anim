// 俯视图、高度图、切面图：从 方块源 读，画到 坐标图 上。北在上（z 往下变大）、x 往右变大；切面图 y 往上变大。
import { 列中, type 方块源, type 范围 } from './源.ts';
import { 坐标图, 比例 } from './图.ts';
import { 天色, 没数据色, type RGB, type 方块配色 } from './颜色.ts';

const 夹 = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const 乘色 = (c: RGB, f: number): RGB => [夹(Math.round(c[0] * f), 0, 255), 夹(Math.round(c[1] * f), 0, 255), 夹(Math.round(c[2] * f), 0, 255)];

export type 图结果 = { png: Buffer; 宽: number; 高: number; 像素: number; 步: number; 有数据: number; 总数: number; 最低?: number; 最高?: number };

/** 俯视图：每列最高的非空气方块朝上那面的颜色，按和北边、西边的高差打明暗 */
export const 画俯视 = (源: 方块源, r: 范围, 配色: 方块配色, 指定像素?: number): 图结果 => {
  const { 像素, 步 } = 比例(Math.max(r.x2 - r.x1 + 1, r.z2 - r.z1 + 1), 指定像素);
  const 列 = Math.floor((r.x2 - r.x1) / 步) + 1, 行 = Math.floor((r.z2 - r.z1) / 步) + 1;
  const 图 = new 坐标图({ 列, 行, 像素, 步, 横起: r.x1, 竖起: r.z1, 竖向: 1, 横名: 'x', 竖名: 'z' });
  const 高 = new Float64Array(列 * 行).fill(NaN);
  let 有 = 0, lo = Infinity, hi = -Infinity;
  for (let j = 0; j < 行; j++)
    for (let i = 0; i < 列; i++) {
      const x = r.x1 + i * 步, z = r.z1 + j * 步;
      const t = 源.顶(x, z);
      if (!t) {
        图.格(i, j, 没数据色);
        continue;
      }
      有++;
      高[j * 列 + i] = t.y;
      lo = Math.min(lo, t.y);
      hi = Math.max(hi, t.y);
      const 北 = j > 0 ? 高[(j - 1) * 列 + i]! : NaN, 西 = i > 0 ? 高[j * 列 + i - 1]! : NaN;
      const d = (Number.isNaN(北) ? 0 : t.y - 北) + (Number.isNaN(西) ? 0 : t.y - 西);
      图.格(i, j, 乘色(配色.色(t.状态, t.群系, x, z, 'top'), 夹(1 + (0.08 * d) / 步, 0.6, 1.35)));
    }
  图.网格();
  return { png: 图.布.png(), 宽: 图.布.宽, 高: 图.布.高, 像素, 步, 有数据: 有, 总数: 列 * 行, 最低: 有 ? lo : undefined, 最高: 有 ? hi : undefined };
};

/** 高度图：每列最高的非空气方块的 y；灰度从最低到最高，海平面（63）以下偏蓝 */
export const 画高度 = (源: 方块源, r: 范围, 指定像素?: number): 图结果 & { 表: (number | null)[][] } => {
  const { 像素, 步 } = 比例(Math.max(r.x2 - r.x1 + 1, r.z2 - r.z1 + 1), 指定像素);
  const 列 = Math.floor((r.x2 - r.x1) / 步) + 1, 行 = Math.floor((r.z2 - r.z1) / 步) + 1;
  const 表: (number | null)[][] = [];
  let lo = Infinity, hi = -Infinity, 有 = 0;
  for (let j = 0; j < 行; j++) {
    const 行值: (number | null)[] = [];
    for (let i = 0; i < 列; i++) {
      const t = 源.顶(r.x1 + i * 步, r.z1 + j * 步);
      行值.push(t ? t.y : null);
      if (t) (有++, (lo = Math.min(lo, t.y)), (hi = Math.max(hi, t.y)));
    }
    表.push(行值);
  }
  const 图 = new 坐标图({ 列, 行, 像素, 步, 横起: r.x1, 竖起: r.z1, 竖向: 1, 横名: 'x', 竖名: 'z' });
  表.forEach((行值, j) =>
    行值.forEach((h, i) => {
      if (h === null) return 图.格(i, j, 没数据色);
      const g = 30 + Math.round((225 * (h - lo)) / Math.max(1, hi - lo));
      图.格(i, j, h < 63 ? [Math.round(g * 0.6), Math.round(g * 0.75), Math.min(255, g + 40)] : [g, g, g]);
    }),
  );
  图.网格();
  return { png: 图.布.png(), 宽: 图.布.宽, 高: 图.布.高, 像素, 步, 有数据: 有, 总数: 列 * 行, 最低: 有 ? lo : undefined, 最高: 有 ? hi : undefined, 表 };
};

/** 切面图：竖直面 x = 位置（横轴 z）或 z = 位置（横轴 x），y 从 y1 到 y2；不给 y 就按这段的地表上下各留一些 */
export const 画切面 = (源: 方块源, 轴: 'x' | 'z', 位置: number, a1: number, a2: number, 配色: 方块配色, o: { y1?: number; y2?: number; 像素?: number } = {}): 图结果 & { y1: number; y2: number } => {
  const [lo, hi] = [Math.min(a1, a2), Math.max(a1, a2)];
  const 列们 = Array.from({ length: hi - lo + 1 }, (_, i) => {
    const a = lo + i;
    const [x, z] = 轴 === 'x' ? [位置, a] : [a, 位置];
    return { x, z, c: 源.列(x, z), t: 源.顶(x, z) };
  });
  const 顶们 = 列们.flatMap((c) => (c.t ? [c.t.y] : []));
  const y2 = o.y2 ?? (顶们.length ? Math.max(...顶们) + 8 : 100);
  const y1 = o.y1 ?? (顶们.length ? Math.min(...顶们) - 24 : 0);
  const 宽格 = 列们.length, 高格 = y2 - y1 + 1;
  const 像素 = o.像素 ?? Math.max(1, Math.min(16, Math.floor(1024 / Math.max(宽格, 高格))));
  const 图 = new 坐标图({ 列: 宽格, 行: 高格, 像素, 步: 1, 横起: lo, 竖起: y2, 竖向: -1, 横名: 轴 === 'x' ? 'z' : 'x', 竖名: 'y' });
  let 有 = 0;
  列们.forEach(({ x, z, c }, i) => {
    for (let y = y2; y >= y1; y--) {
      const j = y2 - y;
      if (!c) {
        图.格(i, j, 没数据色);
        continue;
      }
      if (y < c.y底) {
        // 包里 k底 以下没存（渲染当实心），存档是世界底以下：画斜纹
        图.格(i, j, (i + j) % 4 < 2 ? [90, 90, 96] : [70, 70, 76]);
        continue;
      }
      const s = 列中(c, y);
      if (!s || !s.状态) {
        图.格(i, j, s ? 没数据色 : 天色);
        continue;
      }
      有++;
      if (s.状态 === 'minecraft:air') {
        图.格(i, j, 天色);
        continue;
      }
      // 上面一格是空气的用朝上那面的颜色（草方块顶是绿的），否则用侧面
      const 上 = 列中(c, y + 1);
      const 露天 = !上 || 上.状态 === 'minecraft:air';
      图.格(i, j, 配色.色(s.状态, s.群系, x, z, 露天 ? 'top' : 'side'));
    }
  });
  图.网格();
  return { png: 图.布.png(), 宽: 图.布.宽, 高: 图.布.高, 像素, 步: 1, 有数据: 有, 总数: 宽格 * 高格, y1, y2 };
};
