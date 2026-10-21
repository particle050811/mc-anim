// 拔刀剑的泛光：只让刀上亮过阈值的地方（参考图 设定/物品/拔刀剑.png 中间那把刀身中段那片高光）往外溢一圈柔光。不做全场景泛光（用户 10-17 否过），也不是发光剑。
// 挂法：拔刀剑.tsx 的零件网格自己打上 KATANA_BLOOM_LAYER、调 useKatanaBloom()，所有画刀的画布自动生效；同一画布几把刀只有先登记的那个跑。
// 时机：优先级 1.25，画场景的（屏幕AO、夜幕刀光泛光的画场景那一步都是 1，后期 0.5）之后、后期拷到画布（1.5）和夜幕刀光的泛光（2）之前；画布上没有别的正优先级 useFrame 时由这里画场景。
// 做法（在画面数值上算，即色调映射之后：场景的色调映射在各材质里做，多数画布没有线性亮度可用；参考图本身也是画面上的高光溢出）：
//   1. 遮挡：当前目标（画布或后期的离屏图）深度里已是整个场景，刀的网格再画一遍，深度不比场景远的只写 alpha = 看得见的刀，被手、身体、地形挡住的是 0。
//   2. 取亮：画面颜色 × 这个 alpha，过阈值（软膝），降到 1/2…1/64 再按光晕半径给各级权重升回来。3. 滤色（screen）叠回当前目标（刀外的那圈打折），alpha 还原。
// 光晕半径按刀在屏幕上的大小（MC 像素换成屏幕像素）：参考图那圈光是刀身宽的一小截，远处小刀不会糊成发光的棍，近景和参考图比例一致；上下限按画面高。
// 刀全在画外、被藏起来时整套跳过，画面逐像素不变。
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';

// 刀上要泛光的网格多开这一层（主画面只看第 0 层；第 7 层是夜幕刀光的泛光）
export const KATANA_BLOOM_LAYER = 8;

// 泛光只调这里。阈值、软膝是画面数值（0～1，取最亮的通道）：只有接近白的高光溢光，刀身一般的灰不溢
export const KATANA_BLOOM = {
  threshold: 0.82,
  knee: 0.08,
  strength: 10,
  // 高光尖上（最亮通道过 peak[0]）再加溢光，到 1 时 × (1 + peak[1])：参考图那片高光溢得开，刀身一般的亮处（过阈值不多）只带一点
  peak: [0.9, 1.5] as readonly [number, number],
  // 光晕半径：刀上多少 MC 像素。参考图中间那把刀身宽约 0.8 MC，高光往刃文那边溢出约三分之一个刀宽
  radiusMC: 0.25,
  outside: 0.35, // 溢到刀外（背景、挡在前面的手）的 × 这个：参考图刀身上的高光溢得开，刀刃外只有淡淡一圈
  radiusMin: 1 / 600, // 光晕半径的下限、上限：占画面高。远处的刀至少糊开 2 像素左右，特写不至于糊成一片雾
  radiusMax: 0.04,
};

const PRIORITY = 1.25;
const LEVELS = 6;
// 旧项目能用 --props 的「刀泛光」整个关掉或临时改参数；这里不读：渲染设置只经 content/设置.ts 传，调参直接改 KATANA_BLOOM
const params = KATANA_BLOOM;

const fullscreenVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 刀再画一遍：深度往镜头挪一点（常数 + 按斜率），和场景里刀自己的深度比时不自己挡自己（多重采样下场景深度取的是某个采样点，不是像素中心）
const maskVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  gl_Position = projectionMatrix * (modelViewMatrix * vec4(position, 1.0));
  #include <logdepthbuf_vertex>
}`;
const maskFrag = /* glsl */ `
#include <logdepthbuf_pars_fragment>
void main() {
#if defined(USE_LOGARITHMIC_DEPTH_BUFFER)
  float d = vIsPerspective == 0.0 ? gl_FragCoord.z : log2(vFragDepth) * logDepthBufFC * 0.5;
#else
  float d = gl_FragCoord.z;
#endif
  gl_FragDepth = d - 2e-6 - 1.5 * fwidth(d);
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}`;
const alphaFrag = /* glsl */ `
uniform float uA;
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uA); }`;

// 半分辨率：每个输出像素取原图 2×2 的 4 个像素，颜色 × 刀的 alpha、过阈值，再按亮度倒数加权平均（压住单个亮像素，细几何上的高光不闪）
const prefilterFrag = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tMask;
uniform vec2 uSrcSize;
uniform float uThreshold;
uniform float uKnee;
uniform vec2 uPeak;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 pick(vec2 px) {
  vec2 uv = px / uSrcSize;
  vec3 c = min(texture2D(tColor, uv).rgb, vec3(1.0)) * texture2D(tMask, uv).a;
  float b = max(c.r, max(c.g, c.b));
  float soft = clamp(b - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  return c * (max(soft, b - uThreshold) / max(b, 1e-5)) * (1.0 + uPeak.y * smoothstep(uPeak.x, 1.0, b));
}
void main() {
  vec2 base = floor(gl_FragCoord.xy) * 2.0;
  vec3 a = pick(base + vec2(0.5, 0.5));
  vec3 b = pick(base + vec2(1.5, 0.5));
  vec3 c = pick(base + vec2(0.5, 1.5));
  vec3 d = pick(base + vec2(1.5, 1.5));
  float wa = 1.0 / (1.0 + luma(a)), wb = 1.0 / (1.0 + luma(b)), wc = 1.0 / (1.0 + luma(c)), wd = 1.0 / (1.0 + luma(d));
  gl_FragColor = vec4((a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd), 1.0);
}`;
// 再往下降一级：13 点（Jimenez 2014, Next Generation Post Processing in Call of Duty）
const downFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 r = s(vec2(0.0)) * 0.125;
  r += (s(vec2(-2.0, 2.0)) + s(vec2(2.0, 2.0)) + s(vec2(-2.0, -2.0)) + s(vec2(2.0, -2.0))) * 0.03125;
  r += (s(vec2(0.0, 2.0)) + s(vec2(-2.0, 0.0)) + s(vec2(2.0, 0.0)) + s(vec2(0.0, -2.0))) * 0.0625;
  r += (s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0)) + s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0))) * 0.125;
  gl_FragColor = vec4(r, 1.0);
}`;
const tentGlsl = /* glsl */ `
vec3 tent(sampler2D t, vec2 uv, vec2 d) {
  vec3 r = texture2D(t, uv).rgb * 4.0;
  r += (texture2D(t, uv + vec2(d.x, 0.0)).rgb + texture2D(t, uv - vec2(d.x, 0.0)).rgb + texture2D(t, uv + vec2(0.0, d.y)).rgb + texture2D(t, uv - vec2(0.0, d.y)).rgb) * 2.0;
  r += texture2D(t, uv + d).rgb + texture2D(t, uv - d).rgb + texture2D(t, uv + vec2(d.x, -d.y)).rgb + texture2D(t, uv + vec2(-d.x, d.y)).rgb;
  return r / 16.0;
}`;
// 升一级：下一级（更糊的）帐篷滤波放大 × uLowScale，加上本级 × 本级权重
const upFrag = /* glsl */ `
uniform sampler2D tLow;
uniform vec2 uLowTexel;
uniform float uLowScale;
uniform sampler2D tCur;
uniform float uW;
varying vec2 vUv;
${tentGlsl}
void main() { gl_FragColor = vec4(tent(tLow, vUv, uLowTexel) * uLowScale + texture2D(tCur, vUv).rgb * uW, 1.0); }`;
// 合成：加到当前目标上的是 泛光 × (1 − 原画面)，即滤色（screen）；原画面超过 1 的（离屏图里的天）不加不减。
// 看得见的刀以外 × uOutside。alpha 还原（画布按拷下来的原 alpha，离屏图写 1）。极弱的尾巴截掉，离刀远的像素不变
const compositeFrag = /* glsl */ `
uniform sampler2D tBloom;
uniform vec2 uBloomTexel;
uniform float uStrength;
uniform sampler2D tDst;
uniform sampler2D tMask;
uniform float uOutside;
uniform bool uKeepAlpha;
uniform vec2 uSize;
varying vec2 vUv;
${tentGlsl}
void main() {
  vec2 px = (floor(gl_FragCoord.xy) + 0.5) / uSize;
  vec3 b = min(tent(tBloom, vUv, uBloomTexel) * uStrength, vec3(1.0)) * mix(uOutside, 1.0, texture2D(tMask, px).a);
  b *= step(1.0 / 2048.0, max(b.r, max(b.g, b.b)));
  vec4 dst = texture2D(tDst, px);
  gl_FragColor = vec4(b * (1.0 - min(dst.rgb, vec3(1.0))), uKeepAlpha ? dst.a : 1.0);
}`;
const copyFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSize;
void main() { gl_FragColor = texture2D(tSrc, (floor(gl_FragCoord.xy) + 0.5) / uSize); }`;

