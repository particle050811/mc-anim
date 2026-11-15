// 基岩模型的骨骼正解：不渲染，直接算某根骨骼的坐标系在模型场景坐标里的矩阵。挂在骨骼上的东西（手里的物品）要在别处用到它的世界位置、朝向时用，
// 例：杖尖在哪、朝哪。算式和 基岩模型.tsx 的 BedrockModelView 摆每根骨骼的 group 一样（那边改了这里要跟着改）；单开一个文件是为了不动渲染路径上的文件。
import * as THREE from 'three';
import type { BedrockBone, BonePose } from './基岩模型.tsx';

const radPerDeg = Math.PI / 180;

/**
 * 骨骼坐标系（挂载用的那个：原点 = 骨骼 pivot，单位像素，Y 朝上，正面 −Z）→ 模型场景坐标（Z 朝上，正面 +Y，原点脚底，单位格）。
 * 姿势 是动画和手摆的合好以后的那张表；缩放 = 一像素多少格。再左乘生物的 pose（平移 loc、绕 Z 转 yaw）就是场景坐标
 */
export const skeletonMatrix = (model: { bones: readonly BedrockBone[] }, boneName: string, bonePose: Readonly<Record<string, BonePose>> = {}, scale = 1 / 16): THREE.Matrix4 => {
  const boneMap = new Map(model.bones.map((b) => [b.name, b]));
  const chain: BedrockBone[] = [];
  for (let b = boneMap.get(boneName); b; b = b.parent ? boneMap.get(b.parent) : undefined) chain.unshift(b);
  if (!chain.length) throw new Error(`骨骼矩阵：模型里没有骨骼 ${boneName}`);
  const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).scale(new THREE.Vector3(scale, scale, scale));
  let parentPivot: readonly number[] = [0, 0, 0];
  for (const bone of chain) {
    const p = bonePose[bone.name];
    const s = p?.scale ?? 1;
    const sv = typeof s === 'number' ? [s, s, s] : s;
    const rest = bone.rotation ?? [0, 0, 0];
    const ar = p?.rot ?? [0, 0, 0];
    const ap = p?.pos ?? [0, 0, 0];
    m.multiply(
      new THREE.Matrix4().compose(
        new THREE.Vector3(-(bone.pivot[0] - parentPivot[0]!) - ap[0]!, bone.pivot[1] - parentPivot[1]! + ap[1]!, bone.pivot[2] - parentPivot[2]! + ap[2]!),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-(rest[0] + ar[0]!) * radPerDeg, -(rest[1] + ar[1]!) * radPerDeg, (rest[2] + ar[2]!) * radPerDeg, 'ZYX')),
        new THREE.Vector3(sv[0], sv[1], sv[2]),
      ),
    );
    parentPivot = bone.pivot;
  }
  return m;
};
