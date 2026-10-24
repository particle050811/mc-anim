// 僵尸：原版模型和贴图（取材配方「僵尸」：ModelLayers.ZOMBIE = HumanoidModel.createMesh，entity/zombie/zombie.png）。
// 依据（1.20.1 SRG 客户端 jar，javap 反汇编）：
// - 几何：头 8×8×8 和膨胀 0.5 的帽子层（转轴 y 0）、身 8×12×4、两臂 4×12×4（转轴 x ∓5、y 2）、两腿 4×12×4（转轴 x ∓1.9、y 12），左臂左腿镜像，贴图 64×64。
//   ZombieRenderer 不另缩放（玩家才有 0.9375），头顶 2 格。
// - setupAnim（AbstractZombieModel → HumanoidModel.setupAnim 后再 AnimationUtils.animateZombieArms，m_102102_）：
//   两臂 xRot = −π / (追人 ? 1.5 : 2.25) + sin(出手·π)×1.2 − sin((1 − (1 − 出手)²)·π)×0.4，yRot 右 −(0.1 − sin(出手·π)×0.6)、左取反，zRot 0，
//   再 bobArms：右臂 zRot += cos(年龄×0.09)×0.05 + 0.05、xRot += sin(年龄×0.067)×0.05，左臂两项取反。走路不摆臂（举着的臂整个被上面盖掉）。
//   两腿 xRot = cos(步×0.6662 [+π])×1.4×步幅，yRot、zRot 右 +0.005、左 −0.005；头 yRot = 头偏、xRot = 头仰；帽子层跟头。
// - 眼高 1.74；头偏离身子最多 75°（Mob.getMaxHeadYRot）。移动速度属性 0.23，平地每刻位移同 苦力怕.tsx 的式子：闲逛、追人的倍率都是 1.0。
// 坐标同 骨架.tsx：原点在脚底中心，Z 朝上，朝向 +Y，单位格（EntityModel 本身朝 −Y，这里转过来）。
import React from 'react';
import { rad } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';
import { EntityModel, type EntityModelData, type PartPose } from '../../engine/model/实体模型.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/角色/僵尸';
import texImg from 'asset:贴图/角色/僵尸';

const MODEL = (raw as unknown as { models: { 僵尸: EntityModelData } }).models.僵尸;
const TEX = png(texImg);

const groundSpeed = (mult: number) => Math.round((((mult * 0.23) ** 2 * 0.98) / (1 - 0.6 * 0.91)) * 20 * 1000) / 1000;
export const ZOMBIE = {
  height: 2, // 头顶离脚底（格）
  box: [0.6, 1.95] as [number, number],
  eye: 1.74,
  headYawMax: 75,
  headPitchMax: 90,
  // 平地上的速度（米/秒）
  speed: { wander: groundSpeed(1.0), chase: groundSpeed(1.0) },
};

/** loc：脚底；yaw：身子朝向（度，0 朝 +Y，正 = 往左）；limbSwing、stride：原版走路（库/角色/史蒂夫.tsx 的 vanillaWalk 能从速度算）；
 *  headYaw：头相对身子（度，正 = 往左）；headPitch：度，负 = 低头；aggressive：有目标（追人时两臂举得更平）；attackTime：出手进度 0～1；sec：年龄（秒，两臂轻晃） */
export type ZombiePose = {
  loc: V3;
  yaw?: number;
  limbSwing?: number;
  stride?: number;
  headYaw?: number;
  headPitch?: number;
  aggressive?: boolean;
  attackTime?: number;
  sec?: number;
};

/** 原版各部件的 PartPose（模型空间，转角弧度） */
export const zombieParts = (p: ZombiePose): Record<string, PartPose> => {
  const ls = p.limbSwing ?? 0;
  const la = p.stride ?? 0;
  const at = p.attackTime ?? 0;
  const age = (p.sec ?? 0) * 20;
  const f = Math.sin(at * Math.PI);
  const f1 = Math.sin((1 - (1 - at) * (1 - at)) * Math.PI);
  const armX = -Math.PI / (p.aggressive ? 1.5 : 2.25) + f * 1.2 - f1 * 0.4;
  const bobZ = Math.cos(age * 0.09) * 0.05 + 0.05;
  const bobX = Math.sin(age * 0.067) * 0.05;
  // 原版 yRot 正 = 往右、xRot 正 = 低头，和这里的约定相反
  const head = { rot: [-rad(p.headPitch ?? 0), -rad(p.headYaw ?? 0), 0] };
  return {
    head,
    hat: head,
    right_arm: { rot: [armX + bobX, -(0.1 - f * 0.6), bobZ] },
    left_arm: { rot: [armX - bobX, 0.1 - f * 0.6, -bobZ] },
    right_leg: { rot: [Math.cos(ls * 0.6662) * 1.4 * la, 0.005, 0.005] },
    left_leg: { rot: [Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la, -0.005, -0.005] },
  };
};

const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const DEG = 180 / Math.PI;

/** 看向 target（场景坐标）：从眼睛（1.74 格）算头的偏航和俯仰。头偏离身子超过 75° 时，turnBody 就让身子跟着转过去，否则头停在 75° */
export const zombieLookAt = (pose: ZombiePose, target: V3, turnBody = true): ZombiePose => {
  const [x, y, z] = pose.loc;
  const dx = target[0] - x;
  const dy = target[1] - y;
  const dz = target[2] - (z + ZOMBIE.eye);
  let yaw = pose.yaw ?? 0;
  let rel = wrap180(Math.atan2(-dx, dy) * DEG - yaw);
  if (Math.abs(rel) > ZOMBIE.headYawMax) {
    const lim = Math.sign(rel) * ZOMBIE.headYawMax;
    if (turnBody) yaw += rel - lim;
    rel = lim;
  }
  const pitch = Math.min(ZOMBIE.headPitchMax, Math.max(-ZOMBIE.headPitchMax, Math.atan2(dz, Math.hypot(dx, dy)) * DEG));
  return { ...pose, yaw, headYaw: rel, headPitch: pitch };
};

/** mcLight、opacity、hurt 同 苦力怕.tsx 的 Creeper（三渲二镜头里不传 mcLight）。
 *  坑：没做 UV 内收，开多重采样抗锯齿的画布里轮廓会冒出贴图相邻格子的颜色，只放进不开抗锯齿的画布 */
export const Zombie: React.FC<{ pose: ZombiePose; mcLight?: number; opacity?: number; hurt?: number }> = ({ pose, mcLight, opacity, hurt }) => (
  <group position={pose.loc} rotation={[0, 0, rad(pose.yaw ?? 0) + Math.PI]}>
    <EntityModel model={MODEL} tex={TEX} pose={zombieParts(pose)} mcLight={mcLight} opacity={opacity} hurt={hurt} />
  </group>
);
