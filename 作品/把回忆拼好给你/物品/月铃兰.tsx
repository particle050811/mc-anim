// 月铃兰（万法皆通 1.9.3 的 yue_linglan）：第 13、15 句和封面她手里那一枝。物品模型是 item/generated，手里就是把这张贴图挤出成薄片。
// 给 库/角色/魔法酒狐新动作组件.tsx 的 手持物 用：<MagicalWineFoxEx 右手={{ 物品: <月铃兰 /> }} />。
import type React from 'react';
import { ItemSprite, type ItemLayer } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import img from 'asset:贴图/物品/月铃兰';

export const 月铃兰层: ItemLayer[] = [{ tex: png(img) }];

// 不加自发光打底（ItemSprite 默认 0.25）：拿在她手里，和她身上同一套受光
export const 月铃兰: React.FC = () => <ItemSprite layers={月铃兰层} emissive={0} />;
