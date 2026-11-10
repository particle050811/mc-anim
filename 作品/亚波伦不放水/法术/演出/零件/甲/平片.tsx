// 渲染器里手写四个顶点的贴图四边形：照源码把四个角的 [x, y, z, u, v] 抄过来，放在 MC空间（和照 PoseStack 套的 group）里。两面画。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';
import { 面材质, type 面材质选项 } from '../材质.ts';

export type 角 = readonly [number, number, number, number, number];

export const 平片: React.FC<面材质选项 & { 角们: readonly [角, 角, 角, 角]; 图: Png }> = ({ 角们, 图, ...材 }) => {
  const 键 = JSON.stringify(角们);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(角们.flatMap((c) => [c[0], c[1], c[2]]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(角们.flatMap((c) => [c[3], c[4]]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }, [键]);
  return <mesh geometry={geo} material={面材质(图, 材)} frustumCulled={false} />;
};
