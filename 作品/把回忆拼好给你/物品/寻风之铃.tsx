// 寻风之铃（万法皆通 1.9.3 的 wind_seeking_bell）：第 14 句她挂到告示牌上，第 15 句你摇响它。物品模型是 item/generated，就是把这张贴图挤出成薄片。
// 挂在告示牌上是演绎（游戏里没有挂铃的方块）：放成一个正对镜头的物品薄片，绕挂点摆。用法见 场/2-门口/摇铃.tsx。
import type React from 'react';
import { ItemSprite, type ItemLayer } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import img from 'asset:贴图/物品/寻风之铃';

export const 寻风之铃层: ItemLayer[] = [{ tex: png(img) }];

/** 物品坐标（中心在原点，一格见方的 16×16 贴图，正面朝 +Z），不加自发光打底，和挂它的告示牌同一套受光 */
export const 寻风之铃: React.FC = () => <ItemSprite layers={寻风之铃层} emissive={0} shadow={false} />;
