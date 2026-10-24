// 史蒂夫：原版玩家模型（宽手臂 PlayerModel，带帽子、外套、袖子、裤子四层外层）+ 原版 steve.png，几何、贴图都是 jar 里的原样。
// 字节复用巨人那条取材（模型/角色/巨人 的「宽」、贴图/角色/巨人/史蒂夫，client 1.20.1 entity/player/wide/steve.png，64×64）。
// 依据（1.20.1 SRG 客户端 jar，javap 反汇编）：
// - PlayerRenderer.scale 整体 0.9375：站直头顶 1.875 格。潜行时 getRenderOffset 整个人往下 0.125 格（在缩放之前，脚会陷进地里约 2 像素，游戏里就这样）。
// - HumanoidModel.setupAnim：走路摆臂 cos(步×0.6662+π)×步幅、摆腿 cos(步×0.6662)×1.4×步幅；拿着东西（ArmPose.ITEM）那只手 xRot×0.5 − π/10；
//   潜行：身子 xRot 0.5、两臂 xRot +0.4，身子 y 3.2、头 y 4.2、两臂 y 5.2、两腿 y 12.2 z 4；最后两臂 bobModelPart 轻晃。外层各 copyFrom 对应部件。
// - LivingEntity.tickHeadTurn：头偏离身子超过 50° 时身子跟着转，头最多偏 50°；俯仰 ±90°。
// - 手里的东西：ItemInHandLayer（物品贴图.tsx 的 HeldItem）+ 物品模型的第三人称显示变换。
// 姿势用 骨架.tsx 的 FigurePose（再加 crouch），换算成原版部件的转角来画：关节角的正负、转身、扭转、前倾的含义都和 Figure 一样，
// 但转轴在原版的位置（手臂转轴离身子中线 5 像素、腿 1.9 像素）。潜行的几个部件各挪各的转轴，Figure 那种一棵刚体树摆不出来，所以不直接用 Figure。
// 玩家模型没有肘和膝：kneeR/kneeL/elbowR/elbowL 不起作用。
// 坐标同 骨架.tsx：原点在脚底中心，Z 朝上，朝向 +Y，右手在 +X，单位格。
import React from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';
import { EntityModel, type EntityModelData, MODEL_TO_ENTITY, type PartPose } from '../../engine/model/实体模型.tsx';
import { DISPLAY, HeldItem, type ItemTransform } from '../../engine/model/物品贴图.tsx';
import { type Png, png } from '../../engine/model/贴图.ts';
import { type FigurePose, standPose } from './骨架.tsx';
import raw from 'asset:模型/角色/巨人';
import skinImg from 'asset:贴图/角色/巨人/史蒂夫';

export const STEVE_MODEL = (raw as unknown as { models: { 宽: EntityModelData } }).models.宽;
export const STEVE_SKIN: Png = png(skinImg);

export const STEVE = {
  scale: 0.9375,
  height: 1.875, // 站直头顶离脚底（格）
  crouchHeight: 1.505, // 潜行头顶离脚底（含往下 0.125 格）
  eye: 1.62, // 眼高：站、潜行（Player 的 STANDING / CROUCHING 尺寸）
  eyeCrouch: 1.27,
  box: [0.6, 1.8] as [number, number],
  boxCrouch: [0.6, 1.5] as [number, number],
  headYawMax: 50,
  headPitchMax: 90,
  // 平地上的速度（米/秒）：原版移动速度 0.1、疾跑 ×1.3、潜行 ×0.3 推出来的
  speed: { walk: 4.317, sprint: 5.612, sneak: 1.295 },
  // 贴图取色，给碎屑、粒子、剪影用
  colors: { shirt: '#00afaf', pants: '#3a3189', skin: '#aa7259', hair: '#3f2a15', shoe: '#4a4a4a' },
};

/** FigurePose 再加潜行：0 站、1 原版潜行（游戏里一刻切过去，中间值按比例插，给过渡用） */
export type StevePose = FigurePose & { crouch?: number };

const DEG = 180 / Math.PI;
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 原版走路时的 limbSwing、limbSwingAmount（WalkAnimationState：目标 = min(1, 每刻水平位移 × 4)，每刻往目标靠 0.4，位置每刻加当前值）。
 *  speed 米/秒，sec 走了多久；fromRest 从站着起步（不给就是一直以这个速度在走） */
