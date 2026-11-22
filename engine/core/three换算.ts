// 坐标.ts、机位.ts 里要用到 three 对象的部分（10-30 整体优化方案 0.6）：toThree 的正本 场景到three、aimCamera 的正本 摆相机、投到画面。
// 那两个文件是纯模块（段.ts、时间线.ts 也能引），这里 import three，只给画面、渲染层用。坐标约定见 坐标.ts，机位约定见 机位.ts。
// 副本差别：aimCamera 的 roll 是 rotateZ(+roll)，作品/应力转动/地点/飞行镜头.tsx 是 rotateZ(−roll)（见 机位.ts）。
import * as THREE from 'three';
import { lensToFov, type Cam, type PlaceCameraOptions } from './机位.ts';
import { rad } from './数学.ts';

/** 场景 → three（toThree） */
export const sceneToThree = ([x, y, z]: readonly number[]) => new THREE.Vector3(x, z, -y!);

/** 把 three 的透视相机摆到机位上（视角、宽高比、裁剪面、位置、lookAt、roll），更新投影和世界矩阵。近、远默认 0.05、900（古城画面的 Rig） */
export const placeCamera = (cam: THREE.PerspectiveCamera, c: Cam, aspectRatio: number, options: PlaceCameraOptions = {}) => {
  cam.fov = lensToFov(c.lens, aspectRatio);
  cam.aspect = aspectRatio;
  cam.near = options.near ?? 0.05;
  cam.far = options.far ?? 900;
  cam.position.copy(sceneToThree(c.pos));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(c.tgt));
  if (c.roll) cam.rotateZ(rad(c.roll));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
};

/** 按眼、看的点、竖直视角（度）摆透视相机（核对段的 CheckCamera；加载计划在 Node 里照它摆）。up 不给是 three 的 +Y；aspect 不给不动相机原来的宽高比 */
export const placeEyeCamera = (cam: THREE.PerspectiveCamera, o: { eye: readonly number[]; target: readonly number[]; fov: number; up?: readonly number[]; near?: number; far?: number; aspect?: number }) => {
  cam.fov = o.fov;
  if (o.aspect !== undefined) cam.aspect = o.aspect;
  cam.near = o.near ?? 0.05;
  cam.far = o.far ?? 256;
  cam.position.copy(sceneToThree(o.eye));
  if (o.up) cam.up.copy(sceneToThree(o.up));
  else cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(o.target));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
};

/** 新建一台摆好的透视相机（画布外算投影用，比如伤害数字、头顶气泡；同 库/界面/伤害数字.tsx 的 makePerspectiveCamera，那边近、远是 0.1、1200） */
export const makeCamera = (c: Cam, width: number, height: number, options?: PlaceCameraOptions) => placeCamera(new THREE.PerspectiveCamera(), c, width / height, options);

/** 场景点投到画面上：返回像素坐标（左上角原点）和深度（相机前方为正，格） */
export const projectToPicture = (cam: THREE.PerspectiveCamera, point: readonly number[], width: number, height: number) => {
  const v = sceneToThree(point);
  const depth = -v.clone().applyMatrix4(cam.matrixWorldInverse).z;
  v.project(cam);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, depth };
};
