// 把本段声明的地形包和版本传给页面（engine/voxel/区段包位置.ts 的唯一来源）：renderMedia、renderStill、renderFrames 都传 envVariables: 段渲染环境(段)。
// anim render、still、bench、verify --渲 走这一处。用环境变量不用 inputProps：inputProps 整份进指纹、规范化设置 拒收不认识的键、每段 getCompositions 也得跟着传，
// 而版本已经单独进指纹的地形项。读 Composition 列表的页面不传：列表阶段不该读任何包，读了就报错。
import { 地形版本环境名, 地形用量段环境名 } from '../../engine/段/地形环境.ts';
import { 作品名 } from '../环境/作品.ts';
import { 叠层键, 段地形版本, 读地形版本表 } from '../指纹/指纹.ts';
import type { 段信息 } from '../清单/清单.ts';
import type { 叠层定义 } from '../../engine/段/段定义.ts';

export const 段渲染环境 = (s: Pick<段信息, '键' | '段'>, 叠层?: 叠层定义): Record<string, string> => ({
  [地形版本环境名]: JSON.stringify(段地形版本(s.键, s.段.地形, 读地形版本表())),
  [地形用量段环境名]: `${作品名()}/${叠层 ? 叠层键(s.键, 叠层) : s.键}`,
});

/** Studio 一个页面看全部段，传全表（开着时登记了新版本要重开才拿到） */
export const 全表环境 = (): Record<string, string> => ({ [地形版本环境名]: JSON.stringify(读地形版本表()) });
