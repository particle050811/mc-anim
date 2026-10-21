// 边城卫兵：城墙上举着望远镜往下看的机动族方块人士兵（原文第 6 章「在边城的城墙上，已经出现了不少卫兵在巡视着城墙下方，每个人都配备了望远镜」）。
// 外形（用户 10-02 要定外形；原文没写边城卫兵穿什么，只在第 1 章写机动族王城里的人「身着相同纹饰盔甲」，所以定为一整套统一、游戏里做得出来的装备）：
// - 一整套附魔钻石盔甲（头盔、胸甲、护腿、靴子），带原版附魔光泽（紫色流光，见 lib/实体模型.tsx 的 `GLINT`；用户 10-12 定，不用蓝皮甲）。每件加同一种纹饰「哨兵」（sentry，出自掠夺者前哨站，像守卫），材料用金；
// - 背后一件同色披风：外面是蓝底旗帜（黄色圆形 + 黄色边框，原版旗帜图案），城防部队一眼看得出是一伙；
// - 原版玩家体型（PlayerModel 宽手臂，缩放 0.9375，身高 1.875 格），皮肤用原版默认皮肤（`号` 换脸）；手里拿望远镜。
// 贴图由 npm run 取材 -- 边城贴图（工具/游戏取材/边城贴图.py）从 1.20.1 客户端 jar 合成：钻石甲 = 钻石盔甲贴图 + 纹饰（灰度按 trim_palette → gold 调色板换色，同 HumanoidArmorLayer）；附魔光泽 = enchanted_glint_entity 原图。
// 依据：
// - 模型：和 巨人.tsx 同一份数据（巨人.模型.json 的「宽」= PlayerModel，「外甲」「内甲」= 盔甲层）。头盔、胸甲、靴子画外层（钻石甲1），护腿画内层的身子和两腿（钻石甲2）。
// - 披风：PlayerModel 的 cloak 方盒（-5, 0, -1 起，10×16×1，贴图 0,0），原版按 64×32 贴图算 uv（addBox 的 texScale 1×0.5），导出数据没有这个缩放，所以单独写一份 64×32 的方盒。摆法照 CapeLayer（站着时）：往后 0.125 格、绕 X 转 6°、绕 Y 转 180°；1.20.1 的 CapeLayer 不管胸甲会插进胸甲，这里再往后挪 1 像素。
// - 举镜照 HumanoidModel.poseRightArm 的 SPYGLASS：右臂 xRot = 头.xRot − 1.9198622、yRot = 头.yRot − 0.2617994；望远镜目镜贴右眼（物品/望远镜.tsx）。放下就是右臂垂手。
//   原版右臂 xRot 夹在 ≥ −2.4、镜筒用的头 xRot 夹在 ≥ −30°（仰头超过约 30° 两样都停住）；卫兵要仰着看天上的李樱、镜中视角沿视线，所以都不夹，手和镜筒跟着头。
//   望远镜：原版没在用时是普通手持物（ItemInHandLayer），用的时候才挂到头上（见 `spyglassMatrix`）；举镜过程中两种摆法平滑过渡，一抬手就在手里（用户 10-15 定）。
// - 手臂、腿的其余动作照 巨人.tsx 的 `giantPose`（HumanoidModel.setupAnim：手随时间轻晃）。
// 坐标：原点在脚底中心，Z 朝上，正面朝 -Y（和 巨人.tsx、贴图方盒.tsx 一样），单位格。朝向用外面的 group 转。
import React from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import { EntityModel, EntityModelData, MODEL_TO_ENTITY, PartPose } from '../../engine/model/实体模型.tsx';
import { Png, pngDir } from '../../engine/model/贴图.ts';
import { Spyglass } from '../物品/望远镜.tsx';
import raw from 'asset:模型/角色/巨人';
import { giantPose } from './巨人.tsx';
import { 资产目录 } from '../../engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/角色/卫兵/披风';
import 资_1 from 'asset:贴图/角色/卫兵/皮肤0-kai';
import 资_2 from 'asset:贴图/角色/卫兵/皮肤1-noor';
import 资_3 from 'asset:贴图/角色/卫兵/皮肤2-efe';
import 资_4 from 'asset:贴图/角色/卫兵/皮肤3-makena';
import 资_5 from 'asset:贴图/角色/卫兵/皮肤4-sunny';
import 资_6 from 'asset:贴图/角色/卫兵/皮肤5-ari';
import 资_7 from 'asset:贴图/角色/卫兵/皮肤6-zuri';
import 资_8 from 'asset:贴图/角色/卫兵/皮肤7-alex';
import 资_9 from 'asset:贴图/角色/卫兵/皮肤8-steve';
import 资_10 from 'asset:贴图/角色/卫兵/钻石甲1';
import 资_11 from 'asset:贴图/角色/卫兵/钻石甲2';
import 资_12 from 'asset:贴图/角色/卫兵/附魔光泽';

