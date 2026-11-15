// 防暗：只给包住的人物（连手里的东西）提亮暗部，场景灯和地形不动。用户 11-10 定：封面人物太暗就单独给人物过一条亮度曲线，
// 「防止人物太暗看不清」（草图：直线 y=x 上面一条暗端抬高、亮端和直线汇合的曲线）。
// 曲线作用在画出来的亮度上（sRGB 数值的明度 Y）：Y' = Y + 抬·(1−Y)²，全黑抬到 抬，越亮抬得越少，Y = 1 不变。
// 抬的那截怎么加：有颜色的（红边、皮肤）照原来的色相按 Y'/Y 放大；接近黑、没什么颜色的（黑衣服、黑帽子）加等量的灰。
// 全按色相放大的话黑衣服贴图里那点偏色会被放大成橄榄绿；全加灰的话红边会发粉。
// 试过只抬「受光程度」（按贴图本色补）：她的衣服贴图本身是黑的，几乎没变化，轮廓还是融进背景，所以不用。
// 抬 ≤ 0.5 时曲线单调（斜率 1 − 2·抬·(1−Y) ≥ 0）。
// 只换受场景光的 MeshStandardMaterial；发光件（MeshBasicMaterial）和自写着色器的不碰。
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const antiDarkCurve = (Y: number, lift: number): number => (Y >= 1 ? Y : Y + lift * (1 - Math.max(0, Y)) ** 2);

// 原材质 → 提亮后的克隆，按 抬 分；原材质被释放后跟着回收
const antiDarkCache = new Map<number, WeakMap<THREE.Material, THREE.Material>>();

const brightenMaterial = (baseMaterial: THREE.MeshStandardMaterial, lift: number): THREE.Material => {
  let brightMap = antiDarkCache.get(lift);
  if (!brightMap) antiDarkCache.set(lift, (brightMap = new WeakMap()));
  let mat = brightMap.get(baseMaterial);
  if (mat) return mat;
  const brightened = baseMaterial.clone();
  // clone 不带 onBeforeCompile：原来有注入（受伤变红）的先照跑
  brightened.onBeforeCompile = (sh, r) => {
    baseMaterial.onBeforeCompile?.(sh, r);
    sh.uniforms.fangAnLift = { value: lift };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float fangAnLift;')
      .replace(
        '#include <opaque_fragment>',
        [
          'vec3 faOut = sRGBTransferOETF( vec4( clamp( outgoingLight, 0.0, 1.0 ), 1.0 ) ).rgb;',
          'float faY = dot( faOut, vec3( 0.2126, 0.7152, 0.0722 ) );',
          'float faY2 = faY + fangAnLift * ( 1.0 - faY ) * ( 1.0 - faY );',
          'float faMax = max( faOut.r, max( faOut.g, faOut.b ) );',
          'float faMin = min( faOut.r, min( faOut.g, faOut.b ) );',
          'float faHue = ( faMax - faMin ) / max( faMax, 1e-4 ) * smoothstep( 0.05, 0.25, faMax );',
          'faOut = mix( faOut + vec3( faY2 - faY ), faOut * ( faY2 / max( faY, 1e-4 ) ), faHue );',
          'outgoingLight = sRGBTransferEOTF( vec4( clamp( faOut, 0.0, 1.0 ), 1.0 ) ).rgb;',
          '#include <opaque_fragment>',
        ].join('\n'),
      );
  };
  brightened.customProgramCacheKey = () => `${baseMaterial.customProgramCacheKey?.() ?? ''}|防暗`;
  mat = brightened;
  brightMap.set(baseMaterial, mat);
  return mat;
};

/** 抬：全黑处抬到的明度（sRGB 数值，0～0.5）；0 = 不提亮 */
export const AntiDark: React.FC<{ lift: number; children: React.ReactNode }> = ({ lift, children }) => {
  const ref = useRef<THREE.Group>(null);
  // 每次出画前都扫一遍：里面的组件（基岩实体的换材质）自己重新提交时会把材质换回原样，而这里未必跟着重渲
  useFrame(() => {
    if (!ref.current || lift <= 0) return;
    ref.current.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (!m.isMeshStandardMaterial || m.userData.AntiDark) return;
      const brightened = brightenMaterial(m, lift);
      brightened.userData.AntiDark = true;
      mesh.material = brightened;
    });
  });
  return <group ref={ref}>{children}</group>;
};
