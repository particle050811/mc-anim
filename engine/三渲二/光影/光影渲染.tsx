// 光影层：放进三渲二画布接管渲染（useFrame 优先级 1，在平涂换完材质之后），一帧四步，都只看这一帧（不跨帧累积，乱序、并行出帧结果一样）：
// 1. 太阳的影子图（光照 关了不画，下面第 2 步也不换受光的变体）：正交机从太阳那边看，只画受光的平涂网格（发光方片、粒子、天这些不挡光）和只挡光的组（剖掉的墙），深度进影子图（剖掉的不挡光 时镜头近裁剪面前面的不画）。影子图一个纹素 1/32 格（像素阴影；不按像素时 1/256 格，不够大才放粗），
//    框按纹素吸附，镜头动的时候影子边不游。光影参数.影子算法 = '光线' 时不画影子图，挡光的同一批网格建 BVH，受光面逐像素朝太阳打射线（光线影子.ts）；
// 2. 主画面画进离屏图（半精度浮点，同画布存 sRGB 编码后的值）：受光的平涂材质换成补了光影的变体（着色.ts），标了水的换成补了波纹反光的变体，画完换回来；
// 3. 泛光：只画粒子的泛光源（被主画面挡住的丢掉）；取亮部（加上泛光源）缩一半，再缩五次，每层横竖各糊一遍；
// 4. 云（光影选项.云 开着时）：主画面的深度换成对数深度，交给云组件（engine/light/云/画云.ts）画进一张离屏图；
// 5. 合成到画布：调色、叠在天（天的样式是 Photon平滑 时）和云上、叠泛光；不画天时透明度照原样（画布后面的 2D 天、远景照常透出来）。
// 描边：开光影时不描（本作品全片不描边，规矩 不描边）。
// 天、云、光照是三个能单独开关的组件（用户 11-04 定）：天 = engine/light/天/Photon天.ts，云 = engine/light/云/。应力转动用的 engine/light/大气.ts、大气/云.ts 不动。
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useMemo } from 'react';
import { cancelRender, continueRender, delayRender, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import sunPng from 'asset:贴图/场景/天空/sun';
import { sceneToThree } from '../../core/three换算.ts';
import { atmoUniforms, atmosphere } from '../../light/大气.ts';
import { PhotonSky, prepareSkyColorMap } from '../../light/天/Photon天.ts';
import { shouldDrawClouds as drawCloudLayer, precompileClouds } from '../../light/云/画云.ts';
import { png } from '../../model/贴图.ts';
import { OceanSim, defaultOceanParams } from 'gelatin-game-engine/src/water/OceanSim.js';
import { fullscreenVertex, compositeFragment, brightFrag, logDepthFrag, underwaterFrag, newShadingUniforms, isParticleMaterial, MAX_PARTICLE_LIGHTS, MAX_FILL_LIGHTS, blurFrag, shrinkFrag, patchLit, patchWaterSurface, patchParticleSource, type ShadingUniforms } from './着色.ts';
import { shadingDrawsCloud, getShadingParams, type ShadingOptions, type TimeOfDay, type DaypartLight, type FillLight } from './预设.ts';
import { aaSplitFrag, aaPatchFrag, centerFrag, setRayShadow, newRayResources, releaseRay, type RayUniforms } from './光线影子.ts';
import type { RayMode } from './着色.ts';
import { useCurrentSec } from '../../段/时间.tsx';

/** 影子图默认边长（纹素）；光影参数.影子图边 可改，资源按需改尺寸 */
const DEFAULT_SHADOW_MAP_SIZE = 4096;
/** 透视镜头的影子只算到这么远（格） */
const perspShadowDist = 80;
/** Photon 天的空气雾算到多远（米）：同 engine/light/环境.ts 主世界画法不给时的地形远端 */
const skyFar = 40000;
/** 原版太阳：贴图 32×32 里本体是正中 8×8（第 12～19 格），本体离镜头 100 格、半边 7.5 格（同 作品/把回忆拼好给你/场/2-海上/天.tsx 的 2D 天）。
 *  材质包的高清太阳是原版的 k 倍（Faithful 32x 是 64×64，本体 16×16 在第 24～39 格），本体起、本体边都乘 k（用户 11-03 看了 2-日落划船 的高清太阳定「高清版对」，不退回原版粗格子） */
const sunBodyStart = 12;
const sunBodyLength = 8;
const sunDist = 100;
const sunHalfSide = 7.5;

const isFlatLit = (m: THREE.Material) => !!m.userData.平涂 && m.customProgramCacheKey().includes('|平涂');

/** 场景没说时段时按平涂色调猜：暗 = 夜，偏红 = 日落 */
export const guessDaypart = (tint: string | undefined): TimeOfDay => {
  const c = new THREE.Color().setStyle(tint ?? '#ffffff', THREE.LinearSRGBColorSpace);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l < 0.55) return '夜';
  if (c.r > c.b * 1.25) return '日落';
  return '白天';
};

type Variant = { 光: THREE.Material };
const variantMap = new WeakMap<THREE.Material, Variant | null>();
/** 影子按光线算的受光变体（光线影子.ts）：和影子图的变体分开存，影子图那份照旧。按模式各一份（着色.ts 的 光线模式） */
const rayVariantMap = new WeakMap<THREE.Material, Map<RayMode, THREE.Material>>();

/** 半透明（混色）的材质几何罩接不上（混出来的不是一个起点），主画面里自己打（直） */
const rayMainMode = (m: THREE.Material): RayMode => (m.transparent ? '直' : '主');

const getRayVariant = (m: THREE.Material, u: ShadingUniforms, rayUniforms: RayUniforms, lightMode: RayMode) => {
  let variantMap = rayVariantMap.get(m);
  if (!variantMap) rayVariantMap.set(m, (variantMap = new Map()));
  let v = variantMap.get(lightMode);
  if (!v) {
    const variant = m.clone();
    variant.userData.shading = true;
    variant.onBeforeCompile = (shader, renderer) => {
      m.onBeforeCompile(shader, renderer);
      patchLit(shader, u, rayUniforms, lightMode);
    };
    variant.customProgramCacheKey = () => `${m.customProgramCacheKey()}|光影|光线${lightMode === '直' ? '' : `|${lightMode}`}`;
    m.addEventListener('dispose', () => variant.dispose());
    variantMap.set(lightMode, variant);
    v = variant;
  }
  return v;
};

const getVariant = (m: THREE.Material, u: ShadingUniforms, rayUniforms?: RayUniforms): THREE.Material | null => {
  if (rayUniforms && isFlatLit(m)) return getRayVariant(m, u, rayUniforms, rayMainMode(m));
  let e = variantMap.get(m);
  if (e === undefined) {
    e = null;
    const variant = isFlatLit(m) ? '' : isParticleMaterial(m) ? '粒子' : (m as THREE.MeshBasicMaterial).isMeshBasicMaterial ? '水' : null;
    if (variant !== null) {
      const v = m.clone();
      // 粒子的 uniform 每帧在原材质上改（贴图），变体和它共用同一份；粒子的变体只用来画泛光源。叠在一起的取最亮的（同画面里看得到的那一个），
      // 不加起来：加起来密的一团（照片里缩小的烟花）会叠成一大团白
      if (variant === '粒子')
        Object.assign(v, { uniforms: (m as THREE.ShaderMaterial).uniforms, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: true });
      v.userData.shading = true;
      v.onBeforeCompile = (shader, renderer) => {
        m.onBeforeCompile(shader, renderer);
        if (variant === '') patchLit(shader, u);
        else if (variant === '粒子') patchParticleSource(shader, u);
        else patchWaterSurface(shader, u);
      };
      v.customProgramCacheKey = () => `${m.customProgramCacheKey()}|光影${variant}`;
      m.addEventListener('dispose', () => v.dispose());
      e = { 光: v };
    }
    variantMap.set(m, e);
  }
  return e?.光 ?? null;
};

