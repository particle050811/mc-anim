// 冰雪女王（暮色森林 1.20.1-4.3.2508 的 `SnowQueen`）：模型、贴图、缩放照抄 mod jar（npm run 取材 -- 冰雪女王）。依据（javap 反汇编）：
// - `SnowQueenModel.create()`：人形骨架改的——身子 8×23×4 拖到脚下的长裙、手脚 3 像素粗；头上一圈冰冠：前后左右四片冠条，每片中间一根 4 像素冰刺、两边各一根 3 像素的。贴图 snowqueen.png（64×32）。默认（没装 Jappa 材质包）用的就是这一套。
// - `SnowQueenRenderer.scale`：整体放大 1.2 倍，站直身高 2.4 格（不算冠）。`setupAnim`：放冰霜光束（BEAM 阶段）时两手前平伸；平时人形默认摆臂。女王会飞，平时悬在半空。
// - 冰盾（`SnowQueen.iceArray`，7 个 `SnowQueenIceShield` 部件实体，`SnowQueenIceShieldLayer` 画成一整格浮冰 PACKED_ICE，不随女王放大、不转）：前 6 块绕她转，第 i 块角度 = 60°×i + 刻×5°，位置 = 女王脚底 + (cos 角, 0.1, sin 角)（半径 1 格），
//   方块从实体位置往 x、z 各退半格画；第 7 块固定在脚底正下方 1 格像冰座托着她。这一圈是另外的实体，导出 `SnowQueenModel` 时不带，要单独画（用户 10-01 指出「寒冰底座」不见了）。贴图 packed_ice.png。
// 坐标：原点在脚底中心，Z 朝上，正面朝 -Y，单位格。
import React from 'react';
import * as THREE from 'three';
import { EntityModel, EntityModelData } from '../../engine/model/实体模型.tsx';
import type { V3 } from '../../engine/model/parts.tsx';
import { png } from '../../engine/model/贴图.ts';
import { entityTexture } from '../../engine/model/贴图方盒.tsx';
import raw from 'asset:模型/角色/冰雪女王';
import skin from 'asset:贴图/角色/冰雪女王';
import iceSkin from 'asset:贴图/角色/冰雪女王冰盾';

const MODEL = (raw as unknown as { models: Record<string, EntityModelData> }).models.冰雪女王;
const TEX = png(skin);

export const SNOW_QUEEN = {
  scale: 1.2,
  height: 2.4,
  chest: 1.55,
  debris: ['#e8f4ff', '#a8d8f0', '#6aa8d8', '#f4f8fc'], // 碎屑配色（取自贴图：白、冰蓝）
};

// 秒：游戏时间（手臂轻晃，照 `HumanoidModel` 的 bobArms：zRot ± cos(刻×0.09)×0.05+0.05，xRot ± sin(刻×0.067)×0.05）
// 施法：0～1，两手往前平伸（BEAM 姿势）；头偏 / 头仰：弧度；发光：受击闪白（0～1）；受伤：原版受伤 / 死亡变红（0～1，同巫妖）
export const SnowQueen: React.FC<{ sec: number; casting?: number; headYaw?: number; headPitch?: number; opacity?: number; hitFlash?: number; hurt?: number }> = ({ sec: sec, casting = 0, headYaw: headYaw = 0, headPitch = 0, opacity = 1, hitFlash = 0, hurt: hurt = 0 }) => {
  const age = sec * 20;
  const bz = Math.cos(age * 0.09) * 0.05 + 0.05;
  const bx = Math.sin(age * 0.067) * 0.05;
  const k = casting;
  return (
    <EntityModel
      model={MODEL}
      tex={TEX}
      scale={SNOW_QUEEN.scale}
      opacity={opacity}
      emissive={Math.round(hitFlash * 10) / 10} hurt={hurt}
      pose={{
        // create() 里头的 y 是 -4，但 `HumanoidModel.setupAnim`（不蹲时）每帧把头、身子的 y 设成 0、两臂设成 2，`SnowQueenModel` 之后只改旋转；照 -4 画头会悬在身子上方 4 像素（用户 10-02 指出）
        head: { rot: [headPitch, headYaw, 0], offset: [0, 0, 0] },
        right_arm: { rot: [bx + (-Math.PI / 2) * k, -0.1 * k, bz] },
        left_arm: { rot: [-bx + (-Math.PI / 2) * k, 0.1 * k, -bz] },
      }}
    />
  );
};

// ---------- 冰盾 ----------
// 7 块冰盾的方块中心，相对女王脚底（场景坐标，Z 朝上；游戏的 z = 场景的 -y）。秒：游戏时间，转的角度按刻算
export const iceShieldCenters = (sec: number): V3[] => {
  const out: V3[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((60 * i + sec * 20 * 5) * Math.PI) / 180;
    out.push([Math.cos(angle), -Math.sin(angle), 0.1 + 0.5]);
  }
  out.push([0, 0, -0.5]);
  return out;
};

let iceMat: THREE.MeshStandardMaterial | undefined;
const iceBlockMat = () => {
  if (!iceMat) {
    const t = entityTexture(png(iceSkin));
    iceMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.35 });
  }
  return iceMat;
};
const iceGeo = new THREE.BoxGeometry(1, 1, 1);

// 半透明的冰盾材质（按 8 档缓存）：一镜到底近景里撞飞的冰盾离镜头太近时淡出用（6-1-8/戏.tsx）
const iceFade: THREE.MeshStandardMaterial[] = [];
const iceFadeMat = (opacity: number) => {
  const k = Math.min(7, Math.floor(opacity * 8));
  if (!iceFade[k]) {
    const mat = iceBlockMat().clone();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.opacity = (k + 0.5) / 8;
    iceFade[k] = mat;
  }
  return iceFade[k];
};
// 一块冰盾（整格浮冰，六面同一张贴图）。p：方块中心；q：翻滚（被撞飞时）；opacity：小于 1 时半透明（0 不画）
export const IceShieldBlock: React.FC<{ p: V3; q?: THREE.Quaternion; s?: number; opacity?: number }> = ({ p: center, q: tumbleQuat, s: scale = 1, opacity = 1 }) =>
  opacity <= 0 ? null : (
    <mesh geometry={iceGeo} material={opacity < 1 ? iceFadeMat(opacity) : iceBlockMat()} position={center} quaternion={tumbleQuat} scale={scale} castShadow={opacity >= 1} receiveShadow />
  );

// 绕着女王转的一整圈冰盾（不跟女王的朝向转，方块始终和世界坐标轴对齐）。放在女王脚底的位置上
export const SnowQueenShields: React.FC<{ sec: number }> = ({ sec: sec }) => (
  <>
    {iceShieldCenters(sec).map((c, i) => (
      <IceShieldBlock key={i} p={c} />
    ))}
  </>
);
