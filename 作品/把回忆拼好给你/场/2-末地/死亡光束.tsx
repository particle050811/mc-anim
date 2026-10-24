// 末影龙的死亡光束：几何见 光束.ts（照原版逐条算，连 QUADS 切三角形的毛病一起），这里只管画。
// 原版 RenderType.lightning：加色混合 (SRC_ALPHA, ONE)、写深度、剔除背面；颜色从中心白到尖上品红、透明度从中心到尖 0，平滑渐变。
// 着色器里的名字只能用 ASCII。
// 美术定稿不要平滑光晕：中心权重按 光束色阶 量化成几档硬边（往上取整，尖上最后一档也看得见，光束不变短）。sRGB 数值原样写出（同 末地天空.tsx）。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { 光束色阶 } from './参数.ts';
import { 死亡光束 as 算光束 } from './光束.ts';

const 顶点 = /* glsl */ `
attribute float aW;
varying float vW;
void main() {
  vW = aW;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const 片元 = /* glsl */ `
uniform float uCenterAlpha;
uniform float uSteps;
varying float vW;
void main() {
  float w = ceil(vW * uSteps - 0.001) / uSteps;
  if (w <= 0.0) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.0, 1.0), vec3(1.0), w), w * uCenterAlpha);
}`;

/** 死刻：龙死了多少刻（连续）；龙位：这一刻龙在哪（场景坐标） */
export const 死亡光束: React.FC<{ 死刻: number; 龙位: V3 }> = ({ 死刻, 龙位 }) => {
  const 束 = useMemo(() => 算光束(死刻), [死刻]);
  const 材质 = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uCenterAlpha: { value: 1 }, uSteps: { value: 光束色阶 } },
        vertexShader: 顶点,
        fragmentShader: 片元,
        transparent: true,
        depthWrite: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendEquation: THREE.AddEquation,
        toneMapped: false,
      }),
    [],
  );
  const 几何 = useMemo(() => {
    if (!束) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(束.位, 3));
    g.setAttribute('aW', new THREE.BufferAttribute(束.权, 1));
    return g;
  }, [束]);
  useEffect(() => () => 几何?.dispose(), [几何]);
  if (!束 || !几何) return null;
  材质.uniforms.uCenterAlpha!.value = 束.中心透明;
  return <mesh geometry={几何} material={材质} position={龙位} frustumCulled={false} />;
};
