import { sectionKey } from './区段.ts';
import { coarseHeightAt } from './区段包.ts';
import type { ImportedTerrain } from './导入地形.ts';
import type { VoxelSource } from './生成.ts';
import { emptyColumns, mergeColumns } from './远景并列.ts';

const matchesColumns = (offset: number | undefined, bytes: Uint8Array, mask: Uint8Array | null) => {
  if (!mask) return offset === -1;
  if (offset === undefined || offset < 0 || offset + Math.ceil(mask.length / 8) > bytes.length) return false;
  for (let c = 0; c < mask.length; c++) if (mask[c] !== ((bytes[offset + (c >> 3)] >> (c & 7)) & 1)) return false;
  return true;
};

// 用户 11-18 定：暮色按原镜头选级，不能为了迁就包里没有的块而退粗级。选级的点表和区段清单分开，不能拿区段里的树冠顶当地面选级。
export const buildBakedFarTerrain = (base: ImportedTerrain, landmarks: ImportedTerrain, baked: ImportedTerrain, treeHeight: number) => {
  const far = baked.far;
  if (!far) throw new Error(`${baked.key} 没有远景列清单或选级表：anim world bake-far 重烘`);
  if ([landmarks, baked].some(t => t.source.coarsestLevel !== base.source.coarsestLevel || t.origin.some((v, i) => v !== base.origin[i]))) throw new Error('远景区段包和两个导入包的原点、最粗级要一致');
  const source: VoxelSource = {
    coarsestLevel: base.source.coarsestLevel, toScene: base.source.toScene, transferOwnership: true,
    采样: (x, y, out) => {
      const top = coarseHeightAt(base.coarse, x, y);
      const ground = top === -Infinity ? coarseHeightAt(far.pick, x, y) : top;
      out.z = ground === -Infinity ? far.outside : ground;
      out.crown = 0;
    },
    prefetch: (qs, guessed) => {
      const waits = [base, landmarks, baked].map(t => t.source.prefetch?.(qs, guessed));
      return waits.some(Boolean) ? Promise.all(waits).then(() => undefined) : undefined;
    },
    sections: q => {
      const key = sectionKey(q), imported = base.source.sections(q) ?? landmarks.source.sections(q);
      const mask = imported && emptyColumns(imported);
      if (imported && !mask) return imported;
      if (!matchesColumns(far.columns[key], far.bytes, mask)) throw new Error(`${baked.key}：缺少远景区段 ${key} 或导入包的空列已变。先 anim world cover 量镜头，再 anim world bake-far 重烘`);
      const supplement = baked.source.sections(q)!;
      supplement.waterLevel = far.waterLevel;
      return imported && mask ? mergeColumns(imported, supplement, mask) : supplement;
    },
  };
  return { key: `${base.key}+${landmarks.key}+${baked.key}`, source, heightRange: [base.heightRange[0], Math.max(base.heightRange[1], landmarks.heightRange[1], far.groundMax + treeHeight)] as [number, number] };
};
