// 转码、训练、可见变换读源包的统一入口：给的永远是现行格式的区段（64×64 核心、66 列带邻圈）和现行块文件名。
// 格式 4、5 的包区段编码和现行一样，原样读（格式 4 的块头定长，见 旧块头.ts）；格式 1、2、3（32×32 区段、2048 米一块）的包当场把 2×2 个旧区段拼成一个新区段（用户 11-16 定试做 64×64）。
// 拼法：新区段的每一列从盖住它的旧区段取（先取以它为核心的那个，再取把它当邻圈的），各旧区段存的高度范围不一样，
// 拼成的 k底 取最低、顶取最高；哪个旧区段都没存到的格，在最低存着的一格下面的按那一格是不是空气填（不是空气填 填充，同网格「k底 以下当实心」），其余是空气。
// 所以从旧包转出来的，k底 以下多出一截填充方块，和拿存档直接烘 64×64 不逐字节一样（直接烘那一截是真方块）；画面上它们都埋着。
import fs from 'node:fs';
import path from 'node:path';
import type { SectionData } from '../../../engine/voxel/区段包.ts';
import type { SectionId } from '../../../engine/voxel/区段.ts';
import type { VoxelLib } from '../体素库.ts';
import { fromColumnMajor, toColumnMajor } from './区段编码.ts';
import { decodeSectionFormat2 } from './格式2解码.ts';
import { decodeSectionFormat3 } from './格式3解码.ts';
import { blockFiles, blockCoordsFromName, blockFormat, readTileIndex, readPackModel, decodeFormat1Section } from './读区段.ts';
import { legacyEntries, legacyHeaderLen, readLegacyIndex } from './旧块头.ts';
import { readPackDoc, type PackDoc } from './包信息.ts';

export type SourceSection = { id: SectionId; byteCount: number; 取: () => SectionData };
export interface SectionSource {
  readonly dir: string;
  readonly info: PackDoc;
  /** 源包块文件头的格式版本 */
  readonly format: number;
  /** 转出来的包的最粗级（源包的；格式 4 以前是 6） */
  readonly coarsestLevel: number;
  has(L: number, i: number, j: number): boolean;
  取(L: number, i: number, j: number): SectionData | null;
  /** 现行块文件名，按 UTF-8 字节排 */
  tiles(): string[];
  /** 一个现行块文件里的区段：格式 4、5 的包按文件里的先后，旧包按级、级内项号 */
  inTile(fileName: string): Iterable<SourceSection>;
  close(): void;
}

const legacyCells = 32, legacyPadded = 34;
type TileEntry = { file: string; sections: { id: SectionId; off: number; len: number }[]; fd?: number };
const byUtf8 = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const keyOf = (L: number, i: number, j: number) => `${L}/${i}/${j}`;

