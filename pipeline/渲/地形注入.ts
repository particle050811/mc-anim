// 把本段声明的地形包和版本传给页面（engine/voxel/区段包位置.ts 的唯一来源）：renderMedia、renderStill、renderFrames 都传 envVariables: 段渲染环境(键, 地形)。
// anim film、still、bench、verify --渲 走这一处。用环境变量不用 inputProps：inputProps 整份进指纹、规范化设置 拒收不认识的键、每段 getCompositions 也得跟着传，
// 而版本已经单独进指纹的地形项。读 Composition 列表的页面不传：列表阶段不该读任何包，读了就报错。
import { 地形版本环境名, 地形用量段环境名 } from '../../engine/段/地形环境.ts';
// 和 engine/core/试看.ts 的 试看环境名 同一个名字（pipeline 不 import 渲染代码）
const 试看环境名 = 'REMOTION_ANIM_TRIAL';
import { 作品名 } from '../环境/作品.ts';
import { 段地形版本, 读地形版本表 } from '../指纹/指纹.ts';
import type { 段信息 } from '../清单/清单.ts';

/**
 * 键是段键（段指纹的 段 字段就是）。出切片的渲染，地形一定传指纹的地形项（r.指纹.项.地形），不重读表：
 * 指纹在批次开头算，闸按段放，中途 anim world bake 或合并提交改了表，页面要是拿到新版，切片就是名字说 v1、画面是 v2，还查不出来。旧版本目录只增不改，照样读得到
 */
export const 段渲染环境 = (键: string, 地形: Record<string, string>): Record<string, string> => ({
  [地形版本环境名]: JSON.stringify(地形),
  [地形用量段环境名]: `${作品名()}/${键}`,
});

/** still、bench 不算指纹、不出切片，当场读表；多读：试看要多读的包（`试看地形`） */
export const 段现在的地形 = (s: Pick<段信息, '键' | '段'>, 多读: readonly string[] = []): Record<string, string> => 段地形版本(s.键, [...new Set([...s.段.地形, ...多读])], 读地形版本表());

/** anim still 的试看参数（engine/core/试看.ts）：shell 里设了就原样转给页面；只 still 转，film 不认，切片不会混进试看的画面 */
export const 试看环境 = (): Record<string, string> => (process.env[试看环境名] ? { [试看环境名]: process.env[试看环境名]! } : {});
/** 试看参数里「地形」列的包：still 按现登记的版本并进这一页的地形版本表 */
export const 试看地形 = (): string[] => {
  const 原文 = process.env[试看环境名];
  if (!原文) return [];
  const 包 = (JSON.parse(原文) as { 地形?: unknown }).地形;
  if (包 !== undefined && !(Array.isArray(包) && 包.every((x) => typeof x === 'string'))) throw new Error(`${试看环境名} 的 地形 要是包名数组`);
  return (包 as string[] | undefined) ?? [];
};

/** Studio 一个页面看全部段，传全表（开着时登记了新版本要重开才拿到） */
export const 全表环境 = (): Record<string, string> => ({ [地形版本环境名]: JSON.stringify(读地形版本表()) });
