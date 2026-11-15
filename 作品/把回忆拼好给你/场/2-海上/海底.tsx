// 海底（试看，用户 11-05「海底的那些方块怎么都没看到」）：原来海面底下什么都没有。这里照原版海洋铺一块：
// 水深按噪声在 深 附近起伏，每列最上面那块和水草照导入的真实地形量出来的分布挑（engine/voxel/远景海底.ts，海洋群系第 0 级），贴图取方块图集里的原版贴图。
// 只在光影开了 水透（看得到水下）时画，不开时水不透明、反正看不到。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { hash2, simplex2 } from '@engine/core/噪声.ts';
import { png } from '@engine/model/贴图.ts';
import { kelpDensity, patchRoll, pickPlant, pickSolid, seabedFor } from '@engine/voxel/远景海底.ts';
import { textureNames } from '@engine/voxel/真实方块表.ts';
import texUri from 'asset:贴图/场景/关键帧/方块表';

/** 半边（格，以原点为中心）、平均水深、起伏（格）、往下填到多深 */
const seabed = { 半边: 80, depth: 12, 起伏: 3, bottom: 18 } as const;
const biome = 'minecraft:ocean';

let seabedImg: ReturnType<typeof png> | null = null;
const textureCache = new Map<string, THREE.DataTexture>();
const loadTexture = (textureName: string) => {
  let t = textureCache.get(textureName);
  if (t) return t;
  seabedImg ??= png(texUri);
  const i = textureNames.indexOf(`minecraft:block/${textureName}`);
  if (i < 0) throw new Error(`方块图集里没有 ${textureName}`);
  const c = seabedImg.w;
  const d = new Uint8Array(c * c * 4);
  // png 从上往下排，DataTexture 第 0 行在下面
  for (let y = 0; y < c; y++) d.set(seabedImg.px.subarray((i * c + y) * c * 4, (i * c + y + 1) * c * 4), (c - 1 - y) * c * 4);
  t = new THREE.DataTexture(d, c, c, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  textureCache.set(textureName, t);
  return t;
};

// 十字面片（花草的模型：两片对角竖着），底边在 z = 0
const crossGeometry = (() => {
  const g = new THREE.BufferGeometry();
  const p: number[] = [], uv: number[] = [];
  for (const [ax, ay] of [[1, 1], [1, -1]] as const) {
    const h = 0.5;
    const a = [-ax * h, -ay * h], b = [ax * h, ay * h];
    p.push(a[0]!, a[1]!, 0, b[0]!, b[1]!, 0, b[0]!, b[1]!, 1, a[0]!, a[1]!, 0, b[0]!, b[1]!, 1, a[0]!, a[1]!, 1);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
})();
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);

type SeabedLayout = { 实: Map<string, [number, number, number][]>; grass: Map<string, [number, number, number][]> };
const makeSeabedSwing = (): SeabedLayout => {
  const solid = new Map<string, [number, number, number][]>();
  const grass = new Map<string, [number, number, number][]>();
  const addTo = (m: Map<string, [number, number, number][]>, k: string, v: [number, number, number]) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
  const n = simplex2(23);
  for (let x = -seabed.半边; x < seabed.半边; x++)
    for (let y = -seabed.半边; y < seabed.半边; y++) {
      const depth = Math.round(seabed.depth + seabed.起伏 * n(x / 24, y / 24));
      const s = seabedFor(biome, 0, depth);
      if (!s) continue;
      // 游戏坐标 (x, z) = 场景 (x, −y)
      const topBlock = pickSolid(s.solid, patchRoll(x, -y, 3)).replace('minecraft:', '');
      const blockName = topBlock === 'grass_block' ? 'dirt' : topBlock;
      for (let z = -depth; z > -seabed.bottom; z--) addTo(solid, z === -depth ? blockName : 'stone', [x + 0.5, y + 0.5, z - 0.5]);
      const p = pickPlant(s.plants, hash2(x, -y, 5), kelpDensity(x, -y));
      if (!p) continue;
      const [blockId, cellCount] = p;
      for (let k = 0; k < cellCount && -depth + k < -1; k++) {
        const topCell = k === cellCount - 1 || -depth + k + 1 >= -1;
        const sprite = blockId === 'minecraft:seagrass' ? 'seagrass' : blockId === 'minecraft:tall_seagrass' ? (k === 0 ? 'tall_seagrass_bottom' : 'tall_seagrass_top') : topCell ? 'kelp' : 'kelp_plant';
        addTo(grass, sprite, [x + 0.5, y + 0.5, -depth + k]);
      }
    }
  return { 实: solid, grass };
};

const batchGroup = ({ geometry, 名: textureName, positions, 镂空: cutout }: { geometry: THREE.BufferGeometry; 名: string; positions: [number, number, number][]; 镂空?: boolean }) => {
  const mesh = useMemo(() => {
    const material = new THREE.MeshLambertMaterial({ map: loadTexture(textureName), alphaTest: cutout ? 0.5 : 0, side: cutout ? THREE.DoubleSide : THREE.FrontSide });
    const m = new THREE.InstancedMesh(geometry, material, positions.length);
    const o = new THREE.Object3D();
    positions.forEach((p, i) => {
      o.position.set(...p);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.computeBoundingSphere();
    return m;
  }, [geometry, textureName, positions, cutout]);
  return <primitive object={mesh} />;
};
const Batch = batchGroup as unknown as React.FC<Parameters<typeof batchGroup>[0]>;

let seabedSwing: SeabedLayout | null = null;
export const SeaFloorBlocks: React.FC = () => {
  seabedSwing ??= makeSeabedSwing();
  const { 实: solid, grass } = seabedSwing;
  return (
    <group>
      {[...solid].map(([blockName, positions]) => <Batch key={blockName} geometry={blockGeometry} 名={blockName} positions={positions} />)}
      {[...grass].map(([grassName, positions]) => <Batch key={grassName} geometry={crossGeometry} 名={grassName} positions={positions} 镂空 />)}
    </group>
  );
};

/** 试看开了 水透 才画（pipeline/渲/光影试看.ts 的页面环境变量） */
export const shouldDrawSeabed = () => {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.REMOTION_ANIM_LIGHTING;
  return !!v && !!(JSON.parse(v) as { seeThrough?: unknown }).seeThrough;
};
