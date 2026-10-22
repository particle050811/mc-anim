// 九胡右手里的结构指南针：6-2-4 李樱把指南针递给她（用户 10-20：「这边是九胡导航，所以前一段时间理应把指南针递给九胡，而不是自己收起来」），
// 之后一直握在她右手上，骑扫帚抱腰时也握着（6-2-4 起飞、6-2-5、6-2-6、6-3-1～6-3-3）。
// 握法：挂在 RightHandLocator（模组的手持物品挂点）上、跟着手一起动。站着：前臂端平往前伸时表盘朝上、贴图上方朝指尖，表壳底贴着拳头上面。
// 骑扫帚抱腰（`ride`）：手在他后腰右边，表盘竖着贴在他后腰上、朝着她，拳头握着下半边——平拿会戳进他身子里。
// 用法：骑扫帚 `<RideBroom 九胡={{ 右手: <JiuhuHandCompass ride /> }} />`，站着 `<Jiuhu 右手={<JiuhuHandCompass />} />`；
// 要它在场景里的位置、朝向（和别的手交接、换算）用 `jiuhuCompassMatrix`。
import React from 'react';
import * as THREE from 'three';
import type { BedrockBone, BonePose } from '@engine/model/基岩模型.tsx';
import { StructureCompass } from '@库/物品/结构指南针.tsx';
import { JIUHU } from '@库/角色/九胡.tsx';
import { jiuhuRideBones, RIDE } from '@库/角色/骑扫帚.tsx';
import raw from 'asset:模型/角色/九胡';

export const COMPASS_SCALE = 0.38; // 同 6-2-1～6-2-4、6-3-1
// 挂点坐标系里（像素，Y 朝上、正面 −Z）：前臂截面半厚 1.8 像素，表壳底在表盘中心后面 0.27 像素
const GRIP: [number, number, number] = [0, -1, -2.1];
const GRIP_ROT: [number, number, number] = [Math.PI, 0, 0]; // 表盘法线（物品 +Z）→ 挂点 −Z，贴图上方（+Y）→ −Y（指尖）
const GRIP_SCALE = COMPASS_SCALE / JIUHU.scale;

// ---------- 正向运动学（同 lib/基岩模型.tsx 的 BedrockModelView 那一串变换） ----------
const BONES = new Map((raw as unknown as { bones: BedrockBone[] }).bones.map((b) => [b.name, b]));
const chain = (name: string) => {
  const out: BedrockBone[] = [];
  for (let bone = BONES.get(name); bone; bone = bone.parent ? BONES.get(bone.parent) : undefined) out.unshift(bone);
  return out;
};
const D2R = Math.PI / 180;
// 模型根（脚底为原点，场景单位，Z 朝上、正面 +Y）→ 某根骨骼的坐标系（像素）
export const jiuhuBoneMatrix = (bones: Record<string, BonePose>, name: string): THREE.Matrix4 => {
  const matrix = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(JIUHU.scale, JIUHU.scale, JIUHU.scale));
  let parent = [0, 0, 0];
  for (const bone of chain(name)) {
    const bonePose = bones[bone.name];
    const restRot = bone.rotation ?? [0, 0, 0];
    const ar = bonePose?.rot ?? [0, 0, 0];
    const ap = bonePose?.pos ?? [0, 0, 0];
    const scale = bonePose?.scale ?? 1;
    const sv = typeof scale === 'number' ? [scale, scale, scale] : scale;
    const pos = new THREE.Vector3(-(bone.pivot[0] - parent[0]) - ap[0], bone.pivot[1] - parent[1] + ap[1], bone.pivot[2] - parent[2] + ap[2]);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-(restRot[0] + ar[0]) * D2R, -(restRot[1] + ar[1]) * D2R, (restRot[2] + ar[2]) * D2R, 'ZYX'));
    matrix.multiply(new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(sv[0], sv[1], sv[2])));
    parent = bone.pivot;
  }
  return matrix;
};
const STAND_GRIP = new THREE.Matrix4().compose(new THREE.Vector3(...GRIP), new THREE.Quaternion().setFromEuler(new THREE.Euler(...GRIP_ROT)), new THREE.Vector3(GRIP_SCALE, GRIP_SCALE, GRIP_SCALE));
// 骑扫帚的握法：按前倾 20° 抱腰的姿势（骑扫帚.tsx 的默认）在扫帚本地坐标里摆好，再换回挂点坐标系，之后照样跟着手动。
// 表盘中心在拳头往前（他那边）3.5 厘米、往上 10 厘米，表盘朝后（她）、贴图上方朝上；表壳底离他后腰约 3 厘米，下沿高过扫帚杆
const RIDE_GRIP = (() => {
  const seat = new THREE.Matrix4().makeTranslation(0, RIDE.back, RIDE.jiuhuHipZ - 18.95 * JIUHU.scale); // 同 骑扫帚.tsx 的 RideBroom
  const hand = seat.multiply(jiuhuBoneMatrix(jiuhuRideBones({ lean: 20, hugWaist: 1 }), 'RightHandLocator'));
  const at = new THREE.Vector3().setFromMatrixPosition(hand).add(new THREE.Vector3(0, 0.035, 0.1));
  const want = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)).setPosition(at).scale(new THREE.Vector3(COMPASS_SCALE, COMPASS_SCALE, COMPASS_SCALE));
  return hand.invert().multiply(want);
})();

export const JiuhuHandCompass: React.FC<{ needle?: number; ride?: boolean }> = ({ needle = 0, ride = false }) => (
  <group matrix={ride ? RIDE_GRIP : STAND_GRIP} matrixAutoUpdate={false}>
    <StructureCompass needle={needle} />
  </group>
);

// 模型根 → 指南针的物品坐标系（表盘中心为原点、正面 +Z、贴图上方 +Y，已含 0.38 倍）；ride 同 `JiuhuHandCompass`
export const jiuhuCompassMatrix = (bones: Record<string, BonePose>, ride = false): THREE.Matrix4 => jiuhuBoneMatrix(bones, 'RightHandLocator').multiply(ride ? RIDE_GRIP : STAND_GRIP);
