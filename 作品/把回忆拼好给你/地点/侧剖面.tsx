// 侧剖面的正交机位和原版明暗灯：机位朝正北（+y）平视，画面右边是东，场景内容放在 rotation [−π/2, 0, 0] 的 group 里（Z 朝上，同 机位.tsx）。
// ThreeCanvas 要带 orthographic（默认相机换成正交）；色调映射关掉，贴图颜色原样出。
// 像素对齐：每格像素按成片 2560×1440 算（一个贴图像素 = 每格 ÷ 16，取整数）；画面中心落在整像素上，贴图像素的边就都落在整像素上（取景见 场/2-门口/参数.ts）。
import { useThree } from '@react-three/fiber';
import type React from 'react';
import * as THREE from 'three';

/** 成片页面是 1280×720，渲染 scale 2 出 2560×1440；每格像素按出片的像素算 */
export const 出片倍数 = 2;

/** 取景：中心 = 画面中心对着的 [x, z]（格）；每格 = 一格在 2560×1440 上占几个像素 */
export type 侧取景 = { 中心: readonly [number, number]; 每格: number };

export const 正交侧机位: React.FC<侧取景> = ({ 中心, 每格 }) => {
  const { camera, size, gl } = useThree();
  gl.toneMapping = THREE.NoToneMapping;
  const cam = camera as THREE.OrthographicCamera;
  // 自己管视锥，不让 R3F 按画布尺寸改回去
  (cam as THREE.OrthographicCamera & { manual?: boolean }).manual = true;
  const 半宽 = (size.width * 出片倍数) / 每格 / 2;
  const 半高 = (size.height * 出片倍数) / 每格 / 2;
  cam.left = -半宽;
  cam.right = 半宽;
  cam.top = 半高;
  cam.bottom = -半高;
  cam.zoom = 1;
  cam.near = 1;
  cam.far = 2000;
  // 场景 (x, y, z) 在 three 里是 (x, z, −y)：站在南边 y = −500 往北看
  cam.position.set(中心[0], 中心[1], 500);
  cam.up.set(0, 1, 0);
  cam.lookAt(中心[0], 中心[1], 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

// 原版方块的朝向明暗（ModelBlockRenderer / Direction 的 shade）：顶面 1.0、南北 0.8、东西 0.6、底面 0.5，按 sRGB 数值乘。
// 侧剖面朝镜头的是南面，按 正面亮度 归一（南面 = 贴图原色 × 正面亮度），其余面照原版比例；灯在线性空间里加，所以比例按 2.2 次方换算。
// three 的漫反射是 颜色 × 光强 ÷ π，所以光强都乘 π。顶面会超过 1（被夹），平视看不到顶面。
const 线性比 = (sRGB比: number) => sRGB比 ** 2.2;

/** 在 Z 朝上的 group 里用。亮度：整体再乘一个数（sRGB，夜里压暗用）；正面亮度：南面相对贴图原色（sRGB，默认 1） */
export const 原版明暗灯: React.FC<{ 亮度?: number; 正面亮度?: number }> = ({ 亮度 = 1, 正面亮度 = 1 }) => {
  const k = 线性比(亮度 * 正面亮度) * Math.PI;
  const 底 = 线性比(0.5 / 0.8); // 底面只吃环境光
  const 顶 = 线性比(1 / 0.8) - 底;
  const 南北 = 1 - 底;
  const 东西 = 线性比(0.6 / 0.8) - 底;
  return (
    <>
      <ambientLight intensity={底 * k} />
      <directionalLight position={[0, 0, 1]} intensity={顶 * k} />
      <directionalLight position={[0, -1, 0]} intensity={南北 * k} />
      <directionalLight position={[0, 1, 0]} intensity={南北 * k} />
      <directionalLight position={[1, 0, 0]} intensity={东西 * k} />
      <directionalLight position={[-1, 0, 0]} intensity={东西 * k} />
    </>
  );
};
