// 动力压路机：机械动力（Create 6.0.8）的 create:mechanical_roller。原文第 6 章李樱喊「Road Roller哒！」：体内空间的动力压路机让重锤下落伤害倍率增加、落地还能破坏方块。
// 镜头里是叠在重锤锤头上的半透明虚影（6-3-5 举锤时浮现，6-3-6 砸穿一路都在）；6-3-2 思索里是思索场景板上李樱锤头上的同一种虚影。
// 模型照抄 jar（npm run 取材 -- 动力压路机）：物品模型 models/block/mechanical_roller/item.json 是 forge:obj，item.obj 用了三张贴图（mtl 里的 roller_casing 外壳、roller_metal 支架、roller_wheel 滚筒），
//   导出时按材质分组拼成一张图集。obj 单位是格、Y 朝上：外壳是 0～1 的整格方块，滚筒是绕 X 轴的圆筒，中心 (0.5, 0, 0.81)、半径 0.75、宽 0.75，
//   滚筒底比外壳低 0.75 格、往前（+z）多伸出 0.56 格（压路机用滚筒的底压地面）；整件 1.25 × 1.75 × 1.6 格。
// 坐标（局部，单位格）：原点在滚筒中心，滚筒轴沿 X，压地的那一面朝 -Z，外壳在滚筒上方（+Z）、偏 +Y。换算：obj 先挪到滚筒中心，再绕 X 转 90°（obj 上 → +Z，obj +z 前方 → -Y），行列式为正、面不会翻。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { objGeometry, ObjModel } from '../../engine/model/OBJ网格.tsx';
import { entityTexture } from '../../engine/model/贴图方盒.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/物品/动力压路机';
import atlas from 'asset:贴图/物品/动力压路机';

const MODEL = raw as unknown as ObjModel;
const TEX = png(atlas);
export const ROLLER = {
  radius: 0.75, // 滚筒半径（格）
  width: 0.75, // 滚筒宽
  colors: ['#8a5a2b', '#6e6e72', '#a9a9ad'], // 外壳木框、铁件、滚筒
};

const OBJ_TO_LOCAL = new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(-0.5, 0, -0.8125));
let geos: THREE.BufferGeometry[] | null = null;
const geometries = () => (geos ??= Object.values(MODEL.groups).map((g) => objGeometry(g, OBJ_TO_LOCAL)));

// 虚影：半透明、偏青白的自发光，不写深度、不投影（opacity 0 不画）。实物：ghost false，opacity 小于 1 时是在淡入淡出，材质跟着半透明
// 镂空（用户 10-10 补）：roller_metal 贴图上滚筒外那圈铁箍有 149 个全透明像素，游戏里压路机按 cutout 画（RollerBlock 的渲染层），透过去看得到滚筒；
// 实物没开 alphaTest 时透明像素按 RGB（黑）画成实心，思索标题框里滚筒那圈成了一排黑方块。three 的 alphaTest 比的是乘过 opacity 的 alpha，阈值跟着 opacity 缩
export const MechanicalRoller: React.FC<{ opacity?: number; ghost?: boolean; tint?: string }> = ({ opacity = 1, ghost = false, tint = '#cfeeff' }) => {
  const map = entityTexture(TEX);
  const mat = useMemo(() => {
    const material = ghost
      ? new THREE.MeshStandardMaterial({ map, color: tint, emissive: tint, emissiveMap: map, emissiveIntensity: 1.1, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6 })
      : new THREE.MeshStandardMaterial({ map, roughness: 0.85, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.4, side: THREE.DoubleSide, transparent: opacity < 1, opacity, alphaTest: 0.5 * opacity });
    return material;
  }, [map, ghost, opacity, tint]);
  if (opacity <= 0) return null;
  return (
    <group>
      {geometries().map((g, i) => (
        <mesh key={i} geometry={g} material={mat} castShadow={!ghost} receiveShadow={!ghost} renderOrder={ghost ? 10 : 0} />
      ))}
    </group>
  );
};