/** 水面材质：基础色材质里只有着色器认得的（海面）才换；不认得的换上去也只是原样，但多编一份程序，所以先按缓存键筛一下 */
const isWaterLike = (m: THREE.Material) => (m as THREE.MeshBasicMaterial).isMeshBasicMaterial && /海面|水面/.test(m.customProgramCacheKey());

type Resource = ReturnType<typeof buildResources>;

// 起伏网格：海面（场景里平放在 z = 0、以眼为中心的一块方板）在 Photon 式、FFT 时换成这张极坐标网格，同样以眼为中心、铺到方板的角上；
// 圈距按指数往外疏（近处 5 厘米一圈、视距边上几米一圈），每圈 720 段。只在画主画面那一下换上，画完换回去，场景自己的网格不动
let waveMesh: THREE.BufferGeometry | null = null;
const getWaveMesh = (geometry: THREE.BufferGeometry, farDist: number) => {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  const R = Math.max(farDist, Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y) / 2);
  if (waveMesh && waveMesh.userData.R === R) return waveMesh;
  waveMesh?.dispose();
  const sampleCount = 640;
  const segCount = 720;
  const k = Math.log(R / 0.05);
  const pos: number[] = [0, 0, 0];
  for (let i = 0; i < sampleCount; i++) {
    const r = 0.05 * Math.exp((k * i) / (sampleCount - 1));
    for (let j = 0; j < segCount; j++) {
      const a = (j / segCount) * Math.PI * 2;
      pos.push(r * Math.cos(a), r * Math.sin(a), 0);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < segCount; j++) idx.push(0, 1 + j, 1 + ((j + 1) % segCount));
  for (let i = 0; i < sampleCount - 1; i++)
    for (let j = 0; j < segCount; j++) {
      const a = 1 + i * segCount + j;
      const c = 1 + i * segCount + ((j + 1) % segCount);
      idx.push(a, a + segCount, c, c, a + segCount, c + segCount);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.userData.R = R;
  waveMesh = g;
  return g;
};

// FFT 海：Ultra-Water 的模拟（4 层 256² 的谱，按画面秒数直接算到那一刻，不靠上一帧，乱序出帧一样；它的白沫要逐帧累积，这里不用）。
// 每个渲染器一份，风速变了重算谱
const fftSims = new WeakMap<THREE.WebGLRenderer, OceanSim>();
const prepFftSea = (gl: THREE.WebGLRenderer, u: ShadingUniforms, sec: number, windSpeed: number, swell: number) => {
  let sim = fftSims.get(gl);
  if (!sim) {
    sim = new OceanSim(gl, defaultOceanParams());
    fftSims.set(gl, sim);
  }
  if (sim.params.windSpeed !== windSpeed || sim.params.swellScale !== swell) {
    sim.params.windSpeed = windSpeed;
    sim.params.swellScale = swell;
    sim.dirty = true;
  }
  sim.time = sec % 300;
  sim.update(0);
  u.gySlope0.value = sim.slope[0]!;
  u.gySlope1.value = sim.slope[1]!;
  u.gySlope2.value = sim.slope[2]!;
  u.gySlope3.value = sim.slope[3]!;
  u.gyDisp0.value = sim.displacement[0]!;
  u.gyDisp1.value = sim.displacement[1]!;
  u.gyDisp2.value = sim.displacement[2]!;
  u.gyFftLen.value.set(sim.lengths[0]!, sim.lengths[1]!, sim.lengths[2]!, sim.lengths[3]!);
};

const newFullscreen = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => {
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: fullscreenVertex, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false });
  const quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quadMesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quadMesh);
  return { material, 片: quadMesh, 场: scene };
};

// 水面反射的云：镜头位置、朝向不变，往上抬到看 −5°～65° 仰角，横向比镜头宽一些（反射方向的方位角和视线差不多）。
// 这台相机里没有东西挡（对数深度全是 1、主画面全透明），云照主画面那一遍的配置画，各用各的离屏图（画云 的 槽）
const drawReflectCloud = (gl: THREE.WebGLRenderer, r: Resource, cam: THREE.PerspectiveCamera, w: number, h: number, options: ShadingOptions, sec: number) => {
  const cloud = options.cloud;
  if (!cloud) return;
  const pw = Math.max(64, Math.round(w / 2)), ph = Math.max(32, Math.round(h / 2));
  for (const t of [r.reflectCloud, r.reflectCloudDepth, r.reflectCloudSky]) setSize(t, pw, ph);
  const savedClearColor = gl.getClearColor(new THREE.Color()), clearAlpha = gl.getClearAlpha();
  gl.setClearColor(0xffffff, 1);
  gl.setRenderTarget(r.reflectCloudDepth);
  gl.clear(true, false, false);
  gl.setClearColor(0x000000, 0);
  gl.setRenderTarget(r.reflectCloudSky);
  gl.clear(true, false, false);
  gl.setRenderTarget(r.reflectCloud);
  gl.clear(true, false, false);
  gl.setClearColor(savedClearColor, clearAlpha);
  const m = r.reflectCloudCam;
  m.position.setFromMatrixPosition(cam.matrixWorld);
  const viewDir = new THREE.Vector3();
  cam.getWorldDirection(viewDir);
  m.rotation.set(0, Math.atan2(-viewDir.x, -viewDir.z), 0, 'YXZ');
  m.rotateX((42 * Math.PI) / 180);
  m.fov = 120;
  m.aspect = pw / ph;
  m.near = cam.near;
  m.far = cam.far;
  m.updateProjectionMatrix();
  m.updateMatrixWorld(true);
  drawCloudLayer({ gl, camera: m, depthTexture: r.reflectCloudDepth.texture, mainPicture: r.reflectCloudSky.texture, 宽: pw, 高: ph, 目标: r.reflectCloud, config: cloud, 场: options.cloudScene ?? {}, 海平面: cloud.海平面 ?? 0, 秒: sec, sunBox: null, 槽: '水面反射' });
  r.u.gyCloudMap.value = r.reflectCloud.texture;
  r.u.gyCloudVP.value.multiplyMatrices(m.projectionMatrix, m.matrixWorldInverse);
  r.u.gyCloudOn.value = 1;
};

