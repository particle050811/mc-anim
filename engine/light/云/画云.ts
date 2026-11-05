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
import { 云空间倍 } from './配置.ts';
import { 云片元 } from './着色器.ts';
import { 展开, 层值, 白天系数, type 展开配置 } from './展开.ts';
import { 积云高度图 } from './高度图.ts';
import { 蓝噪声, 蓝噪声边 } from './蓝噪声.ts';
import type { 云场, 云配置 } from './配置.ts';

export type 画云输入 = {
  gl: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  /** 主画面的对数深度（全分辨率，log2(1 + 视深) / log2(远 + 1)，天 = 1） */
  深度: THREE.Texture;
  /** 主画面（取不透明度） */
  主画面: THREE.Texture;
  宽: number;
  高: number;
  /** 云合成到这里（全分辨率，画面值、预乘） */
  目标: THREE.WebGLRenderTarget;
  配置: 云配置;
  场: 云场;
  海平面: number;
  秒: number;
  /** 太阳本体在画布上的方块（像素，左下角 x、y，宽，高）；没有给 null */
  太阳框: readonly [number, number, number, number] | null;
  /** 离屏图和复用状态各用各的（水面反射的云另画一张小图，和主画面那张不来回挤掉） */
  槽?: string;
};

// 去云默认镜头 20 米内删掉、再 30 米渐变回来（同 大气/云.ts 的 defaultNear）
const 镜头周围 = [20, 30] as const;
// 一次画多少行：整屏一次画完的话单次绘制太长，浏览器的 GPU 看门狗会把上下文杀掉（同 大气/云.ts）
const 横条数 = 8;

const 全屏顶点 = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
const 横条顶点 = /* glsl */ `
uniform vec2 uStrip;
void main() { gl_Position = vec4(position.x, mix(uStrip.x, uStrip.y, position.y * 0.5 + 0.5), 0.0, 1.0); }`;

