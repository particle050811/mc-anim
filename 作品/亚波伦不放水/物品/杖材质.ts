// 细做的下界魔杖用的材质（物品/下界魔杖细做.tsx）：照 库/物品/拔刀剑.tsx 的路子，金属和黑亮的料靠杖自带的反射环境出高光（场景里没有环境贴图，
// 不带的话金属是一片黑），只作用在杖上，不影响场景里别的东西。拔刀剑的 KA_ENV 是照刀身那片高光专门摆的（柔光箱顺刀轴），没导出，这里另写一份简单的：
//   天地渐变（按世界上下）＋ 机位身后偏左上的一块柔光箱（圆杆上一道竖的高光）＋ 背后两侧的轮廓光（反射方向背着机位时亮：黑杆的两条边各一道亮线，
//   压在黑红衣服和暗红背景上分得开；反射方向朝天、朝地的不算，免得朝上的平面整片发白）。颜色是定死的暖白，不跟场景的灯换算（正片要跟场景走时再接）。
// 另外三样：芯的光照到杖自己身上（笼条朝里那面被照成橙色，是着色器里的一盏点光，只照杖）；铁的锻痕（按物体坐标的噪声掰法线、抖粗糙度）；
// 杖在画面里小的时候抬粗糙度下限，细条上的高光不闪（同拔刀剑的 KA_ROUGH）。
import * as THREE from 'three';

export type 料名 = '黑曜' | '铁' | '金' | '暗金';
type 料 = {
  金属: number;
  粗糙: number;
  /** 反射天、地、柔光箱、轮廓光各乘几 */
  天: number;
  地: number;
  箱: number;
  轮廓: number;
  /** 锻痕：法线掰多少（0 = 不掰）、噪声每像素几格 */
  锻?: readonly [number, number];
  /** 颜色、粗糙度按噪声抖多少 */
  斑?: number;
};
const 料表: Record<料名, 料> = {
  // 黑曜：抛光的黑石。不算金属，但给一点金属度，反射才够亮
  黑曜: { 金属: 0.45, 粗糙: 0.14, 天: 1.1, 地: 0.5, 箱: 1.6, 轮廓: 1.7, 斑: 0.08 },
  // 铁：锻出来的黑铁，半哑
  铁: { 金属: 0.95, 粗糙: 0.36, 天: 1, 地: 0.6, 箱: 1.2, 轮廓: 0.75, 锻: [0.07, 1.7], 斑: 0.12 },
  金: { 金属: 1, 粗糙: 0.2, 天: 1.35, 地: 0.28, 箱: 1.5, 轮廓: 1.0, 斑: 0.05 },
  // 暗金：做旧的金，凹处、底托用
  暗金: { 金属: 1, 粗糙: 0.34, 天: 1.0, 地: 0.3, 箱: 0.8, 轮廓: 0.8, 锻: [0.05, 2.2], 斑: 0.1 },
};

const 环境 = {
  天: '#c9c4c2',
  地: '#4a4444',
  箱: 2.6, // 柔光箱亮度（线性）
  箱色: '#fff4e6',
  箱向: [-0.36, 0.42, 0.83] as const, // 视空间：机位身后偏左上
  箱宽: 0.035, // 1 − cos 半角
  轮廓: 1.5,
  轮廓色: '#ffe2d0',
};

const 三 = (c: string) => {
  const t = new THREE.Color(c);
  return `vec3(${t.r.toFixed(4)}, ${t.g.toFixed(4)}, ${t.b.toFixed(4)})`;
};
const 数 = (v: readonly number[]) => `vec${v.length}(${v.map((x) => x.toFixed(4)).join(', ')})`;

