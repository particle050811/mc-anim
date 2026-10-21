// 方块场景：渲染 工具/游戏取材/导出场景.py 导出的数据（长方体 + 花草面片 + 贴图）。
// look = 'textured' 用游戏贴图，按世界坐标铺，一格一张，用来看清远近和出场景取景图；
// look = 'flat' 每种材质一个平均色，给纯色参考模型参考视频用（带 MC 贴图的参考会让 Seedance 出图变糊）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Inst, Instanced } from './parts.tsx';
import { Png, crop } from './贴图.ts';

export type BlockSceneData = {
  uvOffset: number[];
  // 贴图都拼在和数据同名的图集 .png 里，x、y 是这一张在图集里的位置
  textures: { key: string; size: number; cutout: boolean; avg: string; x: number; y: number }[];
  // faces：+X、-X、+Y、-Y、+Z、-Z 六个面各 [贴图下标, u 方向 xyz, v 方向 xyz]（v 指向贴图图像的下方）；null = 只有纯色
  materials: { color: string; opacity: number; faces: number[][] | null }[];
  boxes: number[][]; // [中心 X, Y, Z, 尺寸 X, Y, Z, 材质下标]
  crosses: number[][]; // [底面中心 X, Y, Z, 贴图下标]
  // 按模型元素原样导出的方块（螺旋砖这类异形方块）：quads 每项 [贴图下标, 四个角各 xyz（相对方块最小角）, 四个角各 uv, 法线 xyz, 是否不受光]
  models: { color: string; quads: number[][] }[];
  instances: number[][]; // [模型下标, 方块最小角对应的 X, Y, Z]
  bodyRange: { x: number[]; y: number[] };
  markers: Record<string, number[][]>;
};

