// 边城的房子：殖民地（MineColonies）建筑蓝图（工具/游戏取材/殖民地蓝图.py 导出：蓝图.json + 蓝图贴图.png），摆进城里、合并成长方体、一个 InstancedMesh 画完。
// 画法同 渲染.ts（贴图按城里的坐标每格取一张，颜色光照一样），不同的是这里每种方块六个面各一张贴图（导出时从六个方向投影画好），方块可转向、镜像：
//   照 Structurize 放蓝图的规则，先镜像（东西翻过来）再绕竖轴顺时针转 90°×转（楼梯、门朝向跟着变）；着色器里按这一格的转向、镜像把顶面、底面贴图转回去，侧面镜像时左右翻。
// 贴图的透明像素（栏杆、梯子、花盆镂空处）丢掉；窗玻璃、门在导出时已垫好屋里的暗色。
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import raw from 'asset:数据/场景/边城/蓝图';
import atlasUri from 'asset:贴图/场景/边城/蓝图贴图';

type BlockKind = { 盒: number[][]; 面: number[]; 合: number; 挡: boolean; 名: string };
type BlueprintData = { 尺寸: [number, number, number]; 格: string; 门: '南' | '北' | '东' | '西'; 来源: string };
const DATA = raw as unknown as { 列: number; 行: number; 种类: BlockKind[]; 蓝图: Record<string, BlueprintData> };
// 蓝图名照 蓝图.json 的键
export type BlueprintName =
  '橡木民居3' | '橡木民居5' | '橡木别居4' | '云杉民居3' | '云杉民居5' | '云杉别居4' | '深橡民居4' | '深橡别居5' | '运河楼橡木' | '运河楼橡木4' | '酒馆云杉' | '面包房橡木' | '铁匠铺云杉' | '铁匠铺深橡' | '厨房橡木'
  | '染坊云杉' | '石匠铺深橡' | '花店橡木' | '建筑工坊云杉' | '送货站橡木' | '仓库橡木' | '仓库深橡' | '市政厅橡木' | '医院云杉' | '学校深橡' | '兵营要塞' | '箭塔要塞' | '箭塔要塞别式' | '兵营云杉' | '箭塔深橡' | '水井'
  | '小水井' | '木料车' | '带篷马车' | '小马厩' | '路灯' | '喷泉' | '岗亭';
export const blueprintTable = DATA.蓝图 as Record<BlueprintName, BlueprintData>;

// ---------- 蓝图的格子（种类序号 + 1，0 = 空气），按 [z][y][x] 排 ----------
const cellCache = new Map<string, Uint16Array>();
export const blueprintCells = (name: BlueprintName) => {
  let cells = cellCache.get(name);
  if (cells) return cells;
  const blueprint = blueprintTable[name];
  const bin = atob(blueprint.格);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const rle = new Uint16Array(u8.buffer);
  const [sizeX, sizeY, sizeZ] = blueprint.尺寸;
  cells = new Uint16Array(sizeX * sizeY * sizeZ);
  let k = 0;
  for (let i = 0; i < rle.length; i += 2) {
    cells.fill(rle[i], k, k + rle[i + 1]);
    k += rle[i + 1];
  }
  cellCache.set(name, cells);
  return cells;
};

