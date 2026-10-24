// 角色、实体的贴图像素对齐（05-画风 原则 3）。方块一个贴图像素 1/16 格，正交像素机位里正好 N 个成片像素；实体模型自带缩放（玩家 0.9375、魔法酒狐 0.65），
// 一个贴图像素不是整数像素（N = 6 时玩家 5.6），最近邻采样后宽窄不一、夹着 1 像素的细条。
// 这里绕锚点把包住的东西缩放到一个贴图像素正好 成片像素 个像素（整数），正交机位下再把锚点吸到画布像素网格：没转角度的面上每个贴图像素都是整数宽高，
// 动起来整个角色一像素一像素地走，各部件不错帧。透视机位只缩放不吸附，同一个角色在两种镜头里一样大。只吸附不缩放也行（不给 成片像素）。
// 限制：模型要在统一的贴图像素网格上（原版实体是，一个模型单位一个贴图像素）；YSM 模型（魔法酒狐、九胡）各方块的贴图像素大小不一、原点不在网格上，缩放救不了。
// 只管朝镜头的面：角色朝向要取 90° 的整数倍，骨骼转了角度的部件（挥手、歪头）照样斜着；
// 斜投影（顶面 > 0）里往里一个贴图像素画面上升 成片像素 × 顶面 / N，不是整数时角色身上的顶面（头顶、肩）一行 1、2 像素交替，部件之间竖直错开不到一像素。
import { useFrame } from '@react-three/fiber';
import React, { useRef } from 'react';
import * as THREE from 'three';
import type { V3 } from '../model/parts.tsx';

export type 贴图像素对齐参数 = {
  /** 缩放中心、吸附点：角色脚底（pose.loc），场景坐标（和包住的东西同一个坐标系） */
  锚: V3;
  /** 模型一个贴图像素多少格（MAGICAL_WINE_FOX.scale 这类）；给了 成片像素 才用 */
  模型像素?: number;
  /** 缩放到一个贴图像素在成片上几个像素（正整数，取偶数，预览级才不落半像素）；不给 = 不缩放、只吸附 */
  成片像素?: number;
  /** 正交机位的 N（方块一个贴图像素几个成片像素），用来把 成片像素 换成格 */
  N?: number;
};

/** 缩放倍数：一个贴图像素从 模型像素 格变成 成片像素 / (16N) 格 */
export const 对齐倍数 = (p: 贴图像素对齐参数): number => {
  if (p.成片像素 === undefined) return 1;
  if (!Number.isInteger(p.成片像素) || p.成片像素 < 1) throw new Error(`贴图像素对齐的 成片像素 要是正整数：${p.成片像素}`);
  if (!p.模型像素 || !p.N) throw new Error('贴图像素对齐给了 成片像素，还要给 模型像素 和 N');
  return p.成片像素 / (16 * p.N) / p.模型像素;
};

const 世界 = new THREE.Vector3();
const 右 = new THREE.Vector3();
const 上 = new THREE.Vector3();

export const 贴图像素对齐: React.FC<贴图像素对齐参数 & { children: React.ReactNode }> = ({ children, ...p }) => {
  const ref = useRef<THREE.Group>(null);
  const k = 对齐倍数(p);
  const [x, y, z] = p.锚;
  // 位置每帧在渲染前设（要等机位设好相机）；React 不管它，所以外层 group 不写 position
  useFrame(({ camera, size, viewport }) => {
    const g = ref.current;
    if (!g?.parent) return;
    g.position.set(x, y, z);
    const cam = camera as THREE.OrthographicCamera;
    if (!cam.isOrthographicCamera) return;
    g.parent.updateWorldMatrix(true, false);
    cam.updateMatrixWorld();
    世界.set(x, y, z).applyMatrix4(g.parent.matrixWorld);
    const ndc = 世界.clone().project(cam);
    const [宽, 高] = [size.width * viewport.dpr, size.height * viewport.dpr];
    const px = ((ndc.x + 1) / 2) * 宽;
    const py = ((1 - ndc.y) / 2) * 高;
    // 画布像素 / 格；斜投影只切进深方向，沿相机的右、上挪不改别的
    const 每格 = 高 / ((cam.top - cam.bottom) / cam.zoom);
    右.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    上.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    世界.addScaledVector(右, (Math.round(px) - px) / 每格).addScaledVector(上, -(Math.round(py) - py) / 每格);
    g.position.copy(g.parent.worldToLocal(世界));
  });
  return (
    <group ref={ref} scale={k}>
      <group position={[-x, -y, -z]}>{children}</group>
    </group>
  );
};
