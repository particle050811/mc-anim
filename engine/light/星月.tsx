// 原版主世界的月亮和星星（天球.ts 的星星、月相格、天球矩阵），放在场景坐标（Z 朝上）的穹顶中心，和 天空.tsx 的方形太阳同一个半径。
// 照 1.20.1 LevelRenderer.renderSky：月亮按月相取 moon_phases.png 的一格，不透明度 1 − 雨；星星白色、亮度和不透明度都是 星星亮度（环境.ts，已乘 1 − 雨），
// 都是 SRC_ALPHA, ONE 加色混合（three 的 AdditiveBlending），所以星星实际加上去的是 亮度²。不进雾、不调色调。
// 坑：日月星画在 460 米外，对数深度下照 天空.tsx 的 Sun 把深度钉在最远处，云、地形写了深度就挡住它们。
import { useThree } from '@react-three/fiber';
import React, { useEffect, useMemo, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import moonPng from 'asset:贴图/场景/月相';
import { 天球半径, 天球矩阵, 月亮顶点, 原版星星 } from './天球.ts';
import { 星星亮度, 月相, 天角, type 天气, 晴 } from './环境.ts';

/** 同 天空.tsx 的 Sun（R_SKY − 20）：日月星同一个半径，角大小和原版一样 */
const 半径 = 460;
const 缩放 = 半径 / 天球半径;

const 钉在最远 = (mat: THREE.Material) => {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <logdepthbuf_fragment>', '#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )\n\tgl_FragDepth = 0.99999;\n#endif');
  };
};

const 加色材质 = (o: THREE.MeshBasicMaterialParameters) => {
  const mat = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide, ...o });
  钉在最远(mat);
  return mat;
};

// 星星几何只算一次（1500 次随机、确定），各画布共用；材质每个画布一份（亮度随帧变）
let 星星几何: THREE.BufferGeometry | null = null;
const 取星星几何 = () => {
  if (星星几何) return 星星几何;
  const v = 原版星星();
  const 颗 = v.length / 12;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(v, (x) => x * 缩放), 3));
  const idx: number[] = [];
  for (let i = 0; i < 颗; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  g.setIndex(idx);
  return (星星几何 = g);
};

const 设矩阵 = (o: THREE.Object3D, 角: number, 倾角: number) => {
  const [a, b, c] = 天球矩阵(角, 倾角);
  o.matrixAutoUpdate = false;
  o.matrix.set(a[0], a[1], a[2], 0, b[0], b[1], b[2], 0, c[0], c[1], c[2], 0, 0, 0, 0, 1);
  o.matrixWorldNeedsUpdate = true;
};

export type 星月属性 = {
  /** 游戏时间（刻）：定天角和月相 */
  时刻: number;
  /** 轨道往南倾几度（环境描述的 轨道倾角） */
  倾角?: number;
  天气?: 天气;
};

/** 原版的月亮和星星。放在穹顶中心那个 group 里（场景坐标） */
export const 原版星月: React.FC<星月属性> = ({ 时刻, 倾角 = 0, 天气: w = 晴 }) => {
  const 角 = 天角(时刻);
  const 相 = 月相(时刻);
  const 星亮 = 星星亮度(角, w);
  const 月透 = 1 - w.雨;

  // 贴图读完才放行这一帧（同 天空.tsx 的 Clouds）
  const [句柄] = useState(() => delayRender('取月相贴图'));
  const advance = useThree((s) => s.advance);
  const 月贴图 = useMemo(() => {
    const tex = new THREE.TextureLoader().load(
      moonPng,
      () => {
        advance(performance.now());
        continueRender(句柄);
      },
      undefined,
      (e) => cancelRender(e),
    );
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    return tex;
  }, [句柄, advance]);
  const 月 = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(4 * 2), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return new THREE.Mesh(g, 加色材质({ map: 月贴图 }));
  }, [月贴图]);
  const 星 = useMemo(() => new THREE.Mesh(取星星几何(), 加色材质({ color: 0xffffff })), []);
  useEffect(
    () => () => {
      月.geometry.dispose();
      (月.material as THREE.Material).dispose();
      (星.material as THREE.Material).dispose();
      月贴图.dispose();
    },
    [月, 星, 月贴图],
  );

  const 顶点 = 月亮顶点(相);
  const pos = 月.geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = 月.geometry.getAttribute('uv') as THREE.BufferAttribute;
  顶点.forEach(([x, y, z, u, v], i) => {
    pos.setXYZ(i, x * 缩放, y * 缩放, z * 缩放);
    uv.setXY(i, u, v);
  });
  pos.needsUpdate = uv.needsUpdate = true;
  月.geometry.computeBoundingSphere();
  (月.material as THREE.MeshBasicMaterial).opacity = 月透;
  月.visible = 月透 > 0;
  设矩阵(月, 角, 倾角);

  // 原版着色器色 (亮, 亮, 亮, 亮)：画面值上加 亮 × 亮
  const 星材 = 星.material as THREE.MeshBasicMaterial;
  星材.color.setRGB(星亮, 星亮, 星亮, THREE.SRGBColorSpace);
  星材.opacity = 星亮;
  星.visible = 星亮 > 0;
  星.frustumCulled = 月.frustumCulled = false;
  设矩阵(星, 角, 倾角);

  return (
    <>
      <primitive object={星} renderOrder={-1} />
      <primitive object={月} renderOrder={-1} />
    </>
  );
};