const buildResources = () => {
  const u = newShadingUniforms();
  const shadowMap = new THREE.WebGLRenderTarget(DEFAULT_SHADOW_MAP_SIZE, DEFAULT_SHADOW_MAP_SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(DEFAULT_SHADOW_MAP_SIZE, DEFAULT_SHADOW_MAP_SIZE, THREE.UnsignedIntType),
  });
  const shadowCam = new THREE.OrthographicCamera();
  const floatOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false } as const;
  const mainTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
  });
  // 主画面照画布那样存 sRGB 编码后的值（混色也在 sRGB 上做，同画布）。坑：three 画进离屏图一律输出线性（r186 WebGLPrograms 的 outputColorSpace），
  // 只有标成 XR 的离屏图才按它贴图的色彩空间输出；场景里有接在 colorspace_fragment 后面、按 sRGB 数值混的补丁（原版柱形雾），输出线性时雾色会发白
  mainTarget.texture.colorSpace = THREE.SRGBColorSpace;
  (mainTarget as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
  // 云：对数深度（浮点，一像素一值）、云画好的图（画面值、预乘）
  const depthTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const cloudTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const logDepth = newFullscreen(logDepthFrag, { tDepth: { value: null }, cNear: { value: 0.1 }, cFar: { value: 1000 } });
  // 透水：先画水以外的，抄成这张（rgb 画面、a 视深），水面再取它
  const underwater = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  // 水面反射的云：朝天另画一张（半宽半高的那么多像素，不用全分辨率：反射本来就被浪揉碎了）
  const reflectCloud = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const reflectCloudDepth = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const reflectCloudSky = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const reflectCloudCam = new THREE.PerspectiveCamera();
  const copyUnderwater = newFullscreen(underwaterFrag, { tColor: { value: null }, tDepth: { value: null }, cNear: { value: 0.1 }, cFar: { value: 1000 } });
  // 泛光六层：1/2 到 1/64，每层一对（糊的时候来回倒）；后两层只在 泛光.宽 大于 0 时有分量（烟花那种大光晕）
  const pingPongLayers = Array.from({ length: 6 }, () => [new THREE.WebGLRenderTarget(1, 1, floatOpts), new THREE.WebGLRenderTarget(1, 1, floatOpts)] as const);
  const particleSource = new THREE.WebGLRenderTarget(1, 1, floatOpts);
  const brightPass = newFullscreen(brightFrag, { tSrc: { value: null }, tAdd: { value: null }, addK: { value: 0 }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, knee: { value: 0.2 } });
  const downscale = newFullscreen(shrinkFrag, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
  const blurPass = newFullscreen(blurFrag, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
  const composite = newFullscreen(compositeFragment, {
    tColor: { value: null },
    tB0: { value: null },
    tB1: { value: null },
    tB2: { value: null },
    tB3: { value: null },
    tB4: { value: null },
    tB5: { value: null },
    bw: { value: [0, 0, 0, 0, 0, 0] },
    bloom: { value: 0 },
    sat: { value: 1 },
    con: { value: 1 },
    darkTint: { value: new THREE.Color() },
    lightTint: { value: new THREE.Color() },
    split: { value: 0 },
    ...atmoUniforms,
    atmoSky: { value: null },
    skyOn: { value: 0 },
    cloudOn: { value: 0 },
    tCloud: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    sunOn: { value: 0 },
    tSun: { value: null },
    sunMin: { value: new THREE.Vector2() },
    sunN: { value: 1 },
    sunBody: { value: sunBodyLength },
    haloCol: { value: new THREE.Color() },
    zenCol: { value: new THREE.Color() },
    zenK: { value: 0 },
    zenH: { value: 0.6 },
    glowCell: { value: 0 },
    denseK: { value: 0 },
    glowOff: { value: new THREE.Vector2() },
    res: { value: new THREE.Vector2(1, 1) },
  });
  // 几何罩只写起点、导数、法线和朝光标记，不带 BVH 求交。中心射线单放全屏遍，避免求交和场景材质一起编译、执行。
  // 三张 32 位浮点保持原来的几何精度；中心可见度只有 0/1，用 RGBA8。抗锯齿的 k/8 用半精度可以精确表示。
  const mrtTarget = new THREE.WebGLRenderTarget(1, 1, { count: 3, format: THREE.RGBAFormat, type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const antiAlias = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RedFormat, type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const rayResources = newRayResources();
  const centerMap = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const maskTextures = { gyRtA: { value: mrtTarget.textures[0] }, gyRtB: { value: mrtTarget.textures[1] }, gyRtC: { value: mrtTarget.textures[2] }, gyRtCenterMap: { value: centerMap.texture } };
  const center = newFullscreen(centerFrag, { ...rayResources.u, gySun: u.gySun, ...maskTextures });
  const aaSplit = newFullscreen(aaSplitFrag, maskTextures);
  Object.assign(aaSplit.material, { depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true });
  // 全屏片的深度是 0.5：第一遍写 0 的（影子边上）才过
  // 不给 gyRtMask：它就是这一遍要画的 抗（着色器里没用到，也不绑，免得读写同一张图）
  const { gyRtMask: _, ...rayPassUniforms } = rayResources.u;
  const aaPatch = newFullscreen(aaPatchFrag, { ...rayPassUniforms, gySun: u.gySun, ...maskTextures });
  Object.assign(aaPatch.material, { depthTest: true, depthFunc: THREE.GreaterDepth, depthWrite: false });
  return { u, rayResources, mrtTarget, centerMap, 中心: center, antiAlias, aaSplit, aaPatch, shadowMap, shadowCam, 主: mainTarget, depthTarget, cloudTarget, logDepth, underwater, copyUnderwater, reflectCloud, reflectCloudDepth, reflectCloudSky, reflectCloudCam, 层: pingPongLayers, particleSource, brightPass, downscale, blurPass, 合: composite, screenCam: new THREE.OrthographicCamera(), 尺寸: new THREE.Vector2(), clearColor: new THREE.Color(), crossSection: new THREE.Plane(), sunMap: buildSunMap() };
};

/** 太阳本体（原版 8×8，材质包高清的 8k×8k）进一张小图（第 0 行 = 最下面一行，texelFetch 按画布坐标取）；边 = 本体几个贴图像素；
 *  光圈色 = 本体正上方紧挨着的那一格（同 2D 天 的光圈），画面值。
 *  坑：高清贴图要按 k 倍的格子取；按原版 32×32 的格子取，取到的是本体外面那圈快黑的光晕，太阳整个看不见 */
const buildSunMap = () => {
  const t = png(sunPng);
  const k = Math.max(1, Math.round(t.w / 32));
  const side = sunBodyLength * k;
  const startOffset = sunBodyStart * k;
  const px = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const o = ((startOffset + side - 1 - y) * t.w + startOffset + x) * 4;
      px.set(t.px.subarray(o, o + 4), (y * side + x) * 4);
    }
  const sunImage = new THREE.DataTexture(px, side, side, THREE.RGBAFormat);
  sunImage.minFilter = sunImage.magFilter = THREE.NearestFilter;
  sunImage.needsUpdate = true;
  const haloIdx = ((startOffset - 1) * t.w + 16 * k) * 4;
  return { 图: sunImage, side, halo: new THREE.Color(t.px[haloIdx]! / 255, t.px[haloIdx + 1]! / 255, t.px[haloIdx + 2]! / 255) };
};

const release = (r: Resource) => {
  releaseRay(r.rayResources);
  r.mrtTarget.dispose();
  r.centerMap.dispose();
  r.antiAlias.dispose();
  for (const x of [r.中心, r.aaSplit, r.aaPatch]) {
    x.material.dispose();
    x.片.geometry.dispose();
  }
  r.shadowMap.depthTexture?.dispose();
  r.shadowMap.dispose();
  r.主.depthTexture?.dispose();
  r.主.dispose();
  r.depthTarget.dispose();
  r.particleSource.dispose();
  r.cloudTarget.dispose();
  r.sunMap.图.dispose();
  for (const [a, b] of r.层) {
    a.dispose();
    b.dispose();
  }
  for (const x of [r.brightPass, r.downscale, r.blurPass, r.合, r.logDepth, r.copyUnderwater]) {
    x.material.dispose();
    x.片.geometry.dispose();
  }
};

const srgbMul = (c: THREE.Color, hex: string, strength = 1) => c.setStyle(hex, THREE.LinearSRGBColorSpace).multiplyScalar(strength);

/** 太阳方向（three 世界，指向太阳）：场景给了用场景的，不然按时段的仰角、方位跟着镜头摆（给了 太阳参照朝向 就跟它，不跟这一帧的镜头） */
const sunDirection = (opts: ShadingOptions, timeLight: DaypartLight, camera: THREE.Camera, out: THREE.Vector3) => {
  if (opts.sun) return out.copy(sceneToThree(opts.sun)).normalize();
  const f = new THREE.Vector3();
  if (opts.sunRefDir) f.copy(sceneToThree(opts.sunRefDir));
  else camera.getWorldDirection(f);
  f.y = 0;
  if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
  f.normalize();
  // 从镜头那边照过去：太阳在镜头背后，方位往右偏
  const azimuth = Math.PI + (timeLight.sunAzimuth * Math.PI) / 180;
  const sunElevation = (timeLight.sunElevation * Math.PI) / 180;
  const h = f.applyAxisAngle(new THREE.Vector3(0, 1, 0), -azimuth);
  return out.set(h.x * Math.cos(sunElevation), Math.sin(sunElevation), h.z * Math.cos(sunElevation)).normalize();
};

/** 镜头的近裁剪面（世界坐标，镜头看得见的那一边为正）：剖面镜头的近裁剪面放在看点前面 剖 格（机位.tsx） */
const nearClipPlane = (camera: THREE.Camera, out: THREE.Plane) => {
  const f = camera.getWorldDirection(new THREE.Vector3());
  const p = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(f, (camera as THREE.OrthographicCamera).near);
  return out.setFromNormalAndCoplanarPoint(f, p);
};

const frustumCorners = (camera: THREE.Camera): THREE.Vector3[] => {
  const isPerspective = (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
  const points: THREE.Vector3[] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1]) {
      const nearPoint = new THREE.Vector3(x, y, -1).applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
      const farCorner = new THREE.Vector3(x, y, 1).applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
      if (isPerspective) {
        const d = farCorner.clone().sub(nearPoint);
        const vecLength = d.length();
        if (vecLength > perspShadowDist) farCorner.copy(nearPoint).addScaledVector(d, perspShadowDist / vecLength);
      }
      points.push(nearPoint, farCorner);
    }
  return points;
};

/** 摆影子机：受光网格的包围盒和镜头视体（在太阳的视角下）取交，纹素吸附。没有要画影子的东西返回 false。
 *  对齐（光影参数.影子对齐）：影子图的横轴转到画面里最横的那条方块轴（世界 X 或 Z）在太阳视角下的投影上，那个方向的方块边正好落在一行纹素上，投出来是直的；
 *  不对齐时影子图的格子跟着太阳方向随便转，直的屋檐边在影子图里斜穿纹素行、存成台阶，落到被光斜擦的墙上拉长成一排锯齿（用户 11-07 看 2-收集快乐）。
 *  对齐时纹素也按框取到最细（不取 2 的幂） */
const setShadowCam = (r: Resource, scene: THREE.Scene, camera: THREE.Camera, L: THREE.Vector3, litMeshes: THREE.Mesh[], startTexel: number, alignToLight = false) => {
  const shadowMapSize = r.shadowMap.width;
  const up = Math.abs(L.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const viewMatrix = alignToLight ? alignShadowBase(camera, L) ?? new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), L.clone().negate(), up) : new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), L.clone().negate(), up);
  const invMatrix = viewMatrix.clone().invert();
  // 用包围球：方块网格的 CPU 数组上传后就释放，包围盒事后算不出；包围球第一次画（视锥裁剪）之前就算好了
  const sceneBox = new THREE.Box3();
  const worldSphere = new THREE.Sphere();
  for (const m of litMeshes) {
    const origSphere = (m as THREE.Mesh & { boundingSphere?: THREE.Sphere | null }).boundingSphere ?? boundingSphere(m.geometry);
    if (!origSphere) continue;
    worldSphere.copy(origSphere).applyMatrix4(m.matrixWorld).applyMatrix4(invMatrix);
    sceneBox.expandByPoint(worldSphere.center.clone().addScalar(-worldSphere.radius)).expandByPoint(worldSphere.center.clone().addScalar(worldSphere.radius));
  }
  if (sceneBox.isEmpty()) return false;
  const viewBox = new THREE.Box3();
  for (const q of frustumCorners(camera)) viewBox.expandByPoint(q.applyMatrix4(invMatrix));
  const x0 = Math.max(sceneBox.min.x, viewBox.min.x), x1 = Math.min(sceneBox.max.x, viewBox.max.x);
  const y0 = Math.max(sceneBox.min.y, viewBox.min.y), y1 = Math.min(sceneBox.max.y, viewBox.max.y);
  if (x0 >= x1 || y0 >= y1) return false;
  // 纹素：起纹素起，框装不下就翻倍
  let texel = startTexel;
  while (Math.max(x1 - x0, y1 - y0) + 2 > shadowMapSize * texel) texel *= 2;
  if (alignToLight) texel = Math.max(startTexel, (Math.max(x1 - x0, y1 - y0) + 2) / shadowMapSize);
  const halfExtent = (shadowMapSize * texel) / 2;
  const snap = (v: number) => Math.round(v / texel) * texel;
  const cx = snap((x0 + x1) / 2), cy = snap((y0 + y1) / 2);
  const shadowCamera = r.shadowCam;
  shadowCamera.matrixAutoUpdate = false;
  shadowCamera.matrix.copy(viewMatrix);
  shadowCamera.matrixWorld.copy(viewMatrix);
  shadowCamera.matrixWorldInverse.copy(invMatrix);
  // 光的视空间里 z 越大越靠太阳；正交机看 −z，near/far 是到 −z 方向的距离
  Object.assign(shadowCamera, { left: cx - halfExtent, right: cx + halfExtent, bottom: cy - halfExtent, top: cy + halfExtent, near: -sceneBox.max.z - 1, far: -sceneBox.min.z + 1 });
  shadowCamera.updateProjectionMatrix();
  r.u.gyShadowMat.value.multiplyMatrices(shadowCamera.projectionMatrix, invMatrix);
  r.u.gyShadowBias.value = Math.max(0.03, texel * 1.5);
  return true;
};

