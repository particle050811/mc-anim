// 全部已注册法术的元数据（纯，段.ts 能引）：各组分表汇总。顺序 = 核对段里的顺序。
// 不自动扫目录：import.meta.webpackContext 只许在作品的 注册.tsx 里用（指纹要能静态跟到每个文件），所以各组各管一份表，免得并行时改同一个文件。
import type { SpellMeta } from './接口.ts';
import { sampleMeta } from './组/样板.元.ts';
import { groupAMeta } from './组/甲.元.ts';
import { groupBMeta } from './组/乙.元.ts';
import { groupCMeta } from './组/丙.元.ts';
import { groupDMeta } from './组/丁.元.ts';

export const groupMeta = { 样板: sampleMeta, 甲: groupAMeta, 乙: groupBMeta, 丙: groupCMeta, 丁: groupDMeta } as const;
export const spellMetas: readonly SpellMeta[] = Object.values(groupMeta).flat();

const byId = new Map(spellMetas.map((meta) => [meta.id, meta]));
export const getSpellMeta = (id: string): SpellMeta => {
  const meta = byId.get(id);
  if (!meta) throw new Error(`法术 ${id} 还没注册演出（已注册：${[...byId.keys()].join('、')}）`);
  return meta;
};
