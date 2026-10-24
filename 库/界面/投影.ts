// 三维点 → 页面坐标：2D 叠层（女仆气泡、名牌这类挂在实体头顶的东西）要知道那一点落在画面哪里、那里一格有多大。
// 相机要和画三维的那台同一组参数、矩阵已更新（ThreeCanvas 里的相机拿不到外面来，用 做透视相机 另建一台，或者自己建好正交相机传进来）。
// 坐标是 three 的（Y 朝上）；场景按「Z 朝上：x 东、y 北、z 上」写的，先过 Z朝上转three（同各作品 机位 里的 toThree）。
import * as THREE from 'three';

export type 点 = readonly [number, number, number];

export const Z朝上转three = ([x, y, z]: 点): 点 => [x, z, -y];

/** 照 第一人称机位 那样建一台透视相机：视角是竖直方向的度数，up 朝 +Y、不滚转 */
export const 做透视相机 = (o: { 眼: 点; 看: 点; 视角: number; 宽: number; 高: number; near?: number; far?: number }) => {
  const cam = new THREE.PerspectiveCamera(o.视角, o.宽 / o.高, o.near ?? 0.05, o.far ?? 512);
  cam.position.set(...o.眼);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3(...o.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
};

export type 投影结果 = {
  /** 页面坐标（像素，左上角原点，y 朝下） */
  x: number;
  y: number;
  /** 这一点处一格（1 方块）在画面上是多少页面像素（沿相机的上方向量），透视下近大远小，正交下处处一样 */
  每格: number;
  /** 在相机前面、近远裁剪面之间 */
  在前: boolean;
};

/** 相机要已 updateMatrixWorld、updateProjectionMatrix；宽、高是页面尺寸（1280×720 那套） */
export const 投影到页面 = (相机: THREE.Camera, 点: 点, 宽: number, 高: number): 投影结果 => {
  const p = new THREE.Vector3(...点);
  const 视 = p.clone().applyMatrix4(相机.matrixWorldInverse);
  const ndc = p.clone().project(相机);
  const 上 = new THREE.Vector3(0, 1, 0).applyQuaternion(相机.getWorldQuaternion(new THREE.Quaternion()));
  const ndc上 = p.clone().add(上).project(相机);
  const x = ((ndc.x + 1) / 2) * 宽;
  const y = ((1 - ndc.y) / 2) * 高;
  const 每格 = Math.hypot(((ndc上.x - ndc.x) / 2) * 宽, ((ndc上.y - ndc.y) / 2) * 高);
  const 在前 = 视.z < 0 && ndc.z >= -1 && ndc.z <= 1;
  return { x, y, 每格, 在前 };
};