// ---------- 转过向、镜像过的种类（变体）：用到才登记，格子里存变体号 + 1 ----------
// 面的顺序：东 西 北 南 上 下（导出脚本的 DIRS）
type Variant = { boxes: number[][]; faces: number[]; mergeAxes: number; flag: number };
const variantTable: Variant[] = [];
const variantSource: number[] = []; // 每个变体来自哪种方块
const variantIdByKey = new Map<number, number>();
// 一个点 (x, y)（一格里 0..16）绕格子中心：先镜像（x → 16 - x），再顺时针转 r 次（东 → 南：(x, y) → (y, 16 - x)）
const rotatePoint = (x: number, y: number, turns: number, mirrored: boolean): [number, number] => {
  if (mirrored) x = 16 - x;
  for (let i = 0; i < turns; i++) [x, y] = [y, 16 - x];
  return [x, y];
};
// 方向（0 东 1 西 2 北 3 南）同样先镜像再顺时针转：东 → 南 → 西 → 北
const clockwiseNext = [3, 2, 0, 1];
const rotateDir = (dir: number, turns: number, mirrored: boolean) => {
  if (mirrored && dir < 2) dir = 1 - dir;
  for (let i = 0; i < turns; i++) dir = clockwiseNext[dir];
  return dir;
};
export const Variant = (kind: number, turns: number, mirrored: boolean): number => {
  const key = kind * 8 + turns * 2 + (mirrored ? 1 : 0);
  let id = variantIdByKey.get(key);
  if (id !== undefined) return id;
  const k = DATA.种类[kind];
  const boxes = k.盒.map(([x0, y0, z0, x1, y1, z1]) => {
    const [ax, ay] = rotatePoint(x0, y0, turns, mirrored);
    const [bx, by] = rotatePoint(x1, y1, turns, mirrored);
    return [Math.min(ax, bx), Math.min(ay, by), z0, Math.max(ax, bx), Math.max(ay, by), z1];
  });
  // 新的面 d 用的是原来哪一面的贴图：原方向 s 转过去变成 转向(s)
  const faces = new Array(6).fill(0);
  for (let side = 0; side < 4; side++) faces[rotateDir(side, turns, mirrored)] = k.面[side];
  faces[4] = k.面[4];
  faces[5] = k.面[5];
  const mergeAxes = turns % 2 ? (k.合 & 4) | ((k.合 & 1) << 1) | ((k.合 & 2) >> 1) : k.合;
  id = variantTable.length;
  variantTable.push({ boxes: boxes, faces: faces, mergeAxes: mergeAxes, flag: turns + (mirrored ? 4 : 0) });
  variantSource.push(kind);
  variantIdByKey.set(key, id);
  return id;
};
// 这个变体是不是不透光的整块（格子里存的是变体号 + 1）
export const isOpaque = (cell: number) => cell > 0 && DATA.种类[variantSource[cell - 1]].挡;

// ---------- 摆一张蓝图 ----------
// 格子：Uint16（变体号 + 1）。x0, y0：转过向以后的占地西南角（城的坐标）；z0：地面层放在哪一层（城里街面那一层是 0）
export class HouseGrid {
  readonly x0: number;
  readonly y0: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly c: Uint16Array;
  constructor(x0: number, x1: number, y0: number, y1: number, nz: number) {
    this.x0 = x0;
    this.y0 = y0;
    this.nx = x1 - x0;
    this.ny = y1 - y0;
    this.nz = nz;
    this.c = new Uint16Array(this.nx * this.ny * nz);
  }
  idx(x: number, y: number, z: number) {
    const i = x - this.x0;
    const j = y - this.y0;
    if (i < 0 || j < 0 || z < 0 || i >= this.nx || j >= this.ny || z >= this.nz) return -1;
    return (z * this.ny + j) * this.nx + i;
  }
}

// 转过向以后的占地大小
export const footprint = (name: BlueprintName, turns: number): [number, number] => {
  const [sizeX, sizeY] = blueprintTable[name].尺寸;
  return turns % 2 ? [sizeY, sizeX] : [sizeX, sizeY];
};
// 正门转过去以后朝哪边
const dirNames = ['东', '西', '北', '南'] as const;
export const doorFacing = (name: BlueprintName, r: number, m: boolean) => dirNames[rotateDir(dirNames.indexOf(blueprintTable[name].门), r, m)];
// 要让正门朝 want，转几次（不镜像时）
export const turnsToFace = (name: BlueprintName, want: '东' | '西' | '北' | '南', m = false) => [0, 1, 2, 3].find((r) => doorFacing(name, r, m) === want)!;

