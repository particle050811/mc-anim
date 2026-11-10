// 全部已注册法术的元数据（纯，段.ts 能引）：各组分表汇总。顺序 = 核对段里的顺序。
// 不自动扫目录：import.meta.webpackContext 只许在作品的 注册.tsx 里用（指纹要能静态跟到每个文件），所以各组各管一份表，免得并行时改同一个文件。
import type { 法术元 } from './接口.ts';
import { 样板元 } from './组/样板.ts';
import { 甲元 } from './组/甲.ts';
import { 乙元 } from './组/乙.ts';
import { 丙元 } from './组/丙.ts';
import { 丁元 } from './组/丁.ts';

export const 分组元 = { 样板: 样板元, 甲: 甲元, 乙: 乙元, 丙: 丙元, 丁: 丁元 } as const;
export const 法术元表: readonly 法术元[] = Object.values(分组元).flat();

const 按id = new Map(法术元表.map((元) => [元.id, 元]));
export const 取法术元 = (id: string): 法术元 => {
  const 元 = 按id.get(id);
  if (!元) throw new Error(`法术 ${id} 还没注册演出（已注册：${[...按id.keys()].join('、')}）`);
  return 元;
};
export const 有法术演出 = (id: string): boolean => 按id.has(id);
