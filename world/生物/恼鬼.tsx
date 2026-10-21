// 恼鬼（铁魔法「召唤恼鬼」召出的 `SummonedVex`）：模型、贴图、动作都是原版的（npm run 取材 -- 恼鬼）。
// 出处（irons_spellbooks-1.20.1-3.16.3.jar + 原版 1.20.1 SRG 客户端 jar，javap 反汇编）：
// - 铁魔法给 SUMMONED_VEX 注册的就是原版 `VexRenderer`，没有自己的模型贴图。实体尺寸 0.4×0.8。
// - `VexRenderer`：影子 0.3；`getBlockLightLevel` 恒 15（全亮）；贴图 textures/entity/illager/vex.png，冲锋时（`isCharging`）换 vex_charging.png；`VexModel` 渲染类型 entityTranslucent（翅膀 alpha 160 半透明）。手里的东西用 `ItemInHandLayer`。
// - `VexModel.createBodyLayer`（m_171046_，贴图 32×32）：root(0,−2.5,0) 下 head 5×5×5、body 3×4×2 + 3×5×2（缩 0.2）、两臂 2×4×2、两片翅膀 0×5×8 薄片。整只高约 0.72 格，脚底在实体位置上。
// - `setupAnim`（m_6973_）：头 yRot = 头偏、xRot = 头仰；f = cos(刻×5.5°)×0.1；右臂 zRot = 0.628 + f、左臂 −(0.628 + f)；冲锋时 身子 xRot = 0 并 `setArmsCharging`（主手有东西 → 右臂 xRot 3.665、yRot 0.262、zRot −0.471 − f，举剑过头），
//   不冲锋 身子 xRot = 0.157（前倾 9°）；翅膀 左 yRot = 1.0996 + cos(刻×45.84°)×16.2°，右 = −左，两片 xRot 0.471、zRot ∓0.471（拍翅约 0.4 秒一下）。
// - 手里的剑：召唤时 `Vex.populateDefaultEquipmentSlots` 给一把铁剑（主手）。`VexModel.translateToHand`：root、body、手臂依次变换，再 scale 0.55、平移 (±0.046875, −0.15625, 0.078125)；之后照 `ItemInHandLayer`（lib/物品贴图.tsx 的 `HeldItem`）+ 铁剑 item/handheld 第三人称变换。
// - 召唤（`SummonVexSpell.onCast`）：数量 = 法术等级 + 2，每只出生在施法者眼睛 + (±2, +1, ±2) 随机处，存在 12000 刻；没有出生特效（只有施法动作和声音 entity.evoker.prepare_summon → cast_spell，见 第7章素材预览.tsx 的音效表）。
//   到期（`onUnSummon`）原地放 25 个 poof（范围 0.4/0.8/0.4、速度 0.03）后消失；被打死是原版死亡（特效/原版死亡.tsx）。
// 坐标：原点在脚底中心，Z 朝上，正面朝 −Y（lib/实体模型.tsx）。
import React from 'react';
import { EntityModel, EntityModelData } from '../../engine/model/实体模型.tsx';
import { mthCos, restPose, toPartPoses } from '../../engine/anim/关键帧动画.ts';
import { DISPLAY, HeldItem, ItemSprite } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import { VanillaTopple } from '../特效/原版死亡.tsx';
import ironSwordPng from 'asset:贴图/物品/杂项物品/铁剑';
import raw from 'asset:模型/角色/恼鬼';
import texVex from 'asset:贴图/角色/恼鬼/恼鬼';
import texCharge from 'asset:贴图/角色/恼鬼/蓄力';

const MODEL = (raw as unknown as { models: { 恼鬼: EntityModelData } }).models.恼鬼;
const TEX = { normal: png(texVex), charging: png(texCharge) };
const DEG = Math.fround(0.017453292);

export const VEX = {
  box: [0.4, 0.8] as [number, number], // 碰撞箱 宽、高
  height: 0.72, // 头顶离脚底（模型）
  summonRange: { 水平: 2, 高: 1 }, // 出生在施法者眼睛 + (±2, +1, ±2)
  lifeTicks: 12000,
};

export type VexProps = {
  sec: number; // 游戏时间（秒），驱动手臂、翅膀摆动
  charging?: boolean; // isCharging：换冲锋贴图、举剑、身子不前倾
  holdSword?: boolean; // 主手的铁剑，默认 true（召唤出来就有）
  headYaw?: number; // 度
  headPitch?: number; // 度
  secSinceDeath?: number; // 给了就照原版倒下、变红（≥ 1 秒时实体已经没了，不画；白烟另放）
  hurt?: number; // 0～1：受伤变红（hurtTime > 0）
};

export const vexPose = (props: VexProps) => {
  const age = props.sec * 20;
  const pose = restPose(MODEL.root);
  const { head, body, right_arm, left_arm, left_wing, right_wing } = pose;
  head.rot[1] = Math.fround((props.headYaw ?? 0) * DEG);
  head.rot[0] = Math.fround((props.headPitch ?? 0) * DEG);
  const armSway = mthCos(age * 5.5 * DEG) * 0.1;
  right_arm.rot[2] = 0.62831855 + armSway;
  left_arm.rot[2] = -(0.62831855 + armSway);
  if (props.charging) {
    body.rot[0] = 0;
    if (props.holdSword ?? true) {
      right_arm.rot = [3.6651914, 0.2617994, -0.47123888 - armSway];
    } else {
      // 两手空着：setArmsCharging 的第一支（双手前伸）
      right_arm.rot = [-1.2217305, 0.2617994, -0.47123888 - armSway];
      left_arm.rot = [-1.2217305, -0.2617994, 0.47123888 + armSway];
    }
  } else {
    body.rot[0] = 0.15707964;
  }
  left_wing.rot = [0.47123888, 1.0995574 + mthCos(age * 45.836624 * DEG) * DEG * 16.2, -0.47123888];
  right_wing.rot = [0.47123888, -left_wing.rot[1], 0.47123888];
  return pose;
};

// 手里的铁剑：translateToHand 的 scale 0.55 + 平移（右手），再 ItemInHandLayer + handheld 第三人称（部件坐标是像素）
const Sword: React.FC = () => (
  <group scale={0.55}>
    <group position={[0.046875 * 16, -0.15625 * 16, 0.078125 * 16]}>
      <HeldItem t={DISPLAY.handheld.thirdperson_righthand}>
        <ItemSprite layers={[{ tex: png(ironSwordPng) }]} emissive={1} shadow={false} />
      </HeldItem>
    </group>
  </group>
);

export const Vex: React.FC<VexProps> = (props) => {
  if (props.secSinceDeath !== undefined && props.secSinceDeath >= 1) return null;
  const red = props.secSinceDeath !== undefined && props.secSinceDeath >= 0 ? 1 : (props.hurt ?? 0);
  return (
    <VanillaTopple secSinceDeath={props.secSinceDeath}>
      <EntityModel
        model={MODEL}
        tex={props.charging ? TEX.charging : TEX.normal}
        pose={toPartPoses(vexPose(props))}
        attach={(props.holdSword ?? true) ? { right_arm: <Sword /> } : undefined}
        hurt={red}
        // 全亮（getBlockLightLevel 15）；opacity 略小于 1 走半透明路径，翅膀那几块 alpha 160 的像素才是半透明的（entityTranslucent）
        mcLight={1}
        opacity={0.999}
      />
    </VanillaTopple>
  );
};
