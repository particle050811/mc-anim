// 第 7 句她放的法术：一道往天上冲的光柱，脚下魔法阵底下一圈地光。
// 演绎：游戏里女仆没有往天上打光柱、把雨云打散的法术（用户 10-24「直接放法术不就好了吗？」：不拿书、不开界面，她直接放）。
// 光柱用户 11-03 说「太潦草」重做：白芯、淡紫的几圈光（一圈一档，按 1/16 格的像素走）、往上流的光纹、两股绕着往上转的细光，
// 举着的手上一颗像素星；起柱、破云时手上冲出光圈、地上扫过一圈，柱上一环环往上走；末地烛的 glitter 光点绕着往上飘，阵边的附魔台符文飞到手上；
// 退的时候变细、一块块碎掉，碎成光点散开。数在 参数.ts 的 光柱。
// 合成坑（光影层 合成片元）：主画面按预乘存，合成时颜色除以不透明度、封顶 1 再盖到天和云上，纯加法（不透明度 0）的光在天上会被丢掉，
// 所以自己写的着色器一律输出（颜色 × 不透明度，不透明度），混合 ONE / ONE_MINUS_SRC_ALPHA；超过 1 的只在泛光里看得出来。
// 不用 iCenter 这个属性名：光影层按它认粒子（是粒子材质），会被拿去当泛光源。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { easeOutQuad, mulberry32 } from '@engine/core/数学.ts';
import { type V3 } from '@engine/model/parts.tsx';
import { type Particle, ParticleQuads } from '@库/特效/粒子面片.tsx';
import { vanillaParticleAtlas } from '@库/特效/原版粒子.tsx';
import * as params from './参数.ts';
import { eventFrame, songSec, circleSize } from './编排.ts';
import { magicCircleRadius } from './酒狐件.tsx';

const pillarLight = params.lightPillar;
type RGB3 = [number, number, number];
/** 十六进制色 → sRGB 数值（自己写的着色器不过 colorspace_fragment，直接写进按 sRGB 存的主画面） */
const hexToRgb = (hex: string): RGB3 => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB3;
const toVec3 = (c: RGB3) => new THREE.Vector3(...c);

const blendOpts = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
} as const;

const commonGlsl = /* glsl */ `
const float PX = 1.0 / 16.0;
float hash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}
`;

