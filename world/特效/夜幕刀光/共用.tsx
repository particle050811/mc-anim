// 夜幕刀光各部分共用：夜幕的贴图、泛光那一路的层号、贴图和粒子材质，按种子的随机数，朝镜头的方片。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '../../../engine/model/parts.tsx';
import { pngDir } from '../../../engine/model/贴图.ts';

export const nightfallPngs = pngDir(import.meta.webpackContext('../夜幕刀光.贴图', { regExp: /\.png$/ }));

// 泛光离屏图收的东西放在这一层；主画面的镜头只看第 0 层，不会把它们直接画出来
export const bloomLayer = 7;

// 泛光那一路的贴图：最近邻（游戏没改过滤）、边缘 CLAMP（AnimationTrailParticle 构造时设的），不做 sRGB 解码——直接在画面数值上算
const bloomTexCache = new Map<string, THREE.DataTexture>();
export const bloomTexture = (key: string) => {
  let t = bloomTexCache.get(key);
  if (!t) {
    const img = nightfallPngs[key];
    t = new THREE.DataTexture(img.px, img.w, img.h, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.flipY = false;
    t.needsUpdate = true;
    bloomTexCache.set(key, t);
  }
  return t;
};

const bloomVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
void main() {
  vUv = uv;
  vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
// 粒子着色器：贴图 × 顶点色；画面数值直接写进离屏图（不做色彩空间换算）
const bloomFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform vec3 uColor;
varying vec2 vUv;
varying float vA;
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(map, vUv);
  if (t.a * vA <= 0.0) discard;
  gl_FragColor = vec4(t.rgb * uColor, t.a * vA);
}`;
export const bloomMaterial = (map: THREE.Texture, gray: number) =>
  new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uColor: { value: new THREE.Vector3(gray, gray, gray) } },
    vertexShader: bloomVert,
    fragmentShader: bloomFrag,
    side: THREE.DoubleSide,
    transparent: true,
    // vix PostParticleRenderType.begin：blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)、深度测试、写深度
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
  });

export const rng = (seed: number) => {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// 朝镜头的方片：方片的轴 = 镜头的轴（SingleQuadParticle 用 camera.rotation()），再绕视线转 roll（弧度）
export const Billboard: React.FC<{ at: V3; quad: THREE.BufferGeometry; mat: THREE.Material; half: number; roll: number; layer?: number; renderOrder?: number }> = ({
  at,
  quad,
  mat,
  half,
  roll,
  layer = 0,
  renderOrder = 0,
}) => {
  const mesh = useMemo(() => {
    const quadMesh = new THREE.Mesh(quad, mat);
    quadMesh.frustumCulled = false;
    quadMesh.layers.set(layer);
    quadMesh.renderOrder = renderOrder;
    // 每次画之前对准镜头（父级的变换算进去）
    quadMesh.onBeforeRender = (_r, _s, cam) => {
      const parent = quadMesh.parent;
      const quat = cam.getWorldQuaternion(new THREE.Quaternion());
      if (parent) quat.premultiply(parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), quadMesh.userData.roll as number));
      quadMesh.quaternion.copy(quat);
      quadMesh.updateMatrix();
      quadMesh.updateMatrixWorld(true);
      quadMesh.modelViewMatrix.multiplyMatrices(cam.matrixWorldInverse, quadMesh.matrixWorld);
    };
    return quadMesh;
  }, [quad, mat, layer, renderOrder]);
  mesh.userData.roll = roll;
  mesh.position.set(...at);
  mesh.scale.setScalar(half);
  return <primitive object={mesh} />;
};
