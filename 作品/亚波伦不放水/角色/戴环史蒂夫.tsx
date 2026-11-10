// 戴晋升之环的史蒂夫（用户 11-10 定史蒂夫戴晋升之环）：在 @库/角色/史蒂夫.tsx 的 <Steve> 外面包一层，把 特效/晋升之环.tsx 的环挂到头后。
// 盔甲、武器不在这里（另一路在做）。
import React from 'react';
import * as THREE from 'three';
import { MODEL_TO_ENTITY } from '@engine/model/实体模型.tsx';
import { Steve, steveParts, steveRootMatrix } from '@库/角色/史蒂夫.tsx';
import { 头后环 } from '../特效/晋升之环.tsx';
import type { 环款 } from '../特效/晋升之环形.ts';

/**
 * 戴晋升之环的史蒂夫：外面包一层，属性同 <Steve>，多 环（不给就不戴）和 环秒。环跟着头转（照 RevelationFix 的 HaloRendererMixin）。
 * 变换和 Steve 里画头的那一串相同：steveRootMatrix → 模型原点（脚底上方 1.501 格）→ 模型空间（像素，y 朝下，正面 −z）→ head 部件 → 绕 X 转半圈换成头坐标。
 * 只依赖 steveRootMatrix、steveParts 两个函数和 EntityModel 的摆法（同 steveHeldItemMatrix）
 */
export const 戴环史蒂夫: React.FC<React.ComponentProps<typeof Steve> & { 环?: 环款; 环秒?: number }> = ({ 环, 环秒 = 0, ...其余 }) => {
  const 头 = steveParts(其余.pose).head as { rot: number[]; offset: number[] };
  const 矩阵 = steveRootMatrix(其余.pose)
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.501))
    .multiply(MODEL_TO_ENTITY)
    .multiply(new THREE.Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16))
    .multiply(new THREE.Matrix4().makeTranslation(头.offset[0]!, 头.offset[1]!, 头.offset[2]!))
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(头.rot[0], 头.rot[1], 头.rot[2], 'ZYX')))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI));
  return (
    <>
      <Steve {...其余} />
      {环 && (
        <group matrix={矩阵} matrixAutoUpdate={false}>
          <头后环 款={环} 秒={环秒} 戴="史蒂夫" />
        </group>
      )}
    </>
  );
};
