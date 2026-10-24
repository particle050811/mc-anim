// 背景褪色：第 15 句隐世之境这一镜（正片和封面）把布景压暗、去一点饱和，粉的她不再和粉紫的地毯糊成一片（主会话 10-24 美术定稿：
// 「只在正片这一镜，把背景（不含角色）降约 15% 明度、20% 饱和……不改地点本身」）。地点、色板、整片后期都不动，验证片 1-一如既往 用的布景不受影响。
// 做法：套住的子树里，受光、不受光的网格材质换成一份派生材质，在原材质算完颜色（opaque_fragment）以后，按 sRGB 数值往灰里拉、再整体乘暗。
// 平涂（engine/三渲二/平涂.tsx）从这份派生材质再派生，它把自己的颜色那段插在 opaque_fragment 前面，所以先平涂、后褪色。
// 每帧渲染前换一次（同平涂：方块网格取回来以后才挂上去），这一层套在平涂里面、先于平涂跑（子组件的 useFrame 先订阅）。
// userData.不褪色 = true 的组（她、爱心）整枝跳过。
import { useFrame } from '@react-three/fiber';
import React, { useRef } from 'react';
import * as THREE from 'three';

export type 褪色参数 = { 明度: number; 饱和: number };

type 有标记 = THREE.Material & {
  isMeshStandardMaterial?: boolean;
  isMeshLambertMaterial?: boolean;
  isMeshPhongMaterial?: boolean;
  isMeshToonMaterial?: boolean;
  isMeshBasicMaterial?: boolean;
};
const 能派生 = (m: 有标记) => !!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial || m.isMeshBasicMaterial);

const 小数 = (v: number) => v.toFixed(4);
const 片元 = (p: 褪色参数) =>
  [
    '#include <opaque_fragment>',
    '{',
    '\tvec3 fadeC = sRGBTransferOETF( vec4( gl_FragColor.rgb, 1.0 ) ).rgb;',
    '\tfloat fadeL = dot( fadeC, vec3( 0.2126, 0.7152, 0.0722 ) );',
    `\tfadeC = mix( vec3( fadeL ), fadeC, ${小数(p.饱和)} ) * ${小数(p.明度)};`,
    '\tgl_FragColor.rgb = sRGBTransferEOTF( vec4( fadeC, 1.0 ) ).rgb;',
    '}',
  ].join('\n');

// 原材质 → 派生材质（按参数分表）；派生的标 userData.褪色，平涂从它派生出的材质 userData 里也带着这个标记（clone 照抄 userData）
const 表们 = new Map<string, WeakMap<THREE.Material, THREE.Material>>();
const 派生 = (m: THREE.Material, p: 褪色参数): THREE.Material => {
  const 键 = `${小数(p.明度)}|${小数(p.饱和)}`;
  let 表 = 表们.get(键);
  if (!表) 表们.set(键, (表 = new WeakMap()));
  let d = 表.get(m);
  if (!d) {
    const 新 = m.clone();
    新.userData.褪色 = 键;
    新.onBeforeCompile = (shader, renderer) => {
      m.onBeforeCompile(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 片元(p));
    };
    新.customProgramCacheKey = () => `${m.customProgramCacheKey()}|褪色${键}`;
    m.addEventListener('dispose', () => 新.dispose());
    表.set(m, 新);
    d = 新;
  }
  return d;
};

const 换 = (m: THREE.Material, p: 褪色参数) => (m.userData.褪色 !== undefined || m.userData.平涂 || !能派生(m as 有标记) ? m : 派生(m, p));

/** 套住的子树（除了 userData.不褪色 的组）按 p 褪色。放在三渲二画布（平涂）里面 */
export const 背景褪色: React.FC<{ 参数: 褪色参数; children: React.ReactNode }> = ({ 参数: p, children }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const 走 = (o: THREE.Object3D) => {
      if (o.userData.不褪色) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => 换(m, p)) : 换(mesh.material, p);
      for (const c of o.children) 走(c);
    };
    if (ref.current) 走(ref.current);
  });
  return <group ref={ref}>{children}</group>;
};

/** 套住的东西不褪色（她、爱心） */
export const 不褪色: React.FC<{ children: React.ReactNode }> = ({ children }) => <group userData={{ 不褪色: true }}>{children}</group>;
