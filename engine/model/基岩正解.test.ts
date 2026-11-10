import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BedrockBone } from './基岩模型.tsx';
import { 骨骼矩阵 } from './基岩正解.ts';

const 模型 = {
  bones: [
    { name: '身', pivot: [0, 24, 0] },
    { name: '右臂', parent: '身', pivot: [-5, 22, 0] },
    { name: '右手', parent: '右臂', pivot: [-5, 12, 0] },
  ] as BedrockBone[],
};
const 点 = (m: THREE.Matrix4, p: [number, number, number] = [0, 0, 0]) => new THREE.Vector3(...p).applyMatrix4(m).toArray().map((v) => Math.round(v * 1e6) / 1e6 + 0);

describe('骨骼矩阵', () => {
  it('静止时骨骼原点落在 pivot：x 取负（右手在 +X），文件的 y 是场景的 z', () => {
    expect(点(骨骼矩阵(模型, '右手'))).toEqual([5 / 16, 0, 12 / 16]);
  });
  it('rot.x 负 = 手臂往前抬：右臂抬 90 度，手到了肩前方（场景 +Y 是正面）', () => {
    expect(点(骨骼矩阵(模型, '右手', { 右臂: { rot: [-90, 0, 0] } }))).toEqual([5 / 16, 10 / 16, 22 / 16]);
  });
  it('缩放、pos（x 取负）和父骨骼的转动都算进去', () => {
    expect(点(骨骼矩阵(模型, '右手', { 身: { pos: [2, 1, 0] } }, 0.5 / 16))).toEqual([(5 - 2) / 32, 0, 13 / 32]);
    // 身子绕竖轴往右转 90 度（rot.y 正）：右手从 +X 转到身后（−Y）
    expect(点(骨骼矩阵(模型, '右手', { 身: { rot: [0, 90, 0] } }))).toEqual([0, -5 / 16, 12 / 16]);
  });
  it('没有的骨骼报错', () => {
    expect(() => 骨骼矩阵(模型, '尾巴')).toThrow('没有骨骼');
  });
});
