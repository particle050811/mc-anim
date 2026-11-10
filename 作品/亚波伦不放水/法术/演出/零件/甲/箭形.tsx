// 箭形弹（原版 ArrowRenderer 的几何，换贴图）：Goety 的冰刺（IceSpikeRenderer）、箭雨的箭（RainArrow）都照这个画。
//   PoseStack：YP(yaw − 90) · ZP(pitch) · XP(45) · scale(0.05625 × 缩放) · translate(−4, 0, 0)
//   尾片 x = −7、y、z ∈ ±2（贴图 u 0～0.15625、v 0.15625～0.3125）；箭身 4 次各绕 X 再转 90°，(−8, −2, 0)～(8, 2, 0)（u 0～0.5、v 0～0.15625）。
//   yaw = atan2(vx, vz)、pitch = atan2(vy, 水平)（Projectile.updateRotation，游戏坐标）。满亮度、镂空、两面画。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { Png } from '@engine/model/贴图.ts';
import type { 点 } from '../../接口.ts';
import { 面材质 } from '../材质.ts';
import { MC空间, 度 } from '../实体.tsx';

const 网格 = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const 片 = (角: [number, number, number, number, number][], m: THREE.Matrix4) => {
      const 底 = pos.length / 3;
      for (const [x, y, z, u, v] of 角) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(m);
        pos.push(p.x, p.y, p.z);
        uv.push(u, v);
      }
      idx.push(底, 底 + 1, 底 + 2, 底, 底 + 2, 底 + 3);
    };
    const 单位阵 = new THREE.Matrix4();
    片([[-7, -2, -2, 0, 0.15625], [-7, -2, 2, 0.15625, 0.15625], [-7, 2, 2, 0.15625, 0.3125], [-7, 2, -2, 0, 0.3125]], 单位阵);
    for (let j = 0; j < 2; j++) {
      // 4 次里两两共面背靠背，两面都画时只要 2 片
      片([[-8, -2, 0, 0, 0], [8, -2, 0, 0.5, 0], [8, 2, 0, 0.5, 0.15625], [-8, 2, 0, 0, 0.15625]], new THREE.Matrix4().makeRotationX((Math.PI / 2) * (j + 1)));
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  };
})();

export const 箭形: React.FC<{ 位: 点; /** 飞行方向（场景坐标） */ 向: 点; 图: Png; 缩放?: number }> = ({ 位, 向, 图, 缩放 = 1 }) => {
  const [vx, vy, vz] = [向[0], 向[2], -向[1]];
  const yaw = (Math.atan2(vx, vz) * 180) / Math.PI;
  const pitch = (Math.atan2(vy, Math.hypot(vx, vz)) * 180) / Math.PI;
  const s = 0.05625 * 缩放;
  const 缩 = useMemo(() => [s, s, s] as [number, number, number], [s]);
  return (
    <MC空间 位={位}>
      <group rotation={[0, 度(yaw - 90), 0]}>
        <group rotation={[0, 0, 度(pitch)]}>
          <group rotation={[度(45), 0, 0]}>
            <group scale={缩}>
              <mesh position={[-4, 0, 0]} geometry={网格()} material={面材质(图, { 混合: '镂空' })} frustumCulled={false} />
            </group>
          </group>
        </group>
      </group>
    </MC空间>
  );
};