// 只写 alpha、颜色不动的混合
const alphaOnly = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.ZeroFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.ZeroFactor,
} as const;

const makeTarget = () => {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  return rt;
};

const createResources = () => {
  const pass = (frag: string, uniforms: Record<string, THREE.IUniform>, extra: THREE.ShaderMaterialParameters = {}) =>
    new THREE.ShaderMaterial({ vertexShader: fullscreenVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending, ...extra });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  return {
    quad,
    quadScene,
    orthoCam: new THREE.OrthographicCamera(),
    size: new THREE.Vector2(),
    full: makeTarget(),
    colorCopy: new THREE.FramebufferTexture(1, 1),
    maskCopy: new THREE.FramebufferTexture(1, 1),
    down: Array.from({ length: LEVELS }, makeTarget),
    up: Array.from({ length: LEVELS - 1 }, makeTarget),
    maskMat: new THREE.ShaderMaterial({ vertexShader: maskVert, fragmentShader: maskFrag, side: THREE.DoubleSide, depthTest: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, toneMapped: false, fog: false, ...alphaOnly }),
    alphaMat: pass(alphaFrag, { uA: { value: 0 } }, alphaOnly),
    prefilterMat: pass(prefilterFrag, { tColor: { value: null }, tMask: { value: null }, uSrcSize: { value: new THREE.Vector2() }, uThreshold: { value: 0 }, uKnee: { value: 0 }, uPeak: { value: new THREE.Vector2() } }),
    downMat: pass(downFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }),
    upMat: pass(upFrag, { tLow: { value: null }, uLowTexel: { value: new THREE.Vector2() }, uLowScale: { value: 1 }, tCur: { value: null }, uW: { value: 0 } }),
    copyMat: pass(copyFrag, { tSrc: { value: null }, uSize: { value: new THREE.Vector2() } }),
    compositeMat: pass(
      compositeFrag,
      { tBloom: { value: null }, uBloomTexel: { value: new THREE.Vector2() }, uStrength: { value: 1 }, tDst: { value: null }, tMask: { value: null }, uOutside: { value: 1 }, uKeepAlpha: { value: false }, uSize: { value: new THREE.Vector2() } },
      { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor },
    ),
    meshes: [] as THREE.Mesh[],
    frustum: new THREE.Frustum(),
    m4: new THREE.Matrix4(),
    sphere: new THREE.Sphere(),
  };
};
type Resources = ReturnType<typeof createResources>;

const disposeResources = (r: Resources) => {
  for (const rt of [...r.down, ...r.up, r.full]) rt.dispose();
  for (const t of [r.colorCopy, r.maskCopy]) t.dispose();
  for (const m of [r.maskMat, r.alphaMat, r.prefilterMat, r.downMat, r.upMat, r.copyMat, r.compositeMat]) m.dispose();
  r.quad.geometry.dispose();
};

const resize = (r: Resources, width: number, height: number, canvas: boolean) => {
  if (r.down[0].width !== Math.max(1, width >> 1) || r.down[0].height !== Math.max(1, height >> 1)) {
    r.down.forEach((rt, i) => rt.setSize(Math.max(1, width >> (i + 1)), Math.max(1, height >> (i + 1))));
    r.up.forEach((rt, i) => rt.setSize(r.down[i].width, r.down[i].height));
  }
  if (!canvas && (r.full.width !== width || r.full.height !== height)) r.full.setSize(width, height);
  if (canvas && (r.colorCopy.image.width !== width || r.colorCopy.image.height !== height)) {
    r.colorCopy.dispose();
    r.maskCopy.dispose();
    r.colorCopy = new THREE.FramebufferTexture(width, height);
    r.maskCopy = new THREE.FramebufferTexture(width, height);
  }
};

