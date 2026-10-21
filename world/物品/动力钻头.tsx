// 动力钻头：机械动力（Create 6.0.8）的 create:mechanical_drill。原文第 4 章：体内空间的机械动力部件给装备加成；第 1 场长矛冲刺击杀时矛头外包一个动力钻头虚影
// （绕矛的轴旋转，冲刺前一瞬亮起、穿出去后收掉，用户 10-02），做法同 6-3 重锤上的 动力压路机.tsx。
// 模型照抄 jar 里的钻头部分（npm run 取材 -- 动力钻头）：models/block/mechanical_drill/head.json（机壳是另一个模型 block.json，不要）。
//   head.json：一根 4×4 的轴（z 0～4 像素）、6×6 的芯和四片斜着的刃（z 9～13）、一节节变细的钻尖（z 12～20，砧的贴图），钻尖朝模型 +z，尖端伸出方块 4 像素。
//   导出后（lib/方块模型.tsx 的约定）钻尖朝 -Y、尖端在 y = -0.75，轴尾在 y = +0.5，最粗处半径 0.31 格。
// 坐标（局部，单位格）：钻的轴沿 Z，钻尖朝 +Z、尖端在 z = `DRILL.tip`，原点在方块中心（轴尾在 z = -0.5）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { BlockModelData } from '../../engine/model/方块模型.tsx';
import { makeTexture } from '../../engine/model/方块场景.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/物品/动力钻头';
import atlasPng from 'asset:贴图/物品/动力钻头';

const MODEL = raw as unknown as BlockModelData;
const ATLAS = png(atlasPng);
export const DRILL = {
  tip: 0.75, // 钻尖离原点（格）
  radius: 0.31, // 最粗处（刃）的半径
  colors: ['#454545', '#6c716d', '#555148'], // 砧铁、轴、安山机壳
};

// 套在长矛上（一镜到底/战利品.tsx 的 `SpearDrill`）：放大 1.1 倍；玩家模型整体 0.9375 倍，矛和钻头跟着缩。
// 管半径：矛尖连钻头虚影扫过的那一管有多粗（刃的半径），穿墙时管里的方块崩成粒子（模型/特效/方块飞溅.tsx）
export const SPEAR_FIT = { scale: 1.1, tubeRadius: DRILL.radius * 1.1 * 0.9375 };

const CENTER = [0.5, -0.5, 0.5];
// 绕 X 转 -90°：导出坐标里朝 -Y 的钻尖转到 +Z
const ROT = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
let geos: { g: THREE.BufferGeometry; tex: number }[] | null = null;
const geometries = () =>
  (geos ??= (() => {
    const byTex = new Map<number, { pos: number[]; nor: number[]; uv: number[]; idx: number[] }>();
    for (const quad of MODEL.parts.钻头.quads) {
      if (!byTex.has(quad[0])) byTex.set(quad[0], { pos: [], nor: [], uv: [], idx: [] });
      const buf = byTex.get(quad[0])!;
      const base = buf.pos.length / 3;
      for (let k = 0; k < 4; k++) {
        buf.pos.push(quad[1 + k * 3] - CENTER[0], quad[2 + k * 3] - CENTER[1], quad[3 + k * 3] - CENTER[2]);
        buf.uv.push(quad[13 + k * 2], quad[14 + k * 2]);
        buf.nor.push(quad[21], quad[22], quad[23]);
      }
      buf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    return [...byTex.entries()].map(([tex, buf]) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      geo.setIndex(buf.idx);
      geo.applyMatrix4(ROT);
      return { g: geo, tex };
    });
  })());

// 虚影：半透明、偏青白的自发光，两面都画，不写深度、不投影（同 动力压路机.tsx 的 ghost）。opacity 0 不画。
// 实物（ghost false）只给预览核对形状用
export const MechanicalDrillHead: React.FC<{ opacity?: number; ghost?: boolean; tint?: string }> = ({ opacity = 1, ghost = false, tint = '#cfeeff' }) => {
  const mats = useMemo(
    () =>
      geometries().map(({ tex }) => {
        const t = MODEL.textures[tex];
        const map = makeTexture(ATLAS, t);
        return ghost
          ? new THREE.MeshStandardMaterial({ map, color: tint, emissive: tint, emissiveMap: map, emissiveIntensity: 1.1, transparent: true, opacity, alphaTest: t.cutout ? 0.3 : 0, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6 })
          : new THREE.MeshStandardMaterial({ map, roughness: 0.85, alphaTest: t.cutout ? 0.5 : 0, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.4, side: THREE.DoubleSide });
      }),
    [ghost, opacity, tint],
  );
  if (opacity <= 0) return null;
  return (
    <group>
      {geometries().map(({ g: geo }, i) => (
        <mesh key={i} geometry={geo} material={mats[i]} castShadow={!ghost} receiveShadow={!ghost} renderOrder={ghost ? 10 : 0} />
      ))}
    </group>
  );
};
