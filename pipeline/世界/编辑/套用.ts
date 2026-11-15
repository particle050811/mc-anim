// 把编辑集套到一个区域的列段上（区域源 的变换），照游戏执行这串命令后的结果：按步骤先后，后一步看得到前一步的改动。
// clone 读的是「执行到这一步之前」的世界，源可能在别的区域：按步算一次源快照（从原样的区域起、套上之前的步），记住复用。
// 只改方块状态；群系不动（clone、fill 在游戏里也不搬群系）。区块没生成完（列段里没这一列）的格跳过、记一条警告。
// 没有一步碰到的区域原样返回同一个对象：不改地形的包烘出来的字节和不套编辑时一样。
import { columnIndex, spreadColumn, startTable, type UnpackedColumnSegmentRegion } from '../列段.ts';
import type { RegionSource } from '../区域源.ts';
import { volume, type Box, type EditStep } from './命令.ts';
import type { EditSet } from './编辑文件.ts';
import { matchState, type BlockState } from './方块状态.ts';
import { transformPos, transformState, cellIndex } from './结构.ts';

const unresolved = 0xffffffff;
/** 一步 clone 的源快照最多这么多格（游戏 clone 上限 32768，这里放宽到 6400 万，免得一次吃光内存） */
export const snapshotLimit = 64 * 1024 * 1024;

const coversColumn = (b: Box, x: number, z: number) => x >= b.x1 && x <= b.x2 && z >= b.z1 && z <= b.z2;
const coversRegion = (b: Box, rx: number, rz: number) => b.x2 >= rx * 512 && b.x1 <= rx * 512 + 511 && b.z2 >= rz * 512 && b.z1 <= rz * 512 + 511;

export class EditApplier {
  readonly editSet: EditSet;
  private rawSource: Pick<RegionSource, '区域'>;
  /** 全局状态表：各区域的状态号先换成这里的号再套 */
  private 表: string[] = [];
  private indexByKey = new Map<string, number>();
  private airId: number;
  private snapshots = new Map<number, Uint32Array>();
  private matchCache = new Map<string, Map<number, boolean>>();
  private structureIds = new Map<number, Uint32Array>();
  private footprint = new Map<number, Int32Array>();
  private regionRemap = new WeakMap<UnpackedColumnSegmentRegion, number[]>();
  /** 套用时碰到的问题（同一句只记一次） */
  readonly 警告 = new Set<string>();

  constructor(editSet: EditSet, rawSource: Pick<RegionSource, '区域'>) {
    this.editSet = editSet;
    this.rawSource = rawSource;
    this.airId = this.stateId('minecraft:air');
  }

  private stateId(s: string) {
    let i = this.indexByKey.get(s);
    if (i === undefined) {
      i = this.表.push(s) - 1;
      this.indexByKey.set(s, i);
    }
    return i;
  }

  private 合(wantState: BlockState, g: number, cacheKey: string) {
    let m = this.matchCache.get(cacheKey);
    if (!m) this.matchCache.set(cacheKey, (m = new Map()));
    let v = m.get(g);
    if (v === undefined) m.set(g, (v = matchState(wantState, this.表[g]!)));
    return v;
  }

  private buildRemap(r: UnpackedColumnSegmentRegion) {
    let m = this.regionRemap.get(r);
    if (!m) this.regionRemap.set(r, (m = r.stateTable.map((s) => this.stateId(s))));
    return m;
  }

  /** 原样世界里一列（全局号，下标 y − y底）；没数据返回 null */
  private originalColumn(x: number, z: number): { 格: Uint32Array; yBottom: number } | null {
    const r = this.rawSource.区域(x >> 9, z >> 9);
    if (!r) return null;
    const c = spreadColumn(r, columnIndex(r.rx, r.rz, x, z));
    if (!c) return null;
    const remap = this.buildRemap(r);
    const cells = new Uint32Array(c.状态.length);
    for (let i = 0; i < cells.length; i++) cells[i] = remap[c.状态[i]!]!;
    return { 格: cells, yBottom: r.yBottom };
  }

  /** 第 i 步 clone 的源快照：执行到第 i 步之前的世界里源盒的方块（全局号，格下标的顺序；没数据的格是 未知） */
  private snapshot(i: number): Uint32Array {
    const cachedSnapshot = this.snapshots.get(i);
    if (cachedSnapshot) return cachedSnapshot;
    const s = this.editSet.步[i]!;
    if (s.种 !== 'clone') throw new Error('只有 clone 有源快照');
    const b = s.源;
    if (volume(b) > snapshotLimit) throw new Error(`${s.出处}：clone 的源盒 ${volume(b)} 格，超过 ${snapshotLimit}`);
    const sx = b.x2 - b.x1 + 1, sy = b.y2 - b.y1 + 1, sz = b.z2 - b.z1 + 1;
    const out = new Uint32Array(sx * sy * sz).fill(unresolved);
    let missingColumns = 0, firstColumn: [number, number] | null = null;
    for (let z = b.z1; z <= b.z2; z++)
      for (let x = b.x1; x <= b.x2; x++) {
        const c = this.originalColumn(x, z);
        if (!c) {
          missingColumns++;
          firstColumn ??= [x, z];
          continue;
        }
        this.applyColumn(c.格, c.yBottom, x, z, i);
        for (let y = b.y1; y <= b.y2; y++) {
          const k = y - c.yBottom;
          if (k >= 0 && k < c.格.length) out[((y - b.y1) * sz + (z - b.z1)) * sx + (x - b.x1)] = c.格[k]!;
        }
      }
    // 一步只记一条（源盒大时逐列记会刷出成千上万行）
    if (firstColumn) this.警告.add(`${s.出处}：clone 的源有 ${missingColumns} 列区块没生成（第一列在 (${firstColumn[0]}, ${firstColumn[1]})），按没有方块处理（不复制）`);
    this.snapshots.set(i, out);
    return out;
  }