/** 影子机的朝向：z = 指向太阳，x = 画面横向最接近的那条水平方块轴（世界 X 或 Z）去掉太阳方向的分量，y = z × x。太阳正对那条轴（投影退化）时返回 null */
const alignShadowBase = (camera: THREE.Camera, L: THREE.Vector3) => {
  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const axis = Math.abs(cameraRight.x) >= Math.abs(cameraRight.z) ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const z = L.clone().normalize();
  const x = axis.addScaledVector(z, -axis.dot(z));
  if (x.lengthSq() < 1e-4) return null;
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z);
};

const boundingSphere = (g: THREE.BufferGeometry): THREE.Sphere | null => {
  if (!g.boundingSphere) {
    try {
      g.computeBoundingSphere();
    } catch {
      return null;
    }
  }
  return g.boundingSphere;
};

/** 只挡光（./只挡光.tsx）组里的网格 */
const inBlockerGroup = (o: THREE.Object3D) => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.只挡光) return true;
  return false;
};

const collectLitMeshes = (scene: THREE.Scene) => {
  const litMeshes: THREE.Mesh[] = [];
  const others: THREE.Object3D[] = [];
  scene.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (ms.some(isFlatLit) || inBlockerGroup(mesh)) litMeshes.push(mesh);
      else others.push(o);
    } else if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) others.push(o);
  });
  return { litMeshes, others };
};

