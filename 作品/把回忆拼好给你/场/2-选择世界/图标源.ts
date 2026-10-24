// 「新的世界」那一格存档图标用的两张图：旧的（第 0 镜，去年夏天那张合照 = 第 11 句定格的照片）和新的（片尾拼回来的合照 = 15 尾 54.65 闪白截下的那张）。
// 旧的用真帧 贴图/照片/第11句合照（已按第 11 句下线图标的裁法裁成正方形，同照片墙那一格）；新的还是占位（资产表 贴图.toml 里写了从哪一帧裁），
// 真图做出来以后登记成资产，只改这里的 import 和 裁：别的地方都从这里取。裁 不给取正中的正方形。
import { png } from '@engine/model/贴图.ts';
import 旧uri from 'asset:贴图/照片/第11句合照';
import 新uri from 'asset:贴图/启动器/新合照-占位';
import { 取图标, 褪色蒙灰, type 裁框 } from '../../界面/实例图标.ts';

const 旧图 = png(旧uri);
const 新图 = png(新uri);
/** 新图取哪块正方形（源图像素）；undefined = 正中 */
const 新裁: 裁框 | undefined = undefined;

/** 第 0 镜的旧图标：褪了色、蒙着灰 */
export const 旧图标 = 褪色蒙灰(取图标(旧图));
/** 片尾拼回来的新图标 */
export const 新图标 = 取图标(新图, 新裁);
