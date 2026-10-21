// 第六章暮色森林的两件战利品（6-2-1 摆在基地桌上）：炽热的血、雪怪首领毛皮。
// 贴图照抄暮色森林 4.3.2508 的 jar（npm run 取材 -- 战利品贴图）：
//   twilightforest:item/fiery_blood（一小瓶暗红的血，橙红瓶塞）、twilightforest:item/alpha_yeti_fur（一张蓝白两色、对折的毛皮）。
// 两个都是 item/generated（模型 json 只有 layer0），挤出 1 像素厚的薄片（lib/物品贴图.tsx）。
// 坐标：物品空间（单位格，中心在原点，贴图正面朝 +Z、上 = +Y）。
import React from 'react';
import { ItemSprite } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import bloodTex from 'asset:贴图/物品/炽热的血';
import furTex from 'asset:贴图/物品/雪怪首领毛皮';

const BLOOD = [{ tex: png(bloodTex) }];
const FUR = [{ tex: png(furTex) }];

export const FieryBlood: React.FC = () => <ItemSprite layers={BLOOD} />;
export const AlphaYetiFur: React.FC = () => <ItemSprite layers={FUR} />;