// ---------- 柱身：一条始终朝镜头的竖条（绕柱轴转），片元按离轴多远画几圈光 ----------
const bodyVert = /* glsl */ `
uniform float uH;
uniform float uR;
varying vec2 vP;
void main() {
  vec3 base = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  vec3 axis = normalize( ( modelMatrix * vec4( 0.0, 0.0, 1.0, 0.0 ) ).xyz );
  float h = position.y * uH;
  vec3 p = base + axis * h;
  vec3 side = normalize( cross( axis, cameraPosition - p ) );
  float s = position.x * uR;
  vP = vec2( s, h );
  gl_Position = projectionMatrix * viewMatrix * vec4( p + side * s, 1.0 );
}
`;
const bodyFragmentShader = /* glsl */ `
${commonGlsl}
uniform float uH;
uniform float uT;
uniform float uW;
uniform float uB;
uniform float uA;
uniform float uDis;
uniform float uHead;
uniform vec3 uR3;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec2 uE;
uniform vec2 uA2;
uniform vec4 uSt;
uniform float uDuty;
uniform vec4 uSp;
uniform float uSpN;
varying vec2 vP;
void main() {
  vec2 q = ( floor( vP / PX ) + 0.5 ) * PX;
  // 碎掉：两像素一块按哈希丢，上面先碎
  if ( uDis > 0.0 && hash21( floor( vP / ( 2.0 * PX ) ) ) < uDis * 1.5 - 0.5 * ( 1.0 - clamp( q.y / 36.0, 0.0, 1.0 ) ) ) discard;
  float d = uH - q.y;
  // 头：往上冲的时候顶上一截粗一点、亮一点，最顶上收尖
  float head = uHead * exp( - max( d, 0.0 ) / 1.2 );
  float w = uW * ( 1.0 + 0.35 * head ) * clamp( d / 0.45, 0.15, 1.0 );
  float x = abs( q.x );
  vec3 r = uR3 * w;
  // 往上流的光纹：一列像素一个速度、长度
  float col = floor( vP.x / PX );
  float sp = mix( uSt.x, uSt.y, hash21( vec2( col, 7.0 ) ) );
  float len = mix( uSt.z, uSt.w, hash21( vec2( col, 13.0 ) ) );
  float streak = step( fract( ( q.y - uT * sp ) / len + hash21( vec2( col, 29.0 ) ) ), uDuty );
  vec3 c = vec3( 0.0 );
  float a = 0.0;
  if ( x < r.x ) {
    c = uC0 * uE.x * ( 1.0 + 0.15 * head );
    a = 1.0;
  } else if ( x < r.y ) {
    c = mix( uC1, uC0, streak * 0.7 ) * uE.y;
    a = 0.95;
  } else if ( x < r.z ) {
    float t = ( x - r.y ) / ( r.z - r.y );
    a = ( t < 0.5 ? uA2.x : uA2.y ) + streak * 0.22 * ( 1.0 - t );
    c = mix( uC2, uC1, streak * 0.6 );
  }
  // 几股绕着往上转的细光：前半圈盖在芯上，后半圈被芯挡住
  for ( int k = 0; k < 4; k ++ ) {
    if ( float( k ) >= uSpN ) break;
    float phi = 6.2831853 * ( q.y / uSp.y - uT * uSp.z + float( k ) / uSpN );
    float sx = uSp.x * w * sin( phi );
    if ( abs( q.x - sx ) < uSp.w ) {
      if ( cos( phi ) > 0.0 ) {
        c = mix( uC0, uC1, 0.35 ) * 1.1;
        a = 1.0;
      } else if ( x >= r.x ) {
        c = uC1;
        a = max( a, 0.75 );
      }
    }
  }
  a *= uA;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( c * uB * a, a );
}
`;

const bodyGeometry = (() => {
  const segCount = 16;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segCount; j++) pos.push(-1, j / segCount, 0, 1, j / segCount, 0);
  for (let j = 0; j < segCount; j++) idx.push(2 * j, 2 * j + 1, 2 * j + 3, 2 * j, 2 * j + 3, 2 * j + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
})();

const newBodyMaterial = () =>
  new THREE.ShaderMaterial({
    ...blendOpts,
    side: THREE.DoubleSide,
    vertexShader: bodyVert,
    fragmentShader: bodyFragmentShader,
    uniforms: {
      uH: { value: 1 },
      uR: { value: 1 },
      uT: { value: 0 },
      uW: { value: 1 },
      uB: { value: 1 },
      uA: { value: 1 },
      uDis: { value: 0 },
      uHead: { value: 0 },
      uR3: { value: new THREE.Vector3(pillarLight.core.coreRadius, pillarLight.里.innerRadius, pillarLight.halo.haloRadius) },
      uC0: { value: toVec3(hexToRgb(pillarLight.core.色)) },
      uC1: { value: toVec3(hexToRgb(pillarLight.里.色)) },
      uC2: { value: toVec3(hexToRgb(pillarLight.halo.色)) },
      uE: { value: new THREE.Vector2(pillarLight.core.brightness, pillarLight.里.brightness) },
      uA2: { value: new THREE.Vector2(...pillarLight.halo.alphas) },
      uSt: { value: new THREE.Vector4(pillarLight.flow.速[0], pillarLight.flow.速[1], pillarLight.flow.长[0], pillarLight.flow.长[1]) },
      uDuty: { value: pillarLight.flow.duty },
      uSp: { value: new THREE.Vector4(pillarLight.swirl.radius, pillarLight.swirl.ringHeight, pillarLight.swirl.ringsPerSec, pillarLight.swirl.宽) },
      uSpN: { value: pillarLight.swirl.strands },
    },
  });

