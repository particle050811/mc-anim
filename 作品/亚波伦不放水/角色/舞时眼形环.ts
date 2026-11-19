import * as THREE from 'three';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import type { BedrockBone, BonePose } from '@engine/model/基岩模型.tsx';

export const bindDanceEyeRing = (model: { bones: readonly BedrockBone[] }) => {
  const ring = 'ysmGlowbone24';
  const ringBone = model.bones.find(bone => bone.name === ring)!;
  const hat = model.bones.find(bone => bone.name === 'mao')!;
  const parent = ringBone.parent!;
  const restRing = skeletonMatrix(model, ring, {}, 1);
  const headInverse = skeletonMatrix(model, 'Head', {}, 1).invert();
  const mount = headInverse.clone().multiply(restRing);
  const hatMount = headInverse.multiply(skeletonMatrix(model, hat.name, {}, 1));
  const crown = Math.max(...hat.cubes!.map(cube => cube.origin[1] + cube.size[1] - hat.pivot[1])) + hatMount.elements[13];
  const rim = Math.min(...ringBone.cubes!.map(cube => cube.origin[1] - ringBone.pivot[1]));
  mount.elements[13] = crown + 2.5 - rim;
  const restPosition = new THREE.Vector3().setFromMatrixPosition(skeletonMatrix(model, parent, {}, 1).invert().multiply(restRing));
  return (pose: Readonly<Record<string, BonePose>>): Record<string, BonePose> => {
    const local = skeletonMatrix(model, parent, pose, 1).invert().multiply(skeletonMatrix(model, 'Head', pose, 1)).multiply(mount);
    const offset = new THREE.Vector3().setFromMatrixPosition(local).sub(restPosition);
    const angles = new THREE.Euler().setFromRotationMatrix(local, 'ZYX');
    return { [ring]: { pos: [-offset.x, offset.y, offset.z], rot: [-angles.x, -angles.y, angles.z].map(THREE.MathUtils.radToDeg) } };
  };
};
