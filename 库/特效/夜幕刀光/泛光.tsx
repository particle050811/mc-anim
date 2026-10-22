// 夜幕刀光的泛光后处理 `NightfallBloom`：
// 三、泛光（夜幕 BloomParticleRenderType$Pipeline + shaders/program/down_sampling、up_sampling、unity_composite）：
//   刀光和闪光先画进清成全透明的离屏图，连降 5 级（1/2…1/32）再升回 1/2，最后合成：
//   画面 = mix(背景, 刀光, 刀光.a) + 1.65 × 0.8 × (模糊 + 刀光) × [(1 − 背景亮度) × (1.35 − 0.28) + 0.28]，暗背景泛光更强。全部在画面数值（sRGB 编码后）上算，和游戏一致。
//   离屏图没有场景深度，刀光和泛光不会被前面的东西挡住（游戏里刀光有深度测试），刀光一般在人身边的空中，影响不大。
import { useFrame } from '@react-three/fiber';
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { bloomLayer } from './共用.tsx';

const fullscreenVert = /* glsl */ `
varying vec2 texCoord;
void main() { texCoord = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// down_sampling.fsh 原样
const downFrag = /* glsl */ `
uniform sampler2D DiffuseSampler;
uniform vec2 InSize;
varying vec2 texCoord;
void main(){
  vec2 pixelSize = 1.0 / InSize;
  vec4 center = texture2D(DiffuseSampler, texCoord);
  vec4 left = texture2D(DiffuseSampler, texCoord + vec2(-pixelSize.x, 0));
  vec4 right = texture2D(DiffuseSampler, texCoord + vec2(pixelSize.x, 0));
  vec4 top = texture2D(DiffuseSampler, texCoord + vec2(0, pixelSize.y));
  vec4 bottom = texture2D(DiffuseSampler, texCoord + vec2(0, -pixelSize.y));
  float edge = length(center.rgb - left.rgb) + length(center.rgb - right.rgb) + length(center.rgb - top.rgb) + length(center.rgb - bottom.rgb);
  if (edge > 0.1) {
    vec4 blended = (center + left + right + top + bottom) * 0.2;
    gl_FragColor = mix(center, blended, min(edge * 2.0, 1.0));
  } else {
    gl_FragColor = center;
  }
}`;
// up_sampling.fsh 原样
const upFrag = /* glsl */ `
uniform sampler2D DiffuseSampler;
uniform sampler2D DownTexture;
uniform vec2 OutSize;
varying vec2 texCoord;
void main(){
  vec3 textel = vec3(1., -1., 0.) / OutSize.xyx;
  vec4 o = texture2D(DiffuseSampler, texCoord + textel.xx);
  o += texture2D(DiffuseSampler, texCoord + textel.xz) * 2.0;
  o += texture2D(DiffuseSampler, texCoord + textel.xy);
  o += texture2D(DiffuseSampler, texCoord + textel.yz) * 2.0;
  o += texture2D(DiffuseSampler, texCoord) * 4.0;
  o += texture2D(DiffuseSampler, texCoord + textel.zx) * 2.0;
  o += texture2D(DiffuseSampler, texCoord + textel.yy);
  o += texture2D(DiffuseSampler, texCoord + textel.zy) * 2.0;
  o += texture2D(DiffuseSampler, texCoord + textel.yx);
  gl_FragColor = o * 0.8 / 16. + texture2D(DownTexture, texCoord) * 0.8;
}`;
// unity_composite.fsh 原样，uniform 取 unity_composite.json 的默认值（UnityComposite 类里没改）
const compositeFrag = /* glsl */ `
uniform sampler2D DiffuseSampler;
uniform sampler2D DownTexture;
uniform sampler2D Background;
uniform vec2 OutSize;
const float BloomIntensive = 1.65;
const float BloomBase = 0.0;
const float BloomThresholdUp = 1.35;
const float BloomThresholdDown = 0.28;
varying vec2 texCoord;
float calculateLuminance(vec3 color) { return dot(color, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 t = 1.0 / OutSize;
  vec4 o = texture2D(DiffuseSampler, texCoord) * 4.0;
  o += texture2D(DiffuseSampler, texCoord + vec2(t.x, 0.0)) * 2.0;
  o += texture2D(DiffuseSampler, texCoord + vec2(-t.x, 0.0)) * 2.0;
  o += texture2D(DiffuseSampler, texCoord + vec2(0.0, t.y)) * 2.0;
  o += texture2D(DiffuseSampler, texCoord + vec2(0.0, -t.y)) * 2.0;
  o += texture2D(DiffuseSampler, texCoord + vec2(t.x, t.y));
  o += texture2D(DiffuseSampler, texCoord + vec2(-t.x, t.y));
  o += texture2D(DiffuseSampler, texCoord + vec2(t.x, -t.y));
  o += texture2D(DiffuseSampler, texCoord + vec2(-t.x, -t.y));
  o /= 16.0;
  vec4 highLight = texture2D(DownTexture, texCoord);
  vec4 bloom = BloomIntensive * vec4(o.rgb * 0.8 + highLight.rgb * 0.8, 1.0);
  vec4 background = texture2D(Background, texCoord);
  background.rgb = mix(background.rgb, highLight.rgb, highLight.a);
  float luminance = calculateLuminance(background.rgb);
  float bloomFactor = (1.0 - luminance) * (BloomThresholdUp - BloomThresholdDown) + BloomThresholdDown + BloomBase;
  gl_FragColor = vec4(background.rgb + bloom.rgb * bloomFactor, 1.0);
}`;

const makeTarget = (samples = 0) => {
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: samples > 0,
    samples,
  });
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  return rt;
};

// 这一帧画布上有没有要泛光的东西（没有就整套跳过，画面和不挂这个组件时一样）
const hasBloomObjects = (scene: THREE.Scene) => {
  let found = false;
  const mask = 1 << bloomLayer;
  scene.traverseVisible((obj) => {
    if (!found && (obj.layers.mask & mask) !== 0 && (obj as THREE.Mesh).isMesh) found = true;
  });
  return found;
};

export const NightfallBloom: React.FC<{ drawsScene?: boolean }> = ({ drawsScene = true }) => {
  const bloomParts = useMemo(() => {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    const sm = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: fullscreenVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending });
    return {
      quad,
      quadScene: quadScene,
      camera: new THREE.OrthographicCamera(),
      bufSize: new THREE.Vector2(),
      bladeGlow: makeTarget(4),
      downTargets: Array.from({ length: 5 }, () => makeTarget()),
      upTargets: Array.from({ length: 4 }, () => makeTarget()),
      bgTexture: new THREE.FramebufferTexture(1, 1),
      downMat: sm(downFrag, { DiffuseSampler: { value: null }, InSize: { value: new THREE.Vector2() } }),
      upMat: sm(upFrag, { DiffuseSampler: { value: null }, DownTexture: { value: null }, OutSize: { value: new THREE.Vector2() } }),
      compositeMat: sm(compositeFrag, { DiffuseSampler: { value: null }, DownTexture: { value: null }, Background: { value: null }, OutSize: { value: new THREE.Vector2() } }),
      clearColor: new THREE.Color(),
    };
  }, []);
  useEffect(
    () => () => {
      for (const rt of [bloomParts.bladeGlow, ...bloomParts.downTargets, ...bloomParts.upTargets]) rt.dispose();
      bloomParts.bgTexture.dispose();
      for (const mat of [bloomParts.downMat, bloomParts.upMat, bloomParts.compositeMat]) mat.dispose();
      bloomParts.quad.geometry.dispose();
    },
    [bloomParts],
  );

  // 有了正优先级 R3F 就不自己画了，没有别人接管时这里先把场景画上：放在优先级 1（同 屏幕AO），刀的泛光（物品/拔刀剑泛光.tsx，1.25）要在场景画完之后
  useFrame(({ gl, scene, camera }) => {
    if (drawsScene) gl.render(scene, camera);
  }, 1);
  // 优先级 2：在 屏幕AO（1）、后期拷回画布（1.5）之后
  useFrame(({ gl, scene, camera }) => {
    if (!hasBloomObjects(scene)) return;
    const { bufSize: bufSize, quad, quadScene: quadScene, camera: orthoCam } = bloomParts;
    gl.getDrawingBufferSize(bufSize);
    const width = Math.max(1, Math.floor(bufSize.x));
    const height = Math.max(1, Math.floor(bufSize.y));
    if (bloomParts.bladeGlow.width !== width || bloomParts.bladeGlow.height !== height) {
      bloomParts.bladeGlow.setSize(width, height);
      bloomParts.downTargets.forEach((rt, i) => rt.setSize(Math.max(1, Math.floor(width / 2 ** (i + 1))), Math.max(1, Math.floor(height / 2 ** (i + 1)))));
      bloomParts.upTargets.forEach((rt, i) => rt.setSize(bloomParts.downTargets[i].width, bloomParts.downTargets[i].height));
      bloomParts.bgTexture.dispose();
      bloomParts.bgTexture = new THREE.FramebufferTexture(width, height);
    }
    const prevTarget = gl.getRenderTarget();
    const prevAlpha = gl.getClearAlpha();
    gl.getClearColor(bloomParts.clearColor);
    const prevMask = camera.layers.mask;
    const prevBg = scene.background;
    const shadowAuto = gl.shadowMap.autoUpdate;
    const autoClear = gl.autoClear;

    // 1. 刀光、闪光画进离屏图（清成全透明）
    scene.background = null;
    gl.shadowMap.autoUpdate = false;
    camera.layers.set(bloomLayer);
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(bloomParts.bladeGlow);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    camera.layers.mask = prevMask;
    scene.background = prevBg;
    gl.shadowMap.autoUpdate = shadowAuto;
    gl.setClearColor(bloomParts.clearColor, prevAlpha);

    // 2. 降 5 级、升 4 级
    gl.autoClear = false;
    const pass = (mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
      quad.material = mat;
      gl.setRenderTarget(target);
      gl.render(quadScene, orthoCam);
    };
    let src: THREE.WebGLRenderTarget = bloomParts.bladeGlow;
    for (const rt of bloomParts.downTargets) {
      bloomParts.downMat.uniforms.DiffuseSampler.value = src.texture;
      (bloomParts.downMat.uniforms.InSize.value as THREE.Vector2).set(src.width, src.height);
      pass(bloomParts.downMat, rt);
      src = rt;
    }
    for (let i = 3; i >= 0; i--) {
      const lower = i === 3 ? bloomParts.downTargets[4] : bloomParts.upTargets[i + 1];
      bloomParts.upMat.uniforms.DiffuseSampler.value = lower.texture;
      bloomParts.upMat.uniforms.DownTexture.value = bloomParts.downTargets[i].texture;
      (bloomParts.upMat.uniforms.OutSize.value as THREE.Vector2).set(bloomParts.upTargets[i].width, bloomParts.upTargets[i].height);
      pass(bloomParts.upMat, bloomParts.upTargets[i]);
    }

    // 3. 合成到画布：背景是画布现在的画面（拷一份）
    gl.setRenderTarget(prevTarget);
    gl.copyFramebufferToTexture(bloomParts.bgTexture);
    bloomParts.compositeMat.uniforms.DiffuseSampler.value = bloomParts.upTargets[0].texture;
    bloomParts.compositeMat.uniforms.DownTexture.value = bloomParts.bladeGlow.texture;
    bloomParts.compositeMat.uniforms.Background.value = bloomParts.bgTexture;
    (bloomParts.compositeMat.uniforms.OutSize.value as THREE.Vector2).set(width, height);
    pass(bloomParts.compositeMat, prevTarget);
    gl.autoClear = autoClear;
  }, 2);
  return null;
};