/** 打开一个包目录。填充：拼旧区段时补在 k底 以下的整格方块（转码按世界声明给，没有声明的包用石头） */
export const openSectionSource = (voxelLib: VoxelLib, dir: string, fillBlock = 'minecraft:stone'): SectionSource => {
  const P = voxelLib.sectionPack, libFormat = P.formatVersion;
  const info = readPackDoc(voxelLib, dir);
  const tiles = new Map<string, TileEntry>();
  let format = -1;
  for (const fileName of blockFiles(dir)) {
    const file = path.join(dir, fileName), head = Buffer.alloc(legacyHeaderLen), fd = fs.openSync(file, 'r');
    let got: number;
    try { got = fs.readSync(fd, head, 0, legacyHeaderLen, 0); } finally { fs.closeSync(fd); }
    const f = blockFormat(head);
    if (f < 1 || f > libFormat) throw new Error(`${file} 是格式 ${f}，不认`);
    if (format >= 0 && f !== format) throw new Error(`${dir} 里的块文件格式不一（${format}、${f}）`);
    format = f;
    const [ti, tj] = blockCoordsFromName(fileName);
    const sections = f === libFormat ? [...P.tileSections(readTileIndex(voxelLib, file))] : [...legacyEntries(ti, tj, readLegacyIndex(head.subarray(0, got)))].map(({ id, off, len }) => ({ id, off, len }));
    tiles.set(`${ti}.${tj}`, { file, sections });
  }
  const readRaw = (t: TileEntry, off: number, len: number) => {
    t.fd ??= fs.openSync(t.file, 'r');
    const raw = Buffer.alloc(len);
    if (fs.readSync(t.fd, raw, 0, len, off) !== len) throw new Error(`${t.file} 读短了`);
    return raw;
  };
  const close = () => { for (const t of tiles.values()) if (t.fd !== undefined) { fs.closeSync(t.fd); t.fd = undefined; } };
  const at = new Map<string, { t: TileEntry; off: number; len: number }>();
  for (const t of tiles.values()) for (const { id, off, len } of t.sections) at.set(keyOf(id.L, id.i, id.j), { t, off, len });

  if (format >= 4 || format < 0) {
    const decode = (raw: Uint8Array, id: SectionId) => voxelLib.sectionDecoder.decodeSection(raw, id, readPackModel(dir));
    return {
      dir, info, format: format < 0 ? libFormat : format, coarsestLevel: info.coarsestLevel,
      has: (L, i, j) => at.has(keyOf(L, i, j)),
      取(L, i, j) {
        const o = at.get(keyOf(L, i, j));
        return o ? decode(readRaw(o.t, o.off, o.len), { L, i, j }) : null;
      },
      tiles: () => [...tiles.values()].map((t) => path.basename(t.file)).sort(byUtf8),
      *inTile(fileName) {
        const [ti, tj] = blockCoordsFromName(fileName), t = tiles.get(`${ti}.${tj}`);
        if (!t) return;
        const buf = fs.readFileSync(t.file);
        for (const { id, off, len } of [...t.sections].sort((a, b) => a.off - b.off)) {
          const raw = new Uint8Array(buf.buffer, buf.byteOffset + off, len);
          yield { id, byteCount: len, 取: () => decode(raw, id) };
        }
      },
      close,
    };
  }

  // ---------- 旧格式：旧区段 (L, i, j) 归新区段 (L, ⌊i/2⌋, ⌊j/2⌋)，新包最粗级 6 ----------
  const coarsestLevel = 6;
  const newTiles = new Map<string, Map<string, { id: SectionId; local: number }>>();
  for (const k of at.keys()) {
    const [L, i, j] = k.split('/').map(Number) as [number, number, number];
    const id = { L, i: Math.floor(i / 2), j: Math.floor(j / 2) }, t = P.sectionInTile(id, coarsestLevel), name = P.tileFileName(t.ti, t.tj);
    let m = newTiles.get(name);
    if (!m) newTiles.set(name, (m = new Map()));
    m.set(keyOf(id.L, id.i, id.j), { id, local: t.local });
  }
  const model = format === 3 ? readPackModel(dir) : null;
  const decodeOld = (L: number, i: number, j: number): SectionData | null => {
    const o = at.get(keyOf(L, i, j));
    if (!o) return null;
    const raw = readRaw(o.t, o.off, o.len), id = { L, i, j };
    return format === 1 ? decodeFormat1Section(raw) : format === 2 ? decodeSectionFormat2(raw, id) : decodeSectionFormat3(raw, id, model!);
  };
  const oldBytes = (L: number, i: number, j: number) => at.get(keyOf(L, i, j))?.len ?? 0;
  const fillState = info.state.indexOf(fillBlock);
  const cells = voxelLib.sections.sectionCells, side = voxelLib.sectionPack.paddedSectionCols, ratio = cells / legacyCells;
  if (ratio !== 2) throw new Error(`旧格式只会拼成边长 ${2 * legacyCells} 的区段，现在是 ${cells}`);

  const merge = (L: number, I: number, J: number): SectionData | null => {
    const quads: { a: number; b: number; d: SectionData; cm: Uint16Array; map: Uint16Array }[] = [];
    const palette: number[] = [0, P.noBiome], key = new Map<number, number>([[P.noBiome, 0]]);
    const paletteId = (s: number, b: number) => {
      const k = s * 65536 + b;
      let p = key.get(k);
      if (p === undefined) { p = palette.length / 2; key.set(k, p); palette.push(s, b); }
      return p;
    };
    for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
      const d = decodeOld(L, 2 * I + a, 2 * J + b);
      if (!d) continue;
      if (d.runCounts.length !== legacyPadded * legacyPadded) throw new Error(`${dir} 区段 ${L}/${2 * I + a}/${2 * J + b} 不是 ${legacyPadded} 列见方`);
      const map = new Uint16Array(d.palette.length / 2);
      for (let p = 0; p < map.length; p++) map[p] = paletteId(d.palette[2 * p]!, d.palette[2 * p + 1]!);
      quads.push({ a, b, d, cm: toColumnMajor(d), map });
    }
    if (!quads.length) return null;
    const kBottom = Math.min(...quads.map((q) => q.d.kBottom)), kTop = Math.max(...quads.map((q) => q.d.kBottom + q.d.nz - 1)), nz = kTop - kBottom + 1;
    const unset = 0xffff, cm = new Uint16Array(side * side * nz).fill(unset);
    let fillId = -1;
    for (let Y = 0; Y < side; Y++) for (let X = 0; X < side; X++) {
      const c = Y * side + X, base = c * nz;
      // 核心归属的那个旧区段排第一，邻圈抄本补它没存到的高度
      const ownerA = X > legacyCells ? 1 : 0, ownerB = Y > legacyCells ? 1 : 0;
      const order = [...quads].sort((p, q) => Number(q.a === ownerA && q.b === ownerB) - Number(p.a === ownerA && p.b === ownerB));
      for (const q of order) {
        const x = X - legacyCells * q.a, y = Y - legacyCells * q.b;
        if (x < 0 || y < 0 || x >= legacyPadded || y >= legacyPadded) continue;
        const src = (y * legacyPadded + x) * q.d.nz, off = q.d.kBottom - kBottom;
        for (let k = 0; k < q.d.nz; k++) if (cm[base + off + k] === unset) cm[base + off + k] = q.map[q.cm[src + k]!]!;
      }
      let lowest = 0;
      while (lowest < nz && cm[base + lowest] === unset) lowest++;
      const below = lowest < nz && cm[base + lowest] !== 0;
      for (let k = 0; k < nz; k++) {
        if (cm[base + k] !== unset) continue;
        if (k < lowest && below) {
          if (fillId < 0) {
            if (fillState < 0) throw new Error(`${dir} 的状态表里没有 ${fillBlock}，拼旧区段时 k底 以下没东西可填`);
            fillId = paletteId(fillState, P.noBiome);
          }
          cm[base + k] = fillId;
        } else cm[base + k] = 0;
      }
    }
    return fromColumnMajor({ L, i: I, j: J }, kBottom, nz, cm, palette, side * side);
  };
  const hasNew = (L: number, I: number, J: number) => [0, 1].some((b) => [0, 1].some((a) => at.has(keyOf(L, 2 * I + a, 2 * J + b))));
  return {
    dir, info, format, coarsestLevel,
    has: hasNew,
    取: merge,
    tiles: () => [...newTiles.keys()].sort(byUtf8),
    *inTile(fileName) {
      const m = newTiles.get(fileName);
      if (!m) return;
      for (const { id } of [...m.values()].sort((a, b) => a.id.L - b.id.L || a.local - b.local)) {
        const bytes = [0, 1].reduce((s, b) => s + oldBytes(id.L, 2 * id.i, 2 * id.j + b) + oldBytes(id.L, 2 * id.i + 1, 2 * id.j + b), 0);
        yield { id, byteCount: bytes, 取: () => merge(id.L, id.i, id.j)! };
      }
    },
    close,
  };
};

/** 整个源包的区段，按块文件名、块里的先后 */
export function* walkSource(source: SectionSource) {
  for (const f of source.tiles()) yield* source.inTile(f);
}