/** 同一镜头先写几何罩；别的材质只写深度，挡住后面的受光面。随后独立算中心可见度、同面边检测、边上补 8 条。
 *  中心射线和补采样都不进场景材质：不改变采样位置和判边，只隔离 BVH 的着色器开销；主画面仍按像素取最终可见度。 */
const drawMask = (gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, r: Resource, u: ShadingUniforms, w: number, h: number) => {
  setSize(r.mrtTarget, w, h);
  setSize(r.antiAlias, w, h);
  setSize(r.centerMap, w, h);
  const restores: (() => void)[] = [];
  const colorOffSet = new Set<THREE.Material>();
  const swapMaterial = (m: THREE.Material) => {
    if (isFlatLit(m) && rayMainMode(m) === '主') return getRayVariant(m, u, r.rayResources.u, '罩');
    colorOffSet.add(m);
    return m;
  };
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const originalMaterial = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!originalMaterial) return;
    // 点、线、精灵也只写深度
    if (!mesh.isMesh) {
      for (const m of Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]) colorOffSet.add(m);
      return;
    }
    mesh.material = Array.isArray(originalMaterial) ? originalMaterial.map(swapMaterial) : swapMaterial(originalMaterial);
    restores.push(() => (mesh.material = originalMaterial));
  });
  const origColorWrite = [...colorOffSet].map((m) => [m, m.colorWrite] as const);
  for (const m of colorOffSet) m.colorWrite = false;
  const savedBackground = scene.background;
  scene.background = null;
  // 清成全 0（调用处清色已设成 0、透明）：没画东西的像素导数是 0，抗锯齿那遍据此跳过
  gl.setRenderTarget(r.mrtTarget);
  gl.clear(true, true, true);
  gl.render(scene, camera);
  scene.background = savedBackground;
  for (const [m, c] of origColorWrite) m.colorWrite = c;
  restores.forEach((f) => f());
  gl.setRenderTarget(r.centerMap);
  gl.render(r.中心.场, r.screenCam);
  gl.setRenderTarget(r.antiAlias);
  gl.clear(true, true, false);
  const autoClear = gl.autoClear;
  gl.autoClear = false;
  gl.render(r.aaSplit.场, r.screenCam);
  gl.render(r.aaPatch.场, r.screenCam);
  gl.autoClear = autoClear;
  r.rayResources.u.gyRtMask.value = r.antiAlias.texture;
};

/** 泛光六层叠回去的权重：窄（泛光.宽 = 0）只用前四层，宽（= 1）往粗的层挪 */
const narrowWeights = [0.4, 0.3, 0.2, 0.1, 0, 0];
const wideWeights = [0.1, 0.12, 0.16, 0.2, 0.22, 0.2];

/** 看得见的粒子面片（单一材质） */
const collectParticles = (scene: THREE.Scene) => {
  const meshes: THREE.Mesh[] = [];
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material) && isParticleMaterial(m.material)) meshes.push(m);
  });
  return meshes;
};

/** 粒子照亮的光源：粒子按 并格 格见方的格子并成团（颜色 × 不透明度加起来、位置按亮度平均），取最亮的几团。
 *  一团的颜色 = 平均颜色 × 强 × √(粒子数 / 满团)，封到 满团 个粒子：火花多的一团亮一些，但不按个数线性翻上去 */
const cellGroupSize = 6;
const fullClusterCount = 60;
/** 补光进统一量：方向光的方向、点光的位置换到 three 世界；'镜头' 取镜头朝向反过来、往上抬 20°。要在日光、阴影摆好之后调（受光减影子 要用） */
const setFillLights = (u: ShadingUniforms, lights: readonly FillLight[], camera: THREE.Camera) => {
  if (lights.length > MAX_FILL_LIGHTS) throw new Error(`补光最多 ${MAX_FILL_LIGHTS} 盏，给了 ${lights.length} 盏`);
  u.gyFillN.value = lights.length;
  lights.forEach((b, i) => {
    const p = u.gyFillPos.value[i];
    if (b.位置) {
      p.copy(sceneToThree(b.位置));
      u.gyFillR.value[i] = b.radius ?? 8;
    } else {
      if (b.lightDir === '镜头' || !b.lightDir) {
        camera.getWorldDirection(p).negate();
        const elevationRad = (20 * Math.PI) / 180;
        p.y = Math.max(p.y, 0);
        const h = Math.hypot(p.x, p.z) || 1;
        p.set((p.x / h) * Math.cos(elevationRad), Math.sin(elevationRad), (p.z / h) * Math.cos(elevationRad));
      } else p.copy(sceneToThree(b.lightDir));
      p.normalize();
      u.gyFillR.value[i] = 0;
    }
    u.gyFillSh.value[i] = b.fillShadowOnly ? 1 : 0;
    const c = u.gyFillCol.value[i];
    if (b.色 === '受光减影子') {
      c.copy(u.gySunCol.value).sub(u.gyShadeCol.value).multiplyScalar(b.强);
      c.setRGB(Math.max(c.r, 0), Math.max(c.g, 0), Math.max(c.b, 0));
    } else srgbMul(c, b.色, b.强);
  });
};

const setParticleLights = (u: ShadingUniforms, meshes: THREE.Mesh[], radius: number, strength: number) => {
  const cluster = new Map<string, { p: THREE.Vector3; c: THREE.Color; w: number; n: number }>();
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const g = m.geometry as THREE.InstancedBufferGeometry;
    const pc = g.getAttribute('iCenter') as THREE.BufferAttribute | undefined;
    const cc = g.getAttribute('iColor') as THREE.BufferAttribute | undefined;
    if (!pc || !cc) continue;
    for (let i = 0; i < g.instanceCount; i++) {
      const a = cc.getW(i);
      if (a <= 0) continue;
      v.fromBufferAttribute(pc, i).applyMatrix4(m.matrixWorld);
      const k = `${Math.floor(v.x / cellGroupSize)},${Math.floor(v.y / cellGroupSize)},${Math.floor(v.z / cellGroupSize)}`;
      const e = cluster.get(k) ?? cluster.set(k, { p: new THREE.Vector3(), c: new THREE.Color(0, 0, 0), w: 0, n: 0 }).get(k)!;
      const r = cc.getX(i) * a, gg = cc.getY(i) * a, b = cc.getZ(i) * a;
      const l = r * 0.2126 + gg * 0.7152 + b * 0.0722 + 1e-4;
      e.p.addScaledVector(v, l);
      e.w += l;
      e.c.r += r;
      e.c.g += gg;
      e.c.b += b;
      e.n += a;
    }
  }
  const topLights = [...cluster.values()].sort((x, y) => y.w - x.w).slice(0, MAX_PARTICLE_LIGHTS);
  u.gyFlashN.value = topLights.length;
  u.gyFlashR.value = radius;
  topLights.forEach((e, i) => {
    u.gyFlashPos.value[i]!.copy(e.p).divideScalar(e.w);
    u.gyFlashCol.value[i]!.copy(e.c).multiplyScalar((strength / e.n) * Math.sqrt(Math.min(e.n, fullClusterCount) / fullClusterCount));
  });
};

