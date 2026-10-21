// 方块模型：渲染 工具/游戏取材/导出模型.py 导出的 Java 版方块 / 物品模型（机器、物品这类单个模型）。
// 数据里每个部件（part）是一组面片，和方块场景里异形方块的面片同一种格式；一个部件画成一个网格，
// 外面套 <group> 就能单独转动（风扇叶片、门、拉杆）。
// 坐标：单位是格，原点在方块中心（导出数据里方块占 X 0..1、Y -1..0、Z 0..1，这里减掉了中心）。
// 游戏里的北（-Z）= 这里的 +Y，游戏里的上 = 这里的 +Z。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { type BlockSceneData, makeTexture } from './方块场景.tsx';
import type { Png } from './贴图.ts';

export type BlockModelData = {
  textures: BlockSceneData['textures'];
  // quads 每项：[贴图下标, 四个角各 xyz, 四个角各 uv, 法线 xyz, 是否不受光]，四个角从外面看是左上、右上、右下、左下
  parts: Record<string, { color: string; quads: number[][] }>;
};

const CENTER = [0.5, -0.5, 0.5];

const build = (model: BlockModelData, atlas: Png, part: string, opacity = 1, ghost?: string) => {
  const partData = model.parts[part];
  if (!partData) throw new Error(`模型里没有部件「${part}」，现有：${Object.keys(model.parts).join('、')}`);
  const byTex = new Map<number, { pos: number[]; nor: number[]; uv: number[]; idx: number[] }>();
  for (const quad of partData.quads) {
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
  return [...byTex.entries()].map(([ti, buf]) => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    geom.setIndex(buf.idx);
    const t = model.textures[ti];
    const map = makeTexture(atlas, t);
    // 镂空贴图（扇叶这种一张面片）两面都要画；自发光打底和方块场景一致，背光面不会黑成一团
    const mat = new THREE.MeshStandardMaterial({ map, alphaTest: t.cutout ? 0.5 : 0, side: t.cutout ? THREE.DoubleSide : THREE.FrontSide, roughness: 0.95, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.4 });
    // 半透明（虚化）：opacity < 1 时整体透明，不写深度
    if (opacity < 1) Object.assign(mat, { transparent: true, opacity, depthWrite: false });
    // 虚影：照 动力压路机.tsx 的虚影，贴图染成 ghost 色、自发光，半透明、不写深度、不投影，排在不透明的后面画。
    // three 的 alphaTest 比的是乘过 opacity 的 alpha，镂空的阈值跟着 opacity 缩，淡入时（opacity < 0.5）扇叶才不会整片被丢掉
    if (ghost) {
      Object.assign(mat, { color: new THREE.Color(ghost), emissive: new THREE.Color(ghost), emissiveIntensity: 1.1, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false, alphaTest: t.cutout ? 0.5 * opacity : 0 });
      mat.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = !ghost;
    mesh.receiveShadow = !ghost;
    if (ghost) mesh.renderOrder = 10;
    return mesh;
  });
};

// atlas：和模型数据同名的图集 .png（用 png() 读）；opacity：整体透明度（默认 1 不透明）；ghost：虚影的颜色（给了就按虚影画，见 build）
export const BlockModel: React.FC<{ data: BlockModelData; atlas: Png; part: string; opacity?: number; ghost?: string }> = ({ data, atlas, part, opacity = 1, ghost }) => {
  const meshes = useMemo(() => build(data, atlas, part, opacity, ghost), [data, atlas, part, opacity, ghost]);
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
};
