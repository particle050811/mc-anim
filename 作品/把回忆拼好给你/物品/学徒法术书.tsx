// 学徒法术书（铁魔法 3.16.3 的 gold_spell_book）：第 7 句你放进她副手槽、她拿在左手的那本。物品模型是 item/generated，手里就是把这张贴图挤出成薄片。
// 给 库/角色/魔法酒狐新动作组件.tsx 的 手持物 用：<MagicalWineFoxEx 左手={{ 物品: <学徒法术书 /> }} />；女仆界面的格子里画这张贴图（学徒法术书图）。
import type React from 'react';
import { ItemSprite, type ItemLayer } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import img from 'asset:贴图/物品/学徒法术书';

export const 学徒法术书图 = png(img);
export const 学徒法术书层: ItemLayer[] = [{ tex: 学徒法术书图 }];

// 不加自发光打底（ItemSprite 默认 0.25）：拿在她手里，和她身上同一套受光
export const 学徒法术书: React.FC = () => <ItemSprite layers={学徒法术书层} emissive={0} />;
