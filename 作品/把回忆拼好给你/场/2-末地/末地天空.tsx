// 末地的天：照 1.20.1 LevelRenderer.renderEndSky——以镜头为中心、边长 200 的盒子六个面都贴 end_sky.png（每面 uv 0～16，铺 16×16 遍），
// 顶点色 (40, 40, 40)，不写深度、最先画。原版在 sRGB 数值上直接乘（帧缓冲里就是 sRGB 数值），这里贴图按原样数值取（NoColorSpace）、乘完原样写出，不过色彩空间转换。
// 平涂不碰着色器材质（不乘面明暗、不乘色调），所以天就是原版的颜色，再由整片后期统一调色。
// 也导出 原样贴图（末地传送门.tsx 的星空底层也用 end_sky）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { png } from '@engine/model/贴图.ts';
import endSkyPng from 'asset:贴图/环境/末地天空';

const textureCache = new Map<string, THREE.DataTexture>();
/** PNG → 贴图：像素原样（不当 sRGB 解码）、最近邻、平铺 */
export const rawTexture = (uri: string) => {
  let t = textureCache.get(uri);
  if (!t) {
    const p = png(uri);
    t = new THREE.DataTexture(p.px, p.w, p.h, THREE.RGBAFormat);
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    textureCache.set(uri, t);
  }
  return t;
};
export const endSkyTexture = () => rawTexture(endSkyPng);

/** 原版的六个面（原版坐标：y 朝上、z 朝南）：先画底面 y = −100，再按 X 转 90、−90、180，按 Z 转 90、−90 */
const skyGeometry = (() => {
  const faces = [
    [-100, -100, -100, 0, 0],
    [-100, -100, 100, 0, 16],
    [100, -100, 100, 16, 16],
    [100, -100, -100, 16, 0],
  ];
  const rotations: THREE.Matrix4[] = [
    new THREE.Matrix4(),
    new THREE.Matrix4().makeRotationX(Math.PI / 2),
    new THREE.Matrix4().makeRotationX(-Math.PI / 2),
    new THREE.Matrix4().makeRotationX(Math.PI),
    new THREE.Matrix4().makeRotationZ(Math.PI / 2),
    new THREE.Matrix4().makeRotationZ(-Math.PI / 2),
  ];
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  rotations.forEach((m, n) => {
    for (const [x, y, z, u, v] of faces) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(m);
      pos.push(p.x, -p.z, p.y); // 原版 (x, y, z) → 场景 (x, −z, y)
      uv.push(u!, v!);
    }
    const b = n * 4;
    idx.push(b, b + 1, b + 2, b + 2, b + 3, b);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
})();

const vertexShaderSource = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentSource = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(map, vUv).rgb * (40.0 / 255.0), 1.0);
}`;

/** 天：跟着镜头（眼，场景坐标）走 */
export const EndSky: React.FC<{ 眼: V3 }> = ({ 眼: eye }) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { map: { value: endSkyTexture() } },
        vertexShader: vertexShaderSource,
        fragmentShader: fragmentSource,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );
  return <mesh geometry={skyGeometry} material={material} position={eye} renderOrder={-1000} frustumCulled={false} />;
};
