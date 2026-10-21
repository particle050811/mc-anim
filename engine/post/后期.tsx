// 后期：场景先画进半精度离屏图，最后一遍逐像素拷到画布。用处是让 屏幕AO 的离屏图也换成半精度（lib/体素/屏幕AO.tsx），亮部不在那一步被量化成 8 位。
// 场景照旧按画到屏幕的写法出色（色调映射、sRGB、雾、屏幕 AO、云都和直接画到画布逐像素一样）。
// 不做全场景泛光（用户 10-17：保持现有画面）：天空、天边的云按中性映射反解出的亮度太高，取亮截到 2、阈值调到 1.8 仍把整片天糊成白团（6-1-2 开头）。
// 刀光、命中闪光的泛光另有一套（模型/特效/夜幕刀光/泛光.tsx）。
//
// 用法：ThreeCanvas 里挂 <PostFx />。画布上有 <ScreenAo />（优先级 1）时传 drawsScene={false}，由 AO 往这里的离屏图画；
// <NightfallBloom />（优先级 2）在这之后接着画，也传 drawsScene={false}。命令行 --props='{"后期":false}' 整个关掉。
// 不支持：画布上别的 useFrame 接管渲染、又不经过 gl.getRenderTarget() 的（目前没有）。
import { useFrame } from '@react-three/fiber';
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { 渲染输入 } from '../core/渲染设置.ts';

// 挂了 <PostFx /> 的画布：屏幕 AO 的离屏图跟着换成半精度（lib/体素/屏幕AO.tsx），亮部不在那一步被量化成 8 位
export const postFxRenderers = new WeakSet<THREE.WebGLRenderer>();

const inputOverrides = 渲染输入() as { 后期?: boolean };
export const postFxEnabled = inputOverrides.后期 !== false;

const VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 画面数值（sRGB 编码后的中性映射输出）→ 场景亮度（线性）。中性映射见 three 的 tonemapping_pars_fragment（NeutralToneMapping）
const inverseToneMapGlsl = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 invNeutral(vec3 o) {
  const float S = 0.8 - 0.04;
  const float DS = 0.15;
  const float d = 1.0 - S;
  vec3 c = max(o, vec3(0.0));
  float np = max(c.r, max(c.g, c.b));
  if (np >= S) {
    // 正向：newPeak = 1 − d²/(peak + d − S)，颜色 × newPeak/peak，再往 newPeak 的灰混 g
    np = min(np, 0.9995);
    float peak = d * d / (1.0 - np) - d + S;
    float g = 1.0 - 1.0 / (DS * (peak - np) + 1.0);
    c = (min(c, vec3(np)) - g * np) / (1.0 - g);
    c *= peak / np;
  }
  // 正向减的偏移：最暗的通道 x < 0.08 时减 x − 6.25x²，否则减 0.04
  float m = max(min(c.r, min(c.g, c.b)), 0.0);
  float x = m >= 0.04 ? m + 0.04 : sqrt(m / 6.25);
  return c + (x - m);
}
vec3 sceneAt(sampler2D t, vec2 uv) { return invNeutral(srgbToLinear(texture2D(t, uv).rgb)); }`;

// 拷到画布：逐像素取（不插值）。remap：超出 0～1 的亮色（天空、天边的云）反解成场景亮度再过一遍中性映射，压向白色；
// 这是原来泛光管线在合成时顺带做的，用户认可的画面就是这样，所以留着（6-1-2 迷宫那几镜原来泛光是 0，没过这一步）
const copyFs = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uSize;
uniform bool uRemap;
varying vec2 vUv;
${inverseToneMapGlsl}
vec3 neutral(vec3 color) {
  const float StartCompression = 0.8 - 0.04;
  const float Desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < StartCompression) return color;
  float d = 1. - StartCompression;
  float newPeak = 1. - d * d / (peak + d - StartCompression);
  color *= newPeak / peak;
  float g = 1. - 1. / (Desaturation * (peak - newPeak) + 1.);
  return mix(color, vec3(newPeak), g);
}
vec3 linearToSrgb(vec3 c) {
  return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
void main() {
  vec2 uv = (floor(gl_FragCoord.xy) + 0.5) / uSize;
  vec3 c = texture2D(tScene, uv).rgb;
  if (uRemap) c = linearToSrgb(clamp(neutral(invNeutral(srgbToLinear(c))), 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

export const PostFx: React.FC<{ drawsScene?: boolean; remap?: boolean }> = ({ drawsScene = true, remap = true }) => {
  const resources = useMemo(() => {
    // 场景画进来的图：「XR 渲染目标」+ sRGB，three 按画到屏幕的写法出色（同 屏幕AO 的离屏图），存成半精度
    const scene = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });
    (scene as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    scene.texture.colorSpace = THREE.SRGBColorSpace;
    scene.texture.internalFormat = 'RGBA16F';
    const copyMat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: copyFs,
      uniforms: { tScene: { value: scene.texture }, uSize: { value: new THREE.Vector2() }, uRemap: { value: true } },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat);
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    return { scene, copyMat, quad, quadScene, camera: new THREE.OrthographicCamera(), bufSize: new THREE.Vector2(), prevTarget: null as THREE.WebGLRenderTarget | null };
  }, []);
  useEffect(
    () => () => {
      resources.scene.dispose();
      resources.copyMat.dispose();
      resources.quad.geometry.dispose();
    },
    [resources],
  );
  const enabled = postFxEnabled;

  // 优先级 0.5：在 屏幕AO（1）之前，把渲染目标换成离屏图；没有别人接管时这里画场景
  useFrame(({ gl, scene, camera }) => {
    if (!enabled) {
      if (drawsScene) gl.render(scene, camera);
      return;
    }
    postFxRenderers.add(gl);
    gl.getDrawingBufferSize(resources.bufSize);
    const width = Math.max(1, Math.floor(resources.bufSize.x));
    const height = Math.max(1, Math.floor(resources.bufSize.y));
    const samples = gl.getContextAttributes()?.antialias ? Math.min(4, gl.capabilities.maxSamples) : 0;
    if (resources.scene.width !== width || resources.scene.height !== height || resources.scene.samples !== samples) {
      resources.scene.samples = samples;
      resources.scene.setSize(width, height);
      resources.scene.dispose(); // 采样数变了 three 不会自己重建
    }
    resources.prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(resources.scene);
    if (drawsScene) gl.render(scene, camera);
  }, 0.5);

  // 优先级 1.5：屏幕 AO（含云这类中间步骤）画完以后，拷到原来的目标（画布）上
  useFrame(({ gl }) => {
    if (!enabled) return;
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    (resources.copyMat.uniforms.uSize.value as THREE.Vector2).set(resources.scene.width, resources.scene.height);
    resources.copyMat.uniforms.uRemap.value = remap;
    gl.setRenderTarget(resources.prevTarget);
    gl.render(resources.quadScene, resources.camera);
    gl.autoClear = autoClear;
  }, 1.5);
  return null;
};
