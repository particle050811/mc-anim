// 原版蛋糕的物品图：物品栏、手里拿着时的那张平面图（item/cake.json 的 parent 是 item/generated），不是放在地上的蛋糕方块。
// 贴图来自取材配方「蛋糕」（client 1.20.1 的 textures/item/cake.png）。挤出、显示变换用 engine/model/物品贴图.tsx，第一人称的变换见 库/角色/第一人称.tsx。
import type { ItemLayer } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import cakeImg from 'asset:贴图/物品/蛋糕';

export const cakeTex = png(cakeImg);

/** 给 ItemSprite 的贴图层：蛋糕只有一层、不染色 */
export const CAKE: ItemLayer[] = [{ tex: cakeTex }];
