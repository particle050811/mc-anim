// 弓：原版 minecraft:bow，照 1.20.1 client jar（models/item/bow.json、bow_pulling_0/1/2.json，npm run 取材 -- 弓）。
// - 形状：item/generated，16×16 贴图挤出 1/16 格厚（lib/物品贴图.tsx 的 `ItemSprite`）。bow.png 未拉；bow_pulling_0/1/2.png 三档拉弦，贴图自带搭弦的箭（箭头在左上角）。
// - 换贴图（bow.json overrides，取最后一个满足的）：pulling 时 pull（(useDuration − 剩余刻)/20 秒，满 1）< 0.65 → _0，≥ 0.65 → _1，≥ 0.9 → _2；不在拉（放箭后）→ bow。
// - 手持（`ItemInHandLayer.renderArmWithItem`）：手臂坐标系 Rx(−90)·Ry(180)，平移 (±1/16, 2/16, −10/16)（左手 x 取 −），再套 bow.json display.thirdperson_lefthand：rotation [−80, −280, 40]、translation [−1, −2, 2.5]、scale 0.9
//   （`ItemTransform.apply` 左手时 x 平移、y/z 转角再取反，lib/物品贴图.tsx 的 `ItemDisplay` 照做）。
// 挂到 骨架.tsx 手插槽（handL / handR）：原点在肩下 9 像素，1 = 1 像素。骨架手臂坐标系 Ry(180)·Rx(90) 与 `ItemInHandLayer` 的 Rx(−90)·Ry(180) 抵消，
// 插槽里只剩平移：回肩关节 (0, 0, 9)，再平移 (∓1, 2, −10) 像素，套 display，×16 放大。骨架按身高缩放（玩家 0.9375），弓跟着缩。
import React from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';
import { ItemSprite, type ItemTransform } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import { handMatrix, type FigurePose } from '../角色/骨架.tsx';
import bowPng from 'asset:贴图/物品/弓/弓';
import pull0Png from 'asset:贴图/物品/弓/弓拉0';
import pull1Png from 'asset:贴图/物品/弓/弓拉1';
import pull2Png from 'asset:贴图/物品/弓/弓拉2';

export type BowTexture = '弓' | '弓拉0' | '弓拉1' | '弓拉2';
const TEX: Record<BowTexture, string> = { 弓: bowPng, 弓拉0: pull0Png, 弓拉1: pull1Png, 弓拉2: pull2Png };

// bow.json 的 display（第三人称两只手；第一人称不用）
export const BOW_DISPLAY = {
  thirdperson_righthand: { rotation: [-80, 260, -40], translation: [-1, -2, 2.5], scale: [0.9, 0.9, 0.9] },
  thirdperson_lefthand: { rotation: [-80, -280, 40], translation: [-1, -2, 2.5], scale: [0.9, 0.9, 0.9] },
} satisfies Record<string, ItemTransform>;

// overrides：pulling、pull → 用哪张贴图
export const bowTextureFor = (pulling: boolean, pull: number): BowTexture => (!pulling ? '弓' : pull >= 0.9 ? '弓拉2' : pull >= 0.65 ? '弓拉1' : '弓拉0');

// 贴图上搭着的那支箭的箭尖（贴图像素坐标，左上角为原点）：三档的箭头都是 L 形的三个白像素，箭尖是最左上那个像素的左上角
export const BOW_ARROW_TIP: Record<Exclude<BowTexture, '弓'>, [number, number]> = { 弓拉0: [1, 0], 弓拉1: [2, 1], 弓拉2: [3, 2] };

// 手插槽坐标系（像素）→ 物品空间（格，贴图中心为原点、贴图上方 +Y、正面 +Z）的变换，见文件头
const slotToItem = (left: boolean) => {
  const t = left ? BOW_DISPLAY.thirdperson_lefthand : BOW_DISPLAY.thirdperson_righthand;
  const mirror = left ? -1 : 1;
  const [rx, ry, rz] = t.rotation;
  return new THREE.Matrix4()
    .makeTranslation(0, 0, 9)
    .multiply(new THREE.Matrix4().makeTranslation(mirror, 2, -10))
    .multiply(new THREE.Matrix4().makeScale(16, 16, 16))
    .multiply(new THREE.Matrix4().makeTranslation((mirror * t.translation[0]) / 16, t.translation[1] / 16, t.translation[2] / 16))
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rad(rx), rad(mirror * ry), rad(mirror * rz), 'XYZ')))
    .multiply(new THREE.Matrix4().makeScale(t.scale[0], t.scale[1], t.scale[2]));
};
const SLOT_L = slotToItem(true);
const SLOT_R = slotToItem(false);

// 挂在手插槽里的弓
export const HeldBow: React.FC<{ texture: BowTexture; left?: boolean }> = ({ texture: texture, left = true }) => (
  <group matrix={left ? SLOT_L : SLOT_R} matrixAutoUpdate={false}>
    <ItemSprite layers={[{ tex: png(TEX[texture]) }]} />
  </group>
);

// 弓贴图上像素 (px, py) 那一点（挤出的正中那层）在世界里的位置：手矩阵（骨架.tsx）× 插槽到物品空间 × 物品空间里的点
export const bowPointWorld = (pose: FigurePose, height: number, hand: 'L' | 'R', [px, py]: [number, number]): V3 => {
  const point = new THREE.Vector3(px / 16 - 0.5, 0.5 - py / 16, 0)
    .applyMatrix4(hand === 'L' ? SLOT_L : SLOT_R)
    .applyMatrix4(handMatrix(pose, height, hand));
  return [point.x, point.y, point.z];
};
