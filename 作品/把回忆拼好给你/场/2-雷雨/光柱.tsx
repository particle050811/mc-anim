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
import { easeOutQuad as 缓出 } from '@engine/core/数学.ts';
import { rng, type V3 } from '@engine/model/parts.tsx';
import { type Particle, ParticleQuads } from '@库/特效/粒子面片.tsx';
import { vanillaParticleAtlas } from '@库/特效/原版粒子.tsx';
import * as 参 from './参数.ts';
import { 事, 歌秒, 阵大小 } from './编排.ts';
import { 魔法阵半径 } from './酒狐件.tsx';

const 柱 = 参.光柱;
type RGB3 = [number, number, number];
/** 十六进制色 → sRGB 数值（自己写的着色器不过 colorspace_fragment，直接写进按 sRGB 存的主画面） */
const 拆 = (hex: string): RGB3 => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB3;
const 向 = (c: RGB3) => new THREE.Vector3(...c);

const 叠法 = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
} as const;

const 公用 = /* glsl */ `
const float PX = 1.0 / 16.0;
float hash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}
`;

// ---------- 柱身：一条始终朝镜头的竖条（绕柱轴转），片元按离轴多远画几圈光 ----------
const 身顶点 = /* glsl */ `
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
const 身片元 = /* glsl */ `
${公用}
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

const 身geo = (() => {
  const 段 = 16;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= 段; j++) pos.push(-1, j / 段, 0, 1, j / 段, 0);
  for (let j = 0; j < 段; j++) idx.push(2 * j, 2 * j + 1, 2 * j + 3, 2 * j, 2 * j + 3, 2 * j + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
})();

const 新身材质 = () =>
  new THREE.ShaderMaterial({
    ...叠法,
    side: THREE.DoubleSide,
    vertexShader: 身顶点,
    fragmentShader: 身片元,
    uniforms: {
      uH: { value: 1 },
      uR: { value: 1 },
      uT: { value: 0 },
      uW: { value: 1 },
      uB: { value: 1 },
      uA: { value: 1 },
      uDis: { value: 0 },
      uHead: { value: 0 },
      uR3: { value: new THREE.Vector3(柱.芯.半, 柱.里.半, 柱.晕.半) },
      uC0: { value: 向(拆(柱.芯.色)) },
      uC1: { value: 向(拆(柱.里.色)) },
      uC2: { value: 向(拆(柱.晕.色)) },
      uE: { value: new THREE.Vector2(柱.芯.亮, 柱.里.亮) },
      uA2: { value: new THREE.Vector2(...柱.晕.透) },
      uSt: { value: new THREE.Vector4(柱.流.速[0], 柱.流.速[1], 柱.流.长[0], 柱.流.长[1]) },
      uDuty: { value: 柱.流.占 },
      uSp: { value: new THREE.Vector4(柱.旋.半, 柱.旋.圈高, 柱.旋.每秒圈, 柱.旋.宽) },
      uSpN: { value: 柱.旋.股 },
    },
  });

