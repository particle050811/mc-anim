// 描边：给角色、物件加整数像素宽的暗色外轮廓（05-画风 原则 5）。用 <描边> 包住要描的东西，画布里放一个 <描边渲染> 接管渲染：
// 1. 照常画整个场景；2. 再画一遍到遮罩：描边对象写 1，别的东西写 0（挡在前面的会把描边对象擦掉），半透明的、线、点不画；
// 3. 全屏一遍：遮罩外、方圆 宽 个画布像素内有遮罩像素，而且这里的东西比那个遮罩像素远（在它后面）的，涂描边色。
// 所以只描外轮廓，同一个描边对象内部、两个描边对象挨着的地方不描；前面挡着的墙上不出线。宽按成片像素给，预览级（不放大）减半。
// 遮罩那遍的材质从当前材质派生（平涂过的就从平涂材质派生），镂空的头发、树叶照样按贴图透明度挖掉。
import { useFrame } from '@react-three/fiber';
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { 成片倍数 } from './像素.ts';

/** 包住要描边的东西；开 = false 时里面的不描（可以在描边的大组里挖掉一块） */
export const 描边: React.FC<{ 开?: boolean; children: React.ReactNode }> = ({ 开 = true, children }) => <group userData={{ 描边: 开 }}>{children}</group>;

export type 描边参数 = {
  /** 宽（成片像素，整数） */
  宽: number;
  /** 颜色（sRGB） */
  色: string;
};

type 有标记 = THREE.Material & { isMeshBasicMaterial?: boolean; isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean; isMeshToonMaterial?: boolean };
const 能派生 = (m: 有标记) => !!(m.isMeshBasicMaterial || m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);

// 什么都不画的材质：遮罩那遍里不该出现、又不能把子节点一起藏掉的网格换成它
const 隐身 = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });

const 变体表 = new WeakMap<THREE.Material, { 遮罩?: THREE.Material; 深度?: THREE.Material }>();
const 变体 = (m: THREE.Material, 遮罩: boolean): THREE.Material => {
  if ((m.transparent && !m.depthWrite) || !m.visible || !能派生(m as 有标记)) return 隐身;
  let e = 变体表.get(m);
  if (!e) {
    e = {};
    变体表.set(m, e);
    const 表 = e;
    m.addEventListener('dispose', () => {
      表.遮罩?.dispose();
      表.深度?.dispose();
    });
  }
  const 键 = 遮罩 ? '遮罩' : '深度';
  let v = e[键];
  if (!v) {
    v = m.clone();
    v.toneMapped = false;
    (v as THREE.MeshBasicMaterial).fog = false;
    if (遮罩) {
      v.onBeforeCompile = (shader, renderer) => {
        m.onBeforeCompile(shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor = vec4( 1.0 );');
      };
      v.customProgramCacheKey = () => `${m.customProgramCacheKey()}|描边遮罩`;
    } else {
      // 写 0 而不是 colorWrite = false：three 按 renderOrder、材质 id 排序，挡在前面的墙可能排在描边对象后面画，只写深度就擦不掉它的遮罩，墙边会透出轮廓线
      v.onBeforeCompile = (shader, renderer) => {
        m.onBeforeCompile(shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );');
      };
      v.customProgramCacheKey = () => `${m.customProgramCacheKey()}|描边深度`;
    }
    e[键] = v;
  }
  return v;
};

/** 把场景换成遮罩那遍的样子，返回还原函数和有没有描边对象 */
const 换成遮罩 = (scene: THREE.Scene) => {
  const 还原: (() => void)[] = [];
  let 有 = false;
  const 走 = (o: THREE.Object3D, 描: boolean) => {
    if (!o.visible) return;
    const d = typeof o.userData.描边 === 'boolean' ? (o.userData.描边 as boolean) : 描;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const 原 = mesh.material;
      mesh.material = Array.isArray(原) ? 原.map((m) => 变体(m, d)) : 变体(原, d);
      还原.push(() => (mesh.material = 原));
      if (d) 有 = true;
    } else if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) {
      o.visible = false;
      还原.push(() => (o.visible = true));
      return;
    }
    for (const c of o.children) 走(c, d);
  };
  走(scene, false);
  return { 有, 还原: () => 还原.forEach((f) => f()) };
};

const 合成着色器 = /* glsl */ `
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
export const 描边渲染: React.FC<{ 参数?: 描边参数 | false }> = ({ 参数 }) => {
  const 资源 = useMemo(() => {
    const 材质 = new THREE.ShaderMaterial({
      uniforms: { tMask: { value: null }, tDepth: { value: null }, radius: { value: 1 }, inkColor: { value: new THREE.Color() } },
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: 合成着色器,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    const 片 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), 材质);
    片.frustumCulled = false;
    const 场 = new THREE.Scene();
    场.add(片);
    return { 材质, 片, 场, 机: new THREE.OrthographicCamera(), rt: null as THREE.WebGLRenderTarget | null, 尺寸: new THREE.Vector2(), 清色: new THREE.Color() };
  }, []);
  useEffect(
    () => () => {
      资源.rt?.dispose();
      资源.rt?.depthTexture?.dispose();
      资源.材质.dispose();
      资源.片.geometry.dispose();
    },
    [资源],
  );
  useFrame(({ gl, scene, camera, viewport }) => {
    gl.setRenderTarget(null);
    gl.render(scene, camera);
    if (!参数) return;
    const { 有, 还原 } = 换成遮罩(scene);
    if (!有) return 还原();
    const [w, h] = gl.getDrawingBufferSize(资源.尺寸).toArray();
    if (!资源.rt) {
      资源.rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h) });
    } else if (资源.rt.width !== w || 资源.rt.height !== h) 资源.rt.setSize(w, h);
    const 背景 = scene.background;
    const 清透明 = gl.getClearAlpha();
    gl.getClearColor(资源.清色);
    scene.background = null;
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(资源.rt);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.setClearColor(资源.清色, 清透明);
    scene.background = 背景;
    还原();
    const u = 资源.材质.uniforms;
    u.tMask!.value = 资源.rt.texture;
    u.tDepth!.value = 资源.rt.depthTexture;
    u.radius!.value = Math.max(1, Math.round((参数.宽 * viewport.dpr) / 成片倍数));
    (u.inkColor!.value as THREE.Color).set(参数.色);
    const 自动清 = gl.autoClear;
    gl.autoClear = false;
    gl.render(资源.场, 资源.机);
    gl.autoClear = 自动清;
  }, 1);
  return null;
};
