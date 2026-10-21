// 边城的画法：布局.ts 搭好的体素合并成长方体（几万个），一个长方体画成 InstancedMesh 的一个实例（一个单位立方体，实例矩阵缩放到长方体大小）。
// 贴图不靠 uv：片元着色器按城里的坐标取图集，每格（1 米）一张，所以长方体合并得再大，看上去也是一格一格的方块。
// 颜色、光照和别的场景一致（同 lib/方块网格.tsx 的导出网格）：贴图 × 游戏面朝向亮度（上 1、下 0.5、南北 0.8、东西 0.6，换成线性），MeshStandardMaterial 粗糙度 0.95，
// 场景里同一套灯，再加 0.4 倍自身颜色的自发光打底；远处一个像素盖住好几格时按导数选多级纹理（封顶 4 级 = 每张贴图的平均色），不出摩尔纹。
// 同一种方块里按格子随机换贴图（石砖里混裂纹、苔石砖）也在着色器里做：按这一面所属那格的整数坐标取哈希。
import * as THREE from 'three';
import { png } from '../../../engine/model/贴图.ts';
import atlasUri from 'asset:贴图/场景/边城/方块贴图';
import { ATLAS, blockTable, type BlockName } from './方块.ts';
import { mergeCuboids, type Cuboid } from './体素.ts';

let tex: THREE.DataTexture | null = null;
const atlasTexture = () => {
  if (!tex) {
    const image = png(atlasUri);
    tex = new THREE.DataTexture(image.px, image.w, image.h, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
  }
  return tex;
};

let mat: THREE.MeshStandardMaterial | null = null;
const townMaterial = () => {
  if (mat) return mat;
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, emissive: '#ffffff' });
  material.onBeforeCompile = (sh) => {
    sh.uniforms.townAtlas = { value: atlasTexture() };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aTiles; attribute vec4 aAlt; attribute float aSwap;
varying vec3 vTP; varying vec3 vTN;
flat varying vec4 vTiles; flat varying vec4 vAlt; flat varying float vSwap;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vTP = (instanceMatrix * vec4(position, 1.0)).xyz;
  vTN = normal; vTiles = aTiles; vAlt = aAlt; vSwap = aSwap;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D townAtlas;
varying vec3 vTP; varying vec3 vTN;
flat varying vec4 vTiles; flat varying vec4 vAlt; flat varying float vSwap;
vec3 townSample(float tile, vec2 p) {
  vec2 grid = vec2(${ATLAS.cols}.0, ${ATLAS.rows}.0);
  vec2 cell = vec2(mod(tile, grid.x), floor(tile / grid.x));
  vec2 uv = (cell + fract(p) * vec2(1.0, -1.0) + vec2(0.0, 1.0)) / grid;
  vec2 tc = p * 16.0;
  float rho = max(length(dFdx(tc)), length(dFdy(tc)));
  return textureLod(townAtlas, uv, clamp(log2(max(rho, 1e-6)), 0.0, 4.0)).rgb;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    vec3 n = normalize(vTN);
    vec3 a = abs(n);
    float tile; vec2 p; float sh; float bit;
    if (a.z > max(a.x, a.y)) { tile = n.z > 0.0 ? vTiles.z : vTiles.w; p = vTP.xy; sh = n.z > 0.0 ? 1.0 : 0.5; bit = 4.0; }
    else if (a.y > a.x) { tile = vTiles.y; p = vTP.xz; sh = 0.8; bit = 2.0; }
    else { tile = vTiles.x; p = vTP.yz; sh = 0.6; bit = 1.0; }
    if (mod(floor(vSwap / bit), 2.0) > 0.5) p = p.yx;
    if (vAlt.z + vAlt.w > 0.0) {
      ivec3 b = ivec3(floor(vTP - n * 0.5));
      uint h = uint(b.x + 4096) * 73856093u ^ uint(b.y + 4096) * 19349663u ^ uint(b.z + 4096) * 83492791u;
      h = (h ^ (h >> 13u)) * 1274126177u;
      float u = float((h ^ (h >> 16u)) & 65535u) / 65536.0;
      if (u < vAlt.z) tile = vAlt.x;
      else if (u < vAlt.z + vAlt.w) tile = vAlt.y;
    }
    diffuseColor.rgb *= townSample(tile, p) * pow(sh, 2.2);
  }`,
      )
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = diffuseColor.rgb * 0.4;');
  };
  mat = material;
  return material;
};

// 方块名 ↔ 编号（实例属性里存的是贴图号，这里只是合并时区分方块）
const blockNames = Object.keys(blockTable) as BlockName[];
const indexByName = new Map(blockNames.map((n, i) => [n as string, i]));

// 一批长方体 → 一个 InstancedMesh
export const cuboidMesh = (boxes: Cuboid[]) => {
  const count = boxes.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0.5, 0.5, 0.5);
  const tiles = new Float32Array(count * 4);
  const alt = new Float32Array(count * 4);
  const swap = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geo, townMaterial(), count);
  const arr = mesh.instanceMatrix.array as Float32Array;
  boxes.forEach(([x, y, z, sx, sy, sz, blockIdx], i) => {
    arr.set([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1], i * 16);
    const def = blockTable[blockNames[blockIdx]];
    tiles.set([def.X, def.Y, def.顶, def.底], i * 4);
    alt.set(def.变, i * 4);
    swap[i] = def.换;
  });
  mesh.instanceMatrix.needsUpdate = true;
  geo.setAttribute('aTiles', new THREE.InstancedBufferAttribute(tiles, 4));
  geo.setAttribute('aAlt', new THREE.InstancedBufferAttribute(alt, 4));
  geo.setAttribute('aSwap', new THREE.InstancedBufferAttribute(swap, 1));
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export const mergeToCuboids = (v: Parameters<typeof mergeCuboids>[0]) => mergeCuboids(v, (name) => indexByName.get(name)!);
export const blockIndex = (name: BlockName) => indexByName.get(name)!;
