// 同一份编辑在游戏里重放：生成命令序列（只生成，不执行），用来在取材客户端里看效果、或把改动真的写进存档。
// 和烘焙的差别（docs/世界.md）：游戏里 setblock / fill 会触发方块更新（沙子掉、水流），1.20.1 没有不更新的写法；结构在这里展开成 fill / setblock，
// 不用先把结构文件放进存档。fill、clone 超过游戏上限 32768 格的拆成几块；hollow / outline 拆成面和内部。
// 没加载的区块里命令会失败，所以先 forceload add（每条最多 256 个区块），等一下再改，改完 forceload remove（原来就强制加载的也会被去掉）。
import { 拆词, 体积, type 盒, type 步 } from './命令.ts';
import type { 编辑集 } from './编辑文件.ts';
import { 变换位置, 变换状态, 格下标 } from './结构.ts';

export const 命令上限格数 = 32768;

export type 重放 = { 加载: string[]; 命令: string[]; 卸载: string[]; 警告: string[] };

const 坐 = (b: 盒) => `${b.x1} ${b.y1} ${b.z1} ${b.x2} ${b.y2} ${b.z2}`;

/** 盒拆成每块不超过 上限 格（先切 y，再切 z、x） */
export const 拆盒 = (b: 盒, 上限 = 命令上限格数): 盒[] => {
  if (体积(b) <= 上限) return [b];
  const sx = b.x2 - b.x1 + 1, sz = b.z2 - b.z1 + 1;
  if (sx * sz <= 上限) {
    const 层 = Math.floor(上限 / (sx * sz));
    const out: 盒[] = [];
    for (let y = b.y1; y <= b.y2; y += 层) out.push({ ...b, y1: y, y2: Math.min(b.y2, y + 层 - 1) });
    return out;
  }
  if (sx <= 上限) {
    const 行 = Math.floor(上限 / sx);
    const out: 盒[] = [];
    for (let y = b.y1; y <= b.y2; y++) for (let z = b.z1; z <= b.z2; z += 行) out.push({ ...b, y1: y, y2: y, z1: z, z2: Math.min(b.z2, z + 行 - 1) });
    return out;
  }
  const out: 盒[] = [];
  for (let y = b.y1; y <= b.y2; y++) for (let z = b.z1; z <= b.z2; z++) for (let x = b.x1; x <= b.x2; x += 上限) out.push({ x1: x, x2: Math.min(b.x2, x + 上限 - 1), y1: y, y2: y, z1: z, z2: z });
  return out;
};

/** 盒的外壳拆成几块实心盒（不重叠）和内部 */
export const 壳与内 = (b: 盒): { 壳: 盒[]; 内: 盒 | null } => {
  const 壳: 盒[] = [{ ...b, y2: b.y1 }];
  if (b.y2 > b.y1) 壳.push({ ...b, y1: b.y2 });
  if (b.y2 - b.y1 >= 2) {
    const y1 = b.y1 + 1, y2 = b.y2 - 1;
    壳.push({ ...b, y1, y2, z2: b.z1 });
    if (b.z2 > b.z1) 壳.push({ ...b, y1, y2, z1: b.z2 });
    if (b.z2 - b.z1 >= 2) {
      壳.push({ ...b, y1, y2, z1: b.z1 + 1, z2: b.z2 - 1, x2: b.x1 });
      if (b.x2 > b.x1) 壳.push({ ...b, y1, y2, z1: b.z1 + 1, z2: b.z2 - 1, x1: b.x2 });
    }
  }
  const 内 = b.x2 - b.x1 >= 2 && b.y2 - b.y1 >= 2 && b.z2 - b.z1 >= 2 ? { x1: b.x1 + 1, y1: b.y1 + 1, z1: b.z1 + 1, x2: b.x2 - 1, y2: b.y2 - 1, z2: b.z2 - 1 } : null;
  return { 壳, 内 };
};

