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
const 海底 = { 半边: 80, 深: 12, 起伏: 3, 底: 18 } as const;
const 群系 = 'minecraft:ocean';

let 图: ReturnType<typeof png> | null = null;
const 贴图cache = new Map<string, THREE.DataTexture>();
const 贴图 = (名: string) => {
  let t = 贴图cache.get(名);
  if (t) return t;
  图 ??= png(texUri);
  const i = textureNames.indexOf(`minecraft:block/${名}`);
  if (i < 0) throw new Error(`方块图集里没有 ${名}`);
  const c = 图.w;
  const d = new Uint8Array(c * c * 4);
  // png 从上往下排，DataTexture 第 0 行在下面
  for (let y = 0; y < c; y++) d.set(图.px.subarray((i * c + y) * c * 4, (i * c + y + 1) * c * 4), (c - 1 - y) * c * 4);
  t = new THREE.DataTexture(d, c, c, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  贴图cache.set(名, t);
  return t;
};

// 十字面片（花草的模型：两片对角竖着），底边在 z = 0
const 十字 = (() => {
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
const 方块 = new THREE.BoxGeometry(1, 1, 1);

type 摆 = { 实: Map<string, [number, number, number][]>; 草: Map<string, [number, number, number][]> };
const 摆海底 = (): 摆 => {
  const 实 = new Map<string, [number, number, number][]>();
  const 草 = new Map<string, [number, number, number][]>();
  const 放 = (m: Map<string, [number, number, number][]>, k: string, v: [number, number, number]) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
  const n = simplex2(23);
  for (let x = -海底.半边; x < 海底.半边; x++)
    for (let y = -海底.半边; y < 海底.半边; y++) {
      const 深 = Math.round(海底.深 + 海底.起伏 * n(x / 24, y / 24));
      const s = seabedFor(群系, 0, 深);
      if (!s) continue;
      // 游戏坐标 (x, z) = 场景 (x, −y)
      const 顶 = pickSolid(s.solid, patchRoll(x, -y, 3)).replace('minecraft:', '');
      const 名 = 顶 === 'grass_block' ? 'dirt' : 顶;
      for (let z = -深; z > -海底.底; z--) 放(实, z === -深 ? 名 : 'stone', [x + 0.5, y + 0.5, z - 0.5]);
      const p = pickPlant(s.plants, hash2(x, -y, 5), kelpDensity(x, -y));
      if (!p) continue;
      const [种, 格] = p;
      for (let k = 0; k < 格 && -深 + k < -1; k++) {
        const 顶格 = k === 格 - 1 || -深 + k + 1 >= -1;
        const 贴 = 种 === 'minecraft:seagrass' ? 'seagrass' : 种 === 'minecraft:tall_seagrass' ? (k === 0 ? 'tall_seagrass_bottom' : 'tall_seagrass_top') : 顶格 ? 'kelp' : 'kelp_plant';
        放(草, 贴, [x + 0.5, y + 0.5, -深 + k]);
      }
    }
  return { 实, 草 };
};

const 成批 = ({ 几何, 名, 位们, 镂空 }: { 几何: THREE.BufferGeometry; 名: string; 位们: [number, number, number][]; 镂空?: boolean }) => {
  const mesh = useMemo(() => {
    const 材 = new THREE.MeshLambertMaterial({ map: 贴图(名), alphaTest: 镂空 ? 0.5 : 0, side: 镂空 ? THREE.DoubleSide : THREE.FrontSide });
    const m = new THREE.InstancedMesh(几何, 材, 位们.length);
    const o = new THREE.Object3D();
    位们.forEach((p, i) => {
      o.position.set(...p);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.computeBoundingSphere();
    return m;
  }, [几何, 名, 位们, 镂空]);
  return <primitive object={mesh} />;
};
const 批 = 成批 as unknown as React.FC<Parameters<typeof 成批>[0]>;

let 摆好: 摆 | null = null;
export const 海底方块: React.FC = () => {
  摆好 ??= 摆海底();
  const { 实, 草 } = 摆好;
  return (
    <group>
      {[...实].map(([名, 位们]) => <批 key={名} 几何={方块} 名={名} 位们={位们} />)}
      {[...草].map(([名, 位们]) => <批 key={名} 几何={十字} 名={名} 位们={位们} 镂空 />)}
    </group>
  );
};

/** 试看开了 水透 才画（pipeline/渲/光影试看.ts 的页面环境变量） */
export const 要画海底 = () => {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.REMOTION_ANIM_LIGHTING;
  return !!v && !!(JSON.parse(v) as { 水透?: unknown }).水透;
};
