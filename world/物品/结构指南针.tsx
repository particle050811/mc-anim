// 结构指南针：6-2-1、6-2-2 平放在桌角，6-2-3 李樱抓起来看指针转半圈停住，6-2-4 递给九胡，之后一直握在她右手里（模型/角色/九胡持指南针.tsx），6-3-1 在边城上空拿到身前看一眼。
// 原文叫「结构指南针」，用户口头叫「探险家指南针」，就是模组 Explorer's Compass（作者 ChaosTheDude，modid explorerscompass，Forge 1.20.1-1.4.0，
// jar 放 game/缓存/mods/ExplorersCompass-1.20.1-1.4.0-forge.jar；许可 CC BY-NC-SA 4.0）。设定/物品/结构指南针.png 由 npm run 取材 -- 结构指南针 从 jar 的 textures/item/explorerscompass_16.png 原样导出。
//
// jar 里没有立体模型：models/item/explorerscompass*.json 都是 parent item/generated 的平面贴图，指针靠 32 张贴图（explorerscompass_00～31.png）按 angle 换帧画出来，_16 是指针朝上那一帧。
// 平面薄片侧面没有厚度（用户 10-10 要求建模），所以照贴图搭一个立体的，尺寸都从贴图量：
// - 贴图画的是从斜上方看的罗盘：表盘是 12×6 像素的扁椭圆（第 2～13 列、第 4～9 行），下面 3～4 行是表圈内壁和表壳的侧面。所以表盘直径 12 像素、表壳外径 14 像素（第 1～14 列）。
//   厚 4 像素（用户 10-11 定）：背板、壳身、表圈三层各 4/3 像素，表盘凹进表圈的深度、指针浮起的高度和针的厚度也跟着乘 4/3。
// - 指针取横着的两帧（_08、_24，没被压扁）：白色针身从轴伸出 6 像素，轴两边各一格灰色横杆，轴后面 2 格灰色针尾；竖着的帧（_16）是透视压扁的。
//   这里轴做成凸起的灰色轴帽，白针身从轴帽边上伸出 4.5 格（针尖离轴 5 格）：像素圆的表盘在 45° 方向只有 5.5 格多，针再长转到斜角就扎进表圈。
// - 颜色全部从贴图取：表盘、白针身、灰针尾和轴、表圈顶面（第 2、3 行的外圈）、表壳侧面和背面（第 11、12 行的侧面那一条）、表圈内壁（第 10 行那条暗边）。
//   表圈和表壳的面按 1 像素一格，从对应那一行的像素里按格子位置散列着挑，和贴图一样是一格一格的杂色金属；不照搬贴图里画死的左上亮右下暗（明暗交给场景的灯）：
//   侧面那条里最暗的 #5a595a 是画上去的阴影，侧面不取，只留给表圈内壁。
// - 贴图四周那几颗白色亮点是图标上的闪光，不做。
// - 不做挂环：贴图 32 帧逐张看过都没有挂环（用户 10-11 明确不要）。
// 风格和项目里别的方块模型一样：1 像素一格的平面色块、最近邻取色，不加描边；材质同 lib/物品贴图.tsx 的 `ItemSprite`（粗糙度 0.8、自发光 0.25 打底）。
//
// 坐标（物品空间，单位格，同原来的 `ItemSprite`）：表盘中心在原点，正面朝 +Z、贴图上方 = +Y、右 = +X，表壳外径 14/16、厚 4/16。
// 背面留在原来薄片背面的位置（z = -1/32），厚度全往正面长：桌上平放（6-2-1 的 `COMPASS_ON_TABLE`）、托在拳头上的接触面都不变。
// 镜头里都按 0.38 倍用（6-2-1～6-2-4、6-3-1 的 `COMPASS_SIZE` / `compassScale`）。
// 指针：度，绕表盘法线转，0 = 指向贴图上方，正 = 正对表盘看逆时针（6-2-1/编排.ts 的 `needle`、6-3-1/编排.ts 的 `指针` 都按这个给）；轴在表盘正中。游戏里指针只有 32 档，这里连续转，编排里给的角度原样用。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import { png } from '../../engine/model/贴图.ts';
import tex from 'asset:贴图/物品/结构指南针';

type RGB = [number, number, number];
type Vec3 = [number, number, number];

