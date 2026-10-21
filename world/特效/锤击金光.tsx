// 锤击金光：下落锤击时锤头的金光、光尾、火星，和砸地那一下的金光炸开。游戏里没有，是演出（用户 10-02 要）；用在 6-3 下坠（镜头/6-3-下坠/画面.tsx）。
// 风格靠「史诗战斗」（Epic Fight）模组的武器拖尾（用户 10-10 嫌原版五毛）：光尾照 `AbstractTrailParticle`（取点、样条插值成带子，U 沿带子新→旧、V 横跨，越旧越淡，不受光）。
// 它的拖尾是武器两端点扫出的面，我们的锤笔直扎下去扫不出面，所以带子改成始终朝向镜头的一条（`ProjectileTrailParticle` 的箭尾同理）。
// 横截面在着色器里算：白热芯、往外泛金、边缘淡到 0，叠几条沿带子的细丝（照 katana_trail.png）；越往后越细（∝(1−u)^0.7）越淡（∝(1−u)^1.6）。
// 混合用预乘 alpha（ONE, ONE_MINUS_SRC_ALPHA）：发光部分 alpha 写 0 纯加色，另带一点金色覆盖，不然亮天空、白云上加色几乎看不出。
// 火星：锤头甩出，带锤速度、很快被拖慢，画成沿运动方向拉长的光条，每物理秒 90 个。锤本身另调亮成金色（重锤.tsx 的 发光，见 `LiYingGoldGlow`）。
// 炸开：白热闪光 + 金色大光晕 + 贴地冲击波环 + 撞地前那段光尾留在原地散掉（0.45 秒）+ 迸射火星（重力、阻力）。
// 坐标是场景坐标（Z 朝上，米），放在转过 -90° 的 group 里；cam 是镜头在场景坐标的位置。
// 远处不缩到看不见（6-3-4 卫兵抬头看到天上的金点、望远镜里）：宽度、光团直径有按离镜头距离给的下限，长焦时除以 `zoom`。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { rng, type V3 } from '../../engine/model/parts.tsx';

export const GOLD = { core: '#fff6d6', hot: '#ffe08a', glow: '#ffc232', deep: '#ff8f1a' };
// 光团、光尾是不写深度的半透明物，在 屏幕AO 第 3 遍画。云（lib/大气/云.ts）在第 3 遍里先画（水面之后、别的半透明之前）并写了前沿深度：
// 往上看时李樱身后有云，金光画在云上面；真在云后面的金光被云深度挡住。
// 次序排在别的半透明物后面（同一处叠着的半透明物里最后画）
export const goldGlowOrder = 10;

const lin = (hex: string) => new THREE.Color(hex); // three 的 Color 读十六进制时已经换成线性