// 这一帧画面里看得见的刀（打了层、可见、在视锥里），顺带量刀上 1 MC 像素在屏幕上多少像素（取最近的那件）
const visibleKatana = (r: Resources, scene: THREE.Scene, camera: THREE.Camera, height: number) => {
  r.meshes.length = 0;
  const bit = 1 << KATANA_BLOOM_LAYER;
  scene.traverseVisible((obj) => {
    if ((obj.layers.mask & bit) !== 0 && (obj as THREE.Mesh).isMesh) r.meshes.push(obj as THREE.Mesh);
  });
  if (!r.meshes.length) return 0;
  r.frustum.setFromProjectionMatrix(r.m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const persp = (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
  const near = persp ? (camera as THREE.PerspectiveCamera).near : 0;
  let pxPerMC = 0;
  for (const mesh of r.meshes) {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    r.sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
    if (!r.frustum.intersectsSphere(r.sphere)) continue;
    const depth = persp ? Math.max(near, -r.sphere.center.applyMatrix4(camera.matrixWorldInverse).z) : 1;
    pxPerMC = Math.max(pxPerMC, (mesh.matrixWorld.getMaxScaleOnAxis() * camera.projectionMatrix.elements[5] * height) / 2 / depth);
  }
  return pxPerMC;
};

const runBloom = (r: Resources, gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => {
  const target = gl.getRenderTarget();
  if (target) r.size.set(target.width, target.height);
  else gl.getDrawingBufferSize(r.size);
  const width = Math.max(1, Math.floor(r.size.x));
  const height = Math.max(1, Math.floor(r.size.y));
  const pxPerMC = visibleKatana(r, scene, camera, height);
  if (pxPerMC <= 0) return;
  resize(r, width, height, !target);
  const { quad, quadScene, orthoCam } = r;
  const draw = (mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) => {
    quad.material = mat;
    gl.setRenderTarget(to);
    gl.render(quadScene, orthoCam);
  };
  const autoClear = gl.autoClear;
  gl.autoClear = false;

  // 1. 看得见的刀写进 alpha。画布先整张拷下来（颜色和原来的 alpha），画完刀再拷一次取 alpha
  if (!target) gl.copyFramebufferToTexture(r.colorCopy);
  r.alphaMat.uniforms.uA.value = 0;
  draw(r.alphaMat, target);
  const prevLayers = camera.layers.mask;
  const prevBg = scene.background;
  const prevOverride = scene.overrideMaterial;
  const shadowAuto = gl.shadowMap.autoUpdate;
  scene.background = null;
  scene.overrideMaterial = r.maskMat;
  camera.layers.set(KATANA_BLOOM_LAYER);
  gl.shadowMap.autoUpdate = false;
  gl.render(scene, camera);
  camera.layers.mask = prevLayers;
  scene.background = prevBg;
  scene.overrideMaterial = prevOverride;
  gl.shadowMap.autoUpdate = shadowAuto;
  // 离屏图拷一份出来再读（不是多重采样的离屏图，合成时边画边读它会成反馈环）
  if (target) {
    r.copyMat.uniforms.tSrc.value = target.texture;
    (r.copyMat.uniforms.uSize.value as THREE.Vector2).set(width, height);
    draw(r.copyMat, r.full);
  } else gl.copyFramebufferToTexture(r.maskCopy);
  const frame = target ? r.full.texture : r.colorCopy;

  // 2. 取亮、降采样；各级权重：第 k 级（1/2^(k+1)）大致糊开 2^(k+1) 像素，以光晕半径对应的那级为中心取高斯
  const radiusPx = THREE.MathUtils.clamp(params.radiusMC * pxPerMC, params.radiusMin * height, params.radiusMax * height);
  const center = Math.log2(radiusPx) - 1;
  const weights = Array.from({ length: LEVELS }, (_, k) => Math.exp(-0.5 * ((k - center) / 0.8) ** 2));
  const total = weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < LEVELS; k++) weights[k] /= total;
  let levels = LEVELS;
  while (levels > 1 && weights[levels - 1] < 1e-3) levels--;

  const pre = r.prefilterMat.uniforms;
  pre.tColor.value = frame;
  const mask = target ? r.full.texture : r.maskCopy;
  pre.tMask.value = mask;
  (pre.uSrcSize.value as THREE.Vector2).set(width, height);
  pre.uThreshold.value = params.threshold;
  pre.uKnee.value = params.knee;
  (pre.uPeak.value as THREE.Vector2).set(...params.peak);
  draw(r.prefilterMat, r.down[0]);
  for (let k = 1; k < levels; k++) {
    r.downMat.uniforms.tSrc.value = r.down[k - 1].texture;
    (r.downMat.uniforms.uTexel.value as THREE.Vector2).set(1 / r.down[k - 1].width, 1 / r.down[k - 1].height);
    draw(r.downMat, r.down[k]);
  }
  let bloom = r.down[0];
  let scale = weights[0];
  for (let k = levels - 2; k >= 0; k--) {
    const low = k === levels - 2 ? r.down[k + 1] : r.up[k + 1];
    const up = r.upMat.uniforms;
    up.tLow.value = low.texture;
    (up.uLowTexel.value as THREE.Vector2).set(1 / low.width, 1 / low.height);
    up.uLowScale.value = k === levels - 2 ? weights[k + 1] : 1;
    up.tCur.value = r.down[k].texture;
    up.uW.value = weights[k];
    draw(r.upMat, r.up[k]);
    bloom = r.up[k];
    scale = 1;
  }

  // 3. 合成回当前目标
  const comp = r.compositeMat.uniforms;
  comp.tBloom.value = bloom.texture;
  (comp.uBloomTexel.value as THREE.Vector2).set(1 / bloom.width, 1 / bloom.height);
  comp.uStrength.value = params.strength * scale;
  comp.tDst.value = frame;
  comp.tMask.value = mask;
  comp.uOutside.value = params.outside;
  comp.uKeepAlpha.value = !target;
  (comp.uSize.value as THREE.Vector2).set(width, height);
  draw(r.compositeMat, target);
  gl.autoClear = autoClear;
};

// 每个画布一份：登记了的刀（第一个是跑的那个）、这一帧开始时的渲染次数、资源
type PerCanvas = { ids: symbol[]; frameAtStart: number; res: Resources | null };
const canvases = new WeakMap<THREE.WebGLRenderer, PerCanvas>();
const canvasOf = (gl: THREE.WebGLRenderer) => {
  let c = canvases.get(gl);
  if (!c) canvases.set(gl, (c = { ids: [], frameAtStart: -1, res: null }));
  return c;
};

// 刀的组件里调：给这个画布挂上刀的泛光（同一画布挂几次都只跑一遍）
export const useKatanaBloom = () => {
  const gl = useThree((s) => s.gl);
  const id = useMemo(() => Symbol('刀泛光'), []);
  // 和 useFrame 的订阅同在布局阶段登记，第一帧就有人跑（有了正优先级的订阅 R3F 就不自己画场景了）
  useLayoutEffect(() => {
    const c = canvasOf(gl);
    c.ids.push(id);
    return () => {
      c.ids.splice(c.ids.indexOf(id), 1);
    };
  }, [gl, id]);
  useEffect(
    () => () => {
      const c = canvases.get(gl);
      if (c && !c.ids.length && c.res) {
        disposeResources(c.res);
        c.res = null;
      }
    },
    [gl],
  );
  useFrame(({ gl: renderer }) => {
    const c = canvasOf(renderer);
    if (c.ids[0] === id) c.frameAtStart = renderer.info.render.frame;
  }, -1000);
  useFrame((state) => {
    const { gl: renderer, scene, camera } = state;
    const c = canvasOf(renderer);
    if (c.ids[0] !== id) return;
    // 别的正优先级订阅（屏幕AO、后期、夜幕刀光泛光）都在 1.25 之前画好了场景；一个都没有时这里照 R3F 的默认画
    const othersDraw = state.internal.subscribers.some((s) => s.priority > 0 && s.priority !== PRIORITY);
    if (!othersDraw) renderer.render(scene, camera);
    // 该画场景的这一帧没画（屏幕AO 等体素区段建好再画），这一遍不叠
    else if (renderer.info.render.frame === c.frameAtStart) return;
    c.res ??= createResources();
    runBloom(c.res, renderer, scene, camera);
  }, PRIORITY);
};
