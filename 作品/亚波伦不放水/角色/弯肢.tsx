// 弯肢：画一根会在关节处折的肢体（史蒂夫的手臂、腿）。挂在 EntityModel 的 attach 上，坐标是那个部件里的模型像素。
// 用户 11-10 定：史蒂夫要改绑骨骼、加关节，不再完全照原版。折的算法在 角色/弯折.ts，关节的位置和角度约定在 角色/史蒂夫关节.ts。
// 每层（皮肤、盔甲各一种材质）一个网格：上半节、转过去的下半节、外侧的弧面都按这一帧的角度现算进同一份几何（顶点在 CPU 上转，接缝处是同一个数，不裂）。
// 不折的东西（整块跟上半节的肩甲、跟前臂走的剑）走 上节、下节 两个插槽，下节 放在绕铰链转的组里。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { type EntityCube, entityCubeFaces } from '@engine/model/实体模型.tsx';
import { trianglesToArrays, bend, type Triangle, type Vertex } from './弯折.ts';

export type BendLayer = { 键: string; triangles: readonly Triangle[]; material: THREE.Material };

/** 方盒 → 三角（顶点、贴图坐标照 EntityModel 的 cubeFaces；绕向和法线对上，同 实体模型.tsx 的 partGeometry） */
export const boxTriangles = (boxCubes: readonly EntityCube[], textureWidth: number, textureHeight: number): Triangle[] => {
  const triangles: Triangle[] = [];
  for (const box of boxCubes)
    for (const face of entityCubeFaces(box, textureWidth, textureHeight)) {
      const [a, b, c, d] = face.verts.map((v): Vertex => ({ p: v.p, uv: v.uv, n: face.n })) as [Vertex, Vertex, Vertex, Vertex];
      const edgeVec = (p: Vertex, q: Vertex) => new THREE.Vector3(q.p[0]! - p.p[0]!, q.p[1]! - p.p[1]!, q.p[2]! - p.p[2]!);
      if (edgeVec(a, b).cross(edgeVec(a, c)).dot(new THREE.Vector3(...face.n)) >= 0) triangles.push([a, b, c], [a, c, d]);
      else triangles.push([a, c, b], [a, d, c]);
    }
  return triangles;
};

const LimbLayer: React.FC<{ triangles: readonly Triangle[]; material: THREE.Material; cut: number; hingeZ: number; 角: number }> = ({ triangles, material, cut, hingeZ, 角: bendAngle }) => {
  const geometry = useMemo(() => {
    const { 上: upper, 下: lower, bridge } = bend(triangles, { cut, hingeZ, 角: bendAngle });
    const { 位置: positions, normals, uv } = trianglesToArrays([upper, lower, bridge]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }, [triangles, cut, hingeZ, bendAngle]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
};

/** 切、铰z、角：见 弯折.ts（角是弧度，正 = 下半节往 +z 折）。层：要折的面；上节、下节：不折、整块跟着上半节或下半节走的东西 */
export const BendLimb: React.FC<{ cut: number; hingeZ: number; 角: number; 层: readonly BendLayer[]; upperPart?: React.ReactNode; lowerPart?: React.ReactNode }> = ({ cut, hingeZ, 角: bendAngle, 层: layers, upperPart, lowerPart }) => (
  <>
    {layers.map((l) => (
      <LimbLayer key={l.键} triangles={l.triangles} material={l.material} cut={cut} hingeZ={hingeZ} 角={bendAngle} />
    ))}
    {upperPart}
    {lowerPart && (
      <group position={[0, cut, hingeZ]} rotation={[bendAngle, 0, 0]}>
        <group position={[0, -cut, -hingeZ]}>{lowerPart}</group>
      </group>
    )}
  </>
);
