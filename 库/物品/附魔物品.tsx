// 带附魔光效的挤出物品（夸克古卷 isFoil 恒真；传送石充能好时 isFoil 为真）。还有拿在手上的通用变换。
// 光效照 1.20.1 ItemRenderer：非方块物品在世界里（手上、地上）用 RenderType.glintDirect()——
// - 贴图 misc/enchanted_glint_item.png（npm run 取材 -- 杂项物品），GLINT_TEXTURING：uv' = translation(−f, f1)·rotZ(10°)·scale(8)·uv，
//   f = (毫秒×0.5×8 mod 110000)/110000、f1 = (… mod 30000)/30000（横向 27.5 秒、纵向 7.5 秒一圈）；
// - 颜色 c = 贴图 × glintStrength（0.75），混合 (SRC_COLOR, ONE)：画面 = 底色 + c²（sRGB 数值上加），只叠在物品自己的像素上。
// 和游戏的差别：游戏里 uv 是物品贴图在方块图集里的坐标（图集大小随模组多少变，这个整合包没量），这里按物品自己的 0～1 坐标 × 16/图集宽 算，
// 图集宽取 2048（一张 16 像素的物品贴图只占光效贴图的 1/16，看起来是一整片缓慢移动的紫光）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import { type ItemLayer, type ItemTransform, itemMesh } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import glintPng from 'asset:贴图/物品/杂项物品/附魔光效';

const GLINT = { speed: 0.5, strength: 0.75, scale: 8, rotZ: 0.17453292, atlasWidth: 2048 };
let glintTex: THREE.DataTexture | null = null;
const glint = () => {
  if (!glintTex) {
    const t = png(glintPng);
    glintTex = new THREE.DataTexture(t.px, t.w, t.h, THREE.RGBAFormat);
    glintTex.colorSpace = THREE.NoColorSpace;
    glintTex.wrapS = glintTex.wrapT = THREE.RepeatWrapping;
    glintTex.magFilter = glintTex.minFilter = THREE.LinearFilter;
    glintTex.needsUpdate = true;
  }
  return glintTex;
};
const glintMatrix = (sec: number, out: THREE.Matrix3) => {
  const i = Math.floor(sec * 1000 * GLINT.speed * 8);
  const shiftU = (i % 110000) / 110000;
  const f1 = (i % 30000) / 30000;
  const k = GLINT.scale * (16 / GLINT.atlasWidth);
  const cosK = Math.cos(GLINT.rotZ) * k;
  const sinK = Math.sin(GLINT.rotZ) * k;
  return out.set(cosK, -sinK, -shiftU, sinK, cosK, f1, 0, 0, 1);
};

// 秒：光效的时钟；emissive：同 ItemSprite
export const GlintItem: React.FC<{ layers: ItemLayer[]; sec: number; glint?: boolean; emissive?: number }> = ({ layers, sec: sec, glint: withGlint = true, emissive = 0.25 }) => {
  const { g: geo, tex } = itemMesh(layers);
  const { mat, uMat } = useMemo(() => {
    const uMat = { value: new THREE.Matrix3() };
    const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, alphaTest: 0.5, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: emissive });
    if (withGlint) {
      material.onBeforeCompile = (sh) => {
        sh.uniforms.glintMat = uMat;
        sh.uniforms.glintMap = { value: glint() };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform mat3 glintMat;\nvarying vec2 vGlintUv;')
          .replace('#include <begin_vertex>', 'vGlintUv = ( glintMat * vec3( uv, 1.0 ) ).xy;\n#include <begin_vertex>');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D glintMap;\nvarying vec2 vGlintUv;')
          .replace(
            '#include <opaque_fragment>',
            [
              'vec4 glintC = texture2D( glintMap, vGlintUv );',
              `vec3 gc = glintC.rgb * ${GLINT.strength.toFixed(2)};`,
              'outgoingLight = sRGBTransferEOTF( vec4( sRGBTransferOETF( vec4( outgoingLight, 1.0 ) ).rgb + gc * gc, 1.0 ) ).rgb;',
              '#include <opaque_fragment>',
            ].join('\n'),
          );
      };
      material.customProgramCacheKey = () => 'item-glint';
    }
    return { mat: material, uMat };
  }, [tex, withGlint, emissive]);
  glintMatrix(sec, uMat.value);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
};

// 拿在手上：挂到 骨架.tsx 的手插槽（handR / handL，原点在肩下 9 像素，1 = 1 像素）。
// 照 ItemInHandLayer + 物品 display 的第三人称变换（推导见 物品/弓.tsx 文件头：骨架手臂坐标系和 ItemInHandLayer 的 Rx(−90)·Ry(180) 正好抵消）
export const handSlotToItem = (t: ItemTransform, left: boolean) => {
  const mirror = left ? -1 : 1;
  const [rx, ry, rz] = t.rotation ?? [0, 0, 0];
  const tr = t.translation ?? [0, 0, 0];
  const sc = t.scale ?? [1, 1, 1];
  return new THREE.Matrix4()
    .makeTranslation(0, 0, 9)
    .multiply(new THREE.Matrix4().makeTranslation(mirror, 2, -10))
    .multiply(new THREE.Matrix4().makeScale(16, 16, 16))
    .multiply(new THREE.Matrix4().makeTranslation((mirror * tr[0]) / 16, tr[1] / 16, tr[2] / 16))
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rad(rx), rad(mirror * ry), rad(mirror * rz), 'XYZ')))
    .multiply(new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]));
};
export const HeldItem: React.FC<{ t: ItemTransform; left?: boolean; children: React.ReactNode }> = ({ t, left = false, children }) => {
  const matrix = useMemo(() => handSlotToItem(t, left), [JSON.stringify(t), left]);
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      {children}
    </group>
  );
};
