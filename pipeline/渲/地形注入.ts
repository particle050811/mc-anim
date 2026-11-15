// 把本段声明的地形包和版本传给页面（engine/voxel/区段包位置.ts 的唯一来源）：renderMedia、renderStill、renderFrames 都传 envVariables: 段渲染环境(键, 地形)。
// anim film、still、bench、verify --渲 走这一处。用环境变量不用 inputProps：inputProps 整份进指纹、规范化设置 拒收不认识的键、每段 getCompositions 也得跟着传，
// 而版本已经单独进指纹的地形项。读 Composition 列表的页面不传：列表阶段不该读任何包，读了就报错。
import { terrainVersionEnv, terrainUsageSegEnv } from '../../engine/段/地形环境.ts';
// 和 engine/core/试看.ts 的 试看环境名 同一个名字（pipeline 不 import 渲染代码）
const trialEnvName = 'REMOTION_ANIM_TRIAL';
import { workName } from '../环境/作品.ts';
import { segTerrainVersion, readTerrainVersionTable } from '../指纹/指纹.ts';
import type { SegInfo } from '../清单/清单.ts';

/**
 * 键是段键（段指纹的 段 字段就是）。出切片的渲染，地形一定传指纹的地形项（r.指纹.项.地形），不重读表：
 * 指纹在批次开头算，闸按段放，中途 anim world bake 或合并提交改了表，页面要是拿到新版，切片就是名字说 v1、画面是 v2，还查不出来。旧版本目录只增不改，照样读得到
 */
export const segRenderEnv = (segKey: string, terrainFiles: Record<string, string>): Record<string, string> => ({
  [terrainVersionEnv]: JSON.stringify(terrainFiles),
  [terrainUsageSegEnv]: `${workName()}/${segKey}`,
});

/** still、bench 不算指纹、不出切片，当场读表；多读：试看要多读的包（`试看地形`） */
export const segTerrainNow = (s: Pick<SegInfo, '键' | '段'>, extraReads: readonly string[] = []): Record<string, string> => segTerrainVersion(s.键, [...new Set([...s.段.地形, ...extraReads])], readTerrainVersionTable());

/** anim still 的试看参数（engine/core/试看.ts）：shell 里设了就原样转给页面；只 still 转，film 不认，切片不会混进试看的画面 */
export const trialEnv = (): Record<string, string> => (process.env[trialEnvName] ? { [trialEnvName]: process.env[trialEnvName]! } : {});
/** 试看参数里「地形」列的包：still 按现登记的版本并进这一页的地形版本表 */
export const trialTerrain = (): string[] => {
  const raw = process.env[trialEnvName];
  if (!raw) return [];
  const terrainNames = (JSON.parse(raw) as { 地形?: unknown }).地形;
  if (terrainNames !== undefined && !(Array.isArray(terrainNames) && terrainNames.every((x) => typeof x === 'string'))) throw new Error(`${trialEnvName} 的 地形 要是包名数组`);
  return (terrainNames as string[] | undefined) ?? [];
};

/** Studio 一个页面看全部段，传全表（开着时登记了新版本要重开才拿到） */
export const fullTableEnv = (): Record<string, string> => ({ [terrainVersionEnv]: JSON.stringify(readTerrainVersionTable()) });
