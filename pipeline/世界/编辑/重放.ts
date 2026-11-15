// 同一份编辑在游戏里重放：生成命令序列（只生成，不执行），用来在取材客户端里看效果、或把改动真的写进存档。
// 和烘焙的差别（docs/世界.md）：游戏里 setblock / fill 会触发方块更新（沙子掉、水流），1.20.1 没有不更新的写法；结构在这里展开成 fill / setblock，
// 不用先把结构文件放进存档。fill、clone 超过游戏上限 32768 格的拆成几块；hollow / outline 拆成面和内部。
// 没加载的区块里命令会失败，所以先 forceload add（每条最多 256 个区块），等一下再改，改完 forceload remove（原来就强制加载的也会被去掉）。
import { splitWords, volume, type Box, type EditStep } from './命令.ts';
import type { EditSet } from './编辑文件.ts';
import { transformPos, transformState, cellIndex } from './结构.ts';

export const commandCellLimit = 32768;

export type Replay = { loads: string[]; 命令: string[]; unloadCmds: string[]; 警告: string[] };

const boxCoords = (b: Box) => `${b.x1} ${b.y1} ${b.z1} ${b.x2} ${b.y2} ${b.z2}`;

/** 盒拆成每块不超过 上限 格（先切 y，再切 z、x） */
export const splitBox = (b: Box, limit = commandCellLimit): Box[] => {
  if (volume(b) <= limit) return [b];
  const sx = b.x2 - b.x1 + 1, sz = b.z2 - b.z1 + 1;
  if (sx * sz <= limit) {
    const layerHeight = Math.floor(limit / (sx * sz));
    const out: Box[] = [];
    for (let y = b.y1; y <= b.y2; y += layerHeight) out.push({ ...b, y1: y, y2: Math.min(b.y2, y + layerHeight - 1) });
    return out;
  }
  if (sx <= limit) {
    const chunkSize = Math.floor(limit / sx);
    const out: Box[] = [];
    for (let y = b.y1; y <= b.y2; y++) for (let z = b.z1; z <= b.z2; z += chunkSize) out.push({ ...b, y1: y, y2: y, z1: z, z2: Math.min(b.z2, z + chunkSize - 1) });
    return out;
  }
  const out: Box[] = [];
  for (let y = b.y1; y <= b.y2; y++) for (let z = b.z1; z <= b.z2; z++) for (let x = b.x1; x <= b.x2; x += limit) out.push({ x1: x, x2: Math.min(b.x2, x + limit - 1), y1: y, y2: y, z1: z, z2: z });
  return out;
};

/** 盒的外壳拆成几块实心盒（不重叠）和内部 */
export const shellAndInner = (b: Box): { shell: Box[]; 内: Box | null } => {
  const shell: Box[] = [{ ...b, y2: b.y1 }];
  if (b.y2 > b.y1) shell.push({ ...b, y1: b.y2 });
  if (b.y2 - b.y1 >= 2) {
    const y1 = b.y1 + 1, y2 = b.y2 - 1;
    shell.push({ ...b, y1, y2, z2: b.z1 });
    if (b.z2 > b.z1) shell.push({ ...b, y1, y2, z1: b.z2 });
    if (b.z2 - b.z1 >= 2) {
      shell.push({ ...b, y1, y2, z1: b.z1 + 1, z2: b.z2 - 1, x2: b.x1 });
      if (b.x2 > b.x1) shell.push({ ...b, y1, y2, z1: b.z1 + 1, z2: b.z2 - 1, x1: b.x2 });
    }
  }
  const innerBox = b.x2 - b.x1 >= 2 && b.y2 - b.y1 >= 2 && b.z2 - b.z1 >= 2 ? { x1: b.x1 + 1, y1: b.y1 + 1, z1: b.z1 + 1, x2: b.x2 - 1, y2: b.y2 - 1, z2: b.z2 - 1 } : null;
  return { shell, 内: innerBox };
};

