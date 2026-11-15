// 束和带：从一点连到另一点的贴图条。
// 束：绕轴线交叉摆几片（原版信标光柱、守卫者激光、Goety 的 CorruptedBeam、WaterJet 都是这类），贴图沿长度方向走 v，可滚动。
// 带：沿一串点铺的四边形条（弹的尾迹 renderTrail、WindParticle 这类程序画的带子），宽的方向自己给，不朝镜头。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';
import type { Vec3 } from '../接口.ts';
import { faceMaterial, type FaceMaterialOptions } from './材质.ts';

const toVec3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

const quadMesh = (positions: number[], uv: number[]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const idx: number[] = [];
  for (let i = 0; i < positions.length / 12; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  g.setIndex(idx);
  return g;
};

export type BeamProps = FaceMaterialOptions & {
  起: Vec3;
  end: Vec3;
  图: Png | null;
  半宽: number;
  /** 绕轴线摆几片，默认 2（十字）；每片隔 180° ÷ 片数 */
  planeCount?: number;
  /** 整束绕轴线转的弧度（守卫者激光那种慢转） */
  angleRad?: number;
  /** 起、终两头的贴图 v（可以超出 0～1，配 重复 做滚动）；默认 0、1。u 横跨整张 */
  vStart?: number;
  vEnd?: number;
  /** 贴图只取横向的一段 [u0, u1]，默认 [0, 1] */
  u?: readonly [number, number];
};

export const Beam: React.FC<BeamProps> = ({ 起: startPos, end, 图: image, 半宽: halfWidth, planeCount = 2, angleRad = 0, vStart = 0, vEnd = 1, u = [0, 1], ...materialOpts }) => {
  const geo = useMemo(() => {
    const a = toVec3(startPos);
    const b = toVec3(end);
    const axis = b.clone().sub(a);
    if (axis.lengthSq() === 0) return null;
    axis.normalize();
    // 取一个和轴垂直的基准方向：轴接近竖直时用 x，否则用竖直叉出来
    const perpendicular = Math.abs(axis.z) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).cross(axis).normalize();
    const vertices: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < planeCount; i++) {
      const sideOffset = perpendicular.clone().applyAxisAngle(axis, angleRad + (i * Math.PI) / planeCount).multiplyScalar(halfWidth);
      for (const p of [a.clone().sub(sideOffset), a.clone().add(sideOffset), b.clone().add(sideOffset), b.clone().sub(sideOffset)]) vertices.push(p.x, p.y, p.z);
      uv.push(u[0], vStart, u[1], vStart, u[1], vEnd, u[0], vEnd);
    }
    return quadMesh(vertices, uv);
  }, [startPos[0], startPos[1], startPos[2], end[0], end[1], end[2], halfWidth, planeCount, angleRad, vStart, vEnd, u[0], u[1]]);
  return geo ? <mesh geometry={geo} material={faceMaterial(image, materialOpts)} frustumCulled={false} /> : null;
};

export type BandProps = FaceMaterialOptions & {
  /** 中线上的点，至少 2 个 */
  points: readonly Vec3[];
  /** 每个点往两边各伸多少（向量，场景坐标）：一个 = 全程一样，数组 = 逐点 */
  halfWidthDir: Vec3 | readonly Vec3[];
  图: Png | null;
  /** 各点的贴图 u（沿带子方向）；不给 = 从 0 到 1 均分。v 横跨带宽（0 在 −半宽向 那边） */
  uValues?: readonly number[];
};

export const Band: React.FC<BandProps> = ({ points, halfWidthDir, 图: image, uValues, ...materialOpts }) => {
  const cacheKey = JSON.stringify([points, halfWidthDir, uValues]);
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const halfWidthAt = (i: number) => toVec3((typeof halfWidthDir[0] === 'number' ? halfWidthDir : (halfWidthDir as readonly Vec3[])[i]!) as Vec3);
    const vertices: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const [a, b] = [toVec3(points[i]!), toVec3(points[i + 1]!)];
      const [sa, sb] = [halfWidthAt(i), halfWidthAt(i + 1)];
      const [ua, ub] = [uValues?.[i] ?? i / (points.length - 1), uValues?.[i + 1] ?? (i + 1) / (points.length - 1)];
      for (const p of [a.clone().sub(sa), b.clone().sub(sb), b.clone().add(sb), a.clone().add(sa)]) vertices.push(p.x, p.y, p.z);
      uv.push(ua, 1, ub, 1, ub, 0, ua, 0);
    }
    return quadMesh(vertices, uv);
  }, [cacheKey]);
  return geo ? <mesh geometry={geo} material={faceMaterial(image, materialOpts)} frustumCulled={false} /> : null;
};
