// 发光优先（合并.ts）：露在外面的发光方块合并时盖过岩石，封在岩石里的不算；不开时照 Voxy 原样（岩石不透明度 15 盖过熔岩 1）。
import { describe, expect, it } from 'vitest';
import type { BlockKnowledge } from '../体素库.ts';
import { mergeLevel, noSurface, noTop, type Level } from './合并.ts';
import { EntryTable } from './条目.ts';

// 体素值：1 岩石（整格、不透明 15）、2 熔岩（液体、不透明 1、发光）
const knowledge = {
  voxelValue: (s: string) => ({ 'minecraft:netherrack': 1, 'minecraft:lava': 2 })[s] ?? 0,
  biomeNames: [],
  tint: new Uint8Array(3),
  opaque: Uint8Array.from([0, 15, 1]),
  full: Uint8Array.from([0, 1, 0]),
  glow: Uint8Array.from([0, 0, 255]),
  // 同 engine/voxel/生成.ts 的 mergeKey 在 L = 1 时的位：不透明度在最高，位置次之
  mergeKey: (op: number, _L: number, lx: number, ly: number, lz: number, prio: number) => ((((op << 3) | (lx << 2) | (lz << 1) | (1 - ly)) << 2) | prio) + 1,
  allStates: [],
} as unknown as BlockKnowledge;

/** 2 × 2 列、两格高（k 0、1）的第 0 级；格[列] = [k1 的方块, k0 的方块]（状态名，'' = 空气） */
const level0 = (table: EntryTable, cells: [string, string][]): Level => {
  const runStarts = new Uint32Array(5);
  const entries: number[] = [];
  const bottoms: number[] = [];
  cells.forEach(([top, bottom], c) => {
    const e = [top, bottom].map((s) => (s ? table.internEntry(table.internState(s), 0) : 0));
    if (e[0] === e[1]) {
      entries.push(e[0]!);
      bottoms.push(0);
    } else {
      entries.push(e[0]!, e[1]!);
      bottoms.push(1, 0);
    }
    runStarts[c + 1] = entries.length;
  });
  return { L: 0, W: 2, kb: 0, kt: 1, runStarts, entries: Uint16Array.from(entries), bottoms: Int16Array.from(bottoms), surface: new Int16Array(4).fill(noSurface), tops: new Int16Array(4).fill(noTop) };
};
const R = 'minecraft:netherrack', LAVA = 'minecraft:lava';
const merged = (cells: [string, string][], glowFirst: boolean) => {
  const table = new EntryTable(knowledge);
  const out = mergeLevel(level0(table, cells), table, knowledge.mergeKey, 0, 1, glowFirst);
  return table.stateList[table.entryState[out.entries[0]!]!];
};

describe('发光优先', () => {
  // 一格熔岩上面是空气（墙脚下一格熔岩），其余是岩石地面
  const open: [string, string][] = [['', LAVA], ['', R], ['', R], ['', R]];
  // 一格熔岩封在岩石里
  const sealed: [string, string][] = [[R, LAVA], [R, R], [R, R], [R, R]];
  it('不开：照 Voxy，岩石盖过熔岩', () => expect(merged(open, false)).toBe(R));
  it('露在外面的熔岩盖过岩石', () => expect(merged(open, true)).toBe(LAVA));
  it('封在岩石里的不算', () => expect(merged(sealed, true)).toBe(R));
});