// 从图集里切出这一张，单独建成一张贴图（要各自重复平铺，不能直接用图集）
export const makeTexture = (atlas: Png, t: BlockSceneData['textures'][number]) => {
  const tex = new THREE.DataTexture(crop(atlas, t.x, t.y, t.size), t.size, t.size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  // 镂空贴图（花草、栏杆）不做多级缩小：缩小后透明度被平均，面片边缘会冒出细线
  tex.minFilter = t.cutout ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = !t.cutout;
  tex.needsUpdate = true;
  return tex;
};

const SHADE_FLOOR = 0.4;

type Buf = { pos: number[]; nor: number[]; uv: number[]; idx: number[] };
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

const build = (sceneData: BlockSceneData, atlas: Png, clearPlants?: number[][]) => {
  const bufs = new Map<number, Buf>();
  const buf = (tex: number) => {
    if (!bufs.has(tex)) bufs.set(tex, { pos: [], nor: [], uv: [], idx: [] });
    return bufs.get(tex)!;
  };
  const unlitBufs = new Map<number, Buf>();
  const unlit = (tex: number) => {
    if (!unlitBufs.has(tex)) unlitBufs.set(tex, { pos: [], nor: [], uv: [], idx: [] });
    return unlitBufs.get(tex)!;
  };
  const noShadowBufs = new Map<number, Buf>();
  const noShadow = (tex: number) => {
    if (!noShadowBufs.has(tex)) noShadowBufs.set(tex, { pos: [], nor: [], uv: [], idx: [] });
    return noShadowBufs.get(tex)!;
  };
  const flat: Inst[] = [];
  const glass = new Map<number, Inst[]>(); // 半透明的纯色材质（水）
  const off = sceneData.uvOffset;
  for (const [cx, cy, cz, sx, sy, sz, mi] of sceneData.boxes) {
    const material = sceneData.materials[mi];
    if (!material.faces) {
      if (material.opacity < 1) glass.set(mi, [...(glass.get(mi) ?? []), { p: [cx, cy, cz], s: [sx, sy, sz], c: material.color }]);
      else flat.push({ p: [cx, cy, cz], s: [sx, sy, sz], c: material.color });
      continue;
    }
    const boxCenter = [cx, cy, cz];
    const halfSize = [sx / 2, sy / 2, sz / 2];
    for (let faceIdx = 0; faceIdx < 6; faceIdx++) {
      const normalAxis = faceIdx >> 1;
      const sign = faceIdx % 2 === 0 ? 1 : -1;
      const sideAxis = (normalAxis + 1) % 3;
      const cc = (normalAxis + 2) % 3;
      const [ti, ux, uy, uz, vx, vy, vz] = material.faces[faceIdx];
      const faceBuf = buf(ti);
      const base = faceBuf.pos.length / 3;
      // 四个角按 (b, c) 逆时针排，法线朝 +a；朝 -a 的面把顺序反过来
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      if (sign < 0) corners.reverse();
      for (const [kb, kc] of corners) {
        const corner = [0, 0, 0];
        corner[normalAxis] = boxCenter[normalAxis] + sign * halfSize[normalAxis];
        corner[sideAxis] = boxCenter[sideAxis] + kb * halfSize[sideAxis];
        corner[cc] = boxCenter[cc] + kc * halfSize[cc];
        faceBuf.pos.push(corner[0], corner[1], corner[2]);
        faceBuf.nor.push(AXES[normalAxis][0] * sign, AXES[normalAxis][1] * sign, AXES[normalAxis][2] * sign);
        const uvPos = [corner[0] + off[0], corner[1] + off[1], corner[2] + off[2]];
        faceBuf.uv.push(uvPos[0] * ux + uvPos[1] * uy + uvPos[2] * uz, uvPos[0] * vx + uvPos[1] * vy + uvPos[2] * vz);
      }
      faceBuf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  // 花草：两片对角交叉的面片，贴图顶边在上
  const halfDiag = 0.5 * 0.9;
  for (const [x, y, z, ti] of sceneData.crosses) {
    if (clearPlants?.some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1)) continue;
    const plantBuf = buf(ti);
    for (const [dx, dy] of [[1, 1], [1, -1]]) {
      const base = plantBuf.pos.length / 3;
      plantBuf.pos.push(x - halfDiag * dx, y - halfDiag * dy, z, x + halfDiag * dx, y + halfDiag * dy, z, x + halfDiag * dx, y + halfDiag * dy, z + 1, x - halfDiag * dx, y - halfDiag * dy, z + 1);
      for (let i = 0; i < 4; i++) plantBuf.nor.push(0, 0, 1); // 法线朝上：草不分正反面，亮度和地面一致
      const inset = 0.002; // 略微内缩，免得取到对边的像素
      plantBuf.uv.push(inset, 1 - inset, 1 - inset, 1 - inset, 1 - inset, inset, inset, inset);
      plantBuf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  // 异形方块：每个实例把模型的面片平移过去。四个角的顺序是从外面看的左上、右上、右下、左下
  for (const [mi, x, y, z] of sceneData.instances ?? []) {
    for (const quad of sceneData.models[mi].quads) {
      // 模型里 shade:false 的面（螺旋砖凹进去的台阶）在游戏里不算明暗、没有投影，亮度只由贴图决定（贴图已画了假阴影），再按场景光照算会黑成一团。其余面照常受光但不接收投影（游戏里没有投影；和实机截图对照过）
      const modelBuf = quad[24] ? unlit(quad[0]) : noShadow(quad[0]);
      const base = modelBuf.pos.length / 3;
      for (let k = 0; k < 4; k++) {
        modelBuf.pos.push(x + quad[1 + k * 3], y + quad[2 + k * 3], z + quad[3 + k * 3]);
        modelBuf.uv.push(quad[13 + k * 2], quad[14 + k * 2]);
        modelBuf.nor.push(quad[21], quad[22], quad[23]);
      }
      modelBuf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const toMesh = (ti: number, meshBuf: Buf, lit: boolean, shadow = lit) => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(meshBuf.pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(meshBuf.nor, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(meshBuf.uv, 2));
    geom.setIndex(meshBuf.idx);
    const t = sceneData.textures[ti];
    const common = { map: makeTexture(atlas, t), alphaTest: t.cutout ? 0.5 : 0, side: t.cutout ? THREE.DoubleSide : THREE.FrontSide };
    // 受光面加一层自发光打底（贴图亮度的 `SHADE_FLOOR` 倍）：游戏里最暗的面也有朝向明暗的下限（底面 0.5、东西面 0.6），不打底凹槽和背光墙面比游戏黑得多（和实机截图对照过）
    const mat = lit
      ? new THREE.MeshStandardMaterial({ ...common, roughness: 0.95, emissive: '#ffffff', emissiveMap: common.map, emissiveIntensity: SHADE_FLOOR })
      : new THREE.MeshBasicMaterial(common);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    return mesh;
  };
  const meshes = [...[...bufs.entries()].map(([ti, meshBuf]) => toMesh(ti, meshBuf, true)), ...[...noShadowBufs.entries()].map(([ti, meshBuf]) => toMesh(ti, meshBuf, true, false)), ...[...unlitBufs.entries()].map(([ti, meshBuf]) => toMesh(ti, meshBuf, false))];
  return { meshes, flat, glass: [...glass.entries()] };
};

const GlassBoxes: React.FC<{ items: Inst[]; color: string; opacity: number }> = ({ items, color, opacity }) => {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.2, depthWrite: false }), [color, opacity]);
  const white = useMemo(() => items.map((it) => ({ ...it, c: '#ffffff' })), [items]);
  return <Instanced items={white} shadow={false} mat={mat} />;
};

// clearPlants：这些矩形 [x0, y0, x1, y1] 里不画花草（角色跑位上的草有一格高，会把腿整个挡住）
export const BlockScene: React.FC<{ data: BlockSceneData; atlas: Png; look?: 'textured' | 'flat'; clearPlants?: number[][] }> = ({ data: sceneData, atlas, look = 'textured', clearPlants }) => {
  const textured = useMemo(() => (look === 'textured' ? build(sceneData, atlas, clearPlants) : null), [sceneData, atlas, look, clearPlants]);
  const flatAll = useMemo<Inst[]>(
    () =>
      look === 'flat'
        ? [
            ...sceneData.boxes.map(([x, y, z, sx, sy, sz, matIdx]) => ({ p: [x, y, z], s: [sx, sy, sz], c: sceneData.materials[matIdx].color }) as Inst),
            // 异形方块在纯色模式下画成整格；最小角在 (x, y-1, z)（游戏的 +Z 是参考模型的 -Y）
            ...(sceneData.instances ?? []).map(([mi, x, y, z]) => ({ p: [x + 0.5, y - 0.5, z + 0.5], s: [1, 1, 1], c: sceneData.models[mi].color }) as Inst),
          ]
        : [],
    [sceneData, look],
  );
  if (!textured) return <Instanced items={flatAll} />;
  return (
    <group>
      {textured.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      {textured.flat.length > 0 && <Instanced items={textured.flat} />}
      {textured.glass.map(([mi, items]) => (
        <GlassBoxes key={mi} items={items} color={sceneData.materials[mi].color} opacity={sceneData.materials[mi].opacity} />
      ))}
    </group>
  );
};
