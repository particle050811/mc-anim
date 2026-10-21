// 护盾碎裂：巫妖的一面护盾被药水砸中，像玻璃一样碎成一片片飞散。
// 游戏里护盾碎掉只是少画一面、放一声 TFSounds.SHIELD_BREAK，没有碎片；碎片是剧本要的演出（脚本「巫妖怎么打」：六层护盾像玻璃一样一层层碎掉）。
// 做法：把这面护盾的贴图（lich_shield_frame + 半透明的 lich_shield_fill，和 巫妖.tsx 里画的同一张）按抖动过的 5×5 网格切成 32 块三角形碎片，
// 每片带着自己那块贴图，从砸中的点往外炸开、翻滚、慢慢变淡；碎的一瞬间整面闪一下白光。
// 坐标：护盾自己的物品空间（中心在原点、贴图面朝 ±Z、1 格见方），外面套 巫妖.tsx 的 lichShieldMatrix 放到巫妖身上。
// sec = 碎了以后经过的秒数（< 0 不显示）；hit = 砸中点在护盾平面上的位置（-0.5～0.5）；push = 沿法线往哪边飞（+1 / -1）
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng } from '../../engine/model/parts.tsx';
import { pngDir } from '../../engine/model/贴图.ts';

const SHIELD = pngDir(import.meta.webpackContext('../角色/巫妖护盾.贴图', { regExp: /\.png$/ }));

// 护盾两层叠起来的贴图（框盖在填充上）
let shieldTex: THREE.DataTexture | null = null;
const tex = () => {
  if (!shieldTex) {
    const frameImg = SHIELD.frame;
    const fillImg = SHIELD.fill;
    const px = new Uint8Array(frameImg.px.length);
    for (let i = 0; i < frameImg.w * frameImg.h; i++) {
      const src = frameImg.px[i * 4 + 3] > 0 ? frameImg.px : fillImg.px;
      px.set(src.subarray(i * 4, i * 4 + 4), i * 4);
    }
    shieldTex = new THREE.DataTexture(px, frameImg.w, frameImg.h, THREE.RGBAFormat);
    shieldTex.colorSpace = THREE.SRGBColorSpace;
    shieldTex.magFilter = THREE.NearestFilter;
    shieldTex.minFilter = THREE.NearestFilter;
    shieldTex.needsUpdate = true;
  }
  return shieldTex;
};

type Shard = { geo: THREE.BufferGeometry; c: THREE.Vector3 };
const shardsFor = (seed: number): Shard[] => {
  const rand = rng(seed * 977 + 5);
  const gridCells = 4;
  // 抖动网格的顶点（边上的点只沿边抖）
  const gridPts: THREE.Vector2[][] = [];
  for (let j = 0; j <= gridCells; j++) {
    gridPts.push([]);
    for (let i = 0; i <= gridCells; i++) {
      const jx = i === 0 || i === gridCells ? 0 : (rand() - 0.5) * 0.16;
      const jy = j === 0 || j === gridCells ? 0 : (rand() - 0.5) * 0.16;
      gridPts[j].push(new THREE.Vector2(i / gridCells - 0.5 + jx, 0.5 - j / gridCells + jy));
    }
  }
  const out: Shard[] = [];
  const tri = (ptA: THREE.Vector2, ptB: THREE.Vector2, ptC: THREE.Vector2) => {
    const ctr = new THREE.Vector3((ptA.x + ptB.x + ptC.x) / 3, (ptA.y + ptB.y + ptC.y) / 3, 0);
    const pos: number[] = [];
    const uv: number[] = [];
    for (const pt of [ptA, ptB, ptC]) {
      pos.push(pt.x - ctr.x, pt.y - ctr.y, 0);
      uv.push(pt.x + 0.5, 0.5 - pt.y);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    out.push({ geo: geometry, c: ctr });
  };
  for (let j = 0; j < gridCells; j++)
    for (let i = 0; i < gridCells; i++) {
      const topLeft = gridPts[j][i], topRight = gridPts[j][i + 1], bottomRight = gridPts[j + 1][i + 1], bottomLeft = gridPts[j + 1][i];
      if (rand() < 0.5) {
        tri(topLeft, topRight, bottomRight);
        tri(topLeft, bottomRight, bottomLeft);
      } else {
        tri(topLeft, topRight, bottomLeft);
        tri(topRight, bottomRight, bottomLeft);
      }
    }
  return out;
};

const matCache = new Map<number, THREE.MeshBasicMaterial>();
const shardMat = (opacity: number) => {
  const k = Math.round(opacity * 20) / 20;
  let material = matCache.get(k);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ map: tex(), transparent: true, opacity: k, alphaTest: 0.02, side: THREE.DoubleSide, depthWrite: false });
    matCache.set(k, material);
  }
  return material;
};

export const ShieldShatter: React.FC<{ sec: number; seed: number; hit?: [number, number]; push?: number; speed?: number }> = ({ sec, seed, hit = [0, 0], push = -1, speed = 3 }) => {
  const shards = useMemo(() => shardsFor(seed), [seed]);
  if (sec < 0 || sec > 1.6) return null;
  const rand = rng(seed * 131 + 9);
  const fade = sec < 0.9 ? 1 : Math.max(0, 1 - (sec - 0.9) / 0.7);
  const flash = Math.max(0, 1 - sec / 0.06);
  return (
    <>
      {shards.map((shard, i) => {
        const away = new THREE.Vector2(shard.c.x - hit[0], shard.c.y - hit[1]);
        const dl = away.length() || 1;
        const vel = new THREE.Vector3((away.x / dl) * speed * (0.5 + rand()), (away.y / dl) * speed * (0.5 + rand()), push * speed * (0.6 + rand()));
        const gravity = 6; // 碎片轻，重力小一点（物品空间的 -Y 不一定朝下，这里只是让碎片有点弧线）
        const pos = new THREE.Vector3(shard.c.x + vel.x * sec, shard.c.y + vel.y * sec - 0.5 * gravity * sec * sec * 0.3, shard.c.z + vel.z * sec);
        const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), sec * (8 + 10 * rand()));
        return <mesh key={i} geometry={shard.geo} material={shardMat(fade)} position={pos} quaternion={spin} />;
      })}
      {flash > 0 && (
        <mesh>
          <planeGeometry args={[1.2, 1.2]} />
          <meshBasicMaterial color="#fff6d0" transparent opacity={flash * 0.9} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </>
  );
};
