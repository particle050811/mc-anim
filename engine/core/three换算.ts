// 坐标.ts、机位.ts 里要用到 three 对象的部分（10-30 整体优化方案 0.6）：toThree 的正本 场景到three、aimCamera 的正本 摆相机、投到画面。
// 那两个文件是纯模块（段.ts、时间线.ts 也能引），这里 import three，只给画面、渲染层用。坐标约定见 坐标.ts，机位约定见 机位.ts。
// 副本差别：toThree 的 16 份都是 (x, z, −y)，参数有 V3 和 number[] 两种；aimCamera 的 roll 是 rotateZ(+roll)，作品/应力转动/地点/飞行镜头.tsx 是 rotateZ(−roll)（见 机位.ts）。
import * as THREE from 'three';
import { 焦距到视角, type Cam, type 摆相机选项 } from './机位.ts';
import { rad } from './数学.ts';

/** 场景 → three（toThree） */
export const 场景到three = ([x, y, z]: readonly number[]) => new THREE.Vector3(x, z, -y!);

/** 把 three 的透视相机摆到机位上（视角、宽高比、裁剪面、位置、lookAt、roll），更新投影和世界矩阵。近、远默认 0.05、900（古城画面的 Rig） */
export const 摆相机 = (cam: THREE.PerspectiveCamera, c: Cam, 宽高比: number, 选项: 摆相机选项 = {}) => {
  cam.fov = 焦距到视角(c.lens, 宽高比);
  cam.aspect = 宽高比;
  cam.near = 选项.近 ?? 0.05;
  cam.far = 选项.远 ?? 900;
  cam.position.copy(场景到three(c.pos));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three(c.tgt));
  if (c.roll) cam.rotateZ(rad(c.roll));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
};

/** 新建一台摆好的透视相机（画布外算投影用，比如伤害数字、头顶气泡；同 库/界面/伤害数字.tsx 的 makePerspectiveCamera，那边近、远是 0.1、1200） */
export const 做相机 = (c: Cam, 宽: number, 高: number, 选项?: 摆相机选项) => 摆相机(new THREE.PerspectiveCamera(), c, 宽 / 高, 选项);

/** 场景点投到画面上：返回像素坐标（左上角原点）和深度（相机前方为正，格） */
export const 投到画面 = (cam: THREE.PerspectiveCamera, 点: readonly number[], 宽: number, 高: number) => {
  const v = 场景到three(点);
  const 深 = -v.clone().applyMatrix4(cam.matrixWorldInverse).z;
  v.project(cam);
  return { x: ((v.x + 1) / 2) * 宽, y: ((1 - v.y) / 2) * 高, 深 };
};
