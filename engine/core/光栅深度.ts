// 光栅深度：不透明物不在片元着色器里写对数深度，改用光栅器自己插值的深度（屏幕 AO 第 1 遍用，见 engine/voxel/屏幕AO.tsx）。
// 为什么：three 的对数深度在片元里写 gl_FragDepth，显卡就不能在着色前做深度测试，Apple 显卡的隐藏面消除也用不上，
//   被挡住的片元全额跑一遍光照和阴影采样（4K 穿塔 200～215 不透明一遍 382 ms，不写时 119 ms，docs/渲染性能.md「一帧拆解」）。
// 做法：带 `RASTER_DEPTH` 宏的程序不写 gl_FragDepth；深度换成反向深度（近 = 1、远 = 0，EXT_clip_control 把裁剪 z 改成 0..w），
//   配 32 位浮点深度，精度不比对数深度差（相对误差约 6e-8，对数深度存进浮点后约 3.5e-7）。
// 宏只在那一遍期间挂在材质上，画完摘掉：同一份材质在别的画布、别的遍照旧写对数深度。
// 用 onBeforeCompile 换掉 `#include <logdepthbuf_fragment>` 的内置材质要自己认这个宏（engine/voxel/方块网格.tsx 的镂空层）。
import * as THREE from 'three';

export const rasterDepthMacro = 'RASTER_DEPTH';

if (!THREE.ShaderChunk.logdepthbuf_fragment.includes(rasterDepthMacro)) THREE.ShaderChunk.logdepthbuf_fragment = `#ifndef ${rasterDepthMacro}\n${THREE.ShaderChunk.logdepthbuf_fragment}\n#endif`;

/** 反向深度的两个系数：深度 = a ÷ 纵深 − b（纵深 = 近 时 1，= 远 时 0），反推 纵深 = a ÷ (深度 + b) */
export const reverseCoeffs = (near: number, far: number) => ({ a: (near * far) / (far - near), b: near / (far - near) });

/** 把透视投影矩阵的 z 行就地换成反向深度：裁剪 z = a − b × 裁剪 w。只动 z 行，偏心、裁切过的投影照样能用 */
export const toReverseProjection = (projection: THREE.Matrix4, near: number, far: number) => {
  const { a, b } = reverseCoeffs(near, far);
  const e = projection.elements;
  e[2] = -b * e[3]!;
  e[6] = -b * e[7]!;
  e[10] = -b * e[11]!;
  e[14] = -b * e[15]! + a;
  return projection;
};

/** 日月星这类在无穷远的面片：深度钉在最远，写了深度的东西（地形、云）都挡住它。
 * 对数深度下片元写 0.99999（天空是 1.0）；带 `RASTER_DEPTH` 宏的那一遍不在片元写，裁剪 z 钉成 0（反向深度的最远，和清屏值相等，默认的「不比现有的远」过得去）。
 * 只给内置材质用（换的是 three 的片段）；之前挂的 onBeforeCompile 会被换掉 */
export const pinDepthFar = (m: THREE.Material) => {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <logdepthbuf_fragment>', `#if defined( USE_LOGARITHMIC_DEPTH_BUFFER ) && ! defined( ${rasterDepthMacro} )\n\tgl_FragDepth = 0.99999;\n#endif`);
    sh.vertexShader = sh.vertexShader.replace('#include <logdepthbuf_vertex>', `#include <logdepthbuf_vertex>\n#ifdef ${rasterDepthMacro}\n\tgl_Position.z = 0.0;\n#endif`);
  };
  m.customProgramCacheKey = () => '深度钉在最远';
  m.userData.rasterDepth = true;
};

/** 深度比较反过来（深度大的近） */
export const reverseCompare: Record<number, THREE.DepthModes> = {
  [THREE.NeverDepth]: THREE.NeverDepth,
  [THREE.AlwaysDepth]: THREE.AlwaysDepth,
  [THREE.LessDepth]: THREE.GreaterDepth,
  [THREE.LessEqualDepth]: THREE.GreaterEqualDepth,
  [THREE.EqualDepth]: THREE.EqualDepth,
  [THREE.GreaterEqualDepth]: THREE.LessEqualDepth,
  [THREE.GreaterDepth]: THREE.LessDepth,
  [THREE.NotEqualDepth]: THREE.NotEqualDepth,
};

// 自己写的着色器：两头都接了 three 的对数深度片段、位置走 projectionMatrix、自己不碰深度的，换宏以后和内置材质一样
const hasStdDepth = (m: THREE.ShaderMaterial) =>
  m.vertexShader.includes('#include <logdepthbuf_vertex>') &&
  m.vertexShader.includes('projectionMatrix') &&
  !/gl_Position\s*\.\s*\w+\s*[-+*/]?=/.test(m.vertexShader) &&
  m.fragmentShader.includes('#include <logdepthbuf_fragment>') &&
  !m.fragmentShader.includes('gl_FragDepth');
const checkCache = new WeakMap<THREE.Material, { 顶点: string; fragmentSource: string; 行: boolean }>();

/** 这份材质在光栅深度那一遍里画出来对不对。
 * 内置材质走 three 的投影和对数深度片段，换宏就行；不做深度测试的不受影响；透射材质 three 会在主画面前另画一遍，那一遍不认反向深度。
 * 自己写着色器的：照 three 的写法接了对数深度的算；没接的（穹顶这类自己定深度的）要自己认 `RASTER_DEPTH` 宏并标 `userData.光栅深度 = true`，标 false 是明说不行。 */