// ---------- 方片：一批实例化的方片，A、B 两个 vec4 属性 ----------
const 方片geo = (n: number) => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('pA', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute('pB', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
  return g;
};
const 填 = (g: THREE.InstancedBufferGeometry, 们: readonly (readonly [number[], number[]])[]) => {
  const A = g.getAttribute('pA') as THREE.InstancedBufferAttribute;
  const B = g.getAttribute('pB') as THREE.InstancedBufferAttribute;
  们.forEach(([a, b], i) => {
    A.setXYZW(i, a[0]!, a[1]!, a[2]!, a[3]!);
    B.setXYZW(i, b[0]!, b[1]!, b[2]!, b[3]!);
  });
  A.needsUpdate = B.needsUpdate = true;
  g.instanceCount = 们.length;
};

// 朝镜头的方片：pA = 心（场景坐标）、半边长；pB = 种（0 像素星、1 光圈）、两个参数、不透明度
const 星顶点 = /* glsl */ `
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
const 星片元 = /* glsl */ `
${公用}
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
const 环顶点 = /* glsl */ `
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
const 环片元 = /* glsl */ `
${公用}
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

const 新方片材质 = (vertexShader: string, fragmentShader: string) =>
  new THREE.ShaderMaterial({
    ...叠法,
    side: THREE.DoubleSide,
    vertexShader,
    fragmentShader,
    uniforms: { uC0: { value: 向(拆(柱.芯.色)) }, uC1: { value: 向(拆(柱.里.色)) }, uC2: { value: 向(拆(柱.晕.色)) } },
  });

// ---------- 时刻 ----------
const 秒们 = () => ({ 阵: 歌秒(事('阵起')), 起: 歌秒(事('光柱起')), 拨: 歌秒(事('拨')), 破: 歌秒(事('破云')), 退: 歌秒(事('光柱退')) });
/** t0 起按 τ 秒衰减的一下（t0 之前 0） */
const 衰 = (t: number, t0: number, τ: number) => (t < t0 ? 0 : Math.exp(-(t - t0) / τ));
const 涌 = (t: number, s: ReturnType<typeof 秒们>, 键: '粗' | '亮') =>
  柱.涌.起[键] * 衰(t, s.起, 柱.涌.起.秒) + 柱.涌.拨[键] * 衰(t, s.拨, 柱.涌.拨.秒) + 柱.涌.破云[键] * 衰(t, s.破, 柱.涌.破云.秒);

// ---------- 光点、符文（glitter / sga 原版粒子贴图） ----------
const 图 = vanillaParticleAtlas;
const 闪光 = (i: number) => 图.uv[`glitter_${Math.max(0, Math.min(7, Math.floor(i)))}`]!;
const 符文们 = 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => 图.uv[`sga_${c}`]!);
const 点色 = (k: number, 白: number): RGB3 => {
  const [a, b] = [拆(柱.里.色), 拆(柱.晕.色)];
  return [0, 1, 2].map((j) => (b[j]! + (a[j]! - b[j]!) * 白) * k) as RGB3;
};
type 飘 = { 角: number; 半: number; 速: number; 转: number; 命: number; 隔: number; 偏: number; 高: number; 大: number; 种: number };
const 飘点们: 飘[] = (() => {
  const r = rng(7301);
  return Array.from({ length: 柱.光点.数 }, () => ({
    角: r() * Math.PI * 2,
    半: 0.2 + r() * 0.95,
    速: 2.5 + r() * 6,
    转: (r() < 0.5 ? -1 : 1) * (1.2 + r() * 2.4),
    命: 0.5 + r() * 0.7,
    隔: r() * 0.35,
    偏: r() * 1.0,
    高: (r() - 0.35) * 1.4,
    大: 柱.光点.半[0] + r() * (柱.光点.半[1] - 柱.光点.半[0]),
    种: r(),
  }));
})();
type 迸 = { 向: V3; 速: number; 命: number; 大: number; 高: number; 迟: number; 种: number };
const 迸们 = (种子: number, 数: number, 竖: number): 迸[] => {
  const r = rng(种子);
  return Array.from({ length: 数 }, () => {
    const 角 = r() * Math.PI * 2;
    const 仰 = (r() - 0.25) * 竖;
    return {
      向: [Math.cos(角) * Math.cos(仰), Math.sin(角) * Math.cos(仰), Math.sin(仰)] as V3,
      速: 3 + r() * 5,
      命: 0.35 + r() * 0.4,
      大: 柱.光点.半[0] + r() * (柱.光点.半[1] - 柱.光点.半[0]),
      高: r(),
      迟: r() * 0.06,
      种: r(),
    };
  });
};
const 起迸 = 迸们(911, 22, 1.2);
const 破迸 = 迸们(912, 28, 1.4);
const 散迸 = 迸们(913, 70, 0.9);
const 符文态 = (() => {
  const r = rng(5507);
  return Array.from({ length: 柱.符文.数 }, () => ({ 角: r() * Math.PI * 2, 命: 0.8 + r() * 0.5, 隔: r() * 0.3, 偏: r() * 0.9, 字: Math.floor(r() * 26), 亮: 0.6 + r() * 0.4, 弯: (r() - 0.5) * 1.6 }));
})();
/** 带阻力飞出去走了多远：速度按 e^(−k t) 减 */
const 飞 = (v: number, t: number, k = 4) => (v * (1 - Math.exp(-k * t))) / k;

