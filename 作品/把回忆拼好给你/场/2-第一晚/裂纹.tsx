// 挖方块的裂纹：原版 destroy_stage_0～9 叠在被挖的方块上（ModelBlockRenderer 按方块模型画一遍，RenderType.crumbling）。
// 混合照原版 crumbling：DST_COLOR × src + SRC_COLOR × dst = 2·src·dst（灰 0.5 不变、深的压暗、浅的提亮），alpha < 0.1 丢掉、不写深度。
// 画布的 alpha 不动（三维画布背景透明、后面垫着天）。描边那遍里它是不写深度的半透明，不画（engine/三渲二/描边.tsx）。
// 画在剖面看得见的面上：比方块大一丝的盒子，朝镜头的南面和露出来的顶面。
import React from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import crack0Png from 'asset:贴图/特效/方块裂纹/0';
import crack1Png from 'asset:贴图/特效/方块裂纹/1';
import crack2Png from 'asset:贴图/特效/方块裂纹/2';
import crack3Png from 'asset:贴图/特效/方块裂纹/3';
import crack4Png from 'asset:贴图/特效/方块裂纹/4';
import crack5Png from 'asset:贴图/特效/方块裂纹/5';
import crack6Png from 'asset:贴图/特效/方块裂纹/6';
import crack7Png from 'asset:贴图/特效/方块裂纹/7';
import crack8Png from 'asset:贴图/特效/方块裂纹/8';
import crack9Png from 'asset:贴图/特效/方块裂纹/9';

const textures = [crack0Png, crack1Png, crack2Png, crack3Png, crack4Png, crack5Png, crack6Png, crack7Png, crack8Png, crack9Png];
const materials = new Map<number, THREE.MeshBasicMaterial>();
let boxGeometry: THREE.BoxGeometry | null = null;
const crackMaterial = (level: number) => {
  let m = materials.get(level);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: entityTexture(png(textures[level]!)),
      transparent: true,
      alphaTest: 0.1,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      toneMapped: false,
    });
    materials.set(level, m);
  }
  return m;
};

/** 级：0～9（原版 destroyProgress × 10 取整）；格：被挖方块的中心（剖面坐标） */
export const BlockCracks: React.FC<{ cell: readonly [number, number, number]; 级: number }> = ({ cell: cellPos, 级: level }) => {
  boxGeometry ??= new THREE.BoxGeometry(1.002, 1.002, 1.002);
  const levelInt = Math.max(0, Math.min(9, Math.floor(level)));
  return <mesh geometry={boxGeometry} material={crackMaterial(levelInt)} position={[cellPos[0], cellPos[1], cellPos[2]]} />;
};
