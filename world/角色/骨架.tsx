// MC 玩家骨架：头、身、双臂、双腿，外加可选的肘和膝，各角色往插槽里填自己的几何。
// 尺寸以 MC 像素为单位（身高 32 像素），整体缩放到 `height` 格；朝向 +Y，右手在 +X。
// 关节角绕 X 轴，正值 = 往前（+Y）摆；`roll` 绕前后轴，正值把手收向身体中线。腿和手臂的角度都相对躯干（躯干前倾时跟着倾）。
// 膝：小腿相对大腿往后折的角度；肘：前臂相对上臂往前折的角度。
// 身体高度由腿决定：哪条腿伸得更低就以它的脚底贴地（`ground`=1）；腾空时 `ground` 调 0，髋保持站直时的高度。
// 转身分两层：`yaw` 整个人绕竖轴转（正 = 往左）；`twist` 胸相对髋绕脊柱再拧，带着头和双臂，髋和腿不动（侧身按刀、出刀甩肩靠它）；有了 `twist`，`headYaw` 相对胸。
import React from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';

export type FigurePose = {
  loc: number[];
  pitch: number; // 整体前倾（负值 = 往前倾）
  squash: number; // 整体竖向压缩：下蹲、低姿态滑停（MC 的腿不能弯）
  headPitch: number; // 负值 = 低头
  headYaw: number;
  legR: number;
  legL: number;
  armR: number;
  armRRoll: number;
  armL: number;
  armLRoll: number;
  kneeR?: number;
  kneeL?: number;
  elbowR?: number;
  elbowL?: number; // 肘可以是负的：前臂往后折（取材动画换算出来偶尔会有）
  ground?: number; // 脚贴地的程度，默认 1；腾空填 0
  yaw?: number; // 整体转身，正 = 往左转
  twist?: number; // 胸相对髋的扭转，正 = 胸口转向左（右肩往前送）
  legRRoll?: number; // 腿的侧摆，正值把脚收向身体中线（和手臂的 roll 同一约定）；叉开腿站填负值
  legLRoll?: number;
  // 腿抬起以后再绕竖轴往外张多少（度，正 = 脚往外侧张，左右各给各的），转在抬腿、`roll` 之后（最外层），同原版 ModelPart 的 yRot。
  // 腿平伸往前时 `roll` 绕的是腿自己，张不开，骑马（原版 riding：两腿 xRot −81°、yRot ±18°）要靠这个。不给就是 0。
  legRYaw?: number;
  legLYaw?: number;
  // 手臂抬起以后再绕竖轴往左转多少（度，和 `yaw` 同号），转在抬臂、`roll` 之后（最外层），同原版 ModelPart 的 yRot。
  // 手臂平举时 `roll` 绕的是手臂自己，转不出左右，拉弓（原版 BOW_AND_ARROW 两臂往中间收）要靠这个。不给就是 0。
  armRYaw?: number;
  armLYaw?: number;
};

export const standPose = (loc: number[]): FigurePose => ({
  loc, pitch: 0, squash: 1, headPitch: 0, headYaw: 0, legR: 0, legL: 0, armR: 0, armRRoll: 0, armL: 0, armLRoll: 0,
});

export type FigureSlots = {
  head: React.ReactNode; // 颈关节坐标系：头方块占 z 0..8，脸朝 +Y
  torso: React.ReactNode; // 身体坐标系：脚底为原点，腰在 z=12，肩在 z=24。跟着 twist 转
  hip?: React.ReactNode; // 同一个坐标系，但不跟 twist 转：挂在腰上的东西（刀鞘）
  armR: React.ReactNode; // 肩关节坐标系：手臂沿 -Z 下垂，肩关节在手臂顶面下 2 像素。给了 forearm 时这里只放上臂（到肘，z=-4）
  armL: React.ReactNode;
  legR: React.ReactNode; // 髋关节坐标系：腿沿 -Z 下垂，脚底 z=-12。给了 shin 时这里只放大腿（到膝，z=-6）
  legL: React.ReactNode;
  forearmR?: React.ReactNode; // 肘关节坐标系：前臂沿 -Z 下垂，z 0..-6
  forearmL?: React.ReactNode;
  shinR?: React.ReactNode; // 膝关节坐标系：小腿沿 -Z 下垂，z 0..-6
  shinL?: React.ReactNode;
  handR?: React.ReactNode; // 右手握持点（肩下 9 像素，随前臂转）
  handL?: React.ReactNode;
};

