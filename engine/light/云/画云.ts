// 云组件在三渲二光影层里的那一遍（engine/三渲二/光影/光影渲染.tsx 第 4 步调）：按配置拼的着色器（./着色器.ts）分横条画进离屏图，再按深度加权合成到 目标。
// 每帧四步：
// 1. 准备（这一遍的分辨率上）：对数深度、这个像素要不要算、这一帧要不要重算（复用上一帧的）。
//    要不要算：只有主画面没盖满（不透明度 < 1）的像素透出天和云（着色.ts 的 合成片元：画面 × a + 天和云 × (1 − a)），连合成要取到的一圈邻居、
//    太阳本体那一块（合成时按它上面云的不透明度压暗太阳）一起算；别的像素的云最后乘 0，不算。字节不变。
//    复用：配置、镜头、太阳、尺寸都没变（键相同），这个像素的深度也和上一帧一样、上一帧算过它，就留着上一帧的（离屏图不清）；不然重算。字节不变，
//    乱序、单帧出图时键对不上就整张现算（光影层「只看这一帧」的约定照守：结果只由这一帧的输入定）。
// 2. 步进：要重算的像素才算，别的 discard（离屏图里留着上一帧的）。全分辨率时同 engine/light/大气/云.ts 的 drawPhotonClouds；
//    半分辨率（质量.分辨率 0.5，用户 11-04 定 B1）时一个低分辨率像素取全分辨率 (2x, 2y) 那一点的深度和视线。
// 3. 合成：全分辨率同 大气/云.ts 的 COMPOSITE_FS（4×4 按深度加权平均，把 Bayer 的 16 档平均掉）；半分辨率时按 4×4 个低分辨率像素放大（帐篷权 × 深度权）。
//    大气/云.ts 合成后还按云的前沿写深度，光影层用不着（合成只取颜色），不写。
import * as THREE from 'three';
import { atmoLightAt, atmoUniforms, atmosphere } from '../大气.ts';
import { cloudSpaceMult } from './配置.ts';
import { cloudFragment } from './着色器.ts';
import { expandCloud, layerValues, dayFactor, type ExpandedConfig } from './展开.ts';
import { cumulusHeightMap } from './高度图.ts';
import { blueNoise, blueNoiseEdge } from './蓝噪声.ts';
import type { CloudScene, CloudConfig } from './配置.ts';

export type CloudInput = {
  gl: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  /** 主画面的对数深度（全分辨率，log2(1 + 视深) / log2(远 + 1)，天 = 1） */
  depthTexture: THREE.Texture;
  /** 主画面（取不透明度） */
  mainPicture: THREE.Texture;
  width: number;
  height: number;
  /** 云合成到这里（全分辨率，画面值、预乘） */
  target: THREE.WebGLRenderTarget;
  config: CloudConfig;
  scene: CloudScene;
  seaLevel: number;
  sec: number;
  /** 太阳本体在画布上的方块（像素，左下角 x、y，宽，高）；没有给 null */
  sunBox: readonly [number, number, number, number] | null;
  /** 离屏图和复用状态各用各的（水面反射的云另画一张小图，和主画面那张不来回挤掉） */
  槽?: string;
};

// 去云默认镜头 20 米内删掉、再 30 米渐变回来（同 大气/云.ts 的 defaultNear）
const aroundCamera = [20, 30] as const;
// 一次画多少行：整屏一次画完的话单次绘制太长，浏览器的 GPU 看门狗会把上下文杀掉（同 大气/云.ts）
const stripCount = 8;

const fullscreenVertex = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
const stripVertex = /* glsl */ `
uniform vec2 uStrip;
void main() { gl_Position = vec4(position.x, mix(uStrip.x, uStrip.y, position.y * 0.5 + 0.5), 0.0, 1.0); }`;