// ---------- 方片：一批实例化的方片，A、B 两个 vec4 属性 ----------
const squareGeometry = (n: number) => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('pA', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute('pB', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
  return g;
};
const fillInstances = (g: THREE.InstancedBufferGeometry, pairs: readonly (readonly [number[], number[]])[]) => {
  const A = g.getAttribute('pA') as THREE.InstancedBufferAttribute;
  const B = g.getAttribute('pB') as THREE.InstancedBufferAttribute;
  pairs.forEach(([a, b], i) => {
    A.setXYZW(i, a[0]!, a[1]!, a[2]!, a[3]!);
    B.setXYZW(i, b[0]!, b[1]!, b[2]!, b[3]!);
  });
  A.needsUpdate = B.needsUpdate = true;
  g.instanceCount = pairs.length;
};

// 朝镜头的方片：pA = 心（场景坐标）、半边长；pB = 种（0 像素星、1 光圈）、两个参数、不透明度
const starVert = /* glsl */ `
attribute vec4 pA;
attribute vec4 pB;
varying vec2 vP;
varying vec4 vB;
varying float vHalf;
void main() {
  vP = position.xy * pA.w;
  vB = pB;
  vHalf = pA.w;
  vec4 mv = modelViewMatrix * vec4( pA.xyz, 1.0 );
  mv.xy += position.xy * pA.w;
  gl_Position = projectionMatrix * mv;
}
`;
const starFragmentShader = /* glsl */ `
${commonGlsl}
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
varying vec2 vP;
varying vec4 vB;
varying float vHalf;
void main() {
  vec2 q = ( floor( vP / PX ) + 0.5 ) * PX;
  float r = length( q );
  vec3 c = vec3( 0.0 );
  float a = 0.0;
  if ( vB.x < 0.5 ) {
    // 像素星：十字长臂、斜的短臂，一像素宽，外头一半暗一档；芯一块白；外面一圈两档的晕（臂长的一半多）
    float L = vHalf, C = vB.z, G = L * 0.55;
    float ax = abs( q.x ), ay = abs( q.y );
    float arm = 0.0;
    if ( ax < PX ) arm = 1.0 - ay / L;
    if ( ay < PX ) arm = max( arm, 1.0 - ax / L );
    if ( abs( ax - ay ) < PX * 0.5 ) arm = max( arm, 1.0 - r / ( L * 0.42 ) );
    if ( r < G ) {
      a = r < G * 0.55 ? 0.5 : 0.22;
      c = uC2;
    }
    if ( arm > 0.0 ) {
      a = arm > 0.45 ? 1.0 : 0.75;
      c = arm > 0.45 ? uC1 * 1.4 : uC1;
    }
    if ( r < C ) {
      a = 1.0;
      c = uC0 * 2.0;
    }
  } else {
    // 光圈：vB.y = 圈半径，vB.z = 圈宽；圈里头淡淡一层
    float d = abs( r - vB.y );
    if ( d < vB.z * 0.5 ) {
      a = 1.0;
      c = d < vB.z * 0.22 ? uC0 * 1.5 : uC1 * 1.1;
    } else if ( r < vB.y ) {
      a = 0.12;
      c = uC2;
    }
  }
  a *= vB.w;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( c * a, a );
}
`;

// 平躺的圈（场景 xy 平面）：pA = 心、方片半边长；pB = 圈半径、圈宽、不透明度、亮
const ringVert = /* glsl */ `
attribute vec4 pA;
attribute vec4 pB;
varying vec2 vP;
varying vec4 vB;
void main() {
  vP = position.xy * pA.w;
  vB = pB;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( pA.xyz + vec3( vP, 0.0 ), 1.0 );
}
`;
const ringFragmentShader = /* glsl */ `
${commonGlsl}
uniform vec3 uC0;
uniform vec3 uC1;
varying vec2 vP;
varying vec4 vB;
void main() {
  float r = length( ( floor( vP / PX ) + 0.5 ) * PX );
  float d = abs( r - vB.x );
  if ( d >= vB.y * 0.5 ) discard;
  float a = vB.z;
  vec3 c = ( d < vB.y * 0.2 ? uC0 : uC1 ) * vB.w;
  gl_FragColor = vec4( c * a, a );
}
`;

const newQuadMaterial = (vertexShader: string, fragmentShader: string) =>
  new THREE.ShaderMaterial({
    ...blendOpts,
    side: THREE.DoubleSide,
    vertexShader,
    fragmentShader,
    uniforms: { uC0: { value: toVec3(hexToRgb(pillarLight.core.色)) }, uC1: { value: toVec3(hexToRgb(pillarLight.里.色)) }, uC2: { value: toVec3(hexToRgb(pillarLight.halo.色)) } },
  });

// ---------- 时刻 ----------
const cueSecs = () => ({ circleStartSec: songSec(eventFrame('magicCircleUp')), 起: songSec(eventFrame('beamRises')), 拨: songSec(eventFrame('beamHitsCloud')), cloudBreakSec: songSec(eventFrame('cloudBreaks')), 退: songSec(eventFrame('beamFades')) });
/** t0 起按 τ 秒衰减的一下（t0 之前 0） */
const decay = (t: number, t0: number, τ: number) => (t < t0 ? 0 : Math.exp(-(t - t0) / τ));
/** 拨 到 破云 顶着云越憋越粗越亮（进度平方），破云 那一下交给 涌.破云 */
const charge = (t: number, s: ReturnType<typeof cueSecs>) => (t >= s.拨 && t < s.cloudBreakSec ? ((t - s.拨) / (s.cloudBreakSec - s.拨)) ** 2 : 0);
const surge = (t: number, s: ReturnType<typeof cueSecs>, partKey: '粗' | '亮') =>
  pillarLight.surge.起[partKey] * decay(t, s.起, pillarLight.surge.起.秒) + pillarLight.surge.拨[partKey] * decay(t, s.拨, pillarLight.surge.拨.秒) + pillarLight.surge.charge[partKey] * charge(t, s) + pillarLight.surge.cloudBreak[partKey] * decay(t, s.cloudBreakSec, pillarLight.surge.cloudBreak.秒);

// ---------- 光点、符文（glitter / sga 原版粒子贴图） ----------
const atlasImg = vanillaParticleAtlas;
const glitterUv = (i: number) => atlasImg.uv[`glitter_${Math.max(0, Math.min(7, Math.floor(i)))}`]!;
const runes = 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => atlasImg.uv[`sga_${c}`]!);
const particleColor = (k: number, whiteAmt: number): RGB3 => {
  const [a, b] = [hexToRgb(pillarLight.里.色), hexToRgb(pillarLight.halo.色)];
  return [0, 1, 2].map((j) => (b[j]! + (a[j]! - b[j]!) * whiteAmt) * k) as RGB3;
};
type FloatPoint = { 角: number; radius: number; 速: number; 转: number; lifetime: number; gap: number; offset: number; 高: number; 大: number; 种: number };
const floatPoints: FloatPoint[] = (() => {
  const r = mulberry32(7301);
  return Array.from({ length: pillarLight.lightDot.数 }, () => ({
    角: r() * Math.PI * 2,
    radius: 0.2 + r() * 0.95,
    速: 2.5 + r() * 6,
    转: (r() < 0.5 ? -1 : 1) * (1.2 + r() * 2.4),
    lifetime: 0.5 + r() * 0.7,
    gap: r() * 0.35,
    offset: r() * 1.0,
    高: (r() - 0.35) * 1.4,
    大: pillarLight.lightDot.radiusRange[0] + r() * (pillarLight.lightDot.radiusRange[1] - pillarLight.lightDot.radiusRange[0]),
    种: r(),
  }));
})();
type Spark = { dir: V3; 速: number; lifetime: number; 大: number; 高: number; delay: number; 种: number };
const buildBursts = (seed: number, count: number, vertRange: number): Spark[] => {
  const r = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const angle = r() * Math.PI * 2;
    const elevation = (r() - 0.25) * vertRange;
    return {
      dir: [Math.cos(angle) * Math.cos(elevation), Math.sin(angle) * Math.cos(elevation), Math.sin(elevation)] as V3,
      速: 3 + r() * 5,
      lifetime: 0.35 + r() * 0.4,
      大: pillarLight.lightDot.radiusRange[0] + r() * (pillarLight.lightDot.radiusRange[1] - pillarLight.lightDot.radiusRange[0]),
      高: r(),
      delay: r() * 0.06,
      种: r(),
    };
  });
};
const startSparks = buildBursts(911, 22, 1.2);
const breakSparks = buildBursts(912, 28, 1.4);
const scatterSparks = buildBursts(913, 70, 0.9);
const runeStates = (() => {
  const r = mulberry32(5507);
  return Array.from({ length: pillarLight.rune.数 }, () => ({ 角: r() * Math.PI * 2, lifetime: 0.8 + r() * 0.5, gap: r() * 0.3, timeOffset: r() * 0.9, 字: Math.floor(r() * 26), brightness: 0.6 + r() * 0.4, 弯: (r() - 0.5) * 1.6 }));
})();
/** 带阻力飞出去走了多远：速度按 e^(−k t) 减 */
const dampedTravel = (v: number, t: number, k = 4) => (v * (1 - Math.exp(-k * t))) / k;