// ---------- 光团（永远朝着镜头的径向渐变贴图） ----------
// 剖面：中间一个亮芯（高斯）+ 往外拖得很长的柔光（(1−r)^3），比单纯的 (1−r)^2.2 更像发光体的光晕
let glowTex: THREE.DataTexture | null = null;
const glowTexture = () => {
  if (glowTex) return glowTex;
  const texSize = 128;
  const px = new Uint8Array(texSize * texSize * 4);
  for (let y = 0; y < texSize; y++)
    for (let x = 0; x < texSize; x++) {
      const radius = Math.min(1, Math.hypot(x + 0.5 - texSize / 2, y + 0.5 - texSize / 2) / (texSize / 2));
      const alpha = Math.min(1, 0.7 * Math.exp(-((radius / 0.16) ** 2)) + 0.45 * (1 - radius) ** 3);
      const i = (y * texSize + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(alpha * 255);
    }
  glowTex = new THREE.DataTexture(px, texSize, texSize, THREE.RGBAFormat);
  glowTex.magFilter = THREE.LinearFilter;
  glowTex.minFilter = THREE.LinearFilter;
  glowTex.needsUpdate = true;
  return glowTex;
};
const spriteMats = new Map<string, THREE.SpriteMaterial>();
const spriteMat = (color: string, opacity: number, normal = false) => {
  const key = `${color}|${Math.round(opacity * 50)}|${normal}`;
  let material = spriteMats.get(key);
  if (!material) {
    material = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: Math.round(opacity * 50) / 50, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    spriteMats.set(key, material);
  }
  return material;
};
// 一团光：size 是直径（米）。normal：普通混合（亮天空上加色混合看不出来，远处的金点要用普通混合的橙金色才看得见）
export const Glow: React.FC<{ p: V3; size: number; color?: string; opacity?: number; normal?: boolean }> = ({ p: pos, size, color = GOLD.glow, opacity = 1, normal }) =>
  opacity > 0.01 && size > 0 ? <sprite position={pos} scale={[size, size, size]} material={spriteMat(color, Math.min(1, opacity), normal)} renderOrder={goldGlowOrder} /> : null;

const dist3 = (a: V3 | number[], b: V3 | number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// 远处不缩到看不见：直径至少是 离镜头距离 × k / 变焦（变焦：长焦时的放大倍数，6-3-4 望远镜里约 16，按画面比例保持一样大）
const atLeast = (size: number, p: V3 | number[], cam: number[], k: number, zoom = 1) => Math.max(size, (dist3(p, cam) * k) / zoom);

// ---------- 光条：朝着镜头的带子（光尾、火星、冲击波环都用它的着色器） ----------
// 顶点：位置（已朝镜头方向往两边撑开）、uv（u 沿带子 0 新→1 旧，v 横跨 −1～1）、强度、芯长。片元：横截面 = 芯（高斯）+ 光晕 × 细丝；纵向越旧越淡
const streakVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec2 aUv;
attribute float aI;
varying vec2 vUv;
varying float vI;
void main() {
  vUv = aUv;
  vI = aI;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const streakFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCore;
uniform vec3 uHot;
uniform vec3 uGlow;
uniform vec3 uDeep;
uniform float uFade;   // 纵向衰减的指数
uniform float uCoreLen; // 白热芯淡完的 u
uniform float uCover;  // 覆盖（金色底）的强度
uniform float uSeed;
uniform float uStreak; // 细丝的强弱（0 没有）
uniform float uCap;    // 两头收圆（火星用：光条两头淡出，不是一个三角片）
varying vec2 vUv;
varying float vI;
float h1(float n) { return fract(sin(n * 127.1 + uSeed * 311.7) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  #include <logdepthbuf_fragment>
  float u = clamp(vUv.x, 0.0, 1.0);
  float a = abs(vUv.y);
  float along = pow(1.0 - u, uFade);
  // 横截面
  float core = exp(-pow(a / 0.13, 2.0)) * (1.0 - smoothstep(0.0, uCoreLen, u));
  float halo = exp(-pow(a / 0.5, 2.0)) * (1.0 - a * a);
  // 细丝：沿带子方向的几条亮线（横向位置固定，往后稍微散开），只调制光晕，不碰芯
  float s = n1(vUv.y * 9.0 + u * 2.0) * 0.6 + n1(vUv.y * 23.0 - u * 3.0) * 0.4;
  halo *= mix(1.0, 0.45 + 1.1 * s, uStreak);
  // 颜色：芯白热 → 光晕由金到橙（越往外、越往后越橙）
  vec3 haloCol = mix(uGlow, uDeep, clamp(a * 0.8 + u * 0.7, 0.0, 1.0));
  vec3 col = mix(uHot, uCore, clamp(core * 1.5, 0.0, 1.0)) * core * 1.4 + haloCol * halo * 0.55;
  float k = along * vI * mix(1.0, smoothstep(0.0, 0.3, u) * (1.0 - smoothstep(0.55, 1.0, u)), uCap);
  float cover = clamp(halo * uCover * k, 0.0, 0.95);
  // 预乘 alpha：发光部分纯加色，覆盖部分是金色的底
  gl_FragColor = vec4(col * k + uDeep * cover * 0.5, cover);
  #include <colorspace_fragment>
}`;
const streakMaterial = (o: { fade?: number; coreLen?: number; cover?: number; seed?: number; streak?: number; cap?: number } = {}) =>
  new THREE.ShaderMaterial({
    uniforms: {
      uCore: { value: lin(GOLD.core) },
      uHot: { value: lin(GOLD.hot) },
      uGlow: { value: lin(GOLD.glow) },
      uDeep: { value: lin(GOLD.deep) },
      uFade: { value: o.fade ?? 1.6 },
      uCoreLen: { value: o.coreLen ?? 0.35 },
      uCover: { value: o.cover ?? 0.3 },
      uSeed: { value: o.seed ?? 1 },
      uStreak: { value: o.streak ?? 0.8 },
      uCap: { value: o.cap ?? 0 },
    },
    vertexShader: streakVert,
    fragmentShader: streakFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
  });

// 一条带子的顶点：pts 从新到旧，w(i) 宽（米），I(i) 强度。朝着镜头撑开：横向 = 切向 × 视线；切向和视线几乎平行（顺着带子看）时沿用上一点的横向
type Ribbon = { pts: THREE.Vector3[]; w: number[]; I: number[]; u?: number[] };
const buildRibbon = (ribbon: Ribbon, cam: THREE.Vector3, pos: number[], uv: number[], intensities: number[], idx: number[]) => {
  const count = ribbon.pts.length;
  if (count < 2) return;
  const base = pos.length / 3;
  let len = 0;
  const arcLens = [0];
  for (let i = 1; i < count; i++) arcLens.push((len += ribbon.pts[i].distanceTo(ribbon.pts[i - 1])));
  if (len < 1e-4) return;
  const tangent = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const side = new THREE.Vector3();
  const prev = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < count; i++) {
    tangent.subVectors(ribbon.pts[Math.min(count - 1, i + 1)], ribbon.pts[Math.max(0, i - 1)]).normalize();
    toCam.subVectors(cam, ribbon.pts[i]).normalize();
    side.crossVectors(tangent, toCam);
    if (side.lengthSq() < 1e-6) side.copy(prev);
    else {
      side.normalize();
      if (side.dot(prev) < 0 && i > 0) side.negate();
    }
    prev.copy(side);
    const halfWidth = ribbon.w[i] / 2;
    const texU = ribbon.u ? ribbon.u[i] : arcLens[i] / len;
    for (const sg of [1, -1]) {
      pos.push(ribbon.pts[i].x + side.x * halfWidth * sg, ribbon.pts[i].y + side.y * halfWidth * sg, ribbon.pts[i].z + side.z * halfWidth * sg);
      uv.push(texU, sg);
      intensities.push(ribbon.I[i]);
    }
    if (i > 0) {
      const vertBase = base + (i - 1) * 2;
      idx.push(vertBase, vertBase + 1, vertBase + 2, vertBase + 1, vertBase + 3, vertBase + 2);
    }
  }
};
const Streaks: React.FC<{ ribbons: Ribbon[]; cam: V3 | number[]; mat: THREE.ShaderMaterial }> = ({ ribbons: ribbons, cam, mat }) => {
  const geo = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const intensities: number[] = [];
    const idx: number[] = [];
    const camPos = new THREE.Vector3(cam[0], cam[1], cam[2]);
    for (const ribbon of ribbons) buildRibbon(ribbon, camPos, pos, uv, intensities, idx);
    if (!idx.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('aI', new THREE.Float32BufferAttribute(intensities, 1));
    geometry.setIndex(idx);
    return geometry;
  }, [ribbons, cam]);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo ? <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={goldGlowOrder} /> : null;
};

// Catmull-Rom 把稀疏的轨迹点插成平滑的曲线（Epic Fight 的拖尾同样先插值：CubicBezierCurve.getBezierInterpolatedPoints）
const smoothPath = (points: V3[], perSegment = 3): THREE.Vector3[] => {
  const vecs = points.map((x) => new THREE.Vector3(...x));
  if (vecs.length < 3) return vecs;
  const curve = new THREE.CatmullRomCurve3(vecs, false, 'centripetal');
  return curve.getPoints((vecs.length - 1) * perSegment);
};
// 离镜头太近的点淡掉（钻地、跟拍时光尾从镜头身上穿过去会糊满画面）
const nearFade = (p: THREE.Vector3, cam: number[]) => THREE.MathUtils.smoothstep(Math.hypot(p.x - cam[0], p.y - cam[1], p.z - cam[2]), 2.5, 6);

// 材质各一份（模块级，几个画布共用没问题：uniform 不随帧变）
let MATS: { tail: THREE.ShaderMaterial; sparks: THREE.ShaderMaterial; afterglow: THREE.ShaderMaterial; ring: THREE.ShaderMaterial } | null = null;
const mats = () =>
  (MATS ??= {
    tail: streakMaterial({ fade: 1.6, coreLen: 0.3, cover: 0.4, seed: 1, streak: 0.8 }),
    sparks: streakMaterial({ fade: 0, coreLen: 0.9, cover: 0.45, seed: 2, streak: 0, cap: 1 }),
    afterglow: streakMaterial({ fade: 1.2, coreLen: 0.2, cover: 0.25, seed: 3, streak: 0.9 }),
    ring: ringMaterial(),
  });

// ---------- 李樱身上的金光 ----------
// g：强度 0～1（编排.ts 的 金光(w)）；head：锤头中心；hip：髋；w：物理时间（火星的出生时刻按它排）；
// 轨迹(秒前)：锤头在「秒前」那一刻的位置（画面.tsx 用髋走过的路 + 现在锤头相对髋的偏移）；尾长：光尾往回取多少物理秒；
// 指数：取点越靠近锤头越密（跟拍时镜头离他只有三四米，等距取点的话第一节就有好几米长）；
// 变焦：长焦时的放大倍数（望远镜里），远处的宽度下限按画面比例算，等于把距离除以它。
// 锤本身调亮在 重锤.tsx（发光 = g）：点光源在方块里面，锤头六面背光、镜头从下往上看是深色的框（见 重锤.tsx 文件头）。
export const LiYingGoldGlow: React.FC<{
  g: number;
  head: V3;
  hip: V3;
  w: number;
  pathAt: (secAgo: number) => V3;
  trailSec: number;
  sampleExp?: number;
  cam: number[];
  zoom?: number;
}> = ({ g: strength, head, hip, w: physSec, pathAt: pathAt, trailSec, sampleExp: sampleExp = 1, cam, zoom = 1 }) => {
  const materials = mats();
  // 光尾：往回取 24 个点、插成平滑曲线；宽度 1.0 米 × g 起，往后按 (1−u)^0.7 收细；远处有下限
  const trail = useMemo<Ribbon[]>(() => {
    if (strength <= 0.01 || trailSec <= 0) return [];
    const raw = Array.from({ length: 24 }, (_, j) => pathAt(trailSec * (j / 23) ** sampleExp));
    raw[0] = head;
    const pts = smoothPath(raw);
    const count = pts.length;
    let len = 0;
    const arcLens = [0];
    for (let i = 1; i < count; i++) arcLens.push((len += pts[i].distanceTo(pts[i - 1])));
    const wv: number[] = [];
    const Iv: number[] = [];
    pts.forEach((point, i) => {
      const along = len > 0 ? arcLens[i] / len : 0;
      // 收细、变淡既按占整条的比例（u），也按离锤头的米数：光尾长到 90 米，镜头近的时候只看得到前面一二十米，只按 u 收的话看着粗细均匀
      const taper = (1 - along) ** 0.7 * (0.4 + 0.6 * Math.exp(-arcLens[i] / 15));
      wv.push(Math.max(0.8 * strength * (0.12 + 0.88 * taper), (Math.hypot(point.x - cam[0], point.y - cam[1], point.z - cam[2]) * 0.009 * (0.3 + 0.7 * taper)) / zoom));
      Iv.push(Math.min(1, 0.4 + 0.75 * strength) * (0.35 + 0.65 * Math.exp(-arcLens[i] / 20)) * nearFade(point, cam));
    });
    return [{ pts, w: wv, I: Iv }];
  }, [strength, head, pathAt, trailSec, sampleExp, cam, zoom]);

  // 火星：每物理秒 90 个，出生在锤头，带着锤当时速度的 0.85 倍往前冲、阻力时间常数 0.06 秒，很快落到光尾里；横向随机散开 2～6 米/秒；
  // 寿命是光尾长度的 0.25～0.7（最少 0.08 秒），画成从「12 毫秒前的位置」到现在位置的光条
  const sparkTrails = useMemo<Ribbon[]>(() => {
    if (strength <= 0.05 || trailSec <= 0) return [];
    const ratePerSec = 90;
    const out: Ribbon[] = [];
    const n0 = Math.floor((physSec - trailSec) * ratePerSec);
    const n1 = Math.floor(physSec * ratePerSec);
    const sparkPos = (birth: number, age: number, rand: () => number) => {
      const secAgo = physSec - birth;
      const p0 = pathAt(secAgo);
      const p1 = pathAt(secAgo + 0.01);
      const hammerVel = [(p0[0] - p1[0]) / 0.01, (p0[1] - p1[1]) / 0.01, (p0[2] - p1[2]) / 0.01];
      const τ = 0.06;
      const k = 0.85 * τ * (1 - Math.exp(-age / τ));
      const ang = rand() * Math.PI * 2;
      const sp = 2 + 4 * rand();
      const lat = [Math.cos(ang) * sp * age, Math.sin(ang) * sp * age, (rand() - 0.5) * sp * age];
      return new THREE.Vector3(p0[0] + hammerVel[0] * k + lat[0], p0[1] + hammerVel[1] * k + lat[1], p0[2] + hammerVel[2] * k + lat[2]);
    };
    for (let sparkIdx = n0; sparkIdx <= n1; sparkIdx++) {
      const birth = sparkIdx / ratePerSec;
      const age = physSec - birth;
      if (age < 0) continue;
      const r0 = rng(9001 + sparkIdx * 7);
      const life = Math.max(0.08, trailSec * (0.25 + 0.45 * r0()));
      if (age > life) continue;
      const seed = 9001 + sparkIdx * 7;
      const nowPos = sparkPos(birth, age, rng(seed + 1));
      const prevPos = sparkPos(birth, Math.max(0, age - 0.012), rng(seed + 1));
      if (nowPos.distanceTo(prevPos) < 1e-3) prevPos.add(new THREE.Vector3(0, 0, 0.05));
      const t = age / life;
      const width = Math.max(0.11 * (1 - 0.5 * t), (Math.hypot(nowPos.x - cam[0], nowPos.y - cam[1], nowPos.z - cam[2]) * 0.0025) / zoom);
      const intensity = Math.min(1, 1.3 * strength) * (1 - t) ** 1.2 * Math.min(1, 0.6 + 0.8 * r0()) * nearFade(nowPos, cam);
      out.push({ pts: [nowPos, prevPos], w: [width, width * 0.7], I: [intensity, intensity], u: [0, 1] });
    }
    return out;
  }, [strength, physSec, pathAt, trailSec, cam, zoom]);

  if (strength <= 0.01) return null;
  const headDist = dist3(head, cam) / zoom;
  return (
    <group>
      {/* 远处（离镜头 60 米以外）先垫一个普通混合的橙金色点，亮天空上也看得见 */}
      <Glow p={head} size={atLeast(1.5 * strength, head, cam, 0.028, zoom)} color={GOLD.deep} opacity={Math.min(1, 1.6 * strength) * Math.min(1, Math.max(0, (headDist - 60) / 60))} normal />
      <Streaks ribbons={trail} cam={cam} mat={materials.tail} />
      <Streaks ribbons={sparkTrails} cam={cam} mat={materials.sparks} />
      {/* 锤头：白热的小芯 + 金色光晕（锤头离镜头近的那半边把光晕挡住，光从锤头四周透出来）；身上淡淡一圈 */}
      <Glow p={head} size={atLeast(1.8 * strength + 0.5, head, cam, 0.014, zoom)} color={GOLD.core} opacity={0.95 * strength} />
      <Glow p={head} size={atLeast(5 * strength, head, cam, 0.026, zoom)} color={GOLD.glow} opacity={0.65 * strength} />
      <Glow p={hip} size={atLeast(3.6 * strength, hip, cam, 0.016, zoom)} color={GOLD.deep} opacity={0.22 * strength} />
      {/* 照亮：锤头上一盏金色点光源，钻进竖井时把井壁照成金色（锤本身照不到，靠 重锤.tsx 的 发光） */}
      <pointLight position={head} color={GOLD.glow} intensity={60 * strength} distance={30} decay={1.6} />
    </group>
  );
};

// ---------- 砸到地面那一下 ----------
// 冲击波环：贴地的一个圆盘，着色器里按半径画「前沿亮、往里拖一段余辉」的环
const ringVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const ringFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uHot;
uniform vec3 uGlow;
uniform vec3 uDeep;
uniform float uR;    // 前沿半径（米）
uniform float uW;    // 前沿厚度
uniform float uTail; // 余辉往里拖多长
uniform float uI;
varying vec2 vP;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vP);
  float d = r - uR;
  float front = exp(-pow(d / uW, 2.0));
  float tail = d < 0.0 ? exp(d / uTail) * 0.45 : 0.0;
  // 前沿上几道放射状的明暗，不是一个均匀的圈
  float ang = atan(vP.y, vP.x);
  float ray = 0.75 + 0.25 * sin(ang * 23.0) * sin(ang * 7.0 + 1.3);
  vec3 col = uHot * front * 1.2 + mix(uGlow, uDeep, 0.5) * tail;
  float k = uI * ray;
  gl_FragColor = vec4(col * k, clamp((front * 0.25 + tail * 0.15) * uI, 0.0, 0.9));
  #include <colorspace_fragment>
}`;
function ringMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHot: { value: lin(GOLD.hot) },
      uGlow: { value: lin(GOLD.glow) },
      uDeep: { value: lin(GOLD.deep) },
      uR: { value: 1 },
      uW: { value: 0.5 },
      uTail: { value: 3 },
      uI: { value: 1 },
    },
    vertexShader: ringVert,
    fragmentShader: ringFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
  });
}
const ringGeometry = new THREE.CircleGeometry(1, 96);

