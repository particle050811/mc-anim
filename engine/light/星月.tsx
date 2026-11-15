// 原版主世界的月亮和星星（天球.ts 的星星、月相格、天球矩阵），放在场景坐标（Z 朝上）的穹顶中心，和 天空.tsx 的方形太阳同一个半径。
// 照 1.20.1 LevelRenderer.renderSky：月亮按月相取 moon_phases.png 的一格，不透明度 1 − 雨；星星白色、亮度和不透明度都是 星星亮度（环境.ts，已乘 1 − 雨），
// 都是 SRC_ALPHA, ONE 加色混合（three 的 AdditiveBlending），所以星星实际加上去的是 亮度²。不进雾、不调色调。
// 坑：日月星画在 460 米外，对数深度下照 天空.tsx 的 Sun 把深度钉在最远处，云、地形写了深度就挡住它们。
import { useThree } from '@react-three/fiber';
import React, { useEffect, useMemo, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import moonPng from 'asset:贴图/场景/月相';
import { skyDomeRadius, skyMatrix, moonVertices, vanillaStars } from './天球.ts';
import { starBrightness, moonPhase, skyAngle, type Weather, clearWeather } from './环境.ts';
import { pinDepthFar } from '../core/光栅深度.ts';

/** 同 天空.tsx 的 Sun（R_SKY − 20）：日月星同一个半径，角大小和原版一样 */
const radius = 460;
const scale = radius / skyDomeRadius;

const additiveMaterial = (o: THREE.MeshBasicMaterialParameters) => {
  const mat = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide, ...o });
  pinDepthFar(mat);
  return mat;
};

// 星星几何只算一次（1500 次随机、确定），各画布共用；材质每个画布一份（亮度随帧变）
let starGeometry: THREE.BufferGeometry | null = null;
const getStarGeometry = () => {
  if (starGeometry) return starGeometry;
  const v = vanillaStars();
  const starCount = v.length / 12;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(v, (x) => x * scale), 3));
  const idx: number[] = [];
  for (let i = 0; i < starCount; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  g.setIndex(idx);
  return (starGeometry = g);
};

const setMatrix = (o: THREE.Object3D, skyAngle: number, tiltDeg: number) => {
  const [a, b, c] = skyMatrix(skyAngle, tiltDeg);
  o.matrixAutoUpdate = false;
  o.matrix.set(a[0], a[1], a[2], 0, b[0], b[1], b[2], 0, c[0], c[1], c[2], 0, 0, 0, 0, 1);
  o.matrixWorldNeedsUpdate = true;
};

export type StarMoonProps = {
  /** 游戏时间（刻）：定天角和月相 */
  gameTime: number;
  /** 轨道往南倾几度（环境描述的 轨道倾角） */
  tiltDeg?: number;
  weather?: Weather;
};

/** 原版的月亮和星星。放在穹顶中心那个 group 里（场景坐标） */
export const VanillaStarMoon: React.FC<StarMoonProps> = ({ gameTime, tiltDeg = 0, weather: w = clearWeather }) => {
  const angle = skyAngle(gameTime);
  const phase = moonPhase(gameTime);
  const starBright = starBrightness(angle, w);
  const moonOpacity = 1 - w.雨;

  // 贴图读完才放行这一帧（同 天空.tsx 的 Clouds）
  const [delayHandle] = useState(() => delayRender('取月相贴图'));
  const advance = useThree((s) => s.advance);
  const moonTexture = useMemo(() => {
    const tex = new THREE.TextureLoader().load(
      moonPng,
      () => {
        advance(performance.now());
        continueRender(delayHandle);
      },
      undefined,
      (e) => cancelRender(e),
    );
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    return tex;
  }, [delayHandle, advance]);
  const moonMesh = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(4 * 2), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return new THREE.Mesh(g, additiveMaterial({ map: moonTexture }));
  }, [moonTexture]);
  const starMesh = useMemo(() => new THREE.Mesh(getStarGeometry(), additiveMaterial({ color: 0xffffff })), []);
  useEffect(
    () => () => {
      moonMesh.geometry.dispose();
      (moonMesh.material as THREE.Material).dispose();
      (starMesh.material as THREE.Material).dispose();
      moonTexture.dispose();
    },
    [moonMesh, starMesh, moonTexture],
  );

  const vertices = moonVertices(phase);
  const pos = moonMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = moonMesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  vertices.forEach(([x, y, z, u, v], i) => {
    pos.setXYZ(i, x * scale, y * scale, z * scale);
    uv.setXY(i, u, v);
  });
  pos.needsUpdate = uv.needsUpdate = true;
  moonMesh.geometry.computeBoundingSphere();
  (moonMesh.material as THREE.MeshBasicMaterial).opacity = moonOpacity;
  moonMesh.visible = moonOpacity > 0;
  setMatrix(moonMesh, angle, tiltDeg);

  // 原版着色器色 (亮, 亮, 亮, 亮)：画面值上加 亮 × 亮
  const starMaterial = starMesh.material as THREE.MeshBasicMaterial;
  starMaterial.color.setRGB(starBright, starBright, starBright, THREE.SRGBColorSpace);
  starMaterial.opacity = starBright;
  starMesh.visible = starBright > 0;
  starMesh.frustumCulled = moonMesh.frustumCulled = false;
  setMatrix(starMesh, angle, tiltDeg);

  return (
    <>
      <primitive object={starMesh} renderOrder={-1} />
      <primitive object={moonMesh} renderOrder={-1} />
    </>
  );
};