const 公共 = /* glsl */ `
#define ZH_SKY ${三(环境.天)}
#define ZH_GROUND ${三(环境.地)}
#define ZH_KEY (${三(环境.箱色)} * ${环境.箱.toFixed(3)})
#define ZH_BOX_DIR normalize(${数(环境.箱向)})
#define ZH_BOX_W ${环境.箱宽.toFixed(4)}
#define ZH_RIM (${三(环境.轮廓色)} * ${环境.轮廓.toFixed(3)})
uniform vec4 zhCls;
uniform vec4 zhGlow;
uniform vec3 zhFx;
varying float vZhUnit;
varying vec3 vZhPos;
varying vec3 vZhGlowPos;
float zhHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float zhNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(zhHash(i), zhHash(i + vec3(1, 0, 0)), f.x), mix(zhHash(i + vec3(0, 1, 0)), zhHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(zhHash(i + vec3(0, 0, 1)), zhHash(i + vec3(1, 0, 1)), f.x), mix(zhHash(i + vec3(0, 1, 1)), zhHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float zhFbm(vec3 p) { return 0.6 * zhNoise(p) + 0.3 * zhNoise(p * 2.03 + 7.1) + 0.1 * zhNoise(p * 4.1 + 3.7); }
// 一个屏幕像素盖住几个杖像素：越大说明杖在画面里越小，细节（锻痕、斑）要淡出
float zhFoot() { return length(fwidth(vViewPosition)) / vZhUnit; }
vec3 zhEnv(vec3 rv, float rough) {
  vec3 rw = inverseTransformDirection(rv, viewMatrix);
  float a = rough * rough;
  vec3 col = mix(ZH_GROUND * zhCls.y, ZH_SKY * zhCls.x, smoothstep(-0.35 - a, 0.55 + a, rw.y));
  float w = ZH_BOX_W + 1.2 * a;
  float c = 1.0 - dot(rv, ZH_BOX_DIR);
  col += ZH_KEY * zhCls.z * exp(-(c * c) / (w * w)) * (ZH_BOX_W / w);
  col += ZH_RIM * zhCls.w * (1.0 - smoothstep(-0.9, -0.25 + 0.2 * a, rv.z)) * (1.0 - 0.85 * smoothstep(0.2, 0.7, abs(rw.y)));
  return col;
}`;

// 斑：颜色按噪声抖
const 斑色 = /* glsl */ `
{
  float zhK = 1.0 - smoothstep(0.08, 0.5, zhFoot());
  float zhN = zhFbm(vZhPos * 5.0);
  diffuseColor.rgb *= 1.0 + zhFx.z * zhK * (zhN - 0.5) * 1.2;
}`;
// 锻痕：噪声当高度，按屏幕导数掰法线（同 three 的 bump 做法）
const 锻痕 = /* glsl */ `
if (zhFx.x > 0.0) {
  float zhK = 1.0 - smoothstep(0.05, 0.3, zhFoot());
  float zhH = zhFbm(vZhPos * zhFx.y) * vZhUnit;
  vec3 zhPx = dFdx(-vViewPosition);
  vec3 zhPy = dFdy(-vViewPosition);
  vec3 zhR1 = cross(zhPy, normal);
  vec3 zhR2 = cross(normal, zhPx);
  float zhDet = dot(zhPx, zhR1);
  vec3 zhG = sign(zhDet) * (dFdx(zhH) * zhR1 + dFdy(zhH) * zhR2);
  normal = normalize(abs(zhDet) * normal - zhFx.x * zhK * zhG);
}`;
const 粗糙 = /* glsl */ `
material.roughness = clamp(material.roughness * (1.0 + zhFx.z * (1.0 - smoothstep(0.08, 0.5, zhFoot())) * (zhFbm(vZhPos * 3.1 + 11.0) - 0.5) * 1.6), 0.04, 1.0);
material.roughness = max(material.roughness, clamp((zhFoot() - 0.03) * 2.5, 0.0, 0.5));`;
const 加环境 = /* glsl */ `
#if defined( RE_IndirectSpecular )
radiance += zhEnv(normalize(mix(reflect(-geometryViewDir, geometryNormal), geometryNormal, pow4(material.roughness))), material.roughness);
#endif
#if defined( RE_IndirectDiffuse )
iblIrradiance += PI * zhEnv(geometryNormal, 1.0);
#endif
// 芯的光：视空间里的一盏点光，按杖像素算衰减，只照杖
{
  vec3 zhL = vZhGlowPos + vViewPosition;
  float zhD = length(zhL) / vZhUnit;
  zhL = normalize(zhL);
  float zhAtt = zhGlow.w / (1.0 + (zhD * zhD) / 5.0);
  float zhNl = saturate(dot(geometryNormal, zhL));
  vec3 zhHv = normalize(zhL + geometryViewDir);
  float zhSh = mix(90.0, 6.0, sqrt(material.roughness));
  reflectedLight.directDiffuse += zhGlow.rgb * zhAtt * zhNl * material.diffuseContribution;
  reflectedLight.directSpecular += zhGlow.rgb * zhAtt * zhNl * material.specularColorBlended * pow(saturate(dot(geometryNormal, zhHv)), zhSh) * (zhSh + 8.0) / 60.0;
}`;