export const vanillaWalk = (speed: number, sec: number, fromRest = false) => {
  const target = Math.min(1, (Math.max(0, speed) / 20) * 4);
  const ticks = Math.max(0, sec) * 20;
  if (!fromRest) return { limbSwing: target * ticks, stride: target };
  // 从 0 起步：第 n 刻 步幅 = target·(1 − 0.6ⁿ)，位置是它的累加
  const k = 0.6 ** ticks;
  return { limbSwing: target * (ticks - (0.6 * (1 - k)) / 0.4), stride: target * (1 - k) };
};

export type SteveMotion = {
  sec?: number; // 游戏时间（秒）：两臂随时间轻晃（bobModelPart）；不给按 0
  limbSwing?: number; // 原版 limbSwing（见 vanillaWalk）
  stride?: number; // 原版 limbSwingAmount，0～1：走 0.86、疾跑 1、潜行走 0.26
  crouch?: number; // 0～1
  headYaw?: number; // 度，正 = 往左（同 FigurePose）
  headPitch?: number; // 度，负 = 低头（同 FigurePose）
  holdR?: boolean; // 右手拿着东西（ArmPose.ITEM）
  holdL?: boolean;
};

/** 原版 HumanoidModel.setupAnim 的姿势（不骑、不游泳、不鞘翅、不出手），换成 FigurePose。yaw：身子朝向（度，0 朝 +Y，正 = 往左）。
 *  潜行的身子、手臂多出来的转角和各部件下移在画的时候加（见 steveParts），这里的手臂角是潜行之前的 */
export const stevePose = (loc: V3, yaw: number, m: SteveMotion = {}): StevePose => {
  const ls = m.limbSwing ?? 0;
  const la = m.stride ?? 0;
  const age = (m.sec ?? 0) * 20;
  let rArm = Math.cos(ls * 0.6662 + Math.PI) * la;
  let lArm = Math.cos(ls * 0.6662) * la;
  if (m.holdR) rArm = rArm * 0.5 - Math.PI / 10;
  if (m.holdL) lArm = lArm * 0.5 - Math.PI / 10;
  const bobZ = Math.cos(age * 0.09) * 0.05 + 0.05;
  const bobX = Math.sin(age * 0.067) * 0.05;
  rArm += bobX;
  lArm -= bobX;
  const rLeg = Math.cos(ls * 0.6662) * 1.4 * la;
  const lLeg = Math.cos(ls * 0.6662 + Math.PI) * 1.4 * la;
  // 原版 xRot 正 = 往后摆，FigurePose 正 = 往前；右臂 zRot 正 = 往外张，FigurePose 的 roll 正 = 往里收
  return {
    ...standPose([...loc]),
    yaw,
    ground: 0, // 原版走路身子不起伏，脚离地
    headYaw: m.headYaw ?? 0,
    headPitch: m.headPitch ?? 0,
    armR: -rArm * DEG,
    armRRoll: -bobZ * DEG,
    armL: -lArm * DEG,
    armLRoll: -bobZ * DEG,
    legR: -rLeg * DEG,
    legL: -lLeg * DEG,
    crouch: m.crouch ?? 0,
  };
};

/** 看向 target（场景坐标）：从眼睛（站 1.62、潜行 1.27）算头的偏航和俯仰。头偏离身子超过 50° 时，turnBody 就照原版让身子跟着转过去，
 *  否则头停在 50°。只认 yaw、twist（头相对胸），不管整体前倾 pitch */
export const steveLookAt = (pose: StevePose, target: V3, turnBody = true): StevePose => {
  const c = clamp(pose.crouch ?? 0, 0, 1);
  const eye = STEVE.eye + (STEVE.eyeCrouch - STEVE.eye) * c;
  const [x, y, z] = pose.loc;
  const dx = target[0] - x;
  const dy = target[1] - y;
  const dz = target[2] - (z + eye);
  let yaw = pose.yaw ?? 0;
  let rel = wrap180(Math.atan2(-dx, dy) * DEG - yaw - (pose.twist ?? 0));
  if (Math.abs(rel) > STEVE.headYawMax) {
    const lim = Math.sign(rel) * STEVE.headYawMax;
    if (turnBody) yaw += rel - lim;
    rel = lim;
  }
  const pitch = clamp(Math.atan2(dz, Math.hypot(dx, dy)) * DEG, -STEVE.headPitchMax, STEVE.headPitchMax);
  return { ...pose, yaw, headYaw: rel, headPitch: pitch };
};

// ---------- FigurePose → 原版部件 ----------

