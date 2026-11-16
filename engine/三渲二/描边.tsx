// 描边：给角色、物件加整数像素宽的暗色外轮廓（05-画风 原则 5）。用 <描边> 包住要描的东西，画布里放一个 <描边渲染> 接管渲染：
// 1. 照常画整个场景；2. 再画一遍到遮罩：描边对象写 1，别的东西写 0（挡在前面的会把描边对象擦掉），半透明的、线、点不画；
// 3. 全屏一遍：遮罩外、方圆 宽 个画布像素内有遮罩像素，而且这里的东西比那个遮罩像素远（在它后面）的，涂描边色。
// 所以只描外轮廓，同一个描边对象内部、两个描边对象挨着的地方不描；前面挡着的墙上不出线。宽按成片像素给，预览级（不放大）减半。
// 遮罩那遍的材质从当前材质派生（平涂过的就从平涂材质派生），镂空的头发、树叶照样按贴图透明度挖掉。
import { useFrame } from '@react-three/fiber';
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { filmScale } from './像素.ts';

/** 包住要描边的东西；开 = false 时里面的不描（可以在描边的大组里挖掉一块） */
export const Outline: React.FC<{ 开?: boolean; children: React.ReactNode }> = ({ 开: enabled = true, children }) => <group userData={{ outline: enabled }}>{children}</group>;

export type OutlineParams = {
  /** 宽（成片像素，整数） */
  width: number;
  /** 颜色（sRGB） */
  色: string;
};

type MarkedMaterial = THREE.Material & { isMeshBasicMaterial?: boolean; isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean; isMeshToonMaterial?: boolean };
const canDerive = (m: MarkedMaterial) => !!(m.isMeshBasicMaterial || m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);

// 什么都不画的材质：遮罩那遍里不该出现、又不能把子节点一起藏掉的网格换成它
const hiddenMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });

const variantMap = new WeakMap<THREE.Material, { mask?: THREE.Material; depth?: THREE.Material }>();
const makeVariant = (m: THREE.Material, masked: boolean): THREE.Material => {
  if ((m.transparent && !m.depthWrite) || !m.visible || !canDerive(m as MarkedMaterial)) return hiddenMaterial;
  let e = variantMap.get(m);
  if (!e) {
    e = {};
    variantMap.set(m, e);
    const outlineTable = e;
    m.addEventListener('dispose', () => {
      outlineTable.mask?.dispose();
      outlineTable.depth?.dispose();
    });
  }
  const passKey = masked ? 'mask' : 'depth';
  let v = e[passKey];
  if (!v) {
    v = m.clone();
    v.toneMapped = false;
    (v as THREE.MeshBasicMaterial).fog = false;
    if (masked) {
      v.onBeforeCompile = (shader, renderer) => {
        m.onBeforeCompile(shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor = vec4( 1.0 );');
      };
      v.customProgramCacheKey = () => `${m.customProgramCacheKey()}|描边遮罩`;
    } else {
      // 写 0 而不是 colorWrite = false：three 按 renderOrder、材质先后排序（engine/core/稳定排序.ts），挡在前面的墙可能排在描边对象后面画，只写深度就擦不掉它的遮罩，墙边会透出轮廓线
      v.onBeforeCompile = (shader, renderer) => {
        m.onBeforeCompile(shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );');
      };
      v.customProgramCacheKey = () => `${m.customProgramCacheKey()}|描边深度`;
    }
    e[passKey] = v;
  }
  return v;
};

/** 把场景换成遮罩那遍的样子，返回还原函数和有没有描边对象 */
const swapToMask = (scene: THREE.Scene) => {
  const restores: (() => void)[] = [];
  let hasMask = false;
  const walk = (o: THREE.Object3D, outline: boolean) => {
    if (!o.visible) return;
    const d = typeof o.userData.描边 === 'boolean' ? (o.userData.描边 as boolean) : outline;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const originalMaterial = mesh.material;
      mesh.material = Array.isArray(originalMaterial) ? originalMaterial.map((m) => makeVariant(m, d)) : makeVariant(originalMaterial, d);
      restores.push(() => (mesh.material = originalMaterial));
      if (d) hasMask = true;
    } else if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) {
      o.visible = false;
      restores.push(() => (o.visible = true));
      return;
    }
    for (const c of o.children) walk(c, d);
  };
  walk(scene, false);
  return { 有: hasMask, restore: () => restores.forEach((f) => f()) };
};

const compositeShader = /* glsl */ `
uniform sampler2D tMask;
uniform sampler2D tDepth;
uniform int radius;
uniform vec3 inkColor;
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy );
  ivec2 size = textureSize( tMask, 0 );
  if ( texelFetch( tMask, p, 0 ).r > 0.5 ) discard;
  float best = 2.0;
  for ( int dy = - radius; dy <= radius; dy ++ ) {
    for ( int dx = - radius; dx <= radius; dx ++ ) {
      ivec2 q = p + ivec2( dx, dy );
      if ( q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y ) continue;
      if ( texelFetch( tMask, q, 0 ).r > 0.5 ) best = min( best, texelFetch( tDepth, q, 0 ).r );
    }
  }
  if ( best > 1.5 || texelFetch( tDepth, p, 0 ).r <= best ) discard;
  gl_FragColor = vec4( inkColor, 1.0 );
  #include <colorspace_fragment>
}`;

/** 接管画布的渲染（useFrame 优先级 1）：先照常画，参数给了就再描边。一个画布只放一个 */
export const OutlineRender: React.FC<{ params?: OutlineParams | false }> = ({ params: params }) => {
  const resource = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: { tMask: { value: null }, tDepth: { value: null }, radius: { value: 1 }, inkColor: { value: new THREE.Color() } },
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: compositeShader,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    const quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quadMesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quadMesh);
    return { material, 片: quadMesh, scene: scene, machine: new THREE.OrthographicCamera(), rt: null as THREE.WebGLRenderTarget | null, 尺寸: new THREE.Vector2(), clearColor: new THREE.Color() };
  }, []);
  useEffect(
    () => () => {
      resource.rt?.dispose();
      resource.rt?.depthTexture?.dispose();
      resource.material.dispose();
      resource.片.geometry.dispose();
    },
    [resource],
  );
  useFrame(({ gl, scene, camera, viewport }) => {
    gl.setRenderTarget(null);
    gl.render(scene, camera);
    if (!params) return;
    const { 有: hasMask, restore } = swapToMask(scene);
    if (!hasMask) return restore();
    const [w, h] = gl.getDrawingBufferSize(resource.尺寸).toArray();
    if (!resource.rt) {
      resource.rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h) });
    } else if (resource.rt.width !== w || resource.rt.height !== h) resource.rt.setSize(w, h);
    const savedBackground = scene.background;
    const clearTransparency = gl.getClearAlpha();
    gl.getClearColor(resource.clearColor);
    scene.background = null;
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(resource.rt);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.setClearColor(resource.clearColor, clearTransparency);
    scene.background = savedBackground;
    restore();
    const u = resource.material.uniforms;
    u.tMask!.value = resource.rt.texture;
    u.tDepth!.value = resource.rt.depthTexture;
    u.radius!.value = Math.max(1, Math.round((params.width * viewport.dpr) / filmScale));
    (u.inkColor!.value as THREE.Color).set(params.色);
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.render(resource.scene, resource.machine);
    gl.autoClear = autoClear;
  }, 1);
  return null;
};
