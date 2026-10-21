// 雪怪首领（暮色森林 1.20.1-4.3.2508 的 `AlphaYeti`，雪怪洞窟 boss）：模型、贴图、动作照抄 mod jar（npm run 取材 -- 雪怪首领）。依据（javap 反汇编）：
// - 渲染器：`TFClientSetup` 里是 `TFBipedRenderer`(`AlphaYetiModel`(层 ALPHA_YETI), 影子 1.75, "yetialpha.png")，没有缩放，模型本身按大个子搭。贴图 yetialpha.png（256×128）。
// - `AlphaYetiModel.create()`：头和帽子是 0 尺寸（不画），脸长在身子正面：身子 48×72×36 像素，正面挂嘴（34×29×2）和两只眼（12×12×2）；
//   左右各三对角（`addPairHorns`：根 10³、尖 18×8×8，斜 35°/15°/-5°）；手臂 16×48×16；腿 20×20×20。脚底到身子顶 90 像素 = 5.6 格（碰撞箱 3.8×5.0）。
//   左右角的名字和位置照 mod 原样（left_horn 在 -x、z=-8，right_horn 在 +x、z=0，不对称也照抄）。
// - `AlphaYetiModel.setupAnim`（不调父类，全部自己算）：
//   平常：两手往前平伸（xRot -90°），yRot ∓0.1，手随时间轻晃（zRot ±(cos(刻×0.09)×0.05+0.05)、xRot ±sin(刻×0.067)×0.05）；
//         攻击 attackTime：f7 = sin(t·π)、f8 = sin((1-(1-t)²)·π)，手 yRot 往里收 f7×0.6、xRot 再减 f7×1.2-f8×0.4（双手往下砸）；
//         腿按走路摆 cos(步×0.6662)×1.4×步幅；视线俯仰同时转头和身子（body.xRot = headPitch，头是空的，看上去整个身子前后倾）。
//   疲惫（isTired）：身子下沉 12 像素（body.y 6）、腿抬起 -72° 并外撇 ±18°（leg.y 12），手垂着随走路摆再往前 36°。
//   暴走（isRampaging）：两手举过头顶往后（xRot +225°）并随步子左右甩（yRot ±(cos(步×0.25)×0.5+0.5)），腿照常走。
//   举人（isVehicle）：手的 xRot 再加 180°（变成往身后平伸）；被举的玩家脚底在雪怪脚底上方 5.75-0.35 = 5.4 格、往正前方 0.4 格；
//         它同时抬头盯着这个人，身子往后仰约 82°（头仰不给时按这个算）。
// - 渲染层：不显示头饰、鞘翅、手持物品层，`ShieldLayer`、`IceLayer` 平时不显示；没有发光层、半透明层。
//   没做的：暴走时身边绕圈的 SNOW 雪花粒子、疲惫时每刻 20 个粒子；扔的冰块（`IceBomb`）和暴走震落的冰柱（`FallingIce`）是别的实体。
// 坐标：原点在脚底中心，Z 朝上，正面朝 -Y（和 贴图方盒.tsx、巫妖.tsx 一样），单位格。
import React from 'react';
import { EntityModel, EntityModelData } from '../../engine/model/实体模型.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/角色/雪怪首领';
import skin from 'asset:贴图/角色/雪怪首领';

const MODEL = (raw as unknown as { models: Record<string, EntityModelData> }).models.雪怪首领;
const TEX = png(skin);

export const ALPHA_YETI = {
  height: 5.63, // 身子顶离脚底（90 像素；角尖还要再高一点）
  chest: 3.4,
  hitbox: [3.8, 5.0],
  riderZ: 5.4, // 举人时被举的人（玩家）的脚底高度（5.75 - 0.35）
  debris: ['#f4f4f4', '#d0d0d0', '#4a78c0', '#2a4878'], // 碎屑配色（取自贴图：白毛、蓝色的嘴和角）
};

export type AlphaYetiState = '平常' | '疲惫' | '暴走' | '举人';