/** 像素格光晕的格子（画布像素）和格线起点：正交镜头取 1/16 格在屏幕上的大小、格线对上世界原点；透视镜头按 6 个成片像素 */
const glowCell = (camera: THREE.Camera, w: number, h: number, filmWidth: number, out: THREE.Vector2) => {
  const o = camera as THREE.OrthographicCamera;
  if (!o.isOrthographicCamera) {
    out.set(0, 0);
    return Math.max(1, Math.round((6 * w) / filmWidth));
  }
  const n = ((h / ((o.top - o.bottom) / o.zoom)) / 16);
  const p = new THREE.Vector3(0, 0, 0).project(camera);
  out.set((((p.x + 1) / 2) * w) % n, (((p.y + 1) / 2) * h) % n);
  return n;
};

const setSize = (rt: THREE.WebGLRenderTarget, w: number, h: number) => {
  if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
};

export type ShadingRenderProps = {
  /** 已经合上场景给的事实（预设.ts 的 合光影） */
  options: ShadingOptions;
  /** 平涂色调：没给时段时拿它猜 */
  tint?: string;
};

export const ShadingRender: React.FC<ShadingRenderProps> = ({ options, tint }) => {
  // 水面波纹的时间取画面秒数（每帧单独算）
  const { width: filmWidth } = useVideoConfig();
  const sec = useCurrentSec();
  const r = useMemo(buildResources, []);
  useEffect(() => () => release(r), [r]);
  // 云的着色器（按配置拼的一大段）趁取素材的时候并行先编（用户 11-04 定 A4），编完才放行截图；不然头一帧画的时候才同步编
  const gl = useThree((s) => s.gl);
  const cloudKey = shadingDrawsCloud(options) && options.cloud ? JSON.stringify(options.cloud) : '';
  useEffect(() => {
    if (!cloudKey || !options.cloud) return;
    const renderHandle = delayRender('云的着色器');
    precompileClouds(gl, options.cloud, options.cloud.海平面 ?? 0).then(() => continueRender(renderHandle), (e) => cancelRender(e));
  }, [gl, cloudKey]);
  useFrame(({ gl, scene, camera }) => {
    // 世界矩阵 three 在 gl.render 里才更新，下面摆影子机、摆粒子光先要用：不先更新就拿上一次画的（刚挂上的网格还是单位阵），
    // 同一帧单独渲和接在别的帧后面渲出来不一样（2-截图下线 第 163 帧逐像素对不上查出来的）
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    // GPU 天色图换了太阳要先画好：水面（第 2 步）、云、合成都取它
    prepareSkyColorMap(gl);
    const shadingParams = getShadingParams(options.preset);
    const timeOfDay = options.timeOfDay ?? guessDaypart(tint);
    const timeLight = shadingParams[timeOfDay];
    const u = r.u;
    sunDirection(options, timeLight, camera, u.gySun.value);
    // 基准亮度：受光、影子、灯、粒子照的光一起乘（发光区不乘），不给是 1
    const baseBrightness = options.baseBrightness ?? 1;
    srgbMul(u.gySunCol.value, timeLight.sunColor, timeLight.sunIntensity * baseBrightness);
    srgbMul(u.gyShadeCol.value, timeLight.shadowColor, timeLight.shadowStrength * baseBrightness);
    if (options.lightIntensity !== undefined) u.gySunCol.value.lerp(u.gyShadeCol.value, 1 - options.lightIntensity);
    u.gyDirK.value = timeLight.facing;
    u.gyFaceK.value = timeLight.faceShadeK;
    u.gyGlowK.value = timeLight.glowStrength;
    u.gyLampR.value = timeLight.lampLight.radius;
    srgbMul(u.gyLampCol.value, timeLight.lampLight.色, timeLight.lampLight.强 * baseBrightness);
    u.gyPixel.value = shadingParams.pixelShadow ? 1 : 0;
    const shadowSize = shadingParams.shadowMapSize ?? DEFAULT_SHADOW_MAP_SIZE;
    if (r.shadowMap.width !== shadowSize) r.shadowMap.setSize(shadowSize, shadowSize);
    u.gyShadowFilter.value = !shadingParams.pixelShadow && shadingParams.shadowFilter ? 1 / shadowSize : 0;
    u.gyTime.value = sec;
    const waterStyle = options.水 ?? '原版贴图';
    const changeWater = waterStyle !== '原版贴图';
    u.gyWaterPix.value = waterStyle === '像素波纹' || waterStyle === 'FFT像素' ? 1 : 0;
    u.gyWaterMode.value = waterStyle === '像素波纹' ? 1 : waterStyle === 'Photon波纹' ? 2 : waterStyle === 'FFT海' || waterStyle === 'FFT像素' ? 3 : 0;
    u.gyWaveK.value = options.waveStrength ?? 1;
    const waterScatter = options.waterScatter;
    u.gyScatOn.value = waterScatter ? 1 : 0;
    if (waterScatter) {
      u.gyScat.value.setRGB(...(waterScatter.色 ?? [0, 0.05, 0.08]), THREE.LinearSRGBColorSpace);
      u.gySSS.value.set(1.6 * (waterScatter.transmission ?? 1), 0.06 * (waterScatter.transmission ?? 1), 0.05 * (waterScatter.transmission ?? 1));
    }
    u.gyThruOn.value = waterScatter && options.seeThrough ? 1 : 0;
    u.gyLinMix.value = options.waterLinearMix ? 1 : 0;
    if (waterScatter && options.seeThrough) u.gyAtt.value.set(...(options.seeThrough.attenuation ?? [0.46, 0.07, 0.025]));
    u.gyFarR.value = options.waterFar?.farDist ?? 0;
    u.gyHaze.value = options.waterFar?.fog ?? 0;
    u.gyEdgeFlat.value = options.waterFar?.edgeFlat ? 1 : 0;
    if (u.gyWaterMode.value === 3) prepFftSea(gl, u, sec, options.waterWindSpeed ?? 5, options.waterSwell ?? 0.7);
    srgbMul(u.gyZenith.value, options.waterZenith ?? timeLight.水.zenithColor);
    u.gyRefl.value = timeLight.水.reflectivity;
    srgbMul(u.gyGlintCol.value, timeLight.水.glintColor, timeLight.水.glintStrength);
    srgbMul(u.gyWaterBody.value, options.waterBodyColor ?? timeLight.水.waterBodyColor);
    u.gyReflMin.value = timeLight.水.nearReflect;
    const isPerspective = (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
    const drawSky = options.天 === 'Photon平滑' && isPerspective && atmosphere.sky !== null;
    const drawClouds = drawSky && shadingDrawsCloud(options) && atmosphere.clouds !== null;
    const lightingEnabled = options.lighting !== false;
    u.gyAtmoOn.value = drawSky ? 1 : 0;
    u.gyAtmoSky.value = atmosphere.sky;
    const topZenith = options.zenith;
    srgbMul(u.gyZenCol.value, topZenith?.色 ?? '#000000');
    u.gyZenK.value = topZenith ? topZenith.stretch : 0;
    u.gyZenH.value = Math.sin(((topZenith?.高 ?? 38) * Math.PI) / 180);
    const particles = timeLight.particleGlow > 0 || options.particleLit ? collectParticles(scene) : [];
    u.gyFlashN.value = 0;
    if (options.particleLit && timeLight.particleLight.强 > 0) setParticleLights(u, particles, timeLight.particleLight.radius, timeLight.particleLight.强 * baseBrightness);
    setFillLights(u, options.fillLights ?? [], camera);

    const savedBackground = scene.background;
    const clearTransparency = gl.getClearAlpha();
    gl.getClearColor(r.clearColor);
    gl.setClearColor(0x000000, 0);

    // 1. 影子图：只挡光的组（平时藏着）只在这一步露出来
    const blockers: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData.只挡光) blockers.push(o);
    });
    for (const o of blockers) o.visible = true;
    const { litMeshes, others } = collectLitMeshes(scene);
    u.gyShadowOn.value = 0;
    // 光线影子：不画影子图，挡光的三角形建 BVH（像素阴影开着时照旧走影子图）
    const rayOn = lightingEnabled && shadingParams.shadowAlgo === '光线' && !shadingParams.pixelShadow;
    if (rayOn) u.gyShadowOn.value = litMeshes.length && setRayShadow(r.rayResources, litMeshes, options.clipNoBlockLight ? nearClipPlane(camera, r.crossSection) : null) > 0 ? 1 : 0;
    else if (lightingEnabled && litMeshes.length && setShadowCam(r, scene, camera, u.gySun.value, litMeshes, shadingParams.pixelShadow ? 1 / 32 : 1 / 256, !shadingParams.pixelShadow && !!shadingParams.shadowAlign)) {
      const hiddenObjects = others.filter((o) => o.visible);
      for (const o of hiddenObjects) o.visible = false;
      scene.background = null;
      gl.setRenderTarget(r.shadowMap);
      gl.clear(true, true, true);
      const origClipPlanes = gl.clippingPlanes;
      if (options.clipNoBlockLight) gl.clippingPlanes = [nearClipPlane(camera, r.crossSection)];
      gl.render(scene, r.shadowCam);
      gl.clippingPlanes = origClipPlanes;
      scene.background = savedBackground;
      for (const o of hiddenObjects) o.visible = true;
      u.gyShadowMap.value = r.shadowMap.depthTexture;
      u.gyShadowOn.value = 1;
    }
    for (const o of blockers) o.visible = false;

    // 2. 主画面
    const [w, h] = gl.getDrawingBufferSize(r.尺寸).toArray();
    u.gyCloudOn.value = 0;
    if (drawClouds && options.cloud && options.waterReflectCloud && u.gyWaterMode.value > 1.5) drawReflectCloud(gl, r, camera as THREE.PerspectiveCamera, w, h, options, sec);
    setSize(r.主, w, h);
    if (rayOn && u.gyShadowOn.value) drawMask(gl, scene, camera, r, u, w, h);
    const restores: (() => void)[] = [];
    const waterMeshes: THREE.Object3D[] = [];
    const toVariant = (m: THREE.Material) => ((lightingEnabled && isFlatLit(m)) || (changeWater && isWaterLike(m)) ? (getVariant(m, u, rayOn ? r.rayResources.u : undefined) ?? m) : m);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const originalMaterial = mesh.material;
      const replaced = Array.isArray(originalMaterial) ? originalMaterial.map(toVariant) : toVariant(originalMaterial);
      if (replaced === originalMaterial || (Array.isArray(replaced) && replaced.every((m, i) => m === (originalMaterial as THREE.Material[])[i]))) return;
      mesh.material = replaced;
      restores.push(() => (mesh.material = originalMaterial));
      if (!Array.isArray(originalMaterial) && isWaterLike(originalMaterial)) waterMeshes.push(mesh);
      if (u.gyWaterMode.value > 1.5 && !Array.isArray(originalMaterial) && isWaterLike(originalMaterial)) {
        const origMesh = mesh.geometry;
        mesh.geometry = getWaveMesh(origMesh, u.gyFarR.value);
        // 起伏以后包围盒变了，不让 three 按方板的包围盒剔掉
        const origFrustumCull = mesh.frustumCulled;
        mesh.frustumCulled = false;
        restores.push(() => {
          mesh.geometry = origMesh;
          mesh.frustumCulled = origFrustumCull;
        });
      }
    });
    gl.setRenderTarget(r.主);
    gl.clear(true, true, true);
    if (u.gyThruOn.value && waterMeshes.length) {
      // 透水：水以外的先画进主画面，抄一份（画面 + 视深）给水面取，再只画水、叠在上面（深度照旧比）
      for (const o of waterMeshes) o.visible = false;
      gl.render(scene, camera);
      for (const o of waterMeshes) o.visible = true;
      setSize(r.underwater, w, h);
      const cam = camera as THREE.PerspectiveCamera;
      Object.assign(r.copyUnderwater.material.uniforms, { tColor: { value: r.主.texture }, tDepth: { value: r.主.depthTexture }, cNear: { value: cam.near }, cFar: { value: cam.far } });
      gl.setRenderTarget(r.underwater);
      gl.render(r.copyUnderwater.场, r.screenCam);
      u.gyUnder.value = r.underwater.texture;
      u.gyRes.value.set(w, h);
      const lineSprites: THREE.Object3D[] = [];
      scene.traverseVisible((o) => {
        if (o !== scene && !waterMeshes.includes(o) && ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite)) lineSprites.push(o);
      });
      for (const o of lineSprites) o.visible = false;
      const prevBackground = scene.background;
      scene.background = null;
      const savedAutoClear = gl.autoClear;
      gl.autoClear = false;
      gl.setRenderTarget(r.主);
      gl.render(scene, camera);
      gl.autoClear = savedAutoClear;
      scene.background = prevBackground;
      for (const o of lineSprites) o.visible = true;
    } else gl.render(scene, camera);
    restores.forEach((f) => f());

    // 3. 泛光
    if (timeLight.particleGlow > 0 && particles.length) {
      setSize(r.particleSource, w, h);
      u.gyDepth.value = r.主.depthTexture;
      const lineSprites: THREE.Object3D[] = [];
      scene.traverseVisible((o) => {
        if (o !== scene && !particles.includes(o as THREE.Mesh) && ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite)) lineSprites.push(o);
      });
      for (const o of lineSprites) o.visible = false;
      const origMaterials: THREE.Material[] = particles.map((m) => m.material as THREE.Material);
      particles.forEach((m, i) => (m.material = getVariant(origMaterials[i]!, u) ?? origMaterials[i]!));
      scene.background = null;
      gl.setRenderTarget(r.particleSource);
      gl.clear(true, true, true);
      gl.render(scene, camera);
      scene.background = savedBackground;
      particles.forEach((m, i) => (m.material = origMaterials[i]!));
      for (const o of lineSprites) o.visible = true;
    }
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    const renderPass = (x: { 场: THREE.Scene }, renderTarget: THREE.WebGLRenderTarget | null) => {
      gl.setRenderTarget(renderTarget);
      gl.render(x.场, r.screenCam);
    };
    let textureSource: THREE.Texture = r.主.texture;
    let sw = w, sh = h;
    r.层.forEach(([a, b], i) => {
      const lw = Math.max(1, Math.round(w / 2 ** (i + 1))), lh = Math.max(1, Math.round(h / 2 ** (i + 1)));
      setSize(a, lw, lh);
      setSize(b, lw, lh);
      const pass = i === 0 ? r.brightPass : r.downscale;
      pass.material.uniforms.tSrc!.value = textureSource;
      (pass.material.uniforms.texel!.value as THREE.Vector2).set(0.5 / sw, 0.5 / sh);
      if (i === 0) {
        pass.material.uniforms.threshold!.value = timeLight.bloom.threshold;
        pass.material.uniforms.knee!.value = timeLight.bloom.softKnee;
        pass.material.uniforms.tAdd!.value = r.particleSource.texture;
        pass.material.uniforms.addK!.value = particles.length ? timeLight.particleGlow : 0;
      }
      renderPass(pass, a);
      r.blurPass.material.uniforms.tSrc!.value = a.texture;
      (r.blurPass.material.uniforms.dir!.value as THREE.Vector2).set(1 / lw, 0);
      renderPass(r.blurPass, b);
      r.blurPass.material.uniforms.tSrc!.value = b.texture;
      (r.blurPass.material.uniforms.dir!.value as THREE.Vector2).set(0, 1 / lh);
      renderPass(r.blurPass, a);
      textureSource = a.texture;
      sw = lw;
      sh = lh;
    });

    // 太阳摆在哪先算好：云要连太阳本体那一块一起算（合成按它上面云的不透明度压暗太阳）
    const cu = r.合.material.uniforms;
    if (drawSky) setSun(cu, camera, options.sun, w, h, r.sunMap);

    // 4. 云
    if (drawClouds && options.cloud) {
      const perspCamera = camera as THREE.PerspectiveCamera;
      setSize(r.depthTarget, w, h);
      setSize(r.cloudTarget, w, h);
      const du = r.logDepth.material.uniforms;
      du.tDepth!.value = r.主.depthTexture;
      du.cNear!.value = perspCamera.near;
      du.cFar!.value = perspCamera.far;
      renderPass(r.logDepth, r.depthTarget);
      gl.setRenderTarget(r.cloudTarget);
      gl.clear(true, true, true);
      const n = cu.sunN!.value as number, b = cu.sunBody!.value as number, m = cu.sunMin!.value as THREE.Vector2;
      drawCloudLayer({
        gl,
        camera: perspCamera,
        depthTexture: r.depthTarget.texture,
        mainPicture: r.主.texture,
        宽: w,
        高: h,
        目标: r.cloudTarget,
        config: options.cloud,
        场: options.cloudScene ?? {},
        海平面: options.cloud.海平面 ?? 0,
        秒: sec,
        sunBox: cu.sunOn!.value ? [m.x, m.y, n * b, n * b] : null,
      });
      gl.autoClear = false;
    }

    // 5. 合成
    cu.skyOn!.value = drawSky ? 1 : 0;
    cu.cloudOn!.value = drawClouds ? 1 : 0;
    cu.tCloud!.value = r.cloudTarget.texture;
    cu.atmoSky!.value = atmosphere.sky;
    if (drawSky) {
      (cu.uInvProj!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
      (cu.uCamWorld!.value as THREE.Matrix4).copy(camera.matrixWorld);
      (cu.uCamPos!.value as THREE.Vector3).setFromMatrixPosition(camera.matrixWorld);
    }
    cu.tColor!.value = r.主.texture;
    r.层.forEach(([a], i) => (cu[`tB${i}`]!.value = a.texture));
    cu.bloom!.value = timeLight.bloom.强;
    const bloomWidth = timeLight.bloom.宽 ?? 0;
    cu.bw!.value = narrowWeights.map((a, i) => a + (wideWeights[i]! - a) * bloomWidth);
    cu.sat!.value = shadingParams.grade.saturation;
    cu.con!.value = shadingParams.grade.对比;
    srgbMul(cu.darkTint!.value as THREE.Color, shadingParams.grade.darkColor);
    srgbMul(cu.lightTint!.value as THREE.Color, shadingParams.grade.brightColor);
    cu.split!.value = shadingParams.grade.colorSplit;
    (cu.zenCol!.value as THREE.Color).copy(u.gyZenCol.value);
    cu.zenK!.value = u.gyZenK.value;
    cu.zenH!.value = u.gyZenH.value;
    (cu.res!.value as THREE.Vector2).set(w, h);
    cu.denseK!.value = options.denseGlow ?? 0;
    cu.glowCell!.value = options.glowMode === '像素格' ? glowCell(camera, w, h, filmWidth, cu.glowOff!.value as THREE.Vector2) : 0;
    gl.setClearColor(r.clearColor, clearTransparency);
    gl.setRenderTarget(null);
    gl.clear(true, true, true);
    gl.render(r.合.场, r.screenCam);
    gl.autoClear = autoClear;
  }, 1);
  if (options.天 !== 'Photon平滑' || !options.sun) return null;
  return <PhotonSky sun={[...options.sun] as [number, number, number]} far={skyFar} 算法={options.skyAlgo ?? 'GPU'} />;
};

