import { sectionKey, type SectionId } from './区段.ts';
import { base64Bytes } from '../core/base64.ts';
import type { VoxelGrid } from './生成.ts';

// 没开超远景的镜头只画扩展存档；边块已在包内并好，用原来的竖直范围和空列恢复它的轮廓，不取第二份区段。
export type BoundaryColumns = { bottom: number; nz: number; empty: string };
export type RouteIndex = {
  keys: string[];
  simulated: string[];
  edges: Record<string, BoundaryColumns>;
  waterLevel: number;
  outside: number;
  maxTop: number;
  simulateFromLevel: number | null;
};
export const limitToOriginal = (grid: VoxelGrid, edge: BoundaryColumns, simulated: boolean): VoxelGrid => {
  const mask = base64Bytes(edge.empty),
    cols = grid.nx * grid.ny;
  const nz = simulated ? grid.nz : edge.nz,
    start = simulated ? 0 : edge.bottom - grid.origin[2] / grid.cell;
  const vox = grid.vox.slice(start * cols, (start + nz) * cols);
  for (let c = 0; c < cols; ++c) if ((mask[c >> 3]! >> (c & 7)) & 1) for (let k = 0; k < nz; ++k) vox[k * cols + c] = 0;
  return { ...grid, vox, nz, origin: [grid.origin[0], grid.origin[1], grid.origin[2] + start * grid.cell] };
};

// 各父块保留整条级链。请求未烘过的子块时，退到包含它的最细祖先；同一祖先只画一次，已由它覆盖的细块不能再叠画。
export const resolveRouteSections = (present: ReadonlySet<string>, maxLevel: number) => {
  const warned = new Set<string>();
  return (requests: SectionId[], guessed = false): SectionId[] => {
    const ancestors = new Map<string, SectionId>(),
      missing: string[] = [];
    let incomplete = false;
    for (const request of requests) {
      const key = sectionKey(request);
      if (present.has(key)) continue;
      incomplete = true;
      let q = request;
      while (q.L < maxLevel && !present.has(sectionKey(q))) q = { L: q.L + 1, i: q.i >> 1, j: q.j >> 1 };
      const found = present.has(sectionKey(q));
      if (found) ancestors.set(sectionKey(q), q);
      if (!guessed && !warned.has(key)) {
        warned.add(key);
        missing.push(`${key}→${found ? sectionKey(q) : '包外'}`);
      }
    }
    if (missing.length) console.warn(`航线包缺级：${missing.join('、')}。请重算定级、重烘。`);
    if (!incomplete) return requests;
    if (!ancestors.size) return requests.filter((q) => present.has(sectionKey(q)));
    const out = new Map<string, SectionId>();
    for (let q of requests) {
      for (let L = q.L + 1; L <= maxLevel; L++) {
        const delta = L - q.L,
          parent = ancestors.get(`${L}|${q.i >> delta}|${q.j >> delta}`);
        if (parent) q = parent;
      }
      if (present.has(sectionKey(q))) out.set(sectionKey(q), q);
    }
    return [...out.values()];
  };
};
