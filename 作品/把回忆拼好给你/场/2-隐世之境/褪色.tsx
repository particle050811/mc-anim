// 背景褪色：第 15 句隐世之境这一镜（正片和封面）把布景压暗、去一点饱和，粉的她不再和粉紫的地毯糊成一片（主会话 10-24 美术定稿：
// 「只在正片这一镜，把背景（不含角色）降约 15% 明度、20% 饱和……不改地点本身」）。地点、色板、整片后期都不动，验证片 1-一如既往 用的布景不受影响。
// 做法：套住的子树里，受光、不受光的网格材质换成一份派生材质，在原材质算完颜色（opaque_fragment）以后，按 sRGB 数值往灰里拉、再整体乘暗。
// 平涂（engine/三渲二/平涂.tsx）从这份派生材质再派生，它把自己的颜色那段插在 opaque_fragment 前面，所以先平涂、后褪色。
// 每帧渲染前换一次（同平涂：方块网格取回来以后才挂上去），这一层套在平涂里面、先于平涂跑（子组件的 useFrame 先订阅）。
// userData.不褪色 = true 的组（她、爱心）整枝跳过。
import { useFrame } from '@react-three/fiber';
import React, { useRef } from 'react';
import * as THREE from 'three';

export type FadeParams = { lightness: number; saturation: number };

type MarkedMaterial = THREE.Material & {
  isMeshStandardMaterial?: boolean;
  isMeshLambertMaterial?: boolean;
  isMeshPhongMaterial?: boolean;
  isMeshToonMaterial?: boolean;
  isMeshBasicMaterial?: boolean;
};
const canDerive = (m: MarkedMaterial) => !!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial || m.isMeshBasicMaterial);

const formatDecimal = (v: number) => v.toFixed(4);
const buildFragment = (p: FadeParams) =>
  [
    '#include <opaque_fragment>',
    '{',
    '\tvec3 fadeC = sRGBTransferOETF( vec4( gl_FragColor.rgb, 1.0 ) ).rgb;',
    '\tfloat fadeL = dot( fadeC, vec3( 0.2126, 0.7152, 0.0722 ) );',
    `\tfadeC = mix( vec3( fadeL ), fadeC, ${formatDecimal(p.saturation)} ) * ${formatDecimal(p.lightness)};`,
    '\tgl_FragColor.rgb = sRGBTransferEOTF( vec4( fadeC, 1.0 ) ).rgb;',
    '}',
  ].join('\n');

// 原材质 → 派生材质（按参数分表）；派生的标 userData.褪色，平涂从它派生出的材质 userData 里也带着这个标记（clone 照抄 userData）
const materialMaps = new Map<string, WeakMap<THREE.Material, THREE.Material>>();
const derive = (m: THREE.Material, p: FadeParams): THREE.Material => {
  const cacheKey = `${formatDecimal(p.lightness)}|${formatDecimal(p.saturation)}`;
  let derivedMap = materialMaps.get(cacheKey);
  if (!derivedMap) materialMaps.set(cacheKey, (derivedMap = new WeakMap()));
  let d = derivedMap.get(m);
  if (!d) {
    const derived = m.clone();
    derived.userData.褪色 = cacheKey;
    derived.onBeforeCompile = (shader, renderer) => {
      m.onBeforeCompile(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', buildFragment(p));
    };
    derived.customProgramCacheKey = () => `${m.customProgramCacheKey()}|褪色${cacheKey}`;
    m.addEventListener('dispose', () => derived.dispose());
    derivedMap.set(m, derived);
    d = derived;
  }
  return d;
};

const fadeMaterial = (m: THREE.Material, p: FadeParams) => (m.userData.褪色 !== undefined || m.userData.平涂 || !canDerive(m as MarkedMaterial) ? m : derive(m, p));

/** 套住的子树（除了 userData.不褪色 的组）按 p 褪色。放在三渲二画布（平涂）里面 */
export const BackgroundFade: React.FC<{ params: FadeParams; children: React.ReactNode }> = ({ params: p, children }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const walk = (o: THREE.Object3D) => {
      if (o.userData.不褪色) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => fadeMaterial(m, p)) : fadeMaterial(mesh.material, p);
      for (const c of o.children) walk(c);
    };
    if (ref.current) walk(ref.current);
  });
  return <group ref={ref}>{children}</group>;
};

/** 套住的东西不褪色（她、爱心） */
export const NoFade: React.FC<{ children: React.ReactNode }> = ({ children }) => <group userData={{ noFade: true }}>{children}</group>;