// ---------- 从贴图取色（坐标是贴图的列、行） ----------
const texPng = png(tex);
const pixelAt = (x: number, y: number): RGB => {
  const i = (y * texPng.w + x) * 4;
  return [texPng.px[i], texPng.px[i + 1], texPng.px[i + 2]];
};
const rowColors = (y: number, x0: number, x1: number) => Array.from({ length: x1 - x0 + 1 }, (_, k) => pixelAt(x0 + k, y));
const dialColor = pixelAt(5, 5); // #2f2f2f
const needleWhite = pixelAt(8, 5); // #ffffff
const needleGray = pixelAt(7, 7); // #646464
const bezelTopColors = [...rowColors(2, 4, 10), ...rowColors(3, 4, 12)]; // 外圈顶上那两行（第 3 行两头的 #e4e9e9 是闪光，不取）
const innerWallColor = pixelAt(7, 10); // #5a595a，表圈里侧的暗边（贴图第 10 行中间那条）
const caseSideColors = [...rowColors(11, 3, 12), ...rowColors(12, 5, 10)].filter((c) => c[0] !== innerWallColor[0]); // 表壳侧面那一条，去掉画上去的阴影色

// 按格子位置散列着挑色（固定结果，每次渲染一样）
const pickColor = (choices: RGB[], ...k: number[]) => {
  let hash = 2166136261;
  for (const keyPart of k) hash = Math.imul(hash ^ (keyPart + 1000), 16777619);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  return choices[(hash >>> 0) % choices.length];
};

// ---------- 调色板贴图：每种颜色占一格，面的 uv 指到那一格的中心 ----------
const paletteColors: RGB[] = [];
const colorIndex = (color: RGB) => {
  let i = paletteColors.findIndex((d) => d[0] === color[0] && d[1] === color[1] && d[2] === color[2]);
  if (i < 0) i = paletteColors.push(color) - 1;
  return i;
};

// ---------- 拼网格（单位：像素，出网格时除以 16） ----------
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
type MeshBuffers = { pos: number[]; nor: number[]; color: number[]; idx: number[] };
const newMesh = (): MeshBuffers => ({ pos: [], nor: [], color: [], idx: [] });
// 四个角按顺序绕一圈，绕向按法线自动摆正（从外面看逆时针）
const addFace = (mesh: MeshBuffers, corners: Vec3[], normal: Vec3, rgb: RGB) => {
  if (dot(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])), normal) < 0) corners = [corners[0], corners[3], corners[2], corners[1]];
  const baseIdx = mesh.pos.length / 3;
  const k = colorIndex(rgb);
  for (const corner of corners) {
    mesh.pos.push(corner[0] / 16, corner[1] / 16, corner[2] / 16);
    mesh.nor.push(...normal);
    mesh.color.push(k);
  }
  mesh.idx.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
};
// 整个长方体六个面，颜色按面的朝向给
const addBox = (mesh: MeshBuffers, [x0, x1]: number[], [y0, y1]: number[], [z0, z1]: number[], colorOf: (normal: Vec3) => RGB) => {
  addFace(mesh, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], colorOf([0, 0, 1]));
  addFace(mesh, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], colorOf([0, 0, -1]));
  addFace(mesh, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], colorOf([0, 1, 0]));
  addFace(mesh, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], colorOf([0, -1, 0]));
  addFace(mesh, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], colorOf([1, 0, 0]));
  addFace(mesh, [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0], colorOf([-1, 0, 0]));
};