const makeParticles = (bottom: V3, t: number, s: ReturnType<typeof cueSecs>, alpha: number, circleSizeNow: number): Particle[] => {
  const out: Particle[] = [];
  const tick = Math.floor(t * 20);
  // 绕着往上飘的：光柱起 起一颗颗冒（同一颗按 命 + 隔 循环），光柱退 以后不再冒
  for (const [i, p] of floatPoints.entries()) {
    const elapsed = t - s.起 - p.offset;
    if (elapsed < 0) continue;
    const cycle = p.lifetime + p.gap;
    const k = Math.floor(elapsed / cycle);
    const age = elapsed - k * cycle;
    if (age > p.lifetime || t - age > s.退) continue;
    const u = age / p.lifetime;
    // 原版烟花火花那样后半段一闪一闪（按游戏刻）
    if (u > 0.55 && (tick + i) % 3 === 0) continue;
    const angle = p.角 + k * 2.39996 + p.转 * age;
    const radius = p.radius * (1 + 0.5 * age);
    out.push({
      p: [bottom[0] + Math.cos(angle) * radius, bottom[1] + Math.sin(angle) * radius, bottom[2] + p.高 + p.速 * age + 2.5 * age * age],
      half: p.大,
      uv: glitterUv(7.99 - u * 8),
      color: particleColor(1.1, p.种),
      alpha: u > 0.75 ? (1 - u) / 0.25 : 1,
    });
  }
  // 起柱、破云从手上迸出去的，退的时候顺着柱子散开的
  const spawnBurst = (bursts: Spark[], t0: number, posOf: (b: Spark) => V3, vertSpeed: number) => {
    for (const b of bursts) {
      const age = t - t0 - b.delay;
      if (age < 0 || age > b.lifetime) continue;
      const u = age / b.lifetime;
      const travel = dampedTravel(b.速, age);
      const o = posOf(b);
      out.push({
        p: [o[0] + b.dir[0] * travel, o[1] + b.dir[1] * travel, o[2] + b.dir[2] * travel + vertSpeed * age],
        half: b.大,
        uv: glitterUv(7.99 - u * 8),
        color: particleColor(1.15, b.种),
        alpha: u > 0.6 ? (1 - u) / 0.4 : 1,
      });
    }
  };
  spawnBurst(startSparks, s.起, () => bottom, 0);
  spawnBurst(breakSparks, s.cloudBreakSec, () => bottom, 0.8);
  spawnBurst(scatterSparks, s.退, (b) => [bottom[0] + b.dir[0] * 0.1, bottom[1] + b.dir[1] * 0.1, bottom[2] + b.高 * 34], 1.2);
  // 阵边的符文往手上飞（附魔台那样：直线过去、带点弯），阵起 起，光柱退 以后不再冒
  if (circleSizeNow > 0) {
    const R = magicCircleRadius * 0.95 * circleSizeNow;
    for (const g of runeStates) {
      const elapsed = t - s.circleStartSec - g.timeOffset;
      if (elapsed < 0) continue;
      const cycle = g.lifetime + g.gap;
      const k = Math.floor(elapsed / cycle);
      const age = elapsed - k * cycle;
      if (age > g.lifetime || t - age > s.退) continue;
      const u = age / g.lifetime;
      const angle = g.角 + k * 2.39996;
      const e = u * u * (3 - 2 * u);
      const bend = Math.sin(Math.PI * u) * g.弯;
      const [ox, oy] = [Math.cos(angle) * R, Math.sin(angle) * R];
      out.push({
        p: [bottom[0] + ox * (1 - e) - oy * 0.25 * bend, bottom[1] + oy * (1 - e) + ox * 0.25 * bend, 0.15 + (bottom[2] - 0.15) * e + 0.6 * Math.sin(Math.PI * u)],
        half: pillarLight.rune.halfSize,
        uv: runes[(g.字 + k * 7) % 26]!,
        color: particleColor(g.brightness, 0.6),
        alpha: Math.min(1, u * 5) * alpha,
      });
    }
  }
  return out;
};

