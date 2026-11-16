// 三维点 → 页面坐标：2D 叠层（女仆气泡、名牌这类挂在实体头顶的东西）要知道那一点落在画面哪里、那里一格有多大。
// 相机要和画三维的那台同一组参数、矩阵已更新（ThreeCanvas 里的相机拿不到外面来，用 做透视相机 另建一台，或者自己建好正交相机传进来）。
// 坐标是 three 的（Y 朝上）；场景按「Z 朝上：x 东、y 北、z 上」写的，先过 Z朝上转three（同各作品 机位 里的 toThree）。
import * as THREE from 'three';

export type Vec3 = readonly [number, number, number];

export const zUpToThree = ([x, y, z]: Vec3): Vec3 => [x, z, -y];

/** 照 第一人称机位 那样建一台透视相机：视角是竖直方向的度数，up 朝 +Y、不滚转 */
export const makePerspectiveCamera = (o: { 眼: Vec3; 看: Vec3; fov: number; width: number; height: number; near?: number; far?: number }) => {
  const cam = new THREE.PerspectiveCamera(o.fov, o.width / o.height, o.near ?? 0.05, o.far ?? 512);
  cam.position.set(...o.眼);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3(...o.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
};

export type ProjectionResult = {
  /** 页面坐标（像素，左上角原点，y 朝下） */
  x: number;
  y: number;
  /** 这一点处一格（1 方块）在画面上是多少页面像素（沿相机的上方向量），透视下近大远小，正交下处处一样 */
  pxPerCell: number;
  /** 在相机前面、近远裁剪面之间 */
  inFront: boolean;
};

/** 相机要已 updateMatrixWorld、updateProjectionMatrix；宽、高是页面尺寸（1280×720 那套） */
export const projectToPage = (camera: THREE.Camera, point: Vec3, width: number, height: number): ProjectionResult => {
  const p = new THREE.Vector3(...point);
  const viewPoint = p.clone().applyMatrix4(camera.matrixWorldInverse);
  const ndc = p.clone().project(camera);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  const ndcTop = p.clone().add(cameraUp).project(camera);
  const x = ((ndc.x + 1) / 2) * width;
  const y = ((1 - ndc.y) / 2) * height;
  const pxPerCell = Math.hypot(((ndcTop.x - ndc.x) / 2) * width, ((ndcTop.y - ndc.y) / 2) * height);
  const inFront = viewPoint.z < 0 && ndc.z >= -1 && ndc.z <= 1;
  return { x, y, pxPerCell, inFront };
};
