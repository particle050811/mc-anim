// 巫妖（暮色森林 1.20.1-4.3.2508 的 Lich）：模型、贴图、动作、护盾都是从 mod jar 里照抄的（npm run 取材 -- 巫妖）。
// 依据（javap 反汇编）：
// - `LichModel.create()`：人形骨架改的——头 8³、身子 8×24×4 的长袍、手脚都是 2 像素粗的骨头，外加领子（collar，绕 X 转 2.16 弧度斜立在脑后）和披风（cloak）；贴图 twilightlich64.png。默认（没装 Jappa 材质包）用的就是这一套。
// - `LichModel.setupAnim()`：右手往前平伸（xRot = -π/2）、左手举过头顶（xRot = -π、zRot 0.5），两手随时间轻晃（zRot += cos(刻×0.26)×0.15+0.05，xRot ± sin(刻×0.167)×0.15）。
// - `LichShadowsGoal`（第一阶段、带护盾时）让它手里拿着暮色权杖（twilight_scepter），`ItemInHandLayer` 照常画在右手上。
// - `ShieldLayer`：护盾是一圈 twilightforest:shield 物品（lich_shield_frame + 半透明的 lich_shield_fill 两层），每面 1 格见方，围着模型原点（脚底上方 1.501 格）转，半径 0.7 格；
//   角度 = 刻/5 弧度 + 第 i 面 × 360°/面数，同时绕 Z 摆 cos(刻/5)/4、绕 X 摆 sin(刻/5)/4；全亮。开局 6 面（`Lich.INITIAL_SHIELD_STRENGTH`）。
//   碎掉一面后剩下的几面重新均分角度（按当前面数 n 算 i × 360°/n）：传 `shieldCount` 就照这个画；也可以传 `护盾`（每面一个 0～1）让每面固定在自己的位置上。
// 坐标：原点在脚底中心，Z 朝上，正面朝 -Y（同 贴图方盒.tsx、娜迦实机.tsx），单位格。
import React from 'react';
import * as THREE from 'three';
import { EntityModel, EntityModelData } from '../../engine/model/实体模型.tsx';
import { ItemSprite } from '../../engine/model/物品贴图.tsx';
import { png, pngDir } from '../../engine/model/贴图.ts';
import { ScepterInHand } from '../物品/巫妖权杖.tsx';
import raw from 'asset:模型/角色/巫妖';
import skin from 'asset:贴图/角色/巫妖';
import { 资产目录 } from '../../engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/角色/巫妖护盾/fill';
import 资_1 from 'asset:贴图/角色/巫妖护盾/frame';

const MODEL = (raw as unknown as { models: Record<string, EntityModelData> }).models.巫妖;
const TEX = png(skin);
const SHIELD = pngDir(资产目录({ './fill.png': 资_0, './frame.png': 资_1 })) as Record<'frame' | 'fill', ReturnType<typeof png>>;

export const LICH = {
  height: 2.0, // 头顶离脚底（模型最高点 y = -8 像素 → 1.501 + 0.5）
  chest: 1.3, // 胸口高度（长矛对准这里）
  shields: 6, // Lich.INITIAL_SHIELD_STRENGTH
  shieldRadius: 0.7,
  shieldZ: 1.501,
  shieldSize: 1, // 每面护盾 1 格见方
  // 碎屑配色（取自贴图）：骨白、长袍的深灰紫、领子的金
  debris: ['#d8d4c0', '#3b3446', '#272231', '#c8a33a'],
};

// 第 i 面护盾在实体坐标里的变换（中心、朝向）。秒 = 游戏时间（1 秒 20 刻）
// 照 `ShieldLayer.renderShields` 的变换链：模型空间（y 朝下）里 T·S(1,-1,1)·T·Rz·Ry·Rx·T(-0.5)·T(0,0,-0.7)，再换到实体坐标
export const lichShieldMatrix = (sec: number, i: number, count = LICH.shields) => {
  const t = sec * 20;
  const angle = t / 5;
  const rz = Math.cos(angle) / 4;
  const rx = Math.sin(angle) / 4;
  const ry = angle + (i * 2 * Math.PI) / count;
  const rotMat = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'ZYX'));
  const pushMat = new THREE.Matrix4().makeTranslation(0, 0, -LICH.shieldRadius);
  // 模型空间 y 朝下翻转 + 换到实体坐标（x → X，z → Y，-y → Z；再乘 ShieldLayer 自己的 y 翻转，合起来是 (x, z, y)）
  const toEntity = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, LICH.shieldZ, 0, 0, 0, 1);
  return toEntity.multiply(rotMat).multiply(pushMat);
};