// 准备：r = 对数深度，g = 这一帧过后离屏图里这个像素对不对，b = 这一帧要不要重算
const 准备片元 = (半: boolean) => /* glsl */ `
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
  ivec2 at = ${半 ? 'c * 2' : 'c'};
  float d = texelFetch(tDepth, at, 0).r;
  // 合成要取到的那一圈：全分辨率时第 q 个像素取 q − 2 … q + 1，反过来这一点被 c − 1 … c + 2 取到；半分辨率时被全分辨率的 2c − 3 … 2c + 4 取到
  ${半 ? 'ivec2 lo = at - 3, up = at + 4;' : 'ivec2 lo = at - 1, up = at + 2;'}
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
const 合成片元 = /* glsl */ `
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
const 放大片元 = /* glsl */ `
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

const 新片 = (材质: THREE.Material) => {
  const 片 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), 材质);
  片.frustumCulled = false;
  const 场 = new THREE.Scene();
  场.add(片);
  return 场;
};

type 资源 = {
  宽: number;
  高: number;
  半: boolean;
  云: THREE.WebGLRenderTarget;
  准备: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  轮: number;
  键: string;
};

const 机 = new THREE.OrthographicCamera();
const 程序们 = new Map<string, { 材质: THREE.ShaderMaterial; 场: THREE.Scene }>();
const 准备们 = new Map<boolean, { 材质: THREE.ShaderMaterial; 场: THREE.Scene }>();
let 合成: { 材质: THREE.ShaderMaterial; 场: THREE.Scene } | null = null;
let 放大: { 材质: THREE.ShaderMaterial; 场: THREE.Scene } | null = null;
const 资们 = new Map<string, 资源>();

const 取准备 = (半: boolean) => {
  let p = 准备们.get(半);
  if (!p) {
    const 材质 = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null }, tMain: { value: null }, tPrev: { value: null }, uSame: { value: 0 }, uSun: { value: new THREE.Vector4() } },
      vertexShader: 全屏顶点,
      fragmentShader: 准备片元(半),
      glslVersion: THREE.GLSL3,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    p = { 材质, 场: 新片(材质) };
    准备们.set(半, p);
  }
  return p;
};

const 取合成 = () => {
  if (合成) return 合成;
  // 叠法同 大气/云.ts（预乘叠在清空的离屏图上：原样写进去）
  const 材质 = new THREE.ShaderMaterial({
    uniforms: { tCloud: { value: null }, tDepth: { value: null } },
    vertexShader: 全屏顶点,
    fragmentShader: 合成片元,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  return (合成 = { 材质, 场: 新片(材质) });
};
const 取放大 = () => {
  if (放大) return 放大;
  const 材质 = new THREE.ShaderMaterial({
    uniforms: { tCloud: { value: null }, tPrep: { value: null }, tDepth: { value: null } },
    vertexShader: 全屏顶点,
    fragmentShader: 放大片元,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  return (放大 = { 材质, 场: 新片(材质) });
};

const 取程序 = (e: 展开配置) => {
  const 半 = e.质量.分辨率 === 0.5;
  const 源 = 云片元(e.层们, 云空间倍, e.质量.抖动, 半);
  let p = 程序们.get(源);
  if (!p) {
    const 层uni: Record<string, THREE.IUniform> = {};
    const 材质 = new THREE.ShaderMaterial({
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
        ...层uni,
      },
      vertexShader: 横条顶点,
      fragmentShader: 源,
      glslVersion: THREE.GLSL3,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    p = { 材质, 场: 新片(材质) };
    程序们.set(源, p);
  }
  return p;
};

const 设值 = (u: Record<string, THREE.IUniform>, 名: string, v: number | readonly number[]) => {
  if (typeof v === 'number') {
    if (u[名]) u[名].value = v;
    else u[名] = { value: v };
    return;
  }
  const 新 = v.length === 2 ? new THREE.Vector2() : v.length === 3 ? new THREE.Vector3() : new THREE.Vector4();
  if (!u[名]) u[名] = { value: 新 };
  (u[名].value as THREE.Vector2 | THREE.Vector3 | THREE.Vector4).fromArray(v as number[]);
};

const 新离屏 = (w: number, h: number) =>
  new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });

const 摆资源 = (宽: number, 高: number, 半: boolean, 槽: string) => {
  const w = 半 ? Math.ceil(宽 / 2) : 宽, h = 半 ? Math.ceil(高 / 2) : 高;
  const 资 = 资们.get(槽);
  if (资 && 资.宽 === 宽 && 资.高 === 高 && 资.半 === 半) return 资;
  if (资) {
    资.云.dispose();
    资.准备[0].dispose();
    资.准备[1].dispose();
  }
  const 新: 资源 = { 宽, 高, 半, 云: 新离屏(w, h), 准备: [新离屏(w, h), 新离屏(w, h)], 轮: 0, 键: '' };
  资们.set(槽, 新);
  return 新;
};

const 镜头位 = new THREE.Vector3();

let 蓝噪声纹理: THREE.DataTexture | null = null;
const 取蓝噪声纹理 = () => {
  if (蓝噪声纹理) return 蓝噪声纹理;
  const t = new THREE.DataTexture(蓝噪声(), 蓝噪声边, 蓝噪声边, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return (蓝噪声纹理 = t);
};

/** 光影层第 4 步：画这一帧的云。配置里没有光影层的云（都关了、只有原版方块）就不画，返回 false */
export const 画云 = (x: 画云输入): boolean => {
  const tex = atmosphere.clouds;
  if (!tex || !atmosphere.sky || x.配置.开 === false) return false;
  const e = 展开(x.配置, x.海平面);
  if (!e.层们.length) return false;
  const { gl, camera: cam } = x;
  const 半 = e.质量.分辨率 === 0.5;
  const r = 摆资源(x.宽, x.高, 半, x.槽 ?? '主');
  const w = r.云.width, h = r.云.height;
  const p = 取程序(e);
  const u = p.材质.uniforms;

  // uniform（同 大气/云.ts 的 updateCloudUniforms）
  const S = 云空间倍;
  const hm = 积云高度图(tex.noise.image.data as Uint8Array);
  u.pcNoise!.value = tex.noise;
  u.pcCuHeight!.value = hm.nearest;
  u.pcCuHeightS!.value = hm.smooth;
  u.pcWorleyB!.value = tex.worleyBubbly;
  u.pcWorleyS!.value = tex.worleySwirley;
  镜头位.setFromMatrixPosition(cam.matrixWorld);
  (u.pcCamXZ!.value as THREE.Vector2).set(S * 镜头位.x, S * 镜头位.z);
  u.pcCamR!.value = 6371e3 + S * (镜头位.y - e.海平面);
  const sunY = atmosphere.sun[2]!;
  u.pcDay!.value = 白天系数(sunY);
  for (const [名, v] of Object.entries(层值(e, sunY, x.秒, (hh) => atmoLightAt(hh)))) 设值(u, 名, v);
  (u.pcNear!.value as THREE.Vector2).set(S * 镜头周围[0], S * 镜头周围[1]);
  const c = x.场.洞;
  (u.pcClear!.value as THREE.Vector4).set(c ? S * c[0] : 0, c ? -S * c[1] : 0, c ? S * c[2] : 0, c ? S * c[3] : 0);
  const g = x.场.亮;
  (u.pcGlow!.value as THREE.Vector4).set(g ? S * g.心[0] : 0, g ? -S * g.心[1] : 0, g ? S * g.半径 : 1, g ? g.强 : 0);
  if (g) (u.pcGlowCol!.value as THREE.Color).setStyle(g.色, THREE.LinearSRGBColorSpace);
  u.pcAddN!.value = 0;
  u.atmoSky!.value = atmosphere.sky;
  if (e.质量.抖动 === '蓝噪声') u.tBlue!.value = 取蓝噪声纹理();
  (u.uSize!.value as THREE.Vector2).set(x.宽, x.高);
  (u.uInvProj!.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
  (u.uCamWorld!.value as THREE.Matrix4).copy(cam.matrixWorld);
  u.uLogFar!.value = Math.log2(cam.far + 1);
  u.uExposure!.value = e.曝光 * (x.场.曝光倍 ?? 1);

  // 复用的键：着色器、所有 uniform 的值、天色图、尺寸（镜头矩阵在 uniform 里）。横条位置、准备图是这一遍自己摆的，不算输入（算进去就每帧都对不上）
  const 值们: unknown[] = [p.材质.fragmentShader.length, atmosphere.skyKey, w, h, x.太阳框];
  for (const [k, v] of Object.entries(u)) {
    if (k === 'uStrip' || k === 'tPrep') continue;
    const val = v.value as unknown;
    if (val && typeof val === 'object' && 'isTexture' in val) 值们.push(k, (val as THREE.Texture).uuid);
    else if (val && typeof val === 'object' && 'toArray' in val) 值们.push(k, (val as { toArray(): number[] }).toArray());
    else if (Array.isArray(val)) 值们.push(k, val.map((a) => (a && typeof a === 'object' && 'toArray' in a ? (a as { toArray(): number[] }).toArray() : a)));
    else if (val && typeof val === 'object') 值们.push(k, Object.values(val as object));
    else 值们.push(k, val);
  }
  const 键 = JSON.stringify(值们) + 源键(p);
  const 同 = e.质量.复用 && 键 === r.键;

  const 自动清 = gl.autoClear;
  gl.autoClear = false;
  // 1. 准备
  const 前 = r.准备[r.轮]!, 今 = r.准备[1 - r.轮]!;
  r.轮 = 1 - r.轮;
  const pr = 取准备(半);
  const pu = pr.材质.uniforms;
  pu.tDepth!.value = x.深度;
  pu.tMain!.value = x.主画面;
  pu.tPrev!.value = 前.texture;
  pu.uSame!.value = 同 ? 1 : 0;
  const sb = x.太阳框;
  (pu.uSun!.value as THREE.Vector4).set(sb ? sb[0] : 0, sb ? sb[1] : 0, sb ? sb[2] : 0, sb ? sb[3] : 0);
  gl.setRenderTarget(今);
  gl.render(pr.场, 机);
  r.键 = 键;

  // 2. 步进
  u.tPrep!.value = 今.texture;
  gl.setRenderTarget(r.云);
  const glc = gl.getContext();
  for (let i = 0; i < 横条数; i++) {
    (u.uStrip!.value as THREE.Vector2).set(-1 + (2 * i) / 横条数, -1 + (2 * (i + 1)) / 横条数);
    gl.render(p.场, 机);
    glc.flush();
  }

  // 3. 合成到目标
  gl.setRenderTarget(x.目标);
  if (半) {
    const m = 取放大();
    m.材质.uniforms.tCloud!.value = r.云.texture;
    m.材质.uniforms.tPrep!.value = 今.texture;
    m.材质.uniforms.tDepth!.value = x.深度;
    gl.render(m.场, 机);
  } else {
    const m = 取合成();
    m.材质.uniforms.tCloud!.value = r.云.texture;
    m.材质.uniforms.tDepth!.value = x.深度;
    gl.render(m.场, 机);
  }
  gl.autoClear = 自动清;
  return true;
};

const 源键 = (p: { 材质: THREE.ShaderMaterial }) => String(程序号.get(p.材质) ?? 程序号.set(p.材质, 程序号.size).get(p.材质));
const 程序号 = new Map<THREE.ShaderMaterial, number>();

/** 让着色器先编起来（画布挂上时调，和取素材同时进行；用户 11-04 定 A4） */
export const 预编云 = (gl: THREE.WebGLRenderer, 配置: 云配置, 海平面: number) => {
  if (配置.开 === false) return Promise.resolve();
  const e = 展开(配置, 海平面);
  if (!e.层们.length) return Promise.resolve();
  const 场们 = [取程序(e).场, 取准备(e.质量.分辨率 === 0.5).场, e.质量.分辨率 === 0.5 ? 取放大().场 : 取合成().场];
  return Promise.all(场们.map((s) => gl.compileAsync(s, 机))).then(() => undefined);
};
