// 戴晋升之环的史蒂夫（用户 11-10 定史蒂夫戴晋升之环）：在 @库/角色/史蒂夫.tsx 的 <Steve> 外面包一层，把 特效/晋升之环.tsx 的环挂到头后。
// 盔甲、武器不在这里（另一路在做）。
import React from 'react';
import * as THREE from 'three';
import { MODEL_TO_ENTITY } from '@engine/model/实体模型.tsx';
import { Steve, steveParts, steveRootMatrix } from '@库/角色/史蒂夫.tsx';
import { HeadRing } from '../特效/晋升之环.tsx';
import type { RingVariant } from '../特效/晋升之环形.ts';

/**
 * 戴晋升之环的史蒂夫：外面包一层，属性同 <Steve>，多 环（不给就不戴）和 环秒。环跟着头转（照 RevelationFix 的 HaloRendererMixin）。
 * 变换和 Steve 里画头的那一串相同：steveRootMatrix → 模型原点（脚底上方 1.501 格）→ 模型空间（像素，y 朝下，正面 −z）→ head 部件 → 绕 X 转半圈换成头坐标。
 * 只依赖 steveRootMatrix、steveParts 两个函数和 EntityModel 的摆法（同 steveHeldItemMatrix）
 */
export const RingedSteve: React.FC<React.ComponentProps<typeof Steve> & { ring?: RingVariant; ringSec?: number }> = ({ ring, ringSec = 0, ...rest }) => {
  const headPart = steveParts(rest.pose).head as { rot: number[]; offset: number[] };
  const matrix = steveRootMatrix(rest.pose)
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.501))
    .multiply(MODEL_TO_ENTITY)
    .multiply(new THREE.Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16))
    .multiply(new THREE.Matrix4().makeTranslation(headPart.offset[0]!, headPart.offset[1]!, headPart.offset[2]!))
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(headPart.rot[0], headPart.rot[1], headPart.rot[2], 'ZYX')))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI));
  return (
    <>
      <Steve {...rest} />
      {ring && (
        <group matrix={matrix} matrixAutoUpdate={false}>
          <HeadRing variant={ring} 秒={ringSec} wearer="史蒂夫" />
        </group>
      )}
    </>
  );
};
