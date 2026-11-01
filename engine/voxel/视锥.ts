// 镜头视野判断：体素世界只建视野里的区段；几公里半径里整圈都建的话，
// 身后、两边看不见的块白白多花两三倍时间和内存（飞行镜头水平视角 90°）。
// 调用方要先更新镜头的世界矩阵（世界.tsx），这里读到的才是这一帧的视野。
import * as THREE from 'three';

const fr = new THREE.Frustum();
const viewProj = new THREE.Matrix4();
const box = new THREE.Box3();

// 返回一个判断函数：场景坐标（Z 朝上、北 = +Y）的长方体 [x0, x1] × [y0, y1] × [z0, z1] 有没有一部分在视野里。
// 场景整体转成 three 的 Y 朝上：(x, y, z) → (x, z, -y)
export const makeFrustumTest = (camera: THREE.Camera) => {
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  fr.setFromProjectionMatrix(viewProj);
  return (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    box.min.set(x0, z0, -y1);
    box.max.set(x1, z1, -y0);
    return fr.intersectsBox(box);
  };
};
