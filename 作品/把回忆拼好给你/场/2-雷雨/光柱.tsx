// 第 7 句她放的法术：一道往天上冲的光柱（借原版信标光柱 BeaconRenderer.renderBeaconBeam 的画法），脚下魔法阵底下一圈地光。
// 演绎：游戏里女仆没有往天上打光柱、把雨云打散的法术（用户 10-24「直接放法术不就好了吗？」：不拿书、不开界面，她直接放）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { png } from '@engine/model/贴图.ts';
import beamUri from 'asset:贴图/特效/信标光柱';
import * as 参 from './参数.ts';
import { 魔法阵半径 } from './酒狐件.tsx';

let 光柱贴图: THREE.DataTexture | undefined;
const 取光柱贴图 = () => {
  if (!光柱贴图) {
    const p = png(beamUri);
    光柱贴图 = new THREE.DataTexture(p.px, p.w, p.h, THREE.RGBAFormat);
    光柱贴图.colorSpace = THREE.SRGBColorSpace;
    光柱贴图.magFilter = THREE.NearestFilter;
    光柱贴图.minFilter = THREE.NearestFilter;
    光柱贴图.wrapS = THREE.RepeatWrapping;
    光柱贴图.wrapT = THREE.RepeatWrapping;
    光柱贴图.needsUpdate = true;
  }
  return 光柱贴图;
};

/** 一圈四个竖面：角 = 四个角的水平坐标（相对柱心），v 从底 v底 到顶 v顶 */
const 柱面 = (角: readonly (readonly [number, number])[], 底: number, 顶: number, v底: number, v顶: number) => {
  const pos: number[] = [];
  const uv: number[] = [];
  for (let k = 0; k < 4; k++) {
    const [a, b] = [角[k]!, 角[(k + 1) % 4]!];
    pos.push(a[0], a[1], 顶, a[0], a[1], 底, b[0], b[1], 底, a[0], a[1], 顶, b[0], b[1], 底, b[0], b[1], 顶);
    uv.push(1, v顶, 1, v底, 0, v底, 1, v顶, 0, v底, 0, v顶);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
};

/** 光柱：底 = 柱底中心，顶 = 顶的 z，刻 = 游戏刻（贴图滚、里层转），透 = 不透明度 */
export const 光柱件: React.FC<{ 底: V3; 顶: number; 刻: number; 透: number }> = ({ 底, 顶, 刻, 透 }) => {
  const h = 顶 - 底[2];
  // 原版：f = floorMod(gameTime, 40) + partialTick；往上的柱 f1 = −f；贴图滚 f2 = frac(f1·0.2 − floor(f1·0.1))；里层转 f·2.25 − 45 度
  const f = ((刻 % 40) + 40) % 40;
  const f1 = -f;
  const f2 = f1 * 0.2 - Math.floor(f1 * 0.1) - Math.floor(f1 * 0.2 - Math.floor(f1 * 0.1));
  const v0 = -1 + f2;
  const { 里, 外, 外透, 色 } = 参.光柱;
  const 转 = ((f * 2.25 - 45) * Math.PI) / 180;
  const 里角 = ([[0, 里], [里, 0], [0, -里], [-里, 0]] as const).map(([x, y]) => [x * Math.cos(转) - y * Math.sin(转), x * Math.sin(转) + y * Math.cos(转)] as const);
  const 外角 = [[-外, -外], [外, -外], [外, 外], [-外, 外]] as const;
  const 里geo = useMemo(() => 柱面(里角, 0, h, v0, h * (0.5 / 里) + v0), [h, v0, 转]);
  const 外geo = useMemo(() => 柱面(外角, 0, h, v0, h + v0), [h, v0]);
  useEffect(
    () => () => {
      里geo.dispose();
      外geo.dispose();
    },
    [里geo, 外geo],
  );
  const 里mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: 取光柱贴图(), color: 色, side: THREE.DoubleSide, toneMapped: false, fog: false, ...(透 < 1 ? { transparent: true, opacity: 透, depthWrite: false } : {}) }),
    [色, 透],
  );
  const 外mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: 取光柱贴图(), color: 色, transparent: true, opacity: 外透 * 透, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
    [色, 外透, 透],
  );
  if (h <= 0 || 透 <= 0) return null;
  return (
    <group position={底}>
      <mesh geometry={里geo} material={里mat} frustumCulled={false} />
      <mesh geometry={外geo} material={外mat} frustumCulled={false} renderOrder={12} />
    </group>
  );
};

// ---------- 地光：阵底下两层同心圆片（圆边按贴图像素走成阶梯），普通半透明叠 ----------
const 像素 = 1 / 16;
const 圆们 = new Map<number, { g: THREE.PlaneGeometry; tex: THREE.DataTexture }>();
/** 半径 r（取到贴图像素）的圆片：格子中心在圆里就满、不在就空，最近邻采样 */
const 圆 = (r: number) => {
  const n = Math.max(1, Math.round(r / 像素));
  let c = 圆们.get(n);
  if (!c) {
    const 边 = 2 * n;
    const data = new Uint8Array(边 * 边 * 4);
    for (let j = 0; j < 边; j++) for (let i = 0; i < 边; i++) data.set([255, 255, 255, (i + 0.5 - n) ** 2 + (j + 0.5 - n) ** 2 <= n * n ? 255 : 0], (j * 边 + i) * 4);
    const tex = new THREE.DataTexture(data, 边, 边, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    圆们.set(n, (c = { g: new THREE.PlaneGeometry(边 * 像素, 边 * 像素), tex }));
  }
  return c;
};
export const 地光: React.FC<{ 心: V3; 大小: number }> = ({ 心, 大小 }) => {
  const { 色, 半径, 强 } = 参.魔法阵.地光;
  if (大小 <= 0) return null;
  return (
    <group position={心}>
      {半径.map((k, i) => {
        const c = 圆(魔法阵半径 * k * 大小);
        return (
          <mesh key={i} geometry={c.g} position={[0, 0, i * 0.002]} renderOrder={4}>
            <meshBasicMaterial color={色} map={c.tex} transparent opacity={强[i]} depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
        );
      })}
    </group>
  );
};
