// OBJ 网格：渲染从模组 jar 里导出的 Wavefront .obj 模型（工具/游戏取材/导出模型.py 的输出）。
// 几何和贴图都是同步建好的（Remotion 逐帧渲染，不能等异步加载）。贴图是模型旁边同名的 .png。
import React, { useContext } from 'react';
import * as THREE from 'three';
import { Ghost } from './parts.tsx';
import { EntityTexture, entityTexture } from './贴图方盒.tsx';

export type ObjGroup = { pos: number[]; uv: number[] };
export type ObjModel = { tex: { w: number; h: number }; groups: Record<string, ObjGroup> };

// 建几何：m 把 obj 原始坐标变到组件的本地坐标（朝向、缩放、原点）。m 的行列式要为正（纯旋转 + 等比缩放），否则面会翻过来。
// 顶点不共用，法线按面算（低模的硬边观感，和游戏里一样）。
export const objGeometry = (group: ObjGroup, transform?: THREE.Matrix4) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(group.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(group.uv, 2));
  if (transform) geo.applyMatrix4(transform);
  geo.computeVertexNormals();
  return geo;
};

// 残影（Ghost）里画成半透明单色，和 parts.tsx 的纯色零件一致
export const ObjMesh: React.FC<{
  geo: THREE.BufferGeometry;
  tex: EntityTexture;
  metal?: number;
  rough?: number;
  emissive?: number; // 用贴图自身颜色自发光（给刀身打底提亮）
}> = ({ geo, tex, metal = 0, rough = 0.8, emissive = 0 }) => {
  const ghost = useContext(Ghost);
  const map = entityTexture(tex);
  return (
    <mesh geometry={geo} castShadow={!ghost} receiveShadow={!ghost}>
      {ghost ? (
        <meshBasicMaterial color={ghost.color} transparent opacity={ghost.opacity} depthWrite={false} />
      ) : (
        <meshStandardMaterial
          map={map}
          metalness={metal}
          roughness={rough}
          side={THREE.DoubleSide}
          alphaTest={0.5}
          emissive={emissive > 0 ? '#ffffff' : '#000000'}
          emissiveMap={emissive > 0 ? map : null}
          emissiveIntensity={emissive}
        />
      )}
    </mesh>
  );
};
