// 会做反应的史蒂夫：史蒂夫反应.ts 算出来的姿势交给 装备史蒂夫 画，按状态换手里的东西（剑、弓、盾、图腾），死了照原版倒下。
// 弓、盾、图腾都是原版的（弓照 库/物品/弓.tsx 的 display，盾见 物品/盾.tsx，图腾是 item/generated）；破碎之环是启示录的物品，也是 item/generated。
// 激流姿势（史蒂夫反应.ts）：绕脚底横躺、绕身子长轴打转，外面套旋风（特效/激流旋风.tsx）。和游戏不一样：整个人往上抬 0.3 格（碰撞箱 0.6 高的一半），
// 游戏里贴地转的时候人是从脚底横躺下去的，半个身子埋进地里，片里看着像钻地。
// 倒下：LivingEntityRenderer.setupRotations 在转身之后绕前后轴转，头顶倒向他的左手边（库/特效/原版死亡.tsx）；这里包在最外层，绕脚底转。
// 待迁移（私有资产）：破碎之环是启示录的（保留所有权益），只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import React from 'react';
import * as THREE from 'three';
import { DISPLAY, HeldItem, ItemSprite } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import { BOW_DISPLAY } from '@库/物品/弓.tsx';
import { Shield, shieldDisplay } from '../物品/盾.tsx';
import { RiptideWhirl } from '../特效/激流旋风.tsx';
import { type SteveEquip, EquippedSteve } from './史蒂夫装备.tsx';
import { type SteveState, steveReaction, type BowTexture } from './史蒂夫反应.ts';
import bowPng from 'asset:贴图/物品/弓/弓';
import bowPull0Png from 'asset:贴图/物品/弓/弓拉0';
import bowPull1Png from 'asset:贴图/物品/弓/弓拉1';
import bowPull2Png from 'asset:贴图/物品/弓/弓拉2';
import undyingTotemPng from 'asset:贴图/法术/minecraft/item/totem_of_undying';
import brokenRingPng from 'asset:贴图/物品/破碎之环';

const bowImageTable: Record<BowTexture, string> = { 弓: bowPng, 弓拉0: bowPull0Png, 弓拉1: bowPull1Png, 弓拉2: bowPull2Png };

/** 物品空间里的不死图腾（item/generated） */
export const UndyingTotem: React.FC = () => <ItemSprite layers={[{ tex: png(undyingTotemPng) }]} />;
/** 物品空间里的弓 */
export const Bow: React.FC<{ 贴图?: BowTexture }> = ({ 贴图: textureKey = '弓' }) => <ItemSprite layers={[{ tex: png(bowImageTable[textureKey]) }]} />;

/** 状态：这一刻在干什么（史蒂夫反应.ts）；光泽秒：附魔光泽、光环自转的时钟，不给 = 状态.秒；装备：穿什么（右手、左手由状态定，这里给了也不用） */
export const ReactingSteve: React.FC<{ state: SteveState; glintSec?: number; equipment?: Omit<SteveEquip, 'rightHand' | 'leftHand' | '剑'> }> = ({ state: steveState, glintSec, equipment }) => {
  const r = steveReaction(steveState);
  if (!r.在) return null;
  const rightHand =
    r.rightHand === '弓' ? (
      <HeldItem t={BOW_DISPLAY.thirdperson_righthand}>
        <Bow 贴图={r.bowTexture} />
      </HeldItem>
    ) : r.rightHand === '环' ? (
      // 破碎之环是 item/generated 的平面物品，拿法同图腾
      <HeldItem t={DISPLAY.generated.thirdperson_righthand}>
        <ItemSprite layers={[{ tex: png(brokenRingPng) }]} />
      </HeldItem>
    ) : undefined;
  const leftHand =
    r.leftHand === '盾' ? (
      <HeldItem t={shieldDisplay[r.shieldUp ? '举盾' : '平时'].thirdperson_lefthand} left>
        <Shield />
      </HeldItem>
    ) : r.leftHand === '图腾' ? (
      // generated.json 没写左手，原版拿右手那份镜像
      <HeldItem t={DISPLAY.generated.thirdperson_righthand} left>
        <UndyingTotem />
      </HeldItem>
    ) : undefined;
  const personNode = <EquippedSteve pose={r.pose} sec={glintSec ?? steveState.sec} equipment={{ ...equipment, 剑: r.rightHand === '剑', rightHand, leftHand }} editParts={r.editParts} hurt={r.hurt} />;
  if (r.surge) return <InRapids pose={r.pose} surge={r.surge}>{personNode}</InRapids>;
  if (r.toppleAngle === 0) return personNode;
  const [x, y, z] = r.pose.loc as [number, number, number];
  const yawRad = ((r.pose.yaw ?? 0) * Math.PI) / 180;
  // 人的本地坐标：正面 +Y、右手 +X；头顶倒向左手边（−X）= 绕 +Y 转 −角
  const flipMatrix = new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationZ(yawRad))
    .multiply(new THREE.Matrix4().makeRotationY(-r.toppleAngle))
    .multiply(new THREE.Matrix4().makeRotationZ(-yawRad))
    .multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
  return (
    <group matrix={flipMatrix} matrixAutoUpdate={false}>
      {personNode}
    </group>
  );
};

/** 激流姿势：人的本地坐标正面 +Y、头顶 +Z。绕右手轴（+X）转 −(90 − 仰角) 头就倒向视线方向，再绕长轴打转（打转放在横躺里面）。权 < 1 是收势：横躺、打转、抬高都按比例收回 */
const InRapids: React.FC<{ pose: { loc: number[]; yaw?: number }; surge: NonNullable<ReturnType<typeof steveReaction>['surge']>; children: React.ReactNode }> = ({ pose, surge: surge, children }) => {
  const [x, y, z] = pose.loc as [number, number, number];
  const weight = surge.weight ?? 1;
  const yawRad = ((pose.yaw ?? 0) * Math.PI) / 180;
  const lyingRad = (-(90 - surge.elevationDeg) * weight * Math.PI) / 180;
  const spinRad = ((-75 * surge.刻 * weight) * Math.PI) / 180;
  const lyingMatrix = new THREE.Matrix4()
    .makeTranslation(x, y, z + 0.3 * weight)
    .multiply(new THREE.Matrix4().makeRotationZ(yawRad))
    .multiply(new THREE.Matrix4().makeRotationX(lyingRad));
  const personMatrix = lyingMatrix
    .clone()
    .multiply(new THREE.Matrix4().makeRotationZ(spinRad))
    .multiply(new THREE.Matrix4().makeRotationZ(-yawRad))
    .multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
  return (
    <>
      <group matrix={personMatrix} matrixAutoUpdate={false}>
        {children}
      </group>
      {weight >= 1 && (
        <group matrix={lyingMatrix} matrixAutoUpdate={false}>
          <RiptideWhirl 刻={surge.刻} />
        </group>
      )}
    </>
  );
};