export const lichShieldCenter = (sec: number, i: number, count = LICH.shields): [number, number, number] => {
  const center = new THREE.Vector3(0, 0, 0).applyMatrix4(lichShieldMatrix(sec, i, count));
  return [center.x, center.y, center.z];
};

const shieldLayers = [{ tex: SHIELD.frame }, { tex: SHIELD.fill }];
export const LichShield: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => <ItemSprite layers={shieldLayers} emissive={1} opacity={opacity} shadow={false} />;

// 护盾：每面一个 0～1 的"还在"程度（1 = 完好，0 = 已碎，不画）
export const LichShields: React.FC<{ sec: number; shields: number[] }> = ({ sec: sec, shields: shields }) => (
  <>
    {shields.map((k, i) =>
      k > 0 ? (
        <group key={i} matrix={lichShieldMatrix(sec, i, shields.length)} matrixAutoUpdate={false}>
          <LichShield opacity={Math.min(1, k)} />
        </group>
      ) : null,
    )}
  </>
);

// setupAnim 的施法站姿（攻击动作 attackTime = 0）。举手 = 0 时两手垂下（游戏里没有这个状态，给死亡、被撞飞时用）
export const lichPose = (sec: number, opts: { headYaw?: number; headPitch?: number; armRaise?: number } = {}) => {
  const age = sec * 20;
  const k = opts.armRaise ?? 1;
  const sway = Math.cos(age * 0.26) * 0.15 + 0.05;
  const bob = Math.sin(age * 0.167) * 0.15;
  return {
    head: { rot: [opts.headPitch ?? 0, opts.headYaw ?? 0, 0], offset: [0, -4, 0] },
    hat: { rot: [opts.headPitch ?? 0, opts.headYaw ?? 0, 0], offset: [0, -4, 0] },
    // `HumanoidModel.setupAnim`（不蹲时）把身子的 y 设成 0、两臂设成 2，`LichModel` 之后只把头和帽子设回 -4；create() 里身子是 -4、右臂是 -2，照那个画身子会高出 4 像素、长袍拖不到脚
    body: { offset: [0, 0, 0] },
    right_arm: { rot: [(-Math.PI / 2 + bob) * k, -0.1 * k, sway * k], offset: [-5, 2, 0] },
    left_arm: { rot: [(-Math.PI - bob) * k, 0.1 * k, (0.5 - sway) * k] },
  };
};

// 秒：游戏时间（驱动护盾转动、手晃）；护盾：见上；护盾数：按游戏的方式画 n 面（给了就不看 护盾）；权杖：右手拿着暮色权杖；头偏 / 头仰：弧度（头仰正 = 低头）；发光：受击时闪一下白（0～1；不用红色，避免生成血）；
// 受伤：原版受伤 / 死亡时的变红（0～1，lib/实体模型.tsx 的 `HURT_MIX`；用户 10-02 要先在 6-1-5 巫妖死时试，看成片会不会画出血）
export const Lich: React.FC<{ 秒: number; 护盾?: number[]; shieldCount?: number; scepter?: boolean; 头偏?: number; headPitch?: number; armRaise?: number; opacity?: number; hitFlash?: number; 受伤?: number }> = ({
  秒: sec,
  护盾: shields = [1, 1, 1, 1, 1, 1],
  shieldCount,
  scepter = true,
  头偏: headYaw,
  headPitch,
  armRaise,
  opacity = 1,
  hitFlash = 0,
  受伤: hurt = 0,
}) => (
  <>
    <EntityModel
      model={MODEL}
      tex={TEX}
      pose={lichPose(sec, { headYaw: headYaw, headPitch, armRaise })}
      attach={scepter ? { right_arm: <ScepterInHand /> } : undefined}
      opacity={opacity}
      emissive={Math.round(hitFlash * 10) / 10}
      hurt={hurt}
    />
    <LichShields sec={sec} shields={shieldCount === undefined ? shields : Array(shieldCount).fill(1)} />
  </>
);