// 槽坐标（骨架.tsx 的关节坐标：X 右、Y 前、Z 上）和原版模型空间（x 左、y 下、z 后）互换：X = −x、Y = −z、Z = −y。这个矩阵自己就是自己的逆
const SLOT_TO_MODEL = new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, -1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
const rotX = (deg: number) => new THREE.Matrix4().makeRotationX(rad(deg));
const rotY = (deg: number) => new THREE.Matrix4().makeRotationY(rad(deg));
const rotZ = (deg: number) => new THREE.Matrix4().makeRotationZ(rad(deg));
const chain = (...ms: THREE.Matrix4[]) => ms.reduce((acc, m) => acc.multiply(m), new THREE.Matrix4());
// 槽坐标里的转动 → 原版 ModelPart 的 xRot、yRot、zRot（按 Z·Y·X 的顺序转）；extraX：在最里层再加的 xRot（潜行）
const toPart = (slotRot: THREE.Matrix4, extraX = 0) => {
  const m = chain(SLOT_TO_MODEL, slotRot, SLOT_TO_MODEL);
  if (extraX) m.multiply(new THREE.Matrix4().makeRotationX(extraX));
  const e = new THREE.Euler().setFromRotationMatrix(m, 'ZYX');
  return [e.x, e.y, e.z];
};
// 关节转动，同 骨架.tsx 的 joint：先抬（绕 X）再 roll（绕 Y），最外层绕竖轴
const jointRot = (angle: number, roll: number, yaw = 0) => chain(rotZ(yaw), rotY(roll), rotX(angle));

/** 原版各部件的 PartPose（模型空间：像素、y 朝下、正面 −z、转角弧度），外层跟着本体；EntityModel 直接吃 */
export const steveParts = (pose: StevePose): Record<string, PartPose> => {
  const c = clamp(pose.crouch ?? 0, 0, 1);
  const twist = pose.twist ?? 0;
  const head = { rot: toPart(chain(rotZ(twist), rotZ(pose.headYaw), rotX(pose.headPitch))), offset: [0, 4.2 * c, 0] };
  const body = { rot: toPart(rotZ(twist), 0.5 * c), offset: [0, 3.2 * c, 0] };
  // 胸扭转时两肩跟着绕身子中线转（同原版出手时的 body.yRot）
  const shoulder = (x: number) => {
    const p = new THREE.Vector3(x, 0, 0).applyMatrix4(chain(SLOT_TO_MODEL, rotZ(twist), SLOT_TO_MODEL));
    return [p.x, 2 + 3.2 * c, p.z];
  };
  const armR = { rot: toPart(chain(rotZ(twist), jointRot(pose.armR, pose.armRRoll, pose.armRYaw ?? 0)), 0.4 * c), offset: shoulder(-5) };
  const armL = { rot: toPart(chain(rotZ(twist), jointRot(pose.armL, -pose.armLRoll, pose.armLYaw ?? 0)), 0.4 * c), offset: shoulder(5) };
  const legR = { rot: toPart(jointRot(pose.legR, pose.legRRoll ?? 0, -(pose.legRYaw ?? 0))), offset: [-1.9, 12 + 0.2 * c, 4 * c] };
  const legL = { rot: toPart(jointRot(pose.legL, -(pose.legLRoll ?? 0), pose.legLYaw ?? 0)), offset: [1.9, 12 + 0.2 * c, 4 * c] };
  return {
    head,
    hat: head,
    body,
    jacket: body,
    right_arm: armR,
    right_sleeve: armR,
    left_arm: armL,
    left_sleeve: armL,
    right_leg: legR,
    right_pants: legR,
    left_leg: legL,
    left_pants: legL,
    ear: { hide: true },
    cloak: { hide: true },
  };
};

// 髋离地高度（像素），同 骨架.tsx 的 hipHeight（玩家模型没有膝）
const hipHeight = (pose: StevePose) => {
  const reach = (a: number) => 12 * Math.cos(rad(a + pose.pitch));
  const grounded = Math.max(3, reach(pose.legR), reach(pose.legL));
  return 12 + (pose.ground ?? 1) * (grounded - 12);
};