/** 光柱：底 = 柱底中心（她举着的手上面），顶 = 头的 z（光柱顶），透 = 不透明度（光柱透），帧 = 歌曲帧 */
export const LightPillar: React.FC<{ bottom: V3; topY: number; alpha: number; 帧: number }> = ({ bottom, topY, alpha, 帧: frame }) => {
  const bodyMaterial = useMemo(newBodyMaterial, []);
  const starMesh = useMemo(() => ({ g: squareGeometry(8), m: newQuadMaterial(starVert, starFragmentShader) }), []);
  const ring = useMemo(() => ({ g: squareGeometry(32), m: newQuadMaterial(ringVert, ringFragmentShader) }), []);
  useEffect(
    () => () => {
      bodyMaterial.dispose();
      for (const x of [starMesh, ring]) {
        x.g.dispose();
        x.m.dispose();
      }
    },
    [bodyMaterial, starMesh, ring],
  );
  const t = songSec(frame);
  const s = cueSecs();
  const circleSizeNow = circleSize(frame);
  const fadeAmount = 1 - alpha;
  const hasPillar = topY > bottom[2] && alpha > 0;

  // 柱身
  const thickScale = (0.55 + 0.45 * easeOutQuad((t - s.起) / pillarLight.swellSec)) * (1 + surge(t, s, '粗')) * (1 + 0.04 * Math.sin(2 * Math.PI * 9 * t)) * (1 - 0.85 * fadeAmount);
  const u = bodyMaterial.uniforms;
  u.uH!.value = topY - bottom[2];
  u.uR!.value = pillarLight.halo.haloRadius * 1.8;
  u.uT!.value = t;
  u.uW!.value = thickScale;
  u.uB!.value = 1 + surge(t, s, '亮') + 0.05 * Math.sin(2 * Math.PI * 7 * t);
  u.uA!.value = Math.min(1, alpha * 1.6);
  u.uDis!.value = fadeAmount ** 0.7;
  u.uHead!.value = t < s.拨 ? 1 : 0;

  // 手上的星、冲出去的光圈（朝镜头）
  const starList: [number[], number[]][] = [];
  if (circleSizeNow > 0 && alpha > 0) {
    const starCharge = t < s.起 ? easeOutQuad((t - s.circleStartSec) / 0.4) * pillarLight.starBurst.starCharge * (1 + 0.15 * Math.sin(2 * Math.PI * 5 * t)) : 0;
    const flash = t >= s.起 ? pillarLight.starBurst.armLen * (1 + 0.08 * Math.sin(2 * Math.PI * 6 * t)) + pillarLight.starBurst.flash[0] * decay(t, s.起, 0.12) + pillarLight.starBurst.flash[1] * decay(t, s.cloudBreakSec, 0.12) : 0;
    const L = (starCharge + flash) * (1 - fadeAmount);
    if (L > 0.05) starList.push([[...bottom, L], [0, 0, pillarLight.starBurst.core * Math.min(1, L / 0.4), 1]]);
  }
  for (const [t0, magnitude] of [[s.起, 1], [s.起 + 0.07, 0.65], [s.cloudBreakSec, 1.2], [s.cloudBreakSec + 0.07, 0.8]] as const) {
    const p = (t - t0) / pillarLight.impact.手.秒;
    if (p < 0 || p >= 1) continue;
    const R = 0.25 + (pillarLight.impact.手.endRadius * magnitude - 0.25) * easeOutQuad(p);
    starList.push([[...bottom, R + 0.2], [1, R, 0.14 - 0.1 * p, (1 - p) ** 1.5]]);
  }
  fillInstances(starMesh.g, starList);

  // 平躺的圈：地上扫过的、柱上往上走的
  const rings: [number[], number[]][] = [];
  for (const t0 of [s.起, s.cloudBreakSec]) {
    const p = (t - t0) / pillarLight.impact.ground.秒;
    if (p < 0 || p >= 1) continue;
    const R = 1 + (pillarLight.impact.ground.endRadius - 1) * easeOutQuad(p);
    rings.push([[bottom[0], bottom[1], 0.06, R + 0.3], [R, 0.35 - 0.25 * p, 0.75 * (1 - p) ** 2, 1]]);
  }
  if (hasPillar) {
    const { gapSec, 速: speed, radiusRange, fadeHeight } = pillarLight.ring;
    for (let k = Math.floor((t - s.起 - 0.08) / gapSec); k >= 0; k--) {
      const t0 = s.起 + 0.08 + k * gapSec;
      if (t0 > s.退) continue;
      const z = bottom[2] + 0.2 + speed * (t - t0);
      if (z > fadeHeight || rings.length >= 30) break;
      if (z > topY) continue;
      const R = (radiusRange[0] + (radiusRange[1] - radiusRange[0]) * ((z - bottom[2]) / (fadeHeight - bottom[2]))) * thickScale;
      rings.push([[bottom[0], bottom[1], z, R + 0.1], [R, 1.5 / 16, 0.5 * (1 - z / fadeHeight) * Math.min(1, alpha * 1.6), 1.1]]);
    }
  }
  fillInstances(ring.g, rings);

  const particles = useMemo(() => makeParticles(bottom, t, s, alpha, circleSizeNow), [bottom[0], bottom[1], bottom[2], t, alpha, circleSizeNow]);
  return (
    <>
      {hasPillar && <mesh position={bottom} geometry={bodyGeometry} material={bodyMaterial} frustumCulled={false} renderOrder={12} />}
      <mesh geometry={ring.g} material={ring.m} frustumCulled={false} renderOrder={13} />
      <mesh geometry={starMesh.g} material={starMesh.m} frustumCulled={false} renderOrder={14} />
      <group renderOrder={15}>
        <ParticleQuads tex={atlasImg.tex} items={particles} translucent depthWrite={false} />
      </group>
    </>
  );
};

