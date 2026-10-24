// 原版木船（1.20.1）：模型照 BoatModel.createBodyModel（取材配方「樱花木船」导出），划桨、乘客座位、桨声照原版代码（SRG 客户端 jar，javap 反汇编）。
// - BoatRenderer.render：translate(0, 0.375, 0) → rotY(180° − yaw) → scale(−1, −1, 1) → rotY(90°)，模型 +x 是船头。
//   water_patch 用 RenderType.waterMask 只写深度、挡住船舱里的水面，这里不画：水面那边自己在船舱处挖洞（见 船舱）。
// - BoatModel.animatePaddle：f = getRowingTime；xRot = clampedLerp(−π/3, −π/12, (sin(−f)+1)/2)，yRot = clampedLerp(−π/4, π/4, (sin(−f+1)+1)/2)，
//   右桨 yRot = π − yRot；zRot 不动（π/16）。不划时 getRowingTime 是 0。
// - Boat.tick：按着前进时两支桨每刻 paddlePositions += π/8（16 刻一桨，0.8 秒），桨位模 2π 跨过 π/4 的那一刻放 paddle_water（音量 1、音高 0.8 + 0.4·随机）；
//   floatBoat 每刻速度 ×0.9，controlBoat 往前 +0.04，所以从静止起第 n 刻速度 0.4·(1 − 0.9ⁿ) 格/刻，最快 0.4 格/刻（8 米/秒）。
// - floatBoat 在水里：浮力 (水面 − 船 y) / 0.5625 × 0.0615 抵重力 0.04，船 y 停在水面下 0.366 格（吃水）。
// - positionRider：两个乘客时第一个（驾船的）往前 0.2、第二个往后 0.6，是动物（Animal，女仆也是）再往前 0.2；高 = 船 y − 0.1 + 乘客的 getMyRidingOffset（玩家 −0.35，别的 0）。
//   满员时动物身子、头都转 90° 或 270°（按实体 id 单双），侧着坐；玩家身子朝船头。
// 坐标同 骨架.tsx：原点在船实体的位置（船底），Z 朝上，朝向 +Y，单位格。
import React from 'react';
import { rad } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';
import { EntityModel, type EntityModelData } from '../../engine/model/实体模型.tsx';
import { png } from '../../engine/model/贴图.ts';
import { 桨姿 } from './船原版.ts';
import raw from 'asset:模型/物品/船';
import 樱花木 from 'asset:贴图/物品/船/樱花木';

const MODEL = (raw as unknown as { models: { 船: EntityModelData } }).models.船;
const 贴图们 = { 樱花木: png(樱花木) };
export type 船木 = keyof typeof 贴图们;

/** loc：船实体的位置（船底）；yaw：船头朝向（度，0 朝 +Y，正 = 往左，同 FigurePose）；桨：rowingTime（弧度），不划给 null */
export const 原版船: React.FC<{ loc: V3; yaw: number; 桨: number | null; 木?: 船木 }> = ({ loc, yaw, 桨, 木 = '樱花木' }) => (
  // EntityModel 自己是 (x, z, 1.501 − y)/16、正面朝 −Y；BoatRenderer 的变换换到场景里是 (z, −x, 0.375 − y)/16，即绕 Z 转 −90° 再降 1.126 格；
  // 再转 180° 让船头朝 +Y
  <group position={loc} rotation={[0, 0, rad(yaw) + Math.PI / 2]}>
    <group position={[0, 0, 0.375 - 1.501]}>
      <EntityModel model={MODEL} tex={贴图们[木]} pose={桨姿(桨)} />
    </group>
  </group>
);
