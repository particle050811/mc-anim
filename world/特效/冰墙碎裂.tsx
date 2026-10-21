// 冰墙碎裂：扫帚撞穿极光宫殿的墙时，除了整块的方块（方块飞溅.tsx，用的是墙上原来的极光方块），再迸出一蓬半透明的碎冰片，
// 看着是冰一样碎开的。碎片是一片片淡青色的三角形，从洞口沿撞击方向炸开、翻滚、变淡（0.8 秒）。
// 按时间参数算，没有模拟状态。sec = 撞开以后经过的秒数（< 0 不显示）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng, V3 } from '../../engine/model/parts.tsx';

const triGeo = (rand: () => number) => {
  const geometry = new THREE.BufferGeometry();
  const radius = 0.15 + rand() * 0.35;
  const pts = [0, 1, 2].map((k) => {
    const angle = (k / 3) * Math.PI * 2 + (rand() - 0.5) * 1.2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0];
  });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  return geometry;
};
const matCache = new Map<number, THREE.MeshStandardMaterial>();
const iceMat = (opacity: number) => {
  const k = Math.round(opacity * 20) / 20;
  let material = matCache.get(k);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: '#cfefff', emissive: '#9fd8f0', emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.75 * k, side: THREE.DoubleSide, depthWrite: false });
    matCache.set(k, material);
  }
  return material;
};

// origin：洞口中心；dir：撞击方向；size：洞的大小（碎片从这一片里出来）；count：片数
export const IceShards: React.FC<{ sec: number; origin: V3; dir: V3; seed: number; size?: number; count?: number; speed?: number }> = ({
  sec,
  origin,
  dir,
  seed,
  size = 3,
  count = 40,
  speed = 18,
}) => {
  const shards = useMemo(() => {
    const rand = rng(seed * 313 + 1);
    return Array.from({ length: count }, () => ({
      geo: triGeo(rand),
      p0: [origin[0] + (rand() - 0.5) * size, origin[1] + (rand() - 0.5) * 0.6, origin[2] + (rand() - 0.5) * size] as V3,
      v: [dir[0] * speed * (0.4 + rand()) + (rand() - 0.5) * speed * 0.7, dir[1] * speed * (0.4 + rand()) + (rand() - 0.5) * speed * 0.7, dir[2] * speed * (0.4 + rand()) + (rand() - 0.3) * speed * 0.6] as V3,
      axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
      w: 6 + rand() * 14,
    }));
  }, [origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], seed, size, count, speed]);
  if (sec < 0 || sec > 0.9) return null;
  const fade = sec < 0.5 ? 1 : 1 - (sec - 0.5) / 0.4;
  const material = iceMat(fade);
  return (
    <>
      {shards.map((s, i) => (
        <mesh
          key={i}
          geometry={s.geo}
          material={material}
          position={[s.p0[0] + s.v[0] * sec, s.p0[1] + s.v[1] * sec, s.p0[2] + s.v[2] * sec - 8 * sec * sec]}
          quaternion={new THREE.Quaternion().setFromAxisAngle(s.axis, s.w * sec)}
        />
      ))}
    </>
  );
};