// 准备：r = 对数深度，g = 这一帧过后离屏图里这个像素对不对，b = 这一帧要不要重算
const prepFragment = (halfRes: boolean) => /* glsl */ `
precision highp float;
uniform sampler2D tDepth;
uniform sampler2D tMain;
uniform sampler2D tPrev;
uniform float uSame;
uniform vec4 uSun;
out highp vec4 oPrep;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 hi = textureSize(tDepth, 0) - 1;
  ivec2 at = ${halfRes ? 'c * 2' : 'c'};
  float d = texelFetch(tDepth, at, 0).r;
  // 合成要取到的那一圈：全分辨率时第 q 个像素取 q − 2 … q + 1，反过来这一点被 c − 1 … c + 2 取到；半分辨率时被全分辨率的 2c − 3 … 2c + 4 取到
  ${halfRes ? 'ivec2 lo = at - 3, up = at + 4;' : 'ivec2 lo = at - 1, up = at + 2;'}
  bool need = false;
  for (int y = lo.y; y <= up.y && !need; y++)
    for (int x = lo.x; x <= up.x; x++)
      if (texelFetch(tMain, clamp(ivec2(x, y), ivec2(0), hi), 0).a < 1.0) { need = true; break; }
  vec2 p = vec2(at);
  if (uSun.z > 0.0 && all(greaterThanEqual(p, uSun.xy - 8.0)) && all(lessThanEqual(p, uSun.xy + uSun.zw + 8.0))) need = true;
  vec4 prev = texelFetch(tPrev, c, 0);
  bool keep = uSame > 0.5 && prev.g > 0.5 && prev.r == d;
  bool redo = need && !keep;
  oPrep = vec4(d, redo || keep ? 1.0 : 0.0, redo ? 1.0 : 0.0, 1.0);
}`;

// 合成（全分辨率）：同 大气/云.ts 的 COMPOSITE_FS 的颜色那一半
const compositeFragment = /* glsl */ `
precision highp float;
uniform sampler2D tCloud;
uniform sampler2D tDepth;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 hi = textureSize(tDepth, 0) - 1;
  float dc = texelFetch(tDepth, c, 0).r;
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int y = -2; y < 2; y++)
    for (int x = -2; x < 2; x++) {
      ivec2 q = clamp(c + ivec2(x, y), ivec2(0), hi);
      float w = exp(-200.0 * abs(texelFetch(tDepth, q, 0).r - dc));
      vec4 col = texelFetch(tCloud, q, 0);
      sum += w * col;
      wsum += w;
    }
  gl_FragColor = sum / wsum;
}`;

// 放大（半分辨率）：全分辨率像素 q 在低分辨率上的位置 u = (q + 0.5) / 2 − 0.5，取 floor(u) − 1 起 4×4 个，帐篷权 max(0, 2 − |u − p|) × 深度权
const upscaleFragment = /* glsl */ `
precision highp float;
uniform sampler2D tCloud;
uniform sampler2D tPrep;
uniform sampler2D tDepth;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 hi = textureSize(tCloud, 0) - 1;
  float dc = texelFetch(tDepth, c, 0).r;
  vec2 u = (vec2(c) + 0.5) * 0.5 - 0.5;
  ivec2 b = ivec2(floor(u)) - 1;
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int y = 0; y < 4; y++)
    for (int x = 0; x < 4; x++) {
      ivec2 q = b + ivec2(x, y);
      vec2 t = max(vec2(0.0), 2.0 - abs(u - vec2(q)));
      ivec2 k = clamp(q, ivec2(0), hi);
      float w = t.x * t.y * (exp(-200.0 * abs(texelFetch(tPrep, k, 0).r - dc)) + 1e-6);
      sum += w * texelFetch(tCloud, k, 0);
      wsum += w;
    }
  gl_FragColor = sum / max(wsum, 1e-12);
}`;

const newPass = (material: THREE.Material) => {
  const quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quadMesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quadMesh);
  return scene;
};

type Resource = {
  width: number;
  height: number;
  halfRes: boolean;
  cloudTarget: THREE.WebGLRenderTarget;
  spareTargets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  轮: number;
  key: string;
};

const camera = new THREE.OrthographicCamera();
const programs = new Map<string, { material: THREE.ShaderMaterial; scene: THREE.Scene }>();
const prepared = new Map<boolean, { material: THREE.ShaderMaterial; scene: THREE.Scene }>();
let compositePass: { material: THREE.ShaderMaterial; scene: THREE.Scene } | null = null;
let upscalePass: { material: THREE.ShaderMaterial; scene: THREE.Scene } | null = null;
const resources = new Map<string, Resource>();

const getPrepared = (halfRes: boolean) => {
  let p = prepared.get(halfRes);
  if (!p) {
    const material = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null }, tMain: { value: null }, tPrev: { value: null }, uSame: { value: 0 }, uSun: { value: new THREE.Vector4() } },
      vertexShader: fullscreenVertex,
      fragmentShader: prepFragment(halfRes),
      glslVersion: THREE.GLSL3,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    p = { material, scene: newPass(material) };
    prepared.set(halfRes, p);
  }
  return p;
};

