// 第一人称空手时露出来的史蒂夫右臂，放进 第一人称.tsx 的 FirstPersonHand 的 arm 插槽（接口同 李樱第一人称.tsx）。
// 原版 PlayerRenderer.renderHand 就是把玩家模型的右臂和右袖子（宽手臂 4×12×4，袖子膨胀 0.25）在右臂部件坐标里画出来，
// arm 插槽正好是这个坐标系（第一人称.tsx 的 playerArmMatrix，单位像素），所以两件方盒按原样画、不另摆姿势，也不用像李樱那样裁剪。
// 和第三人称一样，原版第一人称按 1/16 格一像素画手臂，不乘 0.9375。
// 坑：手画布开着多重采样抗锯齿，边上的采样点会落到面外、取到贴图里相邻的格子，手臂轮廓上冒出一圈青色、蓝色的边，
// 透明的袖子边上冒出一串点（核对-史蒂夫苦力怕 初稿看到的）。所以不用 EntityModel，自己建网格，每个面的 UV 往里收 1/16 像素。
import React from 'react';
import * as THREE from 'three';
import { type EntityPart, findPart, ownPartGeometry } from '../../engine/model/实体模型.tsx';
import { entityTexture } from '../../engine/model/贴图方盒.tsx';
import type { Png } from '../../engine/model/贴图.ts';
import { STEVE_MODEL, STEVE_SKIN } from './史蒂夫.tsx';

const INSET = 1 / 16; // 像素

// 一个部件自己的方盒几何（部件坐标，像素），每个面（4 个顶点一组）的 UV 往面中心收 INSET
const insetGeometry = (name: string) => {
  const part = findPart(STEVE_MODEL.root, name) as EntityPart;
  const [w, h] = STEVE_MODEL.texSize;
  const geom = ownPartGeometry(part, STEVE_MODEL.texSize).clone();
  const uv = geom.getAttribute('uv') as THREE.BufferAttribute;
  for (let q = 0; q < uv.count; q += 4) {
    let cu = 0;
    let cv = 0;
    for (let k = 0; k < 4; k++) {
      cu += uv.getX(q + k) / 4;
      cv += uv.getY(q + k) / 4;
    }
    for (let k = 0; k < 4; k++) {
      const u = uv.getX(q + k);
      const v = uv.getY(q + k);
      uv.setXY(q + k, u + (Math.sign(cu - u) * INSET) / w, v + (Math.sign(cv - v) * INSET) / h);
    }
  }
  return geom;
};
const ARM = insetGeometry('right_arm');
const SLEEVE = insetGeometry('right_sleeve');

// 同 实体模型.tsx 受场景光的那种材质（第一人称.tsx 的手画布按它配的灯）
const matCache = new WeakMap<Png, THREE.Material>();
const material = (skin: Png) => {
  let mat = matCache.get(skin);
  if (!mat) matCache.set(skin, (mat = new THREE.MeshStandardMaterial({ map: entityTexture(skin), roughness: 0.9, alphaTest: 0.1, side: THREE.DoubleSide })));
  return mat;
};

/** skin：换皮肤（宽手臂的 64×64），不给是 steve.png */
export const SteveFirstPersonArm: React.FC<{ skin?: Png }> = ({ skin = STEVE_SKIN }) => (
  <>
    <mesh geometry={ARM} material={material(skin)} />
    <mesh geometry={SLEEVE} material={material(skin)} />
  </>
);