export type 芯光 = { 位: readonly [number, number, number]; 色: string; 强: number };

/** 一款杖的四种料的材质。芯光：芯在杖空间（像素）哪里、什么颜色、多亮 */
export const 建杖材质 = (光: 芯光): Record<料名, THREE.MeshStandardMaterial> => {
  const 色 = new THREE.Color(光.色);
  const 光值 = { value: new THREE.Vector4(色.r, 色.g, 色.b, 光.强) };
  const 位值 = { value: new THREE.Vector3(...光.位) };
  const 建 = (名: 料名) => {
    const m = 料表[名];
    const 材 = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: m.金属, roughness: m.粗糙, side: THREE.DoubleSide });
    const cls = { value: new THREE.Vector4(m.天, m.地, m.箱, m.轮廓) };
    const fx = { value: new THREE.Vector3(m.锻?.[0] ?? 0, m.锻?.[1] ?? 1, m.斑 ?? 0) };
    材.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { zhCls: cls, zhGlow: 光值, zhGlowAt: 位值, zhFx: fx });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 zhGlowAt;\nvarying float vZhUnit;\nvarying vec3 vZhPos;\nvarying vec3 vZhGlowPos;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvZhUnit = max(length(modelMatrix[0].xyz), max(length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)));\nvZhPos = position;\nvZhGlowPos = (modelViewMatrix * vec4(zhGlowAt, 1.0)).xyz;',
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${公共}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${斑色}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${锻痕}`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${粗糙}`)
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${加环境}`);
    };
    材.customProgramCacheKey = () => '下界魔杖细做';
    return 材;
  };
  return { 黑曜: 建('黑曜'), 铁: 建('铁'), 金: 建('金'), 暗金: 建('暗金') };
};

// ── 发光的料：不受光、不过色调映射，颜色直接是画面上的数 ──
const 发光顶点 = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;
const 噪声 = /* glsl */ `
float zhHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec3 zhHash3(vec3 p) { return vec3(zhHash(p), zhHash(p + 17.3), zhHash(p + 41.7)); }`;

/**
 * 熔融的晶体：像从里面烧着。亮度按「球面法线和刻面法线掺起来」对着镜头的程度连着变（正中是亮黄白的心，往边上橙、再到红），
 * 各刻面只差一点亮度，棱上一道细的亮线（重心坐标 bary 给）
 */
export const 晶体材质 = () =>
  new THREE.ShaderMaterial({
    toneMapped: false,
    vertexShader: /* glsl */ `
attribute vec3 bary;
varying vec3 vB;
varying vec3 vS;
${发光顶点.replace('void main() {', 'void main() {\n  vB = bary;\n  vS = normalize(normalMatrix * normalize(position * vec3(1.0, 0.45, 1.0)));')}`,
    fragmentShader: /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
varying vec3 vB;
varying vec3 vS;
void main() {
  vec3 v = normalize(vV);
  float fs = 1.0 - abs(dot(normalize(vS), v));
  float ff = 1.0 - abs(dot(normalize(vN), v));
  float f = mix(fs, ff, 0.35);
  vec3 col = mix(vec3(1.0, 0.97, 0.72), vec3(1.0, 0.74, 0.2), smoothstep(0.0, 0.3, f));
  col = mix(col, vec3(1.0, 0.5, 0.06), smoothstep(0.25, 0.6, f));
  col = mix(col, vec3(0.86, 0.2, 0.02), smoothstep(0.55, 0.95, f));
  col *= 0.94 + 0.08 * normalize(vN).y;
  float e = min(vB.x, min(vB.y, vB.z));
  float w = fwidth(e);
  col = mix(col, vec3(1.0, 0.93, 0.7), 0.4 * (1.0 - smoothstep(0.5 * w, 0.012 + 1.5 * w, e)));
  gl_FragColor = vec4(col, 1.0);
}`,
  });