const THIGH = 6; // 髋到膝、膝到脚底各 6 像素
const ELBOW = 4; // 肩关节到肘 4 像素

// 手里的刀要摆成身体坐标系（去掉转身和前倾后）里的某个方向时，握持点上该转多少。
// 刀的方向用两个角给：`angle` 是刀在前后竖直面里的角（0 上、90 后、180 下、270 前），`side` 是刀尖往右偏出这个面多少度；
// 刀尖 = (sin side, -sin angle·cos side, cos angle·cos side)，握持点里刀身沿本地 +Z。做法：先按身体坐标摆好刀，再把胸扭转、肩、肘这串转动倒回去。
export const bladeInHand = (pose: FigurePose, angle: number, side = 0, hand: 'R' | 'L' = 'R'): THREE.Quaternion => {
  const eulerQuat = (x: number, y: number, z: number, order: THREE.EulerOrder) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(x), rad(y), rad(z), order));
  const [arm, roll, elbow] = hand === 'R' ? [pose.armR, pose.armRRoll, pose.elbowR ?? 0] : [pose.armL, -pose.armLRoll, pose.elbowL ?? 0];
  const yaw = hand === 'R' ? pose.armRYaw : pose.armLYaw;
  const handFrame = eulerQuat(0, 0, pose.twist ?? 0, 'XYZ');
  if (yaw) handFrame.multiply(eulerQuat(0, 0, yaw, 'XYZ'));
  handFrame.multiply(eulerQuat(arm, roll, 0, 'YXZ')).multiply(eulerQuat(elbow, 0, 0, 'XYZ'));
  return handFrame.invert().multiply(eulerQuat(angle, side, 0, 'XYZ'));
};

// 髋离地高度（像素）：每条腿在竖直方向伸出多长（大腿、小腿相对竖直线的角度 = 自身角度 + 躯干前倾），取更长的那条
const hipHeight = (pose: FigurePose) => {
  const reach = (a: number, knee: number) => THIGH * Math.cos(rad(a + pose.pitch)) + THIGH * Math.cos(rad(a + pose.pitch - knee));
  const grounded = Math.max(3, reach(pose.legR, pose.kneeR ?? 0), reach(pose.legL, pose.kneeL ?? 0));
  const ground = pose.ground ?? 1;
  return 12 + ground * (grounded - 12);
};

// 手（握持点）坐标系在世界里的变换：和 `Figure` 同一串变换（转身、前倾、扭转、肩、肘），单位是格、轴和 `handR` / `handL` 插槽一致（插槽里 1 = 1 像素）。
// 给编排算弓、箭这类手里东西的位置（世界坐标 = 手矩阵 × 插槽里的坐标）。
// 身体（髋）坐标系在世界里的变换：同一串变换但不含胸扭转，即 `FigureSlots.hip` 插槽的坐标系（脚底为原点，腰在 z=12，单位像素）。
// 给编排算挂在腰上的东西（刀鞘）的位置（6-1-2 收刀时刀要对准鞘口）。
export const hipMatrix = (pose: FigurePose, height: number): THREE.Matrix4 => {
  const matrix = new THREE.Matrix4();
  const [x0, y0, z0] = pose.loc;
  matrix.makeTranslation(x0, y0, z0);
  matrix.multiply(new THREE.Matrix4().makeRotationZ(rad(pose.yaw ?? 0)));
  matrix.multiply(new THREE.Matrix4().makeScale(height / 32, height / 32, height / 32));
  matrix.multiply(new THREE.Matrix4().makeTranslation(0, 0, hipHeight(pose) * pose.squash));
  matrix.multiply(new THREE.Matrix4().makeRotationX(rad(pose.pitch)));
  matrix.multiply(new THREE.Matrix4().makeScale(1, 1, pose.squash));
  matrix.multiply(new THREE.Matrix4().makeTranslation(0, 0, -12));
  return matrix;
};