/** EntityModel 外面那一层：落脚点、转身、潜行下移、0.9375 倍、以髋为轴前倾和压扁（同 Figure），再把 EntityModel 的正面 −Y 转成 +Y */
export const steveRootMatrix = (pose: StevePose) => {
  const c = clamp(pose.crouch ?? 0, 0, 1);
  const [x, y, z] = pose.loc;
  const hip = hipHeight(pose);
  return chain(
    new THREE.Matrix4().makeTranslation(x, y, z - 0.125 * c),
    rotZ(pose.yaw ?? 0),
    new THREE.Matrix4().makeScale(STEVE.scale / 16, STEVE.scale / 16, STEVE.scale / 16),
    new THREE.Matrix4().makeTranslation(0, 0, hip * pose.squash),
    rotX(pose.pitch),
    new THREE.Matrix4().makeScale(1, 1, pose.squash),
    new THREE.Matrix4().makeTranslation(0, 0, -12),
    new THREE.Matrix4().makeRotationZ(Math.PI),
    new THREE.Matrix4().makeScale(16, 16, 16),
  );
};

/** 手里物品的物品坐标（中心在原点，见 物品贴图.tsx）在世界里的变换：和画的时候同一串（EntityModel → 手臂部件 → HeldItem → 显示变换）。
 *  取它的原点就是物品中心的世界位置（递东西、对齐别的东西用）。display 不给按 item/generated 的第三人称 */
export const steveHeldItemMatrix = (pose: StevePose, hand: 'R' | 'L' = 'R', display: ItemTransform = DISPLAY.generated.thirdperson_righthand) => {
  const part = steveParts(pose)[hand === 'R' ? 'right_arm' : 'left_arm'] as Required<Pick<PartPose, 'rot' | 'offset'>>;
  const left = hand === 'L';
  const [rx, ry, rz] = display.rotation ?? [0, 0, 0];
  const [tx, ty, tz] = display.translation ?? [0, 0, 0];
  const [sx, sy, sz] = display.scale ?? [1, 1, 1];
  return chain(
    steveRootMatrix(pose),
    new THREE.Matrix4().makeTranslation(0, 0, 1.501),
    MODEL_TO_ENTITY,
    new THREE.Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16),
    new THREE.Matrix4().makeTranslation(part.offset[0], part.offset[1], part.offset[2]),
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(part.rot[0], part.rot[1], part.rot[2], 'ZYX')),
    new THREE.Matrix4().makeScale(16, 16, 16),
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rad(-90), rad(180), 0, 'XYZ')),
    new THREE.Matrix4().makeTranslation((left ? -1 : 1) / 16, 0.125, -0.625),
    new THREE.Matrix4().makeTranslation(((left ? -1 : 1) * tx) / 16, ty / 16, tz / 16),
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rad(rx), rad(left ? -ry : ry), rad(left ? -rz : rz), 'XYZ')),
    new THREE.Matrix4().makeScale(sx, sy, sz),
  );
};
export const steveHeldItemPosition = (pose: StevePose, hand: 'R' | 'L' = 'R', display?: ItemTransform): V3 => {
  const p = new THREE.Vector3().applyMatrix4(steveHeldItemMatrix(pose, hand, display));
  return [p.x, p.y, p.z];
};

/** handR / handL：手里的物品（物品坐标，比如 <ItemSprite/>），照 ItemInHandLayer 挂到手上；displayR / displayL：物品模型的第三人称显示变换，
 *  不给按 item/generated（蛋糕、树苗这类平面物品；剑、镐这类用 DISPLAY.handheld）。拿着东西时手臂姿势用 stevePose 的 holdR / holdL。
 *  skin：换皮肤（宽手臂的 64×64）；mcLight：给了就照原版实体光照画、不受场景光（见 实体模型.tsx），值是亮度 0～1；opacity、hurt 同 EntityModel */
export const Steve: React.FC<{
  pose: StevePose;
  handR?: React.ReactNode;
  handL?: React.ReactNode;
  displayR?: ItemTransform;
  displayL?: ItemTransform;
  skin?: Png;
  mcLight?: number;
  opacity?: number;
  hurt?: number;
}> = ({ pose, handR, handL, displayR = DISPLAY.generated.thirdperson_righthand, displayL = DISPLAY.generated.thirdperson_righthand, skin = STEVE_SKIN, mcLight, opacity, hurt }) => {
  const attach: Record<string, React.ReactNode> = {};
  if (handR) attach.right_arm = <HeldItem t={displayR}>{handR}</HeldItem>;
  if (handL)
    attach.left_arm = (
      <HeldItem t={displayL} left>
        {handL}
      </HeldItem>
    );
  return (
    <group matrix={steveRootMatrix(pose)} matrixAutoUpdate={false}>
      <EntityModel model={STEVE_MODEL} tex={skin} pose={steveParts(pose)} attach={attach} mcLight={mcLight} opacity={opacity} hurt={hurt} />
    </group>
  );
};
