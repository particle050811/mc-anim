// 铁魔法「护盾术」（`ShieldSpell` → `ShieldEntity`）的护盾：照 irons_spellbooks-1.20.1-3.16.3.jar 反汇编（npm run 取材 -- 护盾术）。
// - 施放（`ShieldSpell.onCast`，瞬发）：从施法者眼睛沿视线打 3 格射线（碰方块就停），护盾放在命中点，朝向 = 施法者 xRot / yRot；血量 10 + 法术强度，存在 400 刻（20 秒）。
//   施法完成音 entity.illusioner.cast_spell，施法动作 instant_projectile（这里没做成骨架动作）。
// - 外形（`ShieldRenderer.render`）：PoseStack 转 Ry(−yRot)·Rx(xRot)，缩放 5×0.65 = 3.25 倍，画 `ShieldModel`（7 个 0.1 像素厚薄板拼成 12×12 像素八角形，y 从 −7 到 5；渲染器不翻 y，所以护盾中心在实体位置下方约 0.2 格，宽高 2.44 格），
//   再画 `ShieldTrimLayer`（16 根 1 像素粗的边框条，z −0.5～0.5）。
//   · 本体：`magicSwirl`（energy_swirl 着色器、加法混合、剔除背面、不写深度），贴图 shield/shield_overlay.png（64×32 蓝色噪点），顶点色 0.65，贴图坐标随时间漂移 `getEnergySwirlOffset`：
//     f = (tickCount + pt)×0.02，偏移 = (噪声(f×1.2), 噪声(f + 456))，噪声(x) = (sin(x/4) + 2sin(x/3) + 3sin(x/2) + 4sin(x))×0.25。
//   · 边框：原版 `energySwirl`（加法混合、两面都画），贴图 shield/shield_trim.png（16×16，按模型 64×32 取 uv），不漂移，顶点色 0.65。全亮，不受光。
// - 受击：30 个 electric_spark 粒子 + irons_spellbooks:force_impact；血量打完放 block.glass.break（音量 2、音高 0.65）消失；到时间放 block.respawn_anchor.set_spawn（音高 1.4）消失。监守者音波直接伤害目标、不打护盾，所以音波「穿过」护盾、护盾不碎。
// 坐标：场景坐标（Z 朝上），护盾「实体位置」在 at，朝向给施法者视线方向 dir。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { EntityModelData, ownPartGeometry } from '../../engine/model/实体模型.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/特效/护盾术';
import texOverlay from 'asset:贴图/特效/护盾术/护盾';
import texTrim from 'asset:贴图/特效/护盾术/边框';

const DATA = (raw as unknown as { models: { 护盾: EntityModelData; 边框: EntityModelData } }).models;
export const SHIELD = { 宽: 5, scale: 5 * 0.65, castRange: 3, lifeTicks: 400, tint: 0.65 };

const swirlNoise = (x: number) => (Math.sin(x / 4) + 2 * Math.sin(x / 3) + 3 * Math.sin(x / 2) + 4 * Math.sin(x)) * 0.25;
export const shieldSwirlOffset = (tick: number): [number, number] => {
  const phase = tick * 0.02;
  return [swirlNoise(phase * 1.2), swirlNoise(phase + 456)];
};

const texOf = (uri: string) => {
  const image = png(uri);
  const t = new THREE.DataTexture(image.px, image.w, image.h, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; // 原样的 sRGB 数值，着色器里按原版直接乘
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
};
const TEX = { shield: texOf(texOverlay), trim: texOf(texTrim) };

// energy_swirl 着色器：颜色 = 贴图(uv + 偏移) × 顶点色，加法混合（在 sRGB 数值上加：three 直接画到画布时混合发生在编码之后，和游戏一样）
const VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec2 offset;
varying vec2 vUv;
void main() {
  vUv = uv + offset;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const FRAG = `
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform float tint;
uniform float fade;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec4 c = texture2D(map, vUv);
  gl_FragColor = vec4(c.rgb * tint * fade, 1.0);
}
`;
const swirl = (map: THREE.Texture, side: THREE.Side) =>
  new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, offset: { value: new THREE.Vector2() }, tint: { value: SHIELD.tint }, fade: { value: 1 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side,
  });

// 施法者视线方向（场景坐标）→ 原版的 yRot / xRot（度）
export const lookAngles = (dir: V3) => {
  const gx = dir[0];
  const gy = dir[2];
  const gz = -dir[1];
  const yRot = (Math.atan2(-gx, gz) * 180) / Math.PI;
  const xRot = (-Math.atan2(gy, Math.hypot(gx, gz)) * 180) / Math.PI;
  return { yRot, xRot };
};

// at：护盾实体位置（场景）；dir：施法者视线；秒：出现以后的时间（驱动漂移）；淡：0～1 整体亮度（原版没有淡入淡出，给镜头收尾用，默认 1）
export const MagicShield: React.FC<{ at: V3; dir: V3; sec: number; fade?: number }> = ({ at, dir, sec: sec, fade = 1 }) => {
  const mats = useMemo(() => ({ body: swirl(TEX.shield, THREE.FrontSide), trim: swirl(TEX.trim, THREE.DoubleSide) }), []);
  const [ox, oy] = shieldSwirlOffset(sec * 20);
  mats.body.uniforms.offset.value.set(ox, oy);
  mats.body.uniforms.fade.value = fade;
  mats.trim.uniforms.fade.value = fade;
  const { yRot, xRot } = lookAngles(dir);
  const modelScale = SHIELD.scale / 16;
  // 游戏 Ry(θ) = 场景绕 Z 转 θ，游戏 Rx(φ) = 场景绕 X 转 φ；模型空间（y 朝上，不翻）→ 场景 (x, −z, y)：绕 X 转 +90°
  return (
    <group position={at}>
      <group rotation={[0, 0, (-yRot * Math.PI) / 180]}>
        <group rotation={[(xRot * Math.PI) / 180, 0, 0]}>
          <group rotation={[Math.PI / 2, 0, 0]} scale={modelScale}>
            <mesh geometry={ownPartGeometry(DATA.护盾.root.children[0], DATA.护盾.texSize)} material={mats.body} renderOrder={5} />
            <mesh geometry={ownPartGeometry(DATA.边框.root.children[0], DATA.边框.texSize)} material={mats.trim} renderOrder={5} />
          </group>
        </group>
      </group>
    </group>
  );
};

// 施法时护盾放在哪：眼睛沿视线 3 格（碰到方块就停在方块上，这里不查方块，镜头自己保证 3 格内没有墙）
export const shieldPos = (eye: V3, dir: V3): V3 => {
  const dirLen = Math.hypot(...dir) || 1;
  return [eye[0] + (dir[0] / dirLen) * SHIELD.castRange, eye[1] + (dir[1] / dirLen) * SHIELD.castRange, eye[2] + (dir[2] / dirLen) * SHIELD.castRange];
};