// ---------- 地光：阵底下两层同心圆片（圆边按贴图像素走成阶梯），普通半透明叠 ----------
const pixelSize = 1 / 16;
const circleGeoms = new Map<number, { g: THREE.PlaneGeometry; tex: THREE.DataTexture }>();
/** 半径 r（取到贴图像素）的圆片：格子中心在圆里就满、不在就空，最近邻采样 */
const circle = (r: number) => {
  const n = Math.max(1, Math.round(r / pixelSize));
  let c = circleGeoms.get(n);
  if (!c) {
    const side = 2 * n;
    const data = new Uint8Array(side * side * 4);
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) data.set([255, 255, 255, (i + 0.5 - n) ** 2 + (j + 0.5 - n) ** 2 <= n * n ? 255 : 0], (j * side + i) * 4);
    const tex = new THREE.DataTexture(data, side, side, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    circleGeoms.set(n, (c = { g: new THREE.PlaneGeometry(side * pixelSize, side * pixelSize), tex }));
  }
  return c;
};
export const GroundGlow: React.FC<{ 心: V3; 大小: number }> = ({ 心: center, 大小: size }) => {
  const { 色: color, radiusList, 强: groundStrengths } = params.magicCircle.groundGlow;
  if (size <= 0) return null;
  return (
    <group position={center}>
      {radiusList.map((k, i) => {
        const c = circle(magicCircleRadius * k * size);
        return (
          <mesh key={i} geometry={c.g} position={[0, 0, i * 0.002]} renderOrder={4}>
            <meshBasicMaterial color={color} map={c.tex} transparent opacity={groundStrengths[i]} depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
        );
      })}
    </group>
  );
};