// t：撞击以后的物理秒数；at：撞击点（地面上）；残光：撞地前那一段光尾（轨迹函数和长度，同 李樱金光），撞地后留在原地散掉；
// scale：光团、冲击波环、火星飞出去的距离一起缩放（6-3-6 落进古城那下用小一号的，不打点光）
export const GoldGlowBurst: React.FC<{ t: number; at: V3; cam: number[]; afterglow?: { 轨迹: (secBeforeImpact: number) => V3; trailSec: number }; scale?: number }> = ({ t, at, cam, afterglow, scale = 1 }) => {
  const materials = mats();
  const sparks = useMemo(() => {
    const rand = rng(6361);
    return Array.from({ length: 64 }, () => {
      const angle = rand() * Math.PI * 2;
      const up = 0.15 + rand() * 0.85;
      const sp = 14 + rand() * 34;
      return { v: [Math.cos(angle) * sp * (1 - up * 0.6) * scale, Math.sin(angle) * sp * (1 - up * 0.6) * scale, sp * up * scale] as V3, life: 0.35 + rand() * 0.55, w: 0.08 + rand() * 0.1 };
    });
  }, [scale]);
  // 火星的位置：阻力（时间常数 0.35 秒）+ 重力
  const sparkAt = (vel: V3, sec: number): THREE.Vector3 => {
    const τ = 0.35;
    const k = τ * (1 - Math.exp(-sec / τ));
    return new THREE.Vector3(at[0] + vel[0] * k, at[1] + vel[1] * k, at[2] + 0.4 + vel[2] * k - 4.9 * sec * sec);
  };
  const sparkTrails = useMemo<Ribbon[]>(() => {
    if (t < 0 || t > 1) return [];
    return sparks.flatMap((spark) => {
      if (t > spark.life) return [];
      const lifeFrac = t / spark.life;
      const nowPos = sparkAt(spark.v, t);
      const prevPos = sparkAt(spark.v, Math.max(0, t - 0.03));
      if (nowPos.distanceTo(prevPos) < 1e-3) return [];
      const intensity = (1 - lifeFrac) ** 1.3 * nearFade(nowPos, cam);
      return [{ pts: [nowPos, prevPos], w: [spark.w, spark.w * 0.6], I: [intensity, intensity], u: [0, 1] }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, at, cam, sparks]);
  const afterglowTrails = useMemo<Ribbon[]>(() => {
    if (!afterglow || t < 0 || t > 0.45) return [];
    const fadeFrac = t / 0.45;
    const raw = Array.from({ length: 20 }, (_, j) => afterglow.轨迹(afterglow.trailSec * (j / 19) ** 1.5));
    const pts = smoothPath(raw);
    const count = pts.length;
    return [{
      pts,
      w: pts.map((_, i) => 0.8 * (1 - fadeFrac) ** 0.8 * (0.25 + 0.75 * (1 - i / (count - 1)) ** 0.7)),
      I: pts.map((p) => (1 - fadeFrac) ** 2 * nearFade(p, cam)),
    }];
  }, [t, afterglow, cam]);
  if (t < 0 || t > 1.2) return null;
  const flash = t < 0.05 ? t / 0.05 : Math.max(0, 1 - (t - 0.05) / 0.25);
  const halo = Math.max(0, 1 - t / 0.6) ** 1.5;
  const ringMat = materials.ring;
  const radius = 30 * scale * (1 - Math.exp(-t / 0.16));
  ringMat.uniforms.uR.value = radius;
  ringMat.uniforms.uW.value = 0.4 + 0.05 * radius;
  ringMat.uniforms.uTail.value = 1 + 0.25 * radius;
  ringMat.uniforms.uI.value = Math.max(0, 1 - t / 0.75) ** 1.5;
  const ringScale = radius + 3 * (0.4 + 0.05 * radius);
  return (
    <group>
      <Glow p={[at[0], at[1], at[2] + 1.2 * scale]} size={(2 + 9 * flash) * scale} color={GOLD.core} opacity={flash} />
      <Glow p={[at[0], at[1], at[2] + scale]} size={(8 + 18 * Math.min(1, t / 0.15)) * scale} color={GOLD.glow} opacity={0.6 * halo} />
      {/* 贴地的冲击波环 */}
      {ringMat.uniforms.uI.value > 0.01 && (
        <mesh geometry={ringGeometry} material={ringMat} position={[at[0], at[1], at[2] + 0.12]} scale={[ringScale, ringScale, 1]} renderOrder={goldGlowOrder} frustumCulled={false} />
      )}
      <Streaks ribbons={afterglowTrails} cam={cam} mat={materials.afterglow} />
      <Streaks ribbons={sparkTrails} cam={cam} mat={materials.sparks} />
      {/* 小一号的不打光：古城的夜视光很暗，点光源会把一大片地面染成一块金色圆盘 */}
      {scale >= 1 && <pointLight position={[at[0], at[1], at[2] + 3]} color={GOLD.glow} intensity={150 * halo} distance={60} decay={1.5} />}
    </group>
  );
};