const MODELS = (raw as unknown as { models: Record<'宽' | '细' | '内甲' | '外甲', EntityModelData> }).models;
const TEX = pngDir(资产目录({ './披风.png': 资_0, './皮肤0-kai.png': 资_1, './皮肤1-noor.png': 资_2, './皮肤2-efe.png': 资_3, './皮肤3-makena.png': 资_4, './皮肤4-sunny.png': 资_5, './皮肤5-ari.png': 资_6, './皮肤6-zuri.png': 资_7, './皮肤7-alex.png': 资_8, './皮肤8-steve.png': 资_9, './钻石甲1.png': 资_10, './钻石甲2.png': 资_11, './附魔光泽.png': 资_12 })) as Record<string, Png>;
// 皮肤：文件名 皮肤<号>-<原版皮肤名>，按号排
const SKINS = Object.keys(TEX)
  .filter((k) => k.startsWith('皮肤'))
  .sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)))
  .map((k) => TEX[k]);
export const GUARD = { scale: 0.9375, height: 1.875, eye: 1.62, skinCount: SKINS.length };

const CAPE: EntityModelData = {
  texSize: [64, 32],
  root: {
    name: 'root',
    pose: { offset: [0, 0, 0], rot: [0, 0, 0] },
    cubes: [],
    children: [{ name: 'cloak', pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [{ uv: [0, 0], from: [-5, 0, -1], size: [10, 16, 1], grow: [0, 0, 0], mirror: false }], children: [] }],
  },
};
// CapeLayer：先平移再 X 6°、Y 180°（R = Rx·Ry）；部件按 Z·Y·X 的顺序转（R = Ry·Rx），Ry(π)·Rx(−6°) = Rx(6°)·Ry(π)。摆法在 Guard 里（跑动、蹲下时往后扬）

// 望远镜的两种摆法（模型空间：像素、y 朝下、正面 -z、实体右手边是 -x；部件按 ModelPart.translateAndRotate），乘到 方块模型 坐标（格）上：
// - 手持：ItemInHandLayer.renderArmWithItem——右臂坐标里绕 X 转 -90°、绕 Y 转 180°，平移 (1/16, 2/16, -10/16)，再套 spyglass_in_hand 的 thirdperson_righthand（translation [0,-2,0]）；
// - 用镜：PlayerItemInHandLayer.renderArmWithSpyglass——头坐标里 CustomHeadLayer.translateToHead，往右手一侧 2.5/16、往上 1/16，再套 head 显示（translation [0,0,-16]、rotation [90,0,0]、scale 1.6）。
//   乘出来目镜（细的那节）端面贴右眼 (-1.5625, -3.375, -4.5)，物镜顺着视线朝前到 z = -15.6。
// 方块模型坐标（Z 朝上、北 = +Y）转回原版物品空间（y 朝上）是绕 X 转 -90°。
const mat = (...ms: THREE.Matrix4[]) => ms.reduce((a, b) => a.multiply(b), new THREE.Matrix4());
const tr = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const rotX = (a: number) => new THREE.Matrix4().makeRotationX(a);
const rotY = (a: number) => new THREE.Matrix4().makeRotationY(a);
const ITEM_FROM_BLOCK = rotX(-Math.PI / 2);
const SPYGLASS_IN_HAND = mat(new THREE.Matrix4().makeScale(16, 16, 16), rotX(-Math.PI / 2), rotY(Math.PI), tr(1 / 16, 2 / 16, -10 / 16), tr(0, -2 / 16, 0), ITEM_FROM_BLOCK);
const SPYGLASS_ON_HEAD = mat(
  new THREE.Matrix4().makeScale(16, 16, 16),
  tr(0, -0.25, 0), rotY(Math.PI), new THREE.Matrix4().makeScale(0.625, -0.625, -0.625), tr(2.5 / 16, -1 / 16, 0),
  tr(0, 0, -1), rotX(Math.PI / 2), new THREE.Matrix4().makeScale(1.6, 1.6, 1.6), ITEM_FROM_BLOCK,
);
const partMatrix = (p: PartPose, defaultOffset: number[]) => {
  const [x, y, z] = p.offset ?? defaultOffset;
  const r = p.rot ?? [0, 0, 0];
  return mat(tr(x, y, z), new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0], r[1], r[2], 'ZYX')));
};
// 举镜 k 时望远镜的摆法：k 到 0.5 以前就是手持（跟着手臂抬），0.5～1 从手里平滑挪到眼前（位置插值、朝向球面插值），1 时正好是原版用镜的摆法；放下倒过来
const spyglassMatrix = (pose: Record<string, PartPose>, k: number) => {
  const inHand = mat(partMatrix(pose.right_arm, [-5, 2, 0]), SPYGLASS_IN_HAND);
  const onHead = mat(partMatrix(pose.head, [0, 0, 0]), SPYGLASS_ON_HEAD);
  const blend = Math.min(1, Math.max(0, (k - 0.5) / 0.5));
  const b = blend * blend * (3 - 2 * blend);
  const [p0, p1] = [new THREE.Vector3(), new THREE.Vector3()];
  const [q0, q1] = [new THREE.Quaternion(), new THREE.Quaternion()];
  const unused = new THREE.Vector3();
  inHand.decompose(p0, q0, unused);
  onHead.decompose(p1, q1, unused);
  return new THREE.Matrix4().compose(p0.lerp(p1, b), q0.slerp(q1, b), new THREE.Vector3(16, 16, 16));
};