const 点们 = (底: V3, t: number, s: ReturnType<typeof 秒们>, 透: number, 阵: number): Particle[] => {
  const out: Particle[] = [];
  const 刻 = Math.floor(t * 20);
  // 绕着往上飘的：光柱起 起一颗颗冒（同一颗按 命 + 隔 循环），光柱退 以后不再冒
  for (const [i, p] of 飘点们.entries()) {
    const 已 = t - s.起 - p.偏;
    if (已 < 0) continue;
    const 周 = p.命 + p.隔;
    const k = Math.floor(已 / 周);
    const 龄 = 已 - k * 周;
    if (龄 > p.命 || t - 龄 > s.退) continue;
    const u = 龄 / p.命;
    // 原版烟花火花那样后半段一闪一闪（按游戏刻）
    if (u > 0.55 && (刻 + i) % 3 === 0) continue;
    const 角 = p.角 + k * 2.39996 + p.转 * 龄;
    const 半 = p.半 * (1 + 0.5 * 龄);
    out.push({
      p: [底[0] + Math.cos(角) * 半, 底[1] + Math.sin(角) * 半, 底[2] + p.高 + p.速 * 龄 + 2.5 * 龄 * 龄],
      half: p.大,
      uv: 闪光(7.99 - u * 8),
      color: 点色(1.1, p.种),
      alpha: u > 0.75 ? (1 - u) / 0.25 : 1,
    });
  }
  // 起柱、破云从手上迸出去的，退的时候顺着柱子散开的
  const 迸点 = (们: 迸[], t0: number, 在: (b: 迸) => V3, 竖速: number) => {
    for (const b of 们) {
      const 龄 = t - t0 - b.迟;
      if (龄 < 0 || 龄 > b.命) continue;
      const u = 龄 / b.命;
      const 走 = 飞(b.速, 龄);
      const o = 在(b);
      out.push({
        p: [o[0] + b.向[0] * 走, o[1] + b.向[1] * 走, o[2] + b.向[2] * 走 + 竖速 * 龄],
        half: b.大,
        uv: 闪光(7.99 - u * 8),
        color: 点色(1.15, b.种),
        alpha: u > 0.6 ? (1 - u) / 0.4 : 1,
      });
    }
  };
  迸点(起迸, s.起, () => 底, 0);
  迸点(破迸, s.破, () => 底, 0.8);
  迸点(散迸, s.退, (b) => [底[0] + b.向[0] * 0.1, 底[1] + b.向[1] * 0.1, 底[2] + b.高 * 34], 1.2);
  // 阵边的符文往手上飞（附魔台那样：直线过去、带点弯），阵起 起，光柱退 以后不再冒
  if (阵 > 0) {
    const R = 魔法阵半径 * 0.95 * 阵;
    for (const g of 符文态) {
      const 已 = t - s.阵 - g.偏;
      if (已 < 0) continue;
      const 周 = g.命 + g.隔;
      const k = Math.floor(已 / 周);
      const 龄 = 已 - k * 周;
      if (龄 > g.命 || t - 龄 > s.退) continue;
      const u = 龄 / g.命;
      const 角 = g.角 + k * 2.39996;
      const e = u * u * (3 - 2 * u);
      const 弯 = Math.sin(Math.PI * u) * g.弯;
      const [ox, oy] = [Math.cos(角) * R, Math.sin(角) * R];
      out.push({
        p: [底[0] + ox * (1 - e) - oy * 0.25 * 弯, 底[1] + oy * (1 - e) + ox * 0.25 * 弯, 0.15 + (底[2] - 0.15) * e + 0.6 * Math.sin(Math.PI * u)],
        half: 柱.符文.半,
        uv: 符文们[(g.字 + k * 7) % 26]!,
        color: 点色(g.亮, 0.6),
        alpha: Math.min(1, u * 5) * 透,
      });
    }
  }
  return out;
};

