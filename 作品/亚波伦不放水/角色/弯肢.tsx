// 弯肢：画一根会在关节处折的肢体（史蒂夫的手臂、腿）。挂在 EntityModel 的 attach 上，坐标是那个部件里的模型像素。
// 用户 11-10 定：史蒂夫要改绑骨骼、加关节，不再完全照原版。折的算法在 角色/弯折.ts，关节的位置和角度约定在 角色/史蒂夫关节.ts。
// 每层（皮肤、盔甲各一种材质）一个网格：上半节、转过去的下半节、外侧的弧面都按这一帧的角度现算进同一份几何（顶点在 CPU 上转，接缝处是同一个数，不裂）。
// 不折的东西（整块跟上半节的肩甲、跟前臂走的剑）走 上节、下节 两个插槽，下节 放在绕铰链转的组里。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { type EntityCube, entityCubeFaces } from '@engine/model/实体模型.tsx';
import { 三角转数组, 弯折, type 三角, type 点 } from './弯折.ts';

export type 弯层 = { 键: string; 三角: readonly 三角[]; 材质: THREE.Material };

/** 方盒 → 三角（顶点、贴图坐标照 EntityModel 的 cubeFaces；绕向和法线对上，同 实体模型.tsx 的 partGeometry） */
export const 方盒三角 = (方盒: readonly EntityCube[], 贴图宽: number, 贴图高: number): 三角[] => {
  const 出: 三角[] = [];
  for (const 盒 of 方盒)
    for (const 面 of entityCubeFaces(盒, 贴图宽, 贴图高)) {
      const [a, b, c, d] = 面.verts.map((v): 点 => ({ p: v.p, uv: v.uv, n: 面.n })) as [点, 点, 点, 点];
      const 边 = (p: 点, q: 点) => new THREE.Vector3(q.p[0]! - p.p[0]!, q.p[1]! - p.p[1]!, q.p[2]! - p.p[2]!);
      if (边(a, b).cross(边(a, c)).dot(new THREE.Vector3(...面.n)) >= 0) 出.push([a, b, c], [a, c, d]);
      else 出.push([a, c, b], [a, d, c]);
    }
  return 出;
};

const 一层: React.FC<{ 三角: readonly 三角[]; 材质: THREE.Material; 切: number; 铰z: number; 角: number }> = ({ 三角, 材质, 切, 铰z, 角 }) => {
  const 几何 = useMemo(() => {
    const { 上, 下, 桥 } = 弯折(三角, { 切, 铰z, 角 });
    const { 位置, 法线, uv } = 三角转数组([上, 下, 桥]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(位置, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(法线, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }, [三角, 切, 铰z, 角]);
  useEffect(() => () => 几何.dispose(), [几何]);
  return <mesh geometry={几何} material={材质} castShadow receiveShadow />;
};

/** 切、铰z、角：见 弯折.ts（角是弧度，正 = 下半节往 +z 折）。层：要折的面；上节、下节：不折、整块跟着上半节或下半节走的东西 */
export const 弯肢: React.FC<{ 切: number; 铰z: number; 角: number; 层: readonly 弯层[]; 上节?: React.ReactNode; 下节?: React.ReactNode }> = ({ 切, 铰z, 角, 层, 上节, 下节 }) => (
  <>
    {层.map((l) => (
      <一层 key={l.键} 三角={l.三角} 材质={l.材质} 切={切} 铰z={铰z} 角={角} />
    ))}
    {上节}
    {下节 && (
      <group position={[0, 切, 铰z]} rotation={[角, 0, 0]}>
        <group position={[0, -切, -铰z]}>{下节}</group>
      </group>
    )}
  </>
);
