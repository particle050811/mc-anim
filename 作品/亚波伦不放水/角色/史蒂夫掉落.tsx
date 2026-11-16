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
import { Valettein, valetteinDisplay } from '../物品/断曜流光.tsx';
import { defaultAppearance } from '../物品/装备外观.ts';
import { Bow } from './反应史蒂夫.tsx';
import { deathDropTrack as computeDropTrack, type DropTrack } from './史蒂夫掉落轨迹.ts';

export { steveDropCount } from './史蒂夫掉落轨迹.ts';
export type { DropTrack };
import goldenApplePng from 'asset:贴图/法术/minecraft/item/golden_apple';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import ascensionRingPng from 'asset:贴图/物品/晋升之环';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import oldDivineHelmetPng from 'asset:贴图/物品/神灵金头盔.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import oldDivineChestplatePng from 'asset:贴图/物品/神灵金胸甲.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import oldDivineLeggingsPng from 'asset:贴图/物品/神灵金护腿.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import oldDivineBootsPng from 'asset:贴图/物品/神灵金靴子.旧版';

/** 晋升之环的物品图标：第 4 幕它像不死图腾那样从屏幕中间翻出来（库/界面/物品激活.tsx）也用这一张，私有资产只在这里 import */
export const ascensionHaloIcon = ascensionRingPng;

/** 件数 件物品从死的那一刻起每刻的位置（第 0 项是出生位置），算法在 史蒂夫掉落轨迹.ts（纯模块，第 5 幕的编排也拿它躲开地上的东西）；眼高照史蒂夫模型 */
export const deathDropTrack = (feet: V3, itemCount: number, seed: number, options: { ground?: number; 刻数?: number } = {}): DropTrack[] =>
  computeDropTrack(feet, itemCount, seed, { 眼高: steveSize(STEVE.scale).eye, ...options });

export type DropItem = { 节点: React.ReactNode; display: ItemTransform };

const EnchantmentIcon: React.FC<{ image: string; sec: number }> = ({ image: imagePath, sec: sec }) => <GlintItem layers={[{ tex: png(imagePath) }]} sec={sec} />;

/** 本片史蒂夫死后掉的 8 件（顺序固定，和 死亡掉落轨迹 的下标对应）。光泽秒：附魔光效的时钟 */
export const steveDrops = (glintSec: number): DropItem[] => {
  const groundY = DISPLAY.generated.ground;
  return [
    { 节点: <EnchantmentIcon image={oldDivineHelmetPng} sec={glintSec} />, display: groundY },
    { 节点: <EnchantmentIcon image={oldDivineChestplatePng} sec={glintSec} />, display: groundY },
    { 节点: <EnchantmentIcon image={oldDivineLeggingsPng} sec={glintSec} />, display: groundY },
    { 节点: <EnchantmentIcon image={oldDivineBootsPng} sec={glintSec} />, display: groundY },
    { 节点: <Valettein appearance={defaultAppearance} glintSec={glintSec} />, display: valetteinDisplay[defaultAppearance].ground },
    { 节点: <ItemSprite layers={[{ tex: png(ascensionRingPng) }]} />, display: groundY },
    { 节点: <Bow />, display: groundY },
    { 节点: <ItemSprite layers={[{ tex: png(goldenApplePng) }]} />, display: groundY },
  ];
};

/** 死后 秒 秒时的掉落物。轨迹 用 死亡掉落轨迹 算一次；件 和轨迹一一对应 */
export const DeathDrop: React.FC<{ trajectory: readonly DropTrack[]; drops: readonly DropItem[]; sec: number }> = ({ trajectory, drops, sec: sec }) => {
  if (sec < 0) return null;
  const tick = sec * 20;
  const k = Math.min(Math.floor(tick), trajectory[0]!.lane.length - 2);
  const f = Math.min(1, tick - k);
  return (
    <>
      {drops.map((dropItem, i) => {
        const track = trajectory[i];
        if (!track) return null;
        const a = track.lane[k]!;
        const b = track.lane[k + 1]!;
        const floatOffset = Math.sin(tick / 10 + track.phaseRad) * 0.1 + 0.1 + 0.25 * (dropItem.display.scale?.[1] ?? 1);
        return (
          // 物品空间 Y 朝上 → 场景 Z 朝上：绕 X 转 +90 度；自转绕物品的 Y
          <group key={i} position={[a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f + floatOffset]} rotation={[Math.PI / 2, 0, 0]}>
            <group rotation={[0, tick / 20 + track.phaseRad, 0]}>
              <ItemDisplay t={dropItem.display}>{dropItem.节点}</ItemDisplay>
            </group>
          </group>
        );
      })}
    </>
  );
};
