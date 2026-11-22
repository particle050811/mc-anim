// 飞行镜头摆相机（FlightRig、按航线往后看的相机、Node 里的加载计划共用）：纯模块，不碰 React。
// roll 是 rotateZ(−roll)，和正本 engine/core/three换算.ts 的 placeCamera 相反；现有镜头 roll 只填过 0 和 180，两种写法画出来一样（engine/core/机位.ts 文件头）
import type * as THREE from 'three';
import { rad } from '@engine/core/数学.ts';
import { sceneToThree } from '@engine/core/three换算.ts';
import { lensToFov } from '@engine/core/机位.ts';
export type CamPose = { pos: number[]; tgt: number[]; lens: number; roll?: number };
export const placeFlightCamera = (cam: THREE.PerspectiveCamera, camPose: CamPose, aspect: number, near: number, far: number) => {
  cam.fov = lensToFov(camPose.lens, aspect);
  cam.near = near;
  cam.far = far;
  cam.position.copy(sceneToThree(camPose.pos));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(camPose.tgt));
  if (camPose.roll) cam.rotateZ(-rad(camPose.roll));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
};
