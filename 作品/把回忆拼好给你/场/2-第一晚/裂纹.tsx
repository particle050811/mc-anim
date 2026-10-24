// 挖方块的裂纹：原版 destroy_stage_0～9 叠在被挖的方块上（ModelBlockRenderer 按方块模型画一遍，RenderType.crumbling）。
// 混合照原版 crumbling：DST_COLOR × src + SRC_COLOR × dst = 2·src·dst（灰 0.5 不变、深的压暗、浅的提亮），alpha < 0.1 丢掉、不写深度。
// 画布的 alpha 不动（三维画布背景透明、后面垫着天）。描边那遍里它是不写深度的半透明，不画（engine/三渲二/描边.tsx）。
// 画在剖面看得见的面上：比方块大一丝的盒子，朝镜头的南面和露出来的顶面。
import React from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import 裂0 from 'asset:贴图/特效/方块裂纹/0';
import 裂1 from 'asset:贴图/特效/方块裂纹/1';
import 裂2 from 'asset:贴图/特效/方块裂纹/2';
import 裂3 from 'asset:贴图/特效/方块裂纹/3';
import 裂4 from 'asset:贴图/特效/方块裂纹/4';
import 裂5 from 'asset:贴图/特效/方块裂纹/5';
import 裂6 from 'asset:贴图/特效/方块裂纹/6';
import 裂7 from 'asset:贴图/特效/方块裂纹/7';
import 裂8 from 'asset:贴图/特效/方块裂纹/8';
import 裂9 from 'asset:贴图/特效/方块裂纹/9';

const 图们 = [裂0, 裂1, 裂2, 裂3, 裂4, 裂5, 裂6, 裂7, 裂8, 裂9];
const 材质们 = new Map<number, THREE.MeshBasicMaterial>();
let 盒: THREE.BoxGeometry | null = null;
const 材质 = (级: number) => {
  let m = 材质们.get(级);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: entityTexture(png(图们[级]!)),
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
    材质们.set(级, m);
  }
  return m;
};

/** 级：0～9（原版 destroyProgress × 10 取整）；格：被挖方块的中心（剖面坐标） */
export const 裂纹: React.FC<{ 格: readonly [number, number, number]; 级: number }> = ({ 格, 级 }) => {
  盒 ??= new THREE.BoxGeometry(1.002, 1.002, 1.002);
  const 级整 = Math.max(0, Math.min(9, Math.floor(级)));
  return <mesh geometry={盒} material={材质(级整)} position={[格[0], 格[1], 格[2]]} />;
};
