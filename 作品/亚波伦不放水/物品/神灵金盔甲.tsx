// 神灵金套（启示录的 apocalyptium_helmet / chestplate / leggings / boots，用户 11-10 定史蒂夫穿附魔的全套）穿在身上的样子。
// 游戏里（RevelationFix 4.9，反编译）：ApocalyptiumArmor.initializeClient → ApocalyptiumArmorClient.getHumanoidArmorModel 把原版盔甲层的方盒换成 ApocalyptiumArmorModel，
// 顶点写死在 ApocalyptiumArmorGeometry（配方「亚波伦史蒂夫装备」原样导出）：每块网格跟一个人形部件（head、body、两臂、两腿），坐标是部件里的模型像素；
// 四件共用一张 128×64 贴图（getArmorTexture 都返回 textures/models/armor/apocalyptium_custom.png）。胸甲背后另有一幅披风（物品/神灵金披风.ts）。
// 没有发光层；附魔光泽走原版 HumanoidArmorLayer.renderGlint，拿同一个模型再画一遍，披风也带。变形外观（NBT revelationfix:transformed）没做。
// 用法：const 挂 = use神灵金盔甲(件, 光泽秒)，把 挂.head、挂.body… 放进 EntityModel 的 attach（人形模型的同名部件）。
import React, { useMemo } from 'react';
import { png } from '@engine/model/贴图.ts';
import { 四边形几何, 盔甲材质 } from '@库/角色/网格盔甲.tsx';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 网格数据 from 'asset:数据/角色/史蒂夫装备/神灵金盔甲网格';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 贴图 from 'asset:贴图/角色/史蒂夫装备/神灵金盔甲';
import 光泽图 from 'asset:贴图/角色/卫兵/附魔光泽';
import { 披风站定, 披风顶点表, type 披风数据 } from './神灵金披风.ts';

type 网格 = { 骨: number; 顶点: number[] };
const 数据 = 网格数据 as unknown as { 骨: string[]; 槽: Record<'head' | 'chest' | 'legs' | 'feet', 网格[]>; 披风: 披风数据 };

export type 神灵金件 = '头盔' | '胸甲' | '护腿' | '靴子';
export const 神灵金全套: readonly 神灵金件[] = ['头盔', '胸甲', '护腿', '靴子'];
const 槽名 = { 头盔: 'head', 胸甲: 'chest', 护腿: 'legs', 靴子: 'feet' } as const;

const 几何表 = new Map<网格, ReturnType<typeof 四边形几何>>();
const 几何 = (m: 网格) => {
  let g = 几何表.get(m);
  if (!g) 几何表.set(m, (g = 四边形几何(m.顶点)));
  return g;
};
let 披风几何缓存: ReturnType<typeof 四边形几何> | null = null;
// 披风只做了站着不动的样子（跑到稳的布料），不跟人的走动摆
const 披风几何 = () => (披风几何缓存 ??= 四边形几何(披风顶点表(数据.披风, 披风站定(数据.披风))));

/** 件：穿哪几件，不给 = 全套。光泽秒：附魔光泽滚动的时钟，不给 = 没附魔。返回 { 部件名: 节点 }，没东西的部件不在里面 */
export const use神灵金盔甲 = (件: readonly 神灵金件[] = 神灵金全套, 光泽秒?: number): Record<string, React.ReactNode> => {
  const 附魔 = 光泽秒 !== undefined;
  const { 材质, 设秒 } = useMemo(() => 盔甲材质(png(贴图), 附魔 ? png(光泽图) : undefined), [附魔]);
  if (附魔) 设秒(光泽秒);
  const 挂: Record<string, React.ReactNode[]> = {};
  for (const 名 of 神灵金全套) {
    if (!件.includes(名)) continue;
    数据.槽[槽名[名]].forEach((m, i) => (挂[数据.骨[m.骨]!] ??= []).push(<mesh key={`${名}${i}`} geometry={几何(m)} material={材质} castShadow receiveShadow />));
    if (名 === '胸甲') (挂.body ??= []).push(<mesh key="披风" geometry={披风几何()} material={材质} castShadow receiveShadow />);
  }
  return 挂;
};