/** 一步翻成游戏命令（不带 execute in） */
const 翻一步 = (s: 步, 警告: string[]): string[] => {
  switch (s.种) {
    case 'setblock':
      return [s.原文.replace(/^\s*\//, '')];
    case 'fill': {
      if (体积(s.盒) <= 命令上限格数) return [s.原文.replace(/^\s*\//, '')];
      if (s.模式 === 'hollow' || s.模式 === 'outline') {
        const { 壳, 内 } = 壳与内(s.盒);
        const out = 壳.flatMap((b) => 拆盒(b)).map((b) => `fill ${坐(b)} ${s.状态原文}`);
        if (内 && s.模式 === 'hollow') out.unshift(...拆盒(内).map((b) => `fill ${坐(b)} minecraft:air`));
        return out;
      }
      const 尾 = s.模式 === 'keep' ? ' keep' : s.过滤原文 ? ` replace ${s.过滤原文}` : '';
      return 拆盒(s.盒).map((b) => `fill ${坐(b)} ${s.状态原文}${尾}`);
    }
    case 'clone': {
      if (体积(s.源) <= 命令上限格数) return [s.原文.replace(/^\s*\//, '')];
      const 尾词 = 拆词(s.原文.replace(/^\s*\//, '')).slice(10);
      if (s.移动 || 尾词.includes('force')) 警告.push(`${s.出处}：clone 超过 ${命令上限格数} 格要拆开，源和目标重叠时拆开执行和一次执行的结果可能不同，重放后核对一下`);
      const [dx, dy, dz] = s.偏移;
      return 拆盒(s.源).map((b) => `clone ${坐(b)} ${b.x1 + dx} ${b.y1 + dy} ${b.z1 + dz}${尾词.length ? ' ' + 尾词.join(' ') : ''}`);
    }
    case 'place': {
      // 展开：每个 (y, z) 一行，沿 x 连续相同的并成一条 fill
      const [ex, ey, ez] = s.结构.大小;
      const 世界格 = new Map<string, string>();
      for (let y = 0; y < ey; y++)
        for (let c = 0; c < ez; c++)
          for (let a = 0; a < ex; a++) {
            const st = s.结构.格[格下标(s.结构, a, y, c)];
            if (st == null) continue;
            const [dx, dz] = 变换位置(a, c, s.旋转, s.镜像);
            世界格.set(`${s.位置[0] + dx},${s.位置[1] + y},${s.位置[2] + dz}`, 变换状态(st, s.旋转, s.镜像));
          }
      const out: string[] = [];
      for (let y = s.盒.y1; y <= s.盒.y2; y++)
        for (let z = s.盒.z1; z <= s.盒.z2; z++) {
          let x = s.盒.x1;
          while (x <= s.盒.x2) {
            const st = 世界格.get(`${x},${y},${z}`);
            if (!st) {
              x++;
              continue;
            }
            let x2 = x;
            while (x2 + 1 <= s.盒.x2 && 世界格.get(`${x2 + 1},${y},${z}`) === st) x2++;
            out.push(x2 === x ? `setblock ${x} ${y} ${z} ${st}` : `fill ${x} ${y} ${z} ${x2} ${y} ${z} ${st}`);
            x = x2 + 1;
          }
        }
      if (s.结构.方块实体数) 警告.push(`${s.出处}：结构里 ${s.结构.方块实体数} 个方块实体的 NBT（箱子内容、告示牌字）没有重放`);
      return out;
    }
  }
};

/** 要强制加载的区块：按 16×16 区块的格子分组，每组一个不超过 256 区块的矩形（x1 z1 x2 z2，方块坐标） */
export const 加载矩形 = (盒们: 盒[]): [number, number, number, number][] => {
  const 组 = new Map<string, [number, number, number, number]>();
  for (const b of 盒们)
    for (let cz = b.z1 >> 4; cz <= b.z2 >> 4; cz++)
      for (let cx = b.x1 >> 4; cx <= b.x2 >> 4; cx++) {
        const k = `${cx >> 4},${cz >> 4}`;
        const r = 组.get(k);
        if (!r) 组.set(k, [cx, cz, cx, cz]);
        else (r[0] = Math.min(r[0], cx)), (r[1] = Math.min(r[1], cz)), (r[2] = Math.max(r[2], cx)), (r[3] = Math.max(r[3], cz));
      }
  return [...组.values()].map(([a, b, c, d]) => [a * 16, b * 16, c * 16 + 15, d * 16 + 15]);
};

export const 生成重放 = (编辑: 编辑集, 维度: string): 重放 => {
  const 警告: string[] = [];
  const 前 = `execute in ${维度} run `;
  const 命令 = 编辑.步.flatMap((s) => 翻一步(s, 警告)).map((c) => 前 + c);
  const 盒们 = 编辑.步.flatMap((s) => (s.种 === 'clone' ? [s.盒, s.源] : [s.盒]));
  const 矩形 = 加载矩形(盒们);
  return {
    加载: 矩形.map((r) => `${前}forceload add ${r.join(' ')}`),
    命令,
    卸载: 矩形.map((r) => `${前}forceload remove ${r.join(' ')}`),
    警告,
  };
};

/** 重放脚本：sh，每段一条 anim mcai batch（编辑那段一次 undo 撤得掉；太长的分几批） */
export const 重放脚本 = (r: 重放, 说明: string, 每批 = 400) => {
  const 批 = (cmds: string[]) => {
    const out: string[] = [];
    for (let i = 0; i < cmds.length; i += 每批) out.push(`"$ANIM" mcai batch \\\n  ${cmds.slice(i, i + 每批).map((c) => `'cmd ${c}'`).join(' \\\n  ')}`);
    return out;
  };
  return [
    '#!/bin/sh',
    `# ${说明}`,
    '# 游戏要开着这个世界（anim mcai game start world=<存档>）；ANIM 不设就用 PATH 上的 anim',
    'set -e',
    'ANIM="${ANIM:-anim}"',
    '',
    '# 1. 强制加载要改的区块，等它们载进来',
    ...批(r.加载),
    'sleep 3',
    '',
    `# 2. 编辑（${r.命令.length} 条）`,
    ...批(r.命令),
    '',
    '# 3. 取消强制加载',
    ...批(r.卸载),
    '',
  ].join('\n');
};