const getComposite = () => {
  if (compositePass) return compositePass;
  // 叠法同 大气/云.ts（预乘叠在清空的离屏图上：原样写进去）
  const material = new THREE.ShaderMaterial({
    uniforms: { tCloud: { value: null }, tDepth: { value: null } },
    vertexShader: fullscreenVertex,
    fragmentShader: compositeFragment,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  return (compositePass = { material, scene: newPass(material) });
};
const getUpscale = () => {
  if (upscalePass) return upscalePass;
  const material = new THREE.ShaderMaterial({
    uniforms: { tCloud: { value: null }, tPrep: { value: null }, tDepth: { value: null } },
    vertexShader: fullscreenVertex,
    fragmentShader: upscaleFragment,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  return (upscalePass = { material, scene: newPass(material) });
};

const getProgram = (e: ExpandedConfig) => {
  const halfRes = e.quality.resolution === 0.5;
  const shaderSource = cloudFragment(e.layers, cloudSpaceMult, e.quality.dither, halfRes);
  let p = programs.get(shaderSource);
  if (!p) {
    const layerUniforms: Record<string, THREE.IUniform> = {};
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...atmoUniforms,
        pcNoise: { value: null },
        pcCuHeight: { value: null },
        pcCuHeightS: { value: null },
        pcWorleyB: { value: null },
        pcWorleyS: { value: null },
        pcCamXZ: { value: new THREE.Vector2() },
        pcCamR: { value: 6371e3 },
        pcDay: { value: 0 },
        pcAdd: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
        pcAddN: { value: 0 },
        pcNear: { value: new THREE.Vector2(1, 1) },
        pcClear: { value: new THREE.Vector4() },
        pcGlow: { value: new THREE.Vector4() },
        pcGlowCol: { value: new THREE.Color() },
        uStrip: { value: new THREE.Vector2(-1, 1) },
        tPrep: { value: null },
        tBlue: { value: null },
        atmoSky: { value: null },
        uSize: { value: new THREE.Vector2() },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uLogFar: { value: 1 },
        uExposure: { value: 1 },
        ...layerUniforms,
      },
      vertexShader: stripVertex,
      fragmentShader: shaderSource,
      glslVersion: THREE.GLSL3,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    p = { material, scene: newPass(material) };
    programs.set(shaderSource, p);
  }
  return p;
};

const setValue = (u: Record<string, THREE.IUniform>, uniformName: string, v: number | readonly number[]) => {
  if (typeof v === 'number') {
    if (u[uniformName]) u[uniformName].value = v;
    else u[uniformName] = { value: v };
    return;
  }
  const vector = v.length === 2 ? new THREE.Vector2() : v.length === 3 ? new THREE.Vector3() : new THREE.Vector4();
  if (!u[uniformName]) u[uniformName] = { value: vector };
  (u[uniformName].value as THREE.Vector2 | THREE.Vector3 | THREE.Vector4).fromArray(v as number[]);
};

const newOffscreen = (w: number, h: number) =>
  new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });

const placeResources = (width: number, height: number, halfRes: boolean, slotName: string) => {
  const w = halfRes ? Math.ceil(width / 2) : width, h = halfRes ? Math.ceil(height / 2) : height;
  const resource = resources.get(slotName);
  if (resource && resource.width === width && resource.height === height && resource.halfRes === halfRes) return resource;
  if (resource) {
    resource.cloudTarget.dispose();
    resource.spareTargets[0].dispose();
    resource.spareTargets[1].dispose();
  }
  const freshResource: Resource = { width: width, height: height, halfRes, cloudTarget: newOffscreen(w, h), spareTargets: [newOffscreen(w, h), newOffscreen(w, h)], 轮: 0, key: '' };
  resources.set(slotName, freshResource);
  return freshResource;
};

const cameraPos = new THREE.Vector3();
// 积云最低那层朝太阳的光学厚度先烘成表（用户 11-14 看过 日落划船 对照定采用，划船 4K 热帧快 13%～16%）：
// 镜头周围 48 公里见方 128×128、层厚分 32 片，取的时候横向双线性、纵向线性插值，代替每个采样点各自抖动走光步。
// 表外（云最远到 75 公里）取边上那格。输入一变（键同云复用的键）就重烘；烘的片元程序是云片元的前半截（各层函数）接一个 main。
const bakeCache = new WeakMap<THREE.ShaderMaterial, { rt: THREE.WebGLRenderTarget; scene: THREE.Scene; key: string }>();
const bakeSun = (gl: THREE.WebGLRenderer, material: THREE.ShaderMaterial, cacheKey: string) => {
  let bake = bakeCache.get(material);
  if (!bake) {
    const rt = new THREE.WebGLRenderTarget(128, 4096, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const shaderSource = material.fragmentShader.split('uniform sampler2D tPrep;')[0] + `layout(location=0) out vec4 skyOD;
    void main(){ vec2 coord=vec2(gl_FragCoord.x,mod(gl_FragCoord.y,128.0))/128.0; float slice=floor(gl_FragCoord.y/128.0);vec2 xz=(coord-0.5)*48000.0;
    vec3 pos=vec3(xz.x,PC_CU0_R+(slice+0.5)/32.0*(PC_CU0_BH+PC_CU0_T),xz.y); skyOD=vec4(pcCu0OD(pos,atmoSun,0.5,PC_CU0_LIGHT)); }`;
    const bakeMat = new THREE.ShaderMaterial({ uniforms: material.uniforms, vertexShader: fullscreenVertex, fragmentShader: shaderSource, glslVersion: THREE.GLSL3, blending: THREE.NoBlending, depthTest: false, depthWrite: false });
    bake = { rt, scene: newPass(bakeMat), key: '' };
    bakeCache.set(material, bake);
  }
  if (bake.key !== cacheKey) {
    const old = gl.getRenderTarget();
    gl.setRenderTarget(bake.rt);
    gl.render(bake.scene, camera);
    gl.setRenderTarget(old);
    bake.key = cacheKey;
  }
  material.uniforms.tSunBake = { value: bake.rt.texture };
};

let blueNoiseTexture: THREE.DataTexture | null = null;
const getBlueNoiseTexture = () => {
  if (blueNoiseTexture) return blueNoiseTexture;
  const t = new THREE.DataTexture(blueNoise(), blueNoiseEdge, blueNoiseEdge, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return (blueNoiseTexture = t);
};

/** 光影层第 4 步：画这一帧的云。配置里没有光影层的云（都关了、只有原版方块）就不画，返回 false */
export const shouldDrawClouds = (x: CloudInput): boolean => {
  const tex = atmosphere.clouds;
  if (!tex || !atmosphere.sky || x.config.开 === false) return false;
  const e = expandCloud(x.config, x.seaLevel);
  if (!e.layers.length) return false;
  const { gl, camera: cam } = x;
  const halfRes = e.quality.resolution === 0.5;
  const r = placeResources(x.width, x.height, halfRes, x.槽 ?? '主');
  const w = r.cloudTarget.width, h = r.cloudTarget.height;
  const p = getProgram(e);
  const u = p.material.uniforms;

  // uniform（同 大气/云.ts 的 updateCloudUniforms）
  const S = cloudSpaceMult;
  const hm = cumulusHeightMap(tex.noise.image.data as Uint8Array);
  u.pcNoise!.value = tex.noise;
  u.pcCuHeight!.value = hm.nearest;
  u.pcCuHeightS!.value = hm.smooth;
  u.pcWorleyB!.value = tex.worleyBubbly;
  u.pcWorleyS!.value = tex.worleySwirley;
  cameraPos.setFromMatrixPosition(cam.matrixWorld);
  (u.pcCamXZ!.value as THREE.Vector2).set(S * cameraPos.x, S * cameraPos.z);
  u.pcCamR!.value = 6371e3 + S * (cameraPos.y - e.seaLevel);
  const sunY = atmosphere.sun[2]!;
  u.pcDay!.value = dayFactor(sunY);
  for (const [uniformName, v] of Object.entries(layerValues(e, sunY, x.sec, (hh) => atmoLightAt(hh)))) setValue(u, uniformName, v);
  (u.pcNear!.value as THREE.Vector2).set(S * aroundCamera[0], S * aroundCamera[1]);
  const c = x.scene.hole;
  (u.pcClear!.value as THREE.Vector4).set(c ? S * c[0] : 0, c ? -S * c[1] : 0, c ? S * c[2] : 0, c ? S * c[3] : 0);
  const g = x.scene.brightness;
  (u.pcGlow!.value as THREE.Vector4).set(g ? S * g.心[0] : 0, g ? -S * g.心[1] : 0, g ? S * g.radius : 1, g ? g.strength : 0);
  if (g) (u.pcGlowCol!.value as THREE.Color).setStyle(g.色, THREE.LinearSRGBColorSpace);
  u.pcAddN!.value = 0;
  u.atmoSky!.value = atmosphere.sky;
  if (e.quality.dither === '蓝噪声') u.tBlue!.value = getBlueNoiseTexture();
  (u.uSize!.value as THREE.Vector2).set(x.width, x.height);
  (u.uInvProj!.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
  (u.uCamWorld!.value as THREE.Matrix4).copy(cam.matrixWorld);
  u.uLogFar!.value = Math.log2(cam.far + 1);
  u.uExposure!.value = e.exposure * (x.scene.exposureMult ?? 1);

  // 复用的键：着色器、所有 uniform 的值、天色图、尺寸（镜头矩阵在 uniform 里）。横条位置、准备图是这一遍自己摆的，不算输入（算进去就每帧都对不上）
  const values: unknown[] = [p.material.fragmentShader.length, atmosphere.skyKey, w, h, x.sunBox];
  for (const [k, v] of Object.entries(u)) {
    if (k === 'uStrip' || k === 'tPrep' || k === 'tSunBake') continue;
    const val = v.value as unknown;
    if (val && typeof val === 'object' && 'isTexture' in val) values.push(k, (val as THREE.Texture).uuid);
    else if (val && typeof val === 'object' && 'toArray' in val) values.push(k, (val as { toArray(): number[] }).toArray());
    else if (Array.isArray(val)) values.push(k, val.map((a) => (a && typeof a === 'object' && 'toArray' in a ? (a as { toArray(): number[] }).toArray() : a)));
    else if (val && typeof val === 'object') values.push(k, Object.values(val as object));
    else values.push(k, val);
  }
  const cacheKey = JSON.stringify(values) + sourceKey(p);
  const reusable = e.quality.reuse && cacheKey === r.key;
  if (e.layers[0]?.algorithm === 'Photon积云') bakeSun(gl, p.material, cacheKey);

  const autoClear = gl.autoClear;
  gl.autoClear = false;
  // 1. 准备
  const prev = r.spareTargets[r.轮]!, nowTarget = r.spareTargets[1 - r.轮]!;
  r.轮 = 1 - r.轮;
  const pr = getPrepared(halfRes);
  const pu = pr.material.uniforms;
  pu.tDepth!.value = x.depthTexture;
  pu.tMain!.value = x.mainPicture;
  pu.tPrev!.value = prev.texture;
  pu.uSame!.value = reusable ? 1 : 0;
  const sb = x.sunBox;
  (pu.uSun!.value as THREE.Vector4).set(sb ? sb[0] : 0, sb ? sb[1] : 0, sb ? sb[2] : 0, sb ? sb[3] : 0);
  gl.setRenderTarget(nowTarget);
  gl.render(pr.scene, camera);
  r.key = cacheKey;

  // 2. 步进
  u.tPrep!.value = nowTarget.texture;
  gl.setRenderTarget(r.cloudTarget);
  const glc = gl.getContext();
  for (let i = 0; i < stripCount; i++) {
    (u.uStrip!.value as THREE.Vector2).set(-1 + (2 * i) / stripCount, -1 + (2 * (i + 1)) / stripCount);
    gl.render(p.scene, camera);
    glc.flush();
  }

  // 3. 合成到目标
  gl.setRenderTarget(x.target);
  if (halfRes) {
    const m = getUpscale();
    m.material.uniforms.tCloud!.value = r.cloudTarget.texture;
    m.material.uniforms.tPrep!.value = nowTarget.texture;
    m.material.uniforms.tDepth!.value = x.depthTexture;
    gl.render(m.scene, camera);
  } else {
    const m = getComposite();
    m.material.uniforms.tCloud!.value = r.cloudTarget.texture;
    m.material.uniforms.tDepth!.value = x.depthTexture;
    gl.render(m.scene, camera);
  }
  gl.autoClear = autoClear;
  return true;
};

const sourceKey = (p: { material: THREE.ShaderMaterial }) => String(programId.get(p.material) ?? programId.set(p.material, programId.size).get(p.material));
const programId = new Map<THREE.ShaderMaterial, number>();

/** 让着色器先编起来（画布挂上时调，和取素材同时进行；用户 11-04 定 A4） */
export const precompileClouds = (gl: THREE.WebGLRenderer, config: CloudConfig, seaLevel: number) => {
  if (config.开 === false) return Promise.resolve();
  const e = expandCloud(config, seaLevel);
  if (!e.layers.length) return Promise.resolve();
  const scenes = [getProgram(e).scene, getPrepared(e.quality.resolution === 0.5).scene, e.quality.resolution === 0.5 ? getUpscale().scene : getComposite().scene];
  return Promise.all(scenes.map((s) => gl.compileAsync(s, camera))).then(() => undefined);
};