  /** place 第 i 步：世界列 (x, z) 对应结构里哪一列（结构 x + z·宽），不在结构里是 −1 */
  private structureColumn(i: number, x: number, z: number) {
    const s = this.editSet.步[i]!;
    if (s.种 !== 'place') return -1;
    let f = this.footprint.get(i);
    const w = s.盒.x2 - s.盒.x1 + 1;
    if (!f) {
      f = new Int32Array(w * (s.盒.z2 - s.盒.z1 + 1)).fill(-1);
      const [ex, , ez] = s.结构.大小;
      for (let a = 0; a < ex; a++)
        for (let c = 0; c < ez; c++) {
          const [dx, dz] = transformPos(a, c, s.rotation, s.mirror);
          f[(s.位置[2] + dz - s.盒.z1) * w + (s.位置[0] + dx - s.盒.x1)] = a + c * ex;
        }
      this.footprint.set(i, f);
    }
    return f[(z - s.盒.z1) * w + (x - s.盒.x1)]!;
  }

  /** place 第 i 步：结构调色（变换过的状态的全局号，结构空位是 未知） */
  private structPalette(i: number) {
    let g = this.structureIds.get(i);
    if (g) return g;
    const s = this.editSet.步[i]!;
    if (s.种 !== 'place') throw new Error('只有 place 有结构');
    const cache = new Map<string, number>();
    g = new Uint32Array(s.结构.格.length);
    s.结构.格.forEach((st, k) => {
      if (st === null) return void (g![k] = unresolved);
      let v = cache.get(st);
      if (v === undefined) cache.set(st, (v = this.stateId(transformState(st, s.rotation, s.mirror))));
      g![k] = v;
    });
    this.structureIds.set(i, g);
    return g;
  }

  /** 把前 到 步（不含）里碰到列 (x, z) 的步按顺序套到这一列上 */
  private applyColumn(cells: Uint32Array, yBottom: number, x: number, z: number, count: number) {
    const yTop = yBottom + cells.length - 1;
    const outOfRange = (s: EditStep, lo: number, hi: number) => {
      if (lo < yBottom || hi > yTop) this.警告.add(`${s.出处}：y ${lo}～${hi} 超出世界高度 ${yBottom}～${yTop}，超出的部分不管`);
    };
    for (let i = 0; i < count; i++) {
      const s = this.editSet.步[i]!;
      if (!coversColumn(s.盒, x, z)) continue;
      const lo = Math.max(s.盒.y1, yBottom), hi = Math.min(s.盒.y2, yTop);
      outOfRange(s, s.盒.y1, s.盒.y2);
      switch (s.种) {
        case 'fill':
        case 'setblock': {
          const v = this.stateId(s.状态);
          const b = s.盒;
          const isEdgeColumn = x === b.x1 || x === b.x2 || z === b.z1 || z === b.z2;
          for (let y = lo; y <= hi; y++) {
            const k = y - yBottom;
            if (s.种 === 'fill' && (s.fillMode === 'hollow' || s.fillMode === 'outline')) {
              const isEdge = isEdgeColumn || y === b.y1 || y === b.y2;
              if (isEdge) cells[k] = v;
              else if (s.fillMode === 'hollow') cells[k] = this.airId;
            } else if (s.fillMode === 'keep') {
              if (cells[k] === this.airId) cells[k] = v;
            } else if (s.种 === 'fill' && s.filterState) {
              if (this.合(s.filterState, cells[k]!, `${i}`)) cells[k] = v;
            } else cells[k] = v;
          }
          break;
        }
        case 'clone': {
          const snapshot = this.snapshot(i);
          const b = s.源;
          const sx = b.x2 - b.x1 + 1, sz = b.z2 - b.z1 + 1;
          const shouldCopy = (g: number) => g !== unresolved && (s.maskMode === 'replace' || (s.maskMode === 'masked' ? g !== this.airId : this.合(s.filterState!, g, `${i}`)));
          // move：先把源里搬走的格清成空气，目标再覆盖上去（和游戏一样，重叠处以目标为准）
          if (s.isMove && coversColumn(b, x, z))
            for (let y = Math.max(b.y1, yBottom); y <= Math.min(b.y2, yTop); y++) if (shouldCopy(snapshot[((y - b.y1) * sz + (z - b.z1)) * sx + (x - b.x1)]!)) cells[y - yBottom] = this.airId;
          const [dx, dy, dz] = s.offset;
          const t: Box = { x1: b.x1 + dx, y1: b.y1 + dy, z1: b.z1 + dz, x2: b.x2 + dx, y2: b.y2 + dy, z2: b.z2 + dz };
          if (!coversColumn(t, x, z)) break;
          for (let y = Math.max(t.y1, yBottom); y <= Math.min(t.y2, yTop); y++) {
            const g = snapshot[((y - t.y1) * sz + (z - t.z1)) * sx + (x - t.x1)]!;
            if (shouldCopy(g)) cells[y - yBottom] = g;
          }
          break;
        }
        case 'place': {
          const c = this.structureColumn(i, x, z);
          if (c < 0) break;
          const colorPalette = this.structPalette(i);
          const ex = s.结构.大小[0];
          const a = c % ex, cz = (c - a) / ex;
          for (let y = lo; y <= hi; y++) {
            const g = colorPalette[cellIndex(s.结构, a, y - s.位置[1], cz)]!;
            if (g !== unresolved) cells[y - yBottom] = g;
          }
          break;
        }
      }
    }
  }