export const handMatrix = (pose: FigurePose, height: number, hand: 'R' | 'L'): THREE.Matrix4 => {
  const matrix = hipMatrix(pose, height);
  const t = (x: number, y: number, z: number) => matrix.multiply(new THREE.Matrix4().makeTranslation(x, y, z));
  const rotate = (x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ') => matrix.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rad(x), rad(y), rad(z), order)));
  rotate(0, 0, pose.twist ?? 0);
  const isRight = hand === 'R';
  t(isRight ? 6 : -6, 0, 22);
  const yaw = isRight ? pose.armRYaw : pose.armLYaw;
  if (yaw) rotate(0, 0, yaw);
  rotate(isRight ? pose.armR : pose.armL, isRight ? pose.armRRoll : -pose.armLRoll, 0, 'YXZ');
  t(0, 0, -ELBOW);
  rotate((isRight ? pose.elbowR : pose.elbowL) ?? 0, 0, 0);
  t(0, 0, ELBOW - 9);
  return matrix;
};
export const handPosition = (pose: FigurePose, height: number, hand: 'R' | 'L'): V3 => {
  const handPos = new THREE.Vector3().applyMatrix4(handMatrix(pose, height, hand));
  return [handPos.x, handPos.y, handPos.z];
};

export const Figure: React.FC<{ pose: FigurePose; height: number } & FigureSlots> = ({ pose, height, ...slots }) => {
  const joint = (pos: V3, angle: number, roll: number, children: React.ReactNode, yaw = 0) =>
    yaw ? (
      <group position={pos} rotation={[0, 0, rad(yaw)]}>
        <group rotation={[rad(angle), rad(roll), 0, 'YXZ']}>{children}</group>
      </group>
    ) : (
      <group position={pos} rotation={[rad(angle), rad(roll), 0, 'YXZ']}>
        {children}
      </group>
    );
  const leg = (upper: React.ReactNode, lower: React.ReactNode, knee: number) => (
    <>
      {upper}
      <group position={[0, 0, -THIGH]} rotation={[rad(-knee), 0, 0]}>
        {lower}
      </group>
    </>
  );
  // 肘：前臂往前折；手里的东西跟着前臂
  const arm = (upper: React.ReactNode, lower: React.ReactNode, elbow: number, hand: React.ReactNode) => (
    <>
      {upper}
      <group position={[0, 0, -ELBOW]} rotation={[rad(elbow), 0, 0]}>
        {lower}
        <group position={[0, 0, ELBOW - 9]}>{hand}</group>
      </group>
    </>
  );
  const hip = hipHeight(pose);
  return (
    <group position={pose.loc as V3} rotation={[0, 0, rad(pose.yaw ?? 0)]} scale={height / 32}>
      {/* 以髋为轴前倾：髋始终在落脚点正上方 */}
      <group position={[0, 0, hip * pose.squash]} rotation={[rad(pose.pitch), 0, 0]} scale={[1, 1, pose.squash]}>
        <group position={[0, 0, -12]}>
          {joint([2, 0, 12], pose.legR, pose.legRRoll ?? 0, leg(slots.legR, slots.shinR, pose.kneeR ?? 0), -(pose.legRYaw ?? 0))}
          {joint([-2, 0, 12], pose.legL, -(pose.legLRoll ?? 0), leg(slots.legL, slots.shinL, pose.kneeL ?? 0), pose.legLYaw ?? 0)}
          {slots.hip}
          <group rotation={[0, 0, rad(pose.twist ?? 0)]}>
            {slots.torso}
            <group position={[0, 0, 24]} rotation={[rad(pose.headPitch), 0, rad(pose.headYaw), 'ZXY']}>
              {slots.head}
            </group>
            {joint([6, 0, 22], pose.armR, pose.armRRoll, arm(slots.armR, slots.forearmR, pose.elbowR ?? 0, slots.handR), pose.armRYaw)}
            {joint([-6, 0, 22], pose.armL, -pose.armLRoll, arm(slots.armL, slots.forearmL, pose.elbowL ?? 0, slots.handL), pose.armLYaw)}
          </group>
        </group>
      </group>
    </group>
  );
};
