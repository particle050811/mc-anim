// 史蒂夫死后散落的物品，照原版 1.20.1（官方映射的源码逻辑，常数没逐个 javap 核）：
// - 扔出：Player.dropEquipment → Inventory.dropAll → Player.drop(物, 乱扔 = true)：物品实体出在眼高下 0.3 格，
//   速度 = (−sin(a) × f, 0.2, cos(a) × f) 格/刻，f = 随机 × 0.5、a = 随机 × 2π。死的那一刻就掉，不等倒下。
// - 运动：ItemEntity.tick：先竖直 − 0.04，再挪，再水平 × 0.98（落地后 × 0.6 × 0.98）、竖直 × 0.98；撞地竖直速度清零。只算一块平地。
// - 画：ItemEntityRenderer：抬 sin(刻 ÷ 10 + 相位) × 0.1 + 0.1 + 0.25 × ground 的 scale.y，绕竖轴转 刻 ÷ 20 + 相位 弧度，再套物品的 ground 显示变换。
// 掉哪几件是本片定的（他身上有的：四件神灵金甲、断曜流光、晋升之环、弓、金苹果），图腾已经用掉不掉。用户 11-10 定他全片不拿盾，所以不掉盾。
// 箭（item/arrow.png）库里还没有，没掉；经验球没做。
import React from 'react';
import { ItemDisplay, DISPLAY, ItemSprite, type ItemTransform } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { GlintItem } from '@库/物品/附魔物品.tsx';
import { STEVE, steveSize } from '@库/角色/史蒂夫.tsx';
import { 断曜流光, 断曜流光显示 } from '../物品/断曜流光.tsx';
import { 默认外观 } from '../物品/装备外观.ts';
import { 弓 } from './反应史蒂夫.tsx';
import { 死亡掉落轨迹 as 算掉落轨迹, type 掉落轨迹 } from './史蒂夫掉落轨迹.ts';

export { 史蒂夫掉落件数 } from './史蒂夫掉落轨迹.ts';
export type { 掉落轨迹 };
import 金苹果图 from 'asset:贴图/法术/minecraft/item/golden_apple';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 环图标 from 'asset:贴图/物品/晋升之环';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 旧头盔图标 from 'asset:贴图/物品/神灵金头盔.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 旧胸甲图标 from 'asset:贴图/物品/神灵金胸甲.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 旧护腿图标 from 'asset:贴图/物品/神灵金护腿.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 旧靴子图标 from 'asset:贴图/物品/神灵金靴子.旧版';

/** 晋升之环的物品图标：第 4 幕它像不死图腾那样从屏幕中间翻出来（库/界面/物品激活.tsx）也用这一张，私有资产只在这里 import */
export const 晋升之环图标 = 环图标;

/** 件数 件物品从死的那一刻起每刻的位置（第 0 项是出生位置），算法在 史蒂夫掉落轨迹.ts（纯模块，第 5 幕的编排也拿它躲开地上的东西）；眼高照史蒂夫模型 */
export const 死亡掉落轨迹 = (脚底: V3, 件数: number, 种子: number, 选项: { 地面?: number; 刻数?: number } = {}): 掉落轨迹[] =>
  算掉落轨迹(脚底, 件数, 种子, { 眼高: steveSize(STEVE.scale).eye, ...选项 });

export type 掉落件 = { 节点: React.ReactNode; 显示: ItemTransform };

const 附魔图标: React.FC<{ 图: string; 秒: number }> = ({ 图, 秒 }) => <GlintItem layers={[{ tex: png(图) }]} sec={秒} />;

/** 本片史蒂夫死后掉的 8 件（顺序固定，和 死亡掉落轨迹 的下标对应）。光泽秒：附魔光效的时钟 */
export const 史蒂夫掉落件 = (光泽秒: number): 掉落件[] => {
  const 平 = DISPLAY.generated.ground;
  return [
    { 节点: <附魔图标 图={旧头盔图标} 秒={光泽秒} />, 显示: 平 },
    { 节点: <附魔图标 图={旧胸甲图标} 秒={光泽秒} />, 显示: 平 },
    { 节点: <附魔图标 图={旧护腿图标} 秒={光泽秒} />, 显示: 平 },
    { 节点: <附魔图标 图={旧靴子图标} 秒={光泽秒} />, 显示: 平 },
    { 节点: <断曜流光 外观={默认外观} 光泽秒={光泽秒} />, 显示: 断曜流光显示[默认外观].ground },
    { 节点: <ItemSprite layers={[{ tex: png(环图标) }]} />, 显示: 平 },
    { 节点: <弓 />, 显示: 平 },
    { 节点: <ItemSprite layers={[{ tex: png(金苹果图) }]} />, 显示: 平 },
  ];
};

/** 死后 秒 秒时的掉落物。轨迹 用 死亡掉落轨迹 算一次；件 和轨迹一一对应 */
export const 死亡掉落: React.FC<{ 轨迹: readonly 掉落轨迹[]; 件: readonly 掉落件[]; 秒: number }> = ({ 轨迹, 件, 秒 }) => {
  if (秒 < 0) return null;
  const 刻 = 秒 * 20;
  const k = Math.min(Math.floor(刻), 轨迹[0]!.路.length - 2);
  const f = Math.min(1, 刻 - k);
  return (
    <>
      {件.map((物, i) => {
        const 轨 = 轨迹[i];
        if (!轨) return null;
        const a = 轨.路[k]!;
        const b = 轨.路[k + 1]!;
        const 浮 = Math.sin(刻 / 10 + 轨.相位) * 0.1 + 0.1 + 0.25 * (物.显示.scale?.[1] ?? 1);
        return (
          // 物品空间 Y 朝上 → 场景 Z 朝上：绕 X 转 +90 度；自转绕物品的 Y
          <group key={i} position={[a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f + 浮]} rotation={[Math.PI / 2, 0, 0]}>
            <group rotation={[0, 刻 / 20 + 轨.相位, 0]}>
              <ItemDisplay t={物.显示}>{物.节点}</ItemDisplay>
            </group>
          </group>
        );
      })}
    </>
  );
};