// 秒：游戏时间（手轻晃）；步 / 步幅：走路的相位和幅度（游戏的 limbSwing / limbSwingAmount，步幅 0～1；站着不动给 0）；
// 攻击：0～1（attackTime，双手往下砸的那一下）；状态：见上；头偏 / 头仰：视线角（弧度，模型空间约定，头仰正 = 往下看，身子跟着前倾）
export const alphaYetiPose = (sec: number, opts: { limbSwing?: number; stride?: number; attack?: number; state?: AlphaYetiState; headYaw?: number; headPitch?: number } = {}) => {
  const age = sec * 20;
  const ls = opts.limbSwing ?? 0;
  const la = opts.stride ?? 0;
  const t = opts.attack ?? 0;
  // 举人时游戏里它一直盯着头顶上的人（`aiStep`：setLookAt(乘客)），俯仰不限幅，身子往后仰：人的眼睛在脚底上方 7.02 格、往前 0.4 格，雪怪眼睛 4.25 格 → 仰 atan2(2.77, 0.4) = 82°
  const pitch = opts.headPitch ?? (opts.state === '举人' ? -Math.atan2(7.02 - 4.25, 0.4) : 0);
  const PI = Math.PI;
  const f7 = Math.sin(t * PI);
  const f8 = Math.sin((1 - (1 - t) * (1 - t)) * PI);
  const bz = Math.cos(age * 0.09) * 0.05 + 0.05;
  const bx = Math.sin(age * 0.067) * 0.05;
  const rightArm = { x: -PI / 2 - (f7 * 1.2 - f8 * 0.4) + bx, y: -(0.1 - f7 * 0.6), z: bz };
  const leftArm = { x: -PI / 2 - (f7 * 1.2 - f8 * 0.4) - bx, y: 0.1 - f7 * 0.6, z: -bz };
  const rl = { x: Math.cos(ls * 0.6662) * 1.4 * la, y: 0 };
  const ll = { x: Math.cos(ls * 0.6662 + PI) * 1.4 * la, y: 0 };
  let bodyY = -6;
  let legY = 4;
  if (opts.state === '疲惫') {
    rightArm.x = Math.cos(ls * 0.6662 + PI) * 2 * la * 0.5 - 0.62831855;
    leftArm.x = Math.cos(ls * 0.6662) * 2 * la * 0.5 - 0.62831855;
    rightArm.z = 0;
    leftArm.z = 0;
    rl.x = -1.2566371;
    ll.x = -1.2566371;
    rl.y = 0.31415927;
    ll.y = -0.31415927;
    bodyY = 6;
    legY = 12;
  }
  if (opts.state === '暴走') {
    const sw = Math.cos(ls * 0.25) * 0.5 + 0.5;
    rightArm.x = Math.cos(ls * 0.66 + PI) * 2 * la * 0.5 + 3.9269908169872414;
    leftArm.x = Math.cos(ls * 0.66) * 2 * la * 0.5 + 3.9269908169872414;
    rightArm.y += sw;
    leftArm.y -= sw;
    rightArm.z = 0;
    leftArm.z = 0;
  }
  if (opts.state === '举人') {
    rightArm.x += PI;
    leftArm.x += PI;
  }
  return {
    head: { rot: [pitch, opts.headYaw ?? 0, 0] },
    body: { rot: [pitch, 0, 0], offset: [0, bodyY, 0] },
    right_arm: { rot: [rightArm.x, rightArm.y, rightArm.z] },
    left_arm: { rot: [leftArm.x, leftArm.y, leftArm.z] },
    right_leg: { rot: [rl.x, rl.y, 0], offset: [-13.5, legY, 0] },
    left_leg: { rot: [ll.x, ll.y, 0], offset: [13.5, legY, 0] },
  };
};

export const AlphaYeti: React.FC<{
  sec: number;
  limbSwing?: number;
  stride?: number;
  attack?: number;
  state?: AlphaYetiState;
  headYaw?: number;
  headPitch?: number;
  opacity?: number;
  hitFlash?: number;
  hurt?: number; // 原版受伤 / 死亡时的变红（0～1，同巫妖）
}> = ({ sec: sec, opacity = 1, hitFlash = 0, hurt: hurt = 0, ...poseOpts }) => (
  <EntityModel model={MODEL} tex={TEX} pose={alphaYetiPose(sec, poseOpts)} opacity={opacity} emissive={Math.round(hitFlash * 10) / 10} hurt={hurt} />
);