// 右臂坐标系（模型空间：像素、y 朝下沿手臂往下、正面 -z、实体右手边是 -x；手臂方盒 x −3..1、y −2..10、z −2..2，外面胸甲的袖子每边再凸 1）
// 在卫兵本地坐标（格，脚底原点、Z 朝上、正面 -Y，没蹲）里的变换。rot：右臂的 xRot、yRot、zRot（弧度），同 `Guard` 的 rightArm
export const guardRightArmMatrix = (rot: number[]) =>
  mat(new THREE.Matrix4().makeScale(GUARD.scale, GUARD.scale, GUARD.scale), tr(0, 0, 1.501), MODEL_TO_ENTITY.clone(), new THREE.Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16), partMatrix({ rot }, [-5, 2, 0]));
// 不举镜时右臂的转角（HumanoidModel 的晃手，同 `Guard`）
export const guardRestArm = (sec: number): number[] => giantPose(sec).right_arm.rot ?? [0, 0, 0];

// 秒：时间（手轻晃）；头仰：低头多少度（正 = 往下看）；头偏：头相对身子往左转多少度；举镜：0 垂手 → 1 望远镜贴在眼前；号：第几张皮肤（换脸，不给是 0）
// 拿镜：举镜时手里有没有望远镜（默认有；7-4-3 借举镜的抬手去接书，不拿）。举镜 0 时不画望远镜（收着）
// 光泽秒：附魔光泽滚动用的时钟，不给 = 秒。游戏里所有附魔光泽按同一个系统时间滚、相位一样，所以几个卫兵要传同一个时钟（秒 里各错开了一点，不能用）
// 步 / 步幅：跑动（HumanoidModel 的 limbSwing / limbSwingAmount，同 巨人.tsx 的 giantPose；疾跑时步幅 1，步每刻加 1）。
// 蹲：0～1，潜行（6-3-8 卫兵走到走道内沿蹲下探身看坑）。照 1.20.1 HumanoidModel.setupAnim 的 crouching：身子 xRot 0.5、两臂 xRot +0.4、两腿往后挪到 z 4、往下到 y 12.2，头 y 4.2、身子 y 3.2、两臂 y 5.2；
//   PlayerRenderer.getRenderOffset 整个人往下 0.125 格；CapeLayer 蹲着披风多翘 25°。中间值按比例插（游戏一刻切过去，这里给 0.1 秒左右过渡免跳变）。
// 披风：披风往后扬多少度（CapeLayer 的 f2 / 2：跑起来披风落在身后，疾跑约 40°；站着 0）
// 前倾：整个人绕脚底往前倾多少度（原版没有；跑得比原版快时编排按 模型/角色/跑步.ts 的 `runLean` 给，头仰要自己扣掉）
// 右臂：给了就直接用这个转角（右臂的 xRot、yRot、zRot，弧度，盖掉晃手和举镜），编排按 `guardRightArmMatrix` 算手够到哪（7-4-3 接书）；右手：挂在右臂坐标系里的东西（同 `guardRightArmMatrix` 的坐标）
export const Guard: React.FC<{ sec: number; headPitch?: number; headYaw?: number; raiseSpyglass?: number; holdSpyglass?: boolean; skinIndex?: number; glintSec?: number; limbSwing?: number; stride?: number; crouch?: number; capeLift?: number; lean?: number; rightArm?: number[]; rightHand?: React.ReactNode }> = ({
  sec: sec, headPitch = 0, headYaw: headYaw = 0, raiseSpyglass: raiseSpyglass = 1, holdSpyglass = true, skinIndex: skinIndex = 0, glintSec, limbSwing: step = 0, stride = 0, crouch = 0, capeLift: capeLift = 0, lean = 0, rightArm, rightHand,
}) => {
  const hx = rad(headPitch);
  const hy = rad(-headYaw); // 模型空间 yRot 正 = 往右转
  const pose: Record<string, PartPose> = giantPose(sec, { headPitch: hx, headYaw: hy, limbSwing: step, stride });
  const k = Math.min(1, Math.max(0, raiseSpyglass));
  if (k > 0) {
    const ax = Math.min(3.3, hx - 1.9198622);
    const ay = hy - 0.2617994;
    const base = pose.right_arm.rot ?? [0, 0, 0];
    const arm = { rot: [base[0] + (ax - base[0]) * k, base[1] + (ay - base[1]) * k, base[2] * (1 - k)], offset: pose.right_arm.offset };
    pose.right_arm = arm;
    pose.right_sleeve = arm;
  }
  if (rightArm) {
    pose.right_arm = { rot: rightArm, offset: pose.right_arm.offset };
    pose.right_sleeve = pose.right_arm;
  }
  const glint = { tex: TEX.附魔光泽, 秒: glintSec ?? sec };
  const skin = SKINS[((Math.round(skinIndex) % SKINS.length) + SKINS.length) % SKINS.length];
  const crouchAmt = Math.min(1, Math.max(0, crouch));
  if (crouchAmt > 0) {
    const addCrouch = (partName: string, dRot: number[], off: (offset: number[]) => number[]) => {
      const partPose = pose[partName];
      const rot = partPose.rot ?? [0, 0, 0];
      pose[partName] = { ...partPose, rot: [rot[0] + dRot[0] * crouchAmt, rot[1] + dRot[1] * crouchAmt, rot[2] + dRot[2] * crouchAmt], offset: off(partPose.offset ?? [0, 0, 0]) };
    };
    const lerpTo = (a: number, b: number) => a + (b - a) * crouchAmt;
    for (const partName of ['head', 'hat']) addCrouch(partName, [0, 0, 0], (o) => [o[0], lerpTo(o[1], 4.2), o[2]]);
    for (const partName of ['body', 'jacket']) addCrouch(partName, [0.5, 0, 0], (o) => [o[0], lerpTo(o[1], 3.2), o[2]]);
    for (const partName of ['right_arm', 'right_sleeve', 'left_arm', 'left_sleeve']) addCrouch(partName, [k > 0 && partName.startsWith('right') ? 0 : 0.4, 0, 0], (o) => [o[0], lerpTo(o[1], 5.2), o[2]]);
    for (const partName of ['right_leg', 'right_pants', 'left_leg', 'left_pants']) addCrouch(partName, [0, 0, 0], (o) => [o[0], lerpTo(o[1], 12.2), lerpTo(o[2], 4)]);
  }
  const attach = {
    ...(holdSpyglass && k > 0
      ? {
          root: (
            <group matrix={spyglassMatrix(pose, k)} matrixAutoUpdate={false}>
              <Spyglass />
            </group>
          ),
        }
      : {}),
    ...(rightHand ? { right_arm: rightHand } : {}),
  };
  const cape: Record<string, PartPose> = { cloak: { offset: [0, 3.2 * crouchAmt, 3], rot: [rad(-6 - capeLift - 25 * crouchAmt), Math.PI, 0] } };
  return (
    <group position={[0, 0, -0.125 * crouchAmt]} rotation={[rad(lean), 0, 0]}>
    <group scale={GUARD.scale}>
      <EntityModel model={MODELS.宽} tex={skin} pose={pose} attach={attach} />
      {/* 头盔、胸甲、靴子：外层模型；护腿：内层模型的身子和两腿；四件都附魔，各叠一层光泽 */}
      <EntityModel model={MODELS.外甲} tex={TEX.钻石甲1} pose={pose} glint={glint} />
      <EntityModel model={MODELS.内甲} tex={TEX.钻石甲2} pose={{ ...pose, head: { hide: true }, hat: { hide: true }, right_arm: { hide: true }, left_arm: { hide: true } }} glint={glint} />
      <EntityModel model={CAPE} tex={TEX.披风} pose={cape} />
    </group>
    </group>
  );
};