/** 一步翻成游戏命令（不带 execute in） */
const expandStep = (s: EditStep, warnings: string[]): string[] => {
  switch (s.种) {
    case 'setblock':
      return [s.原文.replace(/^\s*\//, '')];
    case 'fill': {
      if (volume(s.盒) <= commandCellLimit) return [s.原文.replace(/^\s*\//, '')];
      if (s.fillMode === 'hollow' || s.fillMode === 'outline') {
        const { shell, 内: innerBox } = shellAndInner(s.盒);
        const out = shell.flatMap((b) => splitBox(b)).map((b) => `fill ${boxCoords(b)} ${s.stateText}`);
        if (innerBox && s.fillMode === 'hollow') out.unshift(...splitBox(innerBox).map((b) => `fill ${boxCoords(b)} minecraft:air`));
        return out;
      }
      const suffix = s.fillMode === 'keep' ? ' keep' : s.filterText ? ` replace ${s.filterText}` : '';
      return splitBox(s.盒).map((b) => `fill ${boxCoords(b)} ${s.stateText}${suffix}`);
    }
    case 'clone': {
      if (volume(s.源) <= commandCellLimit) return [s.原文.replace(/^\s*\//, '')];
      const tailWords = splitWords(s.原文.replace(/^\s*\//, '')).slice(10);
      if (s.isMove || tailWords.includes('force')) warnings.push(`${s.出处}：clone 超过 ${commandCellLimit} 格要拆开，源和目标重叠时拆开执行和一次执行的结果可能不同，重放后核对一下`);
      const [dx, dy, dz] = s.offset;
      return splitBox(s.源).map((b) => `clone ${boxCoords(b)} ${b.x1 + dx} ${b.y1 + dy} ${b.z1 + dz}${tailWords.length ? ' ' + tailWords.join(' ') : ''}`);
    }
    case 'place': {
      // 展开：每个 (y, z) 一行，沿 x 连续相同的并成一条 fill
      const [ex, ey, ez] = s.结构.大小;
      const worldCells = new Map<string, string>();
      for (let y = 0; y < ey; y++)
        for (let c = 0; c < ez; c++)
          for (let a = 0; a < ex; a++) {
            const st = s.结构.格[cellIndex(s.结构, a, y, c)];
            if (st == null) continue;
            const [dx, dz] = transformPos(a, c, s.rotation, s.mirror);
            worldCells.set(`${s.位置[0] + dx},${s.位置[1] + y},${s.位置[2] + dz}`, transformState(st, s.rotation, s.mirror));
          }
      const out: string[] = [];
      for (let y = s.盒.y1; y <= s.盒.y2; y++)
        for (let z = s.盒.z1; z <= s.盒.z2; z++) {
          let x = s.盒.x1;
          while (x <= s.盒.x2) {
            const st = worldCells.get(`${x},${y},${z}`);
            if (!st) {
              x++;
              continue;
            }
            let x2 = x;
            while (x2 + 1 <= s.盒.x2 && worldCells.get(`${x2 + 1},${y},${z}`) === st) x2++;
            out.push(x2 === x ? `setblock ${x} ${y} ${z} ${st}` : `fill ${x} ${y} ${z} ${x2} ${y} ${z} ${st}`);
            x = x2 + 1;
          }
        }
      if (s.结构.blockEntityCount) warnings.push(`${s.出处}：结构里 ${s.结构.blockEntityCount} 个方块实体的 NBT（箱子内容、告示牌字）没有重放`);
      return out;
    }
  }
};

/** 要强制加载的区块：按 16×16 区块的格子分组，每组一个不超过 256 区块的矩形（x1 z1 x2 z2，方块坐标） */
export const loadRects = (boxes: Box[]): [number, number, number, number][] => {
  const groupRects = new Map<string, [number, number, number, number]>();
  for (const b of boxes)
    for (let cz = b.z1 >> 4; cz <= b.z2 >> 4; cz++)
      for (let cx = b.x1 >> 4; cx <= b.x2 >> 4; cx++) {
        const k = `${cx >> 4},${cz >> 4}`;
        const r = groupRects.get(k);
        if (!r) groupRects.set(k, [cx, cz, cx, cz]);
        else (r[0] = Math.min(r[0], cx)), (r[1] = Math.min(r[1], cz)), (r[2] = Math.max(r[2], cx)), (r[3] = Math.max(r[3], cz));
      }
  return [...groupRects.values()].map(([a, b, c, d]) => [a * 16, b * 16, c * 16 + 15, d * 16 + 15]);
};

export const buildReplay = (editSet: EditSet, dimension: string): Replay => {
  const warnings: string[] = [];
  const prefix = `execute in ${dimension} run `;
  const commands = editSet.步.flatMap((s) => expandStep(s, warnings)).map((c) => prefix + c);
  const boxes = editSet.步.flatMap((s) => (s.种 === 'clone' ? [s.盒, s.源] : [s.盒]));
  const rects = loadRects(boxes);
  return {
    loads: rects.map((r) => `${prefix}forceload add ${r.join(' ')}`),
    命令: commands,
    unloadCmds: rects.map((r) => `${prefix}forceload remove ${r.join(' ')}`),
    警告: warnings,
  };
};

/** 重放脚本：sh，每段一条 anim mcai batch（编辑那段一次 undo 撤得掉；太长的分几批） */
export const buildReplayScript = (r: Replay, note: string, perBatch = 400) => {
  const batch = (cmds: string[]) => {
    const out: string[] = [];
    for (let i = 0; i < cmds.length; i += perBatch) out.push(`"$ANIM" mcai batch \\\n  ${cmds.slice(i, i + perBatch).map((c) => `'cmd ${c}'`).join(' \\\n  ')}`);
    return out;
  };
  return [
    '#!/bin/sh',
    `# ${note}`,
    '# 游戏要开着这个世界（anim mcai game start world=<存档>）；ANIM 不设就用 PATH 上的 anim',
    'set -e',
    'ANIM="${ANIM:-anim}"',
    '',
    '# 1. 强制加载要改的区块，等它们载进来',
    ...batch(r.loads),
    'sleep 3',
    '',
    `# 2. 编辑（${r.命令.length} 条）`,
    ...batch(r.命令),
    '',
    '# 3. 取消强制加载',
    ...batch(r.unloadCmds),
    '',
  ].join('\n');
};