/** 原版方形太阳在画布上的位置：同 2D 天（作品/把回忆拼好给你/场/2-海上/编排.ts 的 太阳屏幕），本体边长 = 上下沿（沿太阳走的方向各偏半边）投影的距离，
 *  一个贴图像素（高清贴图按高清像素）取整成几个画布像素，左下角取整；屏幕上横平竖直 */
const setSun = (cu: Record<string, THREE.IUniform>, camera: THREE.Camera, sun: ShadingOptions['sun'], w: number, h: number, sunImageSet: { 图: THREE.Texture; side: number; halo: THREE.Color }) => {
  cu.sunOn!.value = 0;
  if (!sun) return;
  const d = new THREE.Vector3(...sun).normalize();
  const sideDir = new THREE.Vector3(0, 1, 0).cross(d).normalize();
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const projectDir = (v: THREE.Vector3) => {
    const p = sceneToThree([v.x, v.y, v.z]).add(eye).project(camera);
    return p.z < 1 ? new THREE.Vector2(((p.x + 1) / 2) * w, ((p.y + 1) / 2) * h) : null;
  };
  const c = projectDir(d.clone().multiplyScalar(sunDist));
  const sunTop = projectDir(d.clone().multiplyScalar(sunDist).addScaledVector(sideDir, sunHalfSide));
  const sunBottom = projectDir(d.clone().multiplyScalar(sunDist).addScaledVector(sideDir, -sunHalfSide));
  if (!c || !sunTop || !sunBottom) return;
  const side = sunImageSet.side;
  const n = Math.max(1, Math.round(sunTop.distanceTo(sunBottom) / side));
  // 2D 天按左上角取整（y 朝下），这里换成左下角
  const x0 = Math.round(c.x - (side / 2) * n);
  const y0Top = Math.round(h - c.y - (side / 2) * n);
  (cu.sunMin!.value as THREE.Vector2).set(x0, h - y0Top - side * n);
  cu.sunN!.value = n;
  cu.sunBody!.value = side;
  cu.tSun!.value = sunImageSet.图;
  (cu.haloCol!.value as THREE.Color).copy(sunImageSet.halo);
  cu.sunOn!.value = 1;
};
