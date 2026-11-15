// 第一人称机位：世界相机就是玩家的眼睛。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），进 three 换成 Y 朝上，
// 场景内容放在 rotation [−π/2, 0, 0] 的 group 里就是同一套坐标。
// 照 作品/应力转动/地点/飞行镜头.tsx 的 FlightRig 另写一份（作品不互引）：原版的 FOV 就是竖直视角，所以直接给度数，不按焦距换算。
import { useThree } from '@react-three/fiber';
import type React from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { sceneToThree } from '@engine/core/three换算.ts';

/** 原版默认视角（选项里的 FOV 70，竖直方向；16:9 下横向约 102°） */
export const vanillaFov = 70;
/** 原版站着时的眼高（格，从脚底量） */
export const vanillaEyeHeight = 1.62;
/** 原版的近裁剪面（格） */
export const vanillaNearClip = 0.05;
/** 脚踩在 脚 这一点的玩家，眼睛在哪 */
export const eyePos = (feet: V3, eyeHeight = vanillaEyeHeight): V3 => [feet[0], feet[1], feet[2] + eyeHeight];

export const FirstPersonRig: React.FC<{ 眼: V3; 看: V3; fov?: number; near?: number; far?: number }> = ({ 眼: eye, 看: lookAt, fov = vanillaFov, near = vanillaNearClip, far = 512 }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = fov;
  cam.near = near;
  cam.far = far;
  cam.position.copy(sceneToThree(eye));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(lookAt));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};