export const rasterCompatible = (m: THREE.Material) => {
  if (m.userData.rasterDepth !== undefined) return m.userData.rasterDepth === true;
  if (!m.depthTest) return true;
  if (((m as THREE.MeshPhysicalMaterial).transmission ?? 0) > 0) return false;
  const shaderMat = m as THREE.ShaderMaterial;
  if (!shaderMat.isShaderMaterial) return true;
  const cached = checkCache.get(m);
  if (cached && cached.顶点 === shaderMat.vertexShader && cached.fragmentSource === shaderMat.fragmentShader) return cached.行;
  const rowOk = hasStdDepth(shaderMat);
  checkCache.set(m, { 顶点: shaderMat.vertexShader, fragmentSource: shaderMat.fragmentShader, 行: rowOk });
  return rowOk;
};

/** 挂上、摘掉宏；状态没变不动材质 */
export const toggleRasterMacro = (m: THREE.Material, enabled: boolean) => {
  const hasMacro = m.defines !== undefined && Object.hasOwn(m.defines, rasterDepthMacro);
  if (hasMacro === enabled) return;
  if (enabled) m.defines = { ...m.defines, [rasterDepthMacro]: '' };
  else delete m.defines![rasterDepthMacro];
  m.needsUpdate = true;
};

// ---------- 多重采样的深度解析取的是像素里的哪一点 ----------
// 片元写对数深度时，一个像素的各采样点共用像素中心的深度；光栅深度每个采样点各算各的，解析出来的是其中一点的（Apple 显卡是第 0 个采样点，偏离像素中心 0.4 像素）。
// 地面掠着看时，这不到半个像素纵深差得出几米：留到后面画、贴着地面的东西（体素世界的积雪层）拿像素中心的深度去比会输，雪地露出底下的方块。
// 所以量出这一点相对像素中心的偏移，换算成对数深度时沿深度的斜率推回像素中心（engine/voxel/屏幕AO.tsx 的换算）。
// 量法：一张斜着的全屏面（深度沿 x 或沿 y 线性变）画进同样采样数的小图，解析后读一个像素反推。正着斜、反着斜量出来不一样
// （解析取的是最近或最远的采样点，不是固定的一点）就返回 null，调用方退回片元写对数深度。
const size = 8;
const sampleOffset = 0.25;
const readPos = [3, 5] as const;
const measure = (gl: THREE.WebGLRenderer, samples: number) => {
  const depth = new THREE.DepthTexture(size, size, THREE.FloatType);
  const multisampleTarget = new THREE.WebGLRenderTarget(size, size, { samples, depthTexture: depth, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  const readTarget = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
  // 一个盖住全屏的大三角形（两个三角形拼的面在对角线上各管几个采样点，不必要）
  const triGeometry = new THREE.BufferGeometry();
  triGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const slantMaterial = new THREE.ShaderMaterial({
    uniforms: { uK: { value: new THREE.Vector2() } },
    vertexShader: 'uniform vec2 uK;\nvoid main() { gl_Position = vec4(position.xy, dot(uK, position.xy), 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
    depthFunc: THREE.AlwaysDepth,
    toneMapped: false,
  });
  const copyMaterial = new THREE.ShaderMaterial({
    uniforms: { t: { value: depth } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t;\nvoid main() { gl_FragColor = vec4(texelFetch(t, ivec2(gl_FragCoord.xy), 0).r); }',
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(triGeometry, slantMaterial);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera();
  const originalTarget = gl.getRenderTarget();
  const value = new Float32Array(4);
  // 深度 = 0.5 + 0.5 × k × 那一点的 x（或 y，−1～1）；反推那一点在像素 读 里偏离中心多少
  const probe = (kx: number, ky: number) => {
    (slantMaterial.uniforms.uK!.value as THREE.Vector2).set(kx, ky);
    mesh.material = slantMaterial;
    gl.setRenderTarget(multisampleTarget);
    gl.clear();
    gl.render(scene, camera);
    mesh.material = copyMaterial;
    gl.setRenderTarget(readTarget);
    gl.render(scene, camera);
    gl.readRenderTargetPixels(readTarget, readPos[0], readPos[1], 1, 1, value);
    return (((value[0]! - 0.5) / (0.5 * (kx || ky)) + 1) * size) / 2 - (kx ? readPos[0] : readPos[1]) - 0.5;
  };
  try {
    const x = [probe(sampleOffset, 0), probe(-sampleOffset, 0)] as const;
    const y = [probe(0, sampleOffset), probe(0, -sampleOffset)] as const;
    const isPoint = Math.abs(x[0] - x[1]) < 1e-3 && Math.abs(y[0] - y[1]) < 1e-3 && Math.abs(x[0]) <= 0.5 && Math.abs(y[0]) <= 0.5;
    return isPoint ? new THREE.Vector2((x[0] + x[1]) / 2, (y[0] + y[1]) / 2) : null;
  } finally {
    gl.setRenderTarget(originalTarget);
    depth.dispose();
    multisampleTarget.dispose();
    readTarget.dispose();
    triGeometry.dispose();
    slantMaterial.dispose();
    copyMaterial.dispose();
  }
};
const measuredCache = new WeakMap<THREE.WebGLRenderer, Map<number, THREE.Vector2 | null>>();

/** 深度解析取的那一点相对像素中心的偏移（像素，x 向右、y 向上），每个渲染器、每种采样数量一次；没开多重采样是 0；量不出固定的一点返回 null */
export const analyticOffset = (gl: THREE.WebGLRenderer, samples: number) => {
  let offsetMap = measuredCache.get(gl);
  if (!offsetMap) measuredCache.set(gl, (offsetMap = new Map()));
  let offset = offsetMap.get(samples);
  if (offset === undefined) offsetMap.set(samples, (offset = samples > 0 ? measure(gl, samples) : new THREE.Vector2()));
  return offset;
};