// ---------- 表壳：16×16 的格子（第 i 列、第 j 行，同贴图），一层 1 像素厚 ----------
// 格子 (i, j) 占 x ∈ [i-8, i-7]、y ∈ [7-j, 8-j]（像素）
const inCase = (i: number, j: number) => i >= 0 && j >= 0 && i < 16 && j < 16 && (i + 0.5 - 8) ** 2 + (j + 0.5 - 8) ** 2 <= 49; // 外径 14
const neighbors8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const onRim = (i: number, j: number) => inCase(i, j) && neighbors8.some(([dx, dy]) => !inCase(i + dx, j + dy)); // 最外一圈（斜着挨着外面也算），宽 1 像素
const inDial = (i: number, j: number) => inCase(i, j) && !onRim(i, j); // 表盘，直径 12
// 厚度方向（像素）：背面 z = -0.5，背板、壳身、表圈三层各 层厚，总厚 4（用户 10-11 定）
const layerThick = 4 / 3;
const backZ = -0.5;
const dialZ = backZ + 2 * layerThick; // 表盘面的 z
const layers = [
  { z: [backZ, backZ + layerThick], 有: inDial }, // 背板：比表壳收进一圈
  { z: [backZ + layerThick, dialZ], 有: inCase }, // 壳身
  { z: [dialZ, dialZ + layerThick], 有: onRim }, // 表圈：高出表盘一层
];
const caseMesh = (() => {
  const mesh = newMesh();
  const sideDirs: [number, number, Vec3][] = [[1, 0, [1, 0, 0]], [-1, 0, [-1, 0, 0]], [0, -1, [0, 1, 0]], [0, 1, [0, -1, 0]]];
  layers.forEach((layer, k) => {
    const [z0, z1] = layer.z;
    for (let j = 0; j < 16; j++)
      for (let i = 0; i < 16; i++) {
        if (!layer.有(i, j)) continue;
        const [x0, x1, y0, y1] = [i - 8, i - 7, 7 - j, 8 - j];
        if (k === layers.length - 1 || !layers[k + 1].有(i, j))
          addFace(mesh, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], k === layers.length - 1 ? pickColor(bezelTopColors, i, j) : dialColor);
        if (k === 0 || !layers[k - 1].有(i, j)) addFace(mesh, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], pickColor(caseSideColors, i, j, k, 9));
        for (const [di, dj, normal] of sideDirs) {
          if (layer.有(i + di, j + dj)) continue;
          // 侧面那一格的四个角：沿着这条边、从 z0 到 z1
          const ex = di === 1 ? x1 : di === -1 ? x0 : null;
          const ey = dj === -1 ? y1 : dj === 1 ? y0 : null;
          const corners: Vec3[] =
            ex !== null
              ? [[ex, y0, z0], [ex, y1, z0], [ex, y1, z1], [ex, y0, z1]]
              : [[x0, ey!, z0], [x1, ey!, z0], [x1, ey!, z1], [x0, ey!, z1]];
          const facesIn = k === layers.length - 1 && inDial(i + di, j + dj);
          addFace(mesh, corners, normal, facesIn ? innerWallColor : pickColor(caseSideColors, i, j, k, di, dj));
        }
      }
  });
  return mesh;
})();

// ---------- 指针（指针自己的坐标：轴在原点，针尖朝 +Y）：浮在表盘上方 1/4 层厚，厚 1/2 层厚（同表壳一起放厚） ----------
const needleMesh = (() => {
  const mesh = newMesh();
  const z = [dialZ + layerThick / 4, dialZ + (layerThick * 3) / 4];
  addBox(mesh, [-0.5, 0.5], [0.5, 5], z, () => needleWhite); // 针身
  addBox(mesh, [-0.5, 0.5], [-2.5, -0.5], z, () => needleGray); // 针尾
  addBox(mesh, [-1.5, -0.5], [-0.5, 0.5], z, () => needleGray); // 横杆
  addBox(mesh, [0.5, 1.5], [-0.5, 0.5], z, () => needleGray);
  addBox(mesh, [-0.5, 0.5], [-0.5, 0.5], [dialZ, dialZ + layerThick], () => needleGray); // 轴帽，和表圈一样高
  return mesh;
})();

// 调色板凑齐以后再建贴图和几何
const paletteTex = (() => {
  const width = paletteColors.length;
  const px = new Uint8Array(width * 4);
  paletteColors.forEach((c, i) => px.set([c[0], c[1], c[2], 255], i * 4));
  const t = new THREE.DataTexture(px, width, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const toGeometry = (mesh: MeshBuffers) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.color.flatMap((k) => [(k + 0.5) / paletteColors.length, 0.5]), 2));
  geo.setIndex(mesh.idx);
  return geo;
};
const caseGeo = toGeometry(caseMesh);
const needleGeo = toGeometry(needleMesh);

export const StructureCompass: React.FC<{ needle?: number; opacity?: number }> = ({ needle: needleDeg = 0, opacity = 1 }) => {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: paletteTex,
        roughness: 0.8,
        emissive: '#ffffff',
        emissiveMap: paletteTex,
        emissiveIntensity: 0.25,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
    [opacity],
  );
  return (
    <group>
      <mesh geometry={caseGeo} material={mat} castShadow receiveShadow />
      <group rotation={[0, 0, rad(needleDeg)]}>
        <mesh geometry={needleGeo} material={mat} castShadow receiveShadow />
      </group>
    </group>
  );
};