// 去地面：不要地面层（路灯这种立在街上的：地面层是填地形的占位方块，会变成街上一格草；去掉以后往下挪一层，灯柱从街面立起来）
export const placeBlueprint = (grid: HouseGrid, name: BlueprintName, x0: number, y0: number, z0: number, turns: number, mirrored: boolean, dropGround = false) => {
  const [sizeX, sizeY, sizeZ] = blueprintTable[name].尺寸;
  const cells = blueprintCells(name);
  const [footprintX, footprintY] = footprint(name, turns);
  if (dropGround) z0 -= 1;
  for (let z = dropGround ? 1 : 0; z < sizeZ; z++)
    for (let y = 0; y < sizeY; y++)
      for (let x = 0; x < sizeX; x++) {
        const k = cells[(z * sizeY + y) * sizeX + x];
        if (!k) continue;
        // 格子中心 (x+0.5, y+0.5) 按同样的规则转，再平移到占地里
        let px = x + 0.5;
        let py = y + 0.5;
        if (mirrored) px = sizeX - px;
        let cw = sizeX;
        let ch = sizeY;
        for (let i = 0; i < turns; i++) {
          [px, py] = [py, cw - px];
          [cw, ch] = [ch, cw];
        }
        const gx = x0 + Math.floor(px);
        const gy = y0 + Math.floor(py);
        if (gx - x0 >= footprintX || gy - y0 >= footprintY) continue;
        const i = grid.idx(gx, gy, z0 + z);
        if (i >= 0) grid.c[i] = Variant(k - 1, turns, mirrored) + 1;
      }
};

// ---------- 合并成长方体：同一个变体连成的一片，按它能合并的方向（合）合并 ----------
// 输出每个长方体：[x, y, z, 大小 x, y, z, 变体号]（城的坐标，米）
export const mergeHouses = (grid: HouseGrid): number[][] => {
  const { nx, ny, nz, c: cells } = grid;
  const done = new Uint8Array(cells.length);
  const out: number[][] = [];
  const same = (k: number, id: number) => cells[k] === id && !done[k];
  for (let z = 0; z < nz; z++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k0 = (z * ny + j) * nx + i;
        const id = cells[k0];
        if (!id || done[k0]) continue;
        const variant = variantTable[id - 1];
        let runX = 1;
        if (variant.mergeAxes & 1) while (i + runX < nx && same(k0 + runX, id)) runX++;
        let runY = 1;
        if (variant.mergeAxes & 2)
          grow: while (j + runY < ny) {
            const kr = k0 + runY * nx;
            for (let dx = 0; dx < runX; dx++) if (!same(kr + dx, id)) break grow;
            runY++;
          }
        let runZ = 1;
        if (variant.mergeAxes & 4)
          up: while (z + runZ < nz) {
            const kl = k0 + runZ * nx * ny;
            for (let dy = 0; dy < runY; dy++) for (let dx = 0; dx < runX; dx++) if (!same(kl + dy * nx + dx, id)) break up;
            runZ++;
          }
        for (let t = 0; t < runZ; t++) for (let dy = 0; dy < runY; dy++) done.fill(1, k0 + t * nx * ny + dy * nx, k0 + t * nx * ny + dy * nx + runX);
        const x = grid.x0 + i;
        const y = grid.y0 + j;
        for (const [bx0, by0, bz0, bx1, by1, bz1] of variant.boxes) {
          const sx = variant.mergeAxes & 1 ? runX : (bx1 - bx0) / 16;
          const sy = variant.mergeAxes & 2 ? runY : (by1 - by0) / 16;
          const sz = variant.mergeAxes & 4 ? runZ : (bz1 - bz0) / 16;
          out.push([x + bx0 / 16, y + by0 / 16, z + bz0 / 16, sx, sy, sz, id - 1]);
        }
      }
  return out;
};

