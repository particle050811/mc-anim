// 撕页的手：史蒂夫第一人称的方块手臂（库/角色/史蒂夫第一人称.tsx：原版宽手臂、steve 皮肤，肩那头四行青色袖子），从画面右下伸过来，手那头顶在撕页本那页的右下角上。
// 放在 <像素空间> 里（单位贴图像素）、包在 <描边> 里，和桌上的东西同一套平涂、描边。不画脸，人只露这只手。
// 大小：原版第一人称的手比世界里的方块大得多（手那一遍单独画、贴着镜头）；这里一个皮肤像素 = 倍 个贴图像素（整数倍，边还落在同一张像素网格上），
//   倍 6 时手臂 24 个贴图像素宽，手那头比撕页本的角大一圈，从桌沿伸到画面底边，肩那头的青色袖子露在画面里。
// 摆法：手臂沿 斜（离竖直往右偏几度）从右下往左上伸，绕手臂自己的轴 滚 几度露出内侧那面，手那头往里 俯 几度（离镜头远、肩那头近）。数都在 分屏参数.ts。
import type React from 'react';
import * as THREE from 'three';
import { SteveFirstPersonArm } from '@库/角色/史蒂夫第一人称.tsx';

export type 手摆法 = {
  /** 一个皮肤像素几个贴图像素（整数） */
  倍: number;
  /** 手臂离竖直往右偏几度：0 = 从正下方竖着伸上来 */
  斜: number;
  /** 绕手臂的轴转几度（正 = 把小臂内侧那面转向镜头） */
  滚: number;
  /** 手那头往里（离镜头）低几度 */
  俯: number;
};

// 史蒂夫第一人称手臂的部件坐标（像素）：宽手臂方块占 x −3..1、y −2..10、z −2..2，y 往下是手那头，正面朝 −z
const 手端 = new THREE.Vector3(-1, 10, 0);

/** 手臂的摆放矩阵：手那头端面的中心落在 到（贴图像素，场景坐标 Z 朝上） */
export const 手臂矩阵 = (到: readonly [number, number, number], 摆: 手摆法): THREE.Matrix4 => {
  const r = Math.PI / 180;
  const [a, b] = [摆.斜 * r, 摆.俯 * r];
  // 部件 +y（肩 → 手）在场景里朝左上、往里：竖直往右偏 斜（从肩看手就是往左上），再往 +y（北，离镜头）低 俯
  const Y = new THREE.Vector3(-Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)).normalize();
  // 部件 +z（手背朝的反面，正面朝 −z 对着镜头）先取场景 +y 去掉沿手臂的分量
  const Z = new THREE.Vector3(0, 1, 0).addScaledVector(Y, -Y.y).normalize();
  Z.applyAxisAngle(Y, 摆.滚 * r);
  const X = new THREE.Vector3().crossVectors(Y, Z);
  const 转 = new THREE.Matrix4().makeBasis(X, Y, Z);
  return new THREE.Matrix4()
    .makeTranslation(到[0], 到[1], 到[2])
    .multiply(转)
    .multiply(new THREE.Matrix4().makeScale(摆.倍, 摆.倍, 摆.倍))
    .multiply(new THREE.Matrix4().makeTranslation(-手端.x, -手端.y, -手端.z));
};

export const 撕页手: React.FC<{ 到: readonly [number, number, number]; 摆: 手摆法 }> = ({ 到, 摆 }) => (
  <group matrix={手臂矩阵(到, 摆)} matrixAutoUpdate={false}>
    <SteveFirstPersonArm />
  </group>
);