/** 熔核：一颗熔岩球。亮黄的裂纹把橙红的壳分成一块块（三维的泡孔噪声），边缘更红 */
export const 熔核材质 = () =>
  new THREE.ShaderMaterial({
    toneMapped: false,
    vertexShader: 发光顶点,
    fragmentShader: /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
${噪声}
// 到最近两个泡孔中心的距离之差：0 在裂纹上
float crack(vec3 p) {
  vec3 i = floor(p);
  float d1 = 9.0;
  float d2 = 9.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 c = i + vec3(float(x), float(y), float(z));
    float d = length(c + zhHash3(c) - p);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  // 泡孔先顺滑地扭一下，板块大小不一、不像足球
  vec3 q = vP + 0.45 * vec3(sin(vP.y * 2.1 + vP.z), sin(vP.z * 1.7 + vP.x * 1.3), sin(vP.x * 2.3 + vP.y * 0.7));
  float c = crack(q * 0.82);
  float c2 = crack(q * 2.1 + 5.0);
  float vein = 1.0 - smoothstep(0.012, 0.085 + fwidth(c), c);
  float fine = 1.0 - smoothstep(0.01, 0.07 + fwidth(c2), c2);
  // 壳：板块正中暗红，靠近裂纹被烤成橙
  vec3 shell = mix(vec3(1.0, 0.5, 0.07), vec3(0.6, 0.1, 0.015), smoothstep(0.05, 0.5, c));
  shell = mix(shell, vec3(1.0, 0.6, 0.12), 0.5 * fine);
  vec3 col = mix(shell, vec3(1.0, 0.92, 0.55), vein);
  col = mix(col, col * vec3(0.8, 0.45, 0.3), smoothstep(0.55, 1.0, f));
  gl_FragColor = vec4(col, 1.0);
}`,
  });

/** 发光的细件（熔岩纹、烈焰柱）：顶点色定底色，正对镜头处往亮黄提 */
export const 熔光材质 = () =>
  new THREE.ShaderMaterial({
    toneMapped: false,
    vertexColors: true,
    vertexShader: /* glsl */ `
varying vec3 vC;
${发光顶点.replace('void main() {', 'void main() {\n  vC = color;')}`,
    fragmentShader: /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vC;
void main() {
  float f = abs(dot(normalize(vN), normalize(vV)));
  gl_FragColor = vec4(mix(pow(vC, vec3(0.4545)), vec3(1.0, 0.95, 0.7), 0.55 * f * f), 1.0);
}`,
  });

/** 光晕：总朝镜头的一片，加色，中间亮往外柔和地淡到 0；几何是 [-1, 1] 的方片，uSize 是半径（杖像素） */
export const 光晕材质 = (色: string, 强: number, 半径: number) => {
  const c = new THREE.Color(色);
  return new THREE.ShaderMaterial({
    toneMapped: false,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uCol: { value: new THREE.Vector3(c.r, c.g, c.b).multiplyScalar(强) }, uSize: { value: 半径 } },
    vertexShader: /* glsl */ `
uniform float uSize;
varying vec2 vQ;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize * length(modelViewMatrix[0].xyz);
  vQ = position.xy;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uCol;
varying vec2 vQ;
void main() {
  float r = length(vQ);
  float k = max(0.0, 1.0 - r * r);
  float i = (0.75 * exp(-r * r / 0.035) + 0.32 * exp(-r * r / 0.11)) * k * k;
  gl_FragColor = vec4(uCol * i, 1.0);
}`,
  });
};