  /** 套到一个区域上：返回新的列段（没被碰到就是原对象） */
  applyEdits(r: UnpackedColumnSegmentRegion): UnpackedColumnSegmentRegion {
    const steps = this.editSet.步.map((s, i) => [s, i] as const).filter(([s]) => coversRegion(s.盒, r.rx, r.rz));
    if (!steps.length) return r;
    // 要改的列：各步盒在本区域里的范围
    const edited = new Uint8Array(512 * 512);
    for (const [s] of steps) {
      const x1 = Math.max(s.盒.x1, r.rx * 512) - r.rx * 512, x2 = Math.min(s.盒.x2, r.rx * 512 + 511) - r.rx * 512;
      const z1 = Math.max(s.盒.z1, r.rz * 512) - r.rz * 512, z2 = Math.min(s.盒.z2, r.rz * 512 + 511) - r.rz * 512;
      for (let z = z1; z <= z2; z++) edited.fill(1, z * 512 + x1, z * 512 + x2 + 1);
    }
    const remap = this.buildRemap(r);
    const stateTable = [...r.stateTable];
    const inverseMap = new Map<number, number>(remap.map((g, k) => [g, k]));
    const reverseId = (g: number) => {
      let k = inverseMap.get(g);
      if (k === undefined) {
        k = stateTable.push(this.表[g]!) - 1;
        inverseMap.set(g, k);
      }
      return k;
    };
    const segRunCounts = new Uint16Array(r.段数);
    const stateIds: number[] = [], bottom: number[] = [], biomeIds: number[] = [];
    let noDataCount = 0;
    for (let col = 0; col < 512 * 512; col++) {
      const s0 = r.runStarts[col]!, e0 = r.runStarts[col + 1]!;
      if (!edited[col] || s0 === e0) {
        if (edited[col]) noDataCount++;
        for (let k = s0; k < e0; k++) (stateIds.push(r.状态[k]!), bottom.push(r.bottom[k]!), biomeIds.push(r.群系[k]!));
        continue;
      }
      const c = spreadColumn(r, col)!;
      const cells = new Uint32Array(c.状态.length);
      for (let k = 0; k < cells.length; k++) cells[k] = remap[c.状态[k]!]!;
      this.applyColumn(cells, r.yBottom, r.rx * 512 + (col & 511), r.rz * 512 + (col >> 9), this.editSet.步.length);
      // 从顶往下重新并段
      let n = 0;
      for (let k = cells.length - 1; k >= 0; k--) {
        const st = reverseId(cells[k]!), bi = c.群系[k]!;
        if (k < cells.length - 1 && st === reverseId(cells[k + 1]!) && bi === c.群系[k + 1]) {
          bottom[bottom.length - 1] = r.yBottom + k;
          continue;
        }
        stateIds.push(st), bottom.push(r.yBottom + k), biomeIds.push(bi);
        n++;
      }
      if (n > 0xffff) throw new Error(`r.${r.rx}.${r.rz} 列 ${col} 套完编辑有 ${n} 段，放不进 u16`);
      segRunCounts[col] = n;
    }
    if (noDataCount) this.警告.add(`r.${r.rx}.${r.rz}：编辑碰到的 ${noDataCount} 列区块没生成，跳过`);
    if (stateTable.length > 65536) throw new Error(`r.${r.rx}.${r.rz} 套完编辑方块状态超过 65536 种`);
    return { ...r, stateTable, 段数: segRunCounts, 状态: Uint16Array.from(stateIds), bottom: Int16Array.from(bottom), 群系: Uint8Array.from(biomeIds), runStarts: startTable(segRunCounts) };
  }
}