/** 光柱：底 = 柱底中心（她举着的手上面），顶 = 头的 z（光柱顶），透 = 不透明度（光柱透），帧 = 歌曲帧 */
export const 光柱件: React.FC<{ 底: V3; 顶: number; 透: number; 帧: number }> = ({ 底, 顶, 透, 帧 }) => {
  const 身mat = useMemo(新身材质, []);
  const 星 = useMemo(() => ({ g: 方片geo(8), m: 新方片材质(星顶点, 星片元) }), []);
  const 环 = useMemo(() => ({ g: 方片geo(32), m: 新方片材质(环顶点, 环片元) }), []);
  useEffect(
    () => () => {
      身mat.dispose();
      for (const x of [星, 环]) {
        x.g.dispose();
        x.m.dispose();
      }
    },
    [身mat, 星, 环],
  );
  const t = 歌秒(帧);
  const s = 秒们();
  const 阵 = 阵大小(帧);
  const 退 = 1 - 透;
  const 有柱 = 顶 > 底[2] && 透 > 0;

  // 柱身
  const 粗 = (0.55 + 0.45 * 缓出((t - s.起) / 柱.胀秒)) * (1 + 涌(t, s, '粗')) * (1 + 0.04 * Math.sin(2 * Math.PI * 9 * t)) * (1 - 0.85 * 退);
  const u = 身mat.uniforms;
  u.uH!.value = 顶 - 底[2];
  u.uR!.value = 柱.晕.半 * 1.8;
  u.uT!.value = t;
  u.uW!.value = 粗;
  u.uB!.value = 1 + 涌(t, s, '亮') + 0.05 * Math.sin(2 * Math.PI * 7 * t);
  u.uA!.value = Math.min(1, 透 * 1.6);
  u.uDis!.value = 退 ** 0.7;
  u.uHead!.value = t < s.拨 ? 1 : 0;

  // 手上的星、冲出去的光圈（朝镜头）
  const 星们: [number[], number[]][] = [];
  if (阵 > 0 && 透 > 0) {
    const 蓄 = t < s.起 ? 缓出((t - s.阵) / 0.4) * 柱.星.蓄 * (1 + 0.15 * Math.sin(2 * Math.PI * 5 * t)) : 0;
    const 放 = t >= s.起 ? 柱.星.臂 * (1 + 0.08 * Math.sin(2 * Math.PI * 6 * t)) + 柱.星.闪[0] * 衰(t, s.起, 0.12) + 柱.星.闪[1] * 衰(t, s.破, 0.12) : 0;
    const L = (蓄 + 放) * (1 - 退);
    if (L > 0.05) 星们.push([[...底, L], [0, 0, 柱.星.芯 * Math.min(1, L / 0.4), 1]]);
  }
  for (const [t0, 大] of [[s.起, 1], [s.起 + 0.07, 0.65], [s.破, 1.2], [s.破 + 0.07, 0.8]] as const) {
    const p = (t - t0) / 柱.冲击.手.秒;
    if (p < 0 || p >= 1) continue;
    const R = 0.25 + (柱.冲击.手.半 * 大 - 0.25) * 缓出(p);
    星们.push([[...底, R + 0.2], [1, R, 0.14 - 0.1 * p, (1 - p) ** 1.5]]);
  }
  填(星.g, 星们);

  // 平躺的圈：地上扫过的、柱上往上走的
  const 环们: [number[], number[]][] = [];
  for (const t0 of [s.起, s.破]) {
    const p = (t - t0) / 柱.冲击.地.秒;
    if (p < 0 || p >= 1) continue;
    const R = 1 + (柱.冲击.地.半 - 1) * 缓出(p);
    环们.push([[底[0], 底[1], 0.06, R + 0.3], [R, 0.35 - 0.25 * p, 0.75 * (1 - p) ** 2, 1]]);
  }
  if (有柱) {
    const { 隔秒, 速, 半, 淡高 } = 柱.环;
    for (let k = Math.floor((t - s.起 - 0.08) / 隔秒); k >= 0; k--) {
      const t0 = s.起 + 0.08 + k * 隔秒;
      if (t0 > s.退) continue;
      const z = 底[2] + 0.2 + 速 * (t - t0);
      if (z > 淡高 || 环们.length >= 30) break;
      if (z > 顶) continue;
      const R = (半[0] + (半[1] - 半[0]) * ((z - 底[2]) / (淡高 - 底[2]))) * 粗;
      环们.push([[底[0], 底[1], z, R + 0.1], [R, 1.5 / 16, 0.5 * (1 - z / 淡高) * Math.min(1, 透 * 1.6), 1.1]]);
    }
  }
  填(环.g, 环们);

  const 点 = useMemo(() => 点们(底, t, s, 透, 阵), [底[0], 底[1], 底[2], t, 透, 阵]);
  return (
    <>
      {有柱 && <mesh position={底} geometry={身geo} material={身mat} frustumCulled={false} renderOrder={12} />}
      <mesh geometry={环.g} material={环.m} frustumCulled={false} renderOrder={13} />
      <mesh geometry={星.g} material={星.m} frustumCulled={false} renderOrder={14} />
      <group renderOrder={15}>
        <ParticleQuads tex={图.tex} items={点} translucent depthWrite={false} />
      </group>
    </>
  );
};

// ---------- 地光：阵底下两层同心圆片（圆边按贴图像素走成阶梯），普通半透明叠 ----------
const 像素 = 1 / 16;
const 圆们 = new Map<number, { g: THREE.PlaneGeometry; tex: THREE.DataTexture }>();
/** 半径 r（取到贴图像素）的圆片：格子中心在圆里就满、不在就空，最近邻采样 */
const 圆 = (r: number) => {
  const n = Math.max(1, Math.round(r / 像素));
  let c = 圆们.get(n);
  if (!c) {
    const 边 = 2 * n;
    const data = new Uint8Array(边 * 边 * 4);
    for (let j = 0; j < 边; j++) for (let i = 0; i < 边; i++) data.set([255, 255, 255, (i + 0.5 - n) ** 2 + (j + 0.5 - n) ** 2 <= n * n ? 255 : 0], (j * 边 + i) * 4);
    const tex = new THREE.DataTexture(data, 边, 边, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    圆们.set(n, (c = { g: new THREE.PlaneGeometry(边 * 像素, 边 * 像素), tex }));
  }
  return c;
};
export const 地光: React.FC<{ 心: V3; 大小: number }> = ({ 心, 大小 }) => {
  const { 色, 半径, 强 } = 参.魔法阵.地光;
  if (大小 <= 0) return null;
  return (
    <group position={心}>
      {半径.map((k, i) => {
        const c = 圆(魔法阵半径 * k * 大小);
        return (
          <mesh key={i} geometry={c.g} position={[0, 0, i * 0.002]} renderOrder={4}>
            <meshBasicMaterial color={色} map={c.tex} transparent opacity={强[i]} depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
        );
      })}
    </group>
  );
};