// ---------- 画 ----------
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
const houseMaterial = () => {
  if (mat) return mat;
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, emissive: '#ffffff' });
  material.onBeforeCompile = (sh) => {
    sh.uniforms.houseAtlas = { value: atlasTexture() };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aT0; attribute vec3 aT1; attribute float aFlag;
varying vec3 vHP; varying vec3 vHN;
flat varying vec3 vT0; flat varying vec3 vT1; flat varying float vFlag;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vHP = (instanceMatrix * vec4(position, 1.0)).xyz;
  vHN = normal; vT0 = aT0; vT1 = aT1; vFlag = aFlag;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D houseAtlas;
varying vec3 vHP; varying vec3 vHN;
flat varying vec3 vT0; flat varying vec3 vT1; flat varying float vFlag;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    vec3 n = normalize(vHN);
    vec3 a = abs(n);
    int r = int(mod(vFlag, 4.0));
    bool mir = vFlag >= 3.5;
    float tile; vec2 uv; vec2 w; float sh;
    if (a.z > max(a.x, a.y)) {
      // 顶面、底面：这一格里的位置按 转、镜像 转回原来的方向（逆时针转 r 次，再镜像）
      vec2 q = fract(vHP.xy) - 0.5;
      for (int i = 0; i < 3; i++) if (i < r) q = vec2(-q.y, q.x);
      if (mir) q.x = -q.x;
      q += 0.5;
      if (n.z > 0.0) { tile = vT1.y; uv = vec2(q.x, 1.0 - q.y); sh = 1.0; } else { tile = vT1.z; uv = q; sh = 0.5; }
      w = vHP.xy;
    } else if (a.x > a.y) {
      float u = fract(vHP.y);
      if (n.x > 0.0) { tile = vT0.x; } else { tile = vT0.y; u = 1.0 - u; }
      if (mir) u = 1.0 - u;
      uv = vec2(u, 1.0 - fract(vHP.z)); sh = 0.6; w = vHP.yz;
    } else {
      float u = fract(vHP.x);
      if (n.y > 0.0) { tile = vT0.z; u = 1.0 - u; } else { tile = vT1.x; }
      if (mir) u = 1.0 - u;
      uv = vec2(u, 1.0 - fract(vHP.z)); sh = 0.8; w = vHP.xz;
    }
    vec2 grid = vec2(${DATA.列}.0, ${DATA.行}.0);
    vec2 cell = vec2(mod(tile, grid.x), floor(tile / grid.x));
    vec2 tc = w * 16.0;
    float rho = max(length(dFdx(tc)), length(dFdy(tc)));
    vec4 t = textureLod(houseAtlas, (cell + clamp(uv, 0.001, 0.999)) / grid, clamp(log2(max(rho, 1e-6)), 0.0, 4.0));
    if (t.a < 0.5) discard;
    diffuseColor.rgb *= t.rgb * pow(sh, 2.2);
  }`,
      )
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = diffuseColor.rgb * 0.4;');
  };
  mat = material;
  return material;
};

export const houseMesh = (boxes: number[][]) => {
  const count = boxes.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0.5, 0.5, 0.5);
  const t0 = new Float32Array(count * 3);
  const t1 = new Float32Array(count * 3);
  const flag = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geo, houseMaterial(), count);
  const arr = mesh.instanceMatrix.array as Float32Array;
  boxes.forEach(([x, y, z, sx, sy, sz, variantIdx], i) => {
    arr.set([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1], i * 16);
    const variant = variantTable[variantIdx];
    t0.set([variant.faces[0], variant.faces[1], variant.faces[2]], i * 3);
    t1.set([variant.faces[3], variant.faces[4], variant.faces[5]], i * 3);
    flag[i] = variant.flag;
  });
  mesh.instanceMatrix.needsUpdate = true;
  geo.setAttribute('aT0', new THREE.InstancedBufferAttribute(t0, 3));
  geo.setAttribute('aT1', new THREE.InstancedBufferAttribute(t1, 3));
  geo.setAttribute('aFlag', new THREE.InstancedBufferAttribute(flag, 1));
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};
