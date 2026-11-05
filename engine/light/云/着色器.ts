// 云组件的着色器：按一份配置展开好的层（./展开.ts）拼出画云的片元着色器，一层一套函数（名字带层号），层数不设上限。
// 移植自 Photon include/sky/clouds.glsl、clouds/{common,constants,coverage_map,cumulus,altocumulus,cirrus}.glsl：
// Photon Shaders License Agreement, Copyright © 2021-2025 Benjamin Stott ("SixthSurge")，许可证全文见 engine/light/大气/Photon-LICENSE.txt。
// 坑：质量档 精确、默认三层时拼出来的运算要和 engine/light/大气/云.ts 一模一样（用户看过的 2-日落划船 等逐字节不变），
// 那边的式子照抄、只换名字；风、偏移、尺寸、密度这些不是默认值才多拼一截，不往默认的式子里加「+ 0」「× 1」（编译器合并乘加的方式会变）。
import { ATMO_FN_GLSL, ATMO_PARS_GLSL } from '../大气.ts';
import type { 云抖动 } from './配置.ts';
import type { 展开层 } from './展开.ts';
import { 蓝噪声边 } from './蓝噪声.ts';

const 阈 = (l: { 透射率阈值: number }) => (l.透射率阈值 === 0.075 ? '0.075' : f(l.透射率阈值));
const f = (x: number) => {
  const s = String(x);
  return /[.eE]/.test(s) ? s : `${s}.0`;
};

// 共用：常数、工具函数、去云和让开、加云（同 大气/云.ts 的 PHOTON_CLOUD_COMMON_GLSL 前半）
const 共用 = (S: number) => /* glsl */ `
precision highp sampler3D;
uniform sampler2D pcNoise;
uniform sampler2D pcCuHeight;
uniform sampler2D pcCuHeightS;
uniform sampler3D pcWorleyB;
uniform sampler3D pcWorleyS;
uniform vec2 pcCamXZ;
uniform float pcCamR;
uniform float pcDay;
uniform vec4 pcAdd[4];
uniform int pcAddN;
uniform vec2 pcNear;
uniform vec4 pcClear;
uniform vec4 pcGlow;
uniform vec3 pcGlowCol;
#define PC_S ${f(S)}
#define PC_R 6371e3
#define PC_EPS 1e-6
#define PC_PI 3.14159265
#define PC_ISO 0.0795774715

float pcSqr(float x) { return x * x; }
float pcLs(float a, float b, float x) { return clamp((x - a) / (b - a), 0.0, 1.0); }
float pcDampen(float x) { x = clamp(x, 0.0, 1.0); return x * (2.0 - x); }
float pcLift(float x, float a) { return (x + x * a) / (1.0 + x * a); }
float pcCubic(float x) { return x * x * (3.0 - 2.0 * x); }
float pcPow15(float x) { return x * sqrt(x); }
vec2 pcHash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec2 pcHash2(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec2 pcSphere(vec3 o, vec3 d, float R) {
  float b = dot(o, d);
  float r = length(o);
  float disc = b * b - (r - R) * (r + R);
  if (disc < 0.0) return vec2(-1.0);
  disc = sqrt(disc);
  return -b + vec2(-disc, disc);
}
vec2 pcShell(vec3 o, vec3 d, float ri, float ro) {
  vec2 a = pcSphere(o, d, ri);
  vec2 b = pcSphere(o, d, ro);
  if (b.y < 0.0) return vec2(-1.0);
  bool ai = a.y >= 0.0;
  return vec2(ai && a.x < 0.0 ? a.y : max(b.x, 0.0), ai && a.x > 0.0 ? a.x : b.y);
}
vec2 pcPerlinGrad(vec2 coord) {
  vec2 i = floor(coord);
  vec2 f = fract(coord);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 g0 = pcHash2(i), g1 = pcHash2(i + vec2(1.0, 0.0)), g2 = pcHash2(i + vec2(0.0, 1.0)), g3 = pcHash2(i + vec2(1.0, 1.0));
  float v0 = dot(g0, f), v1 = dot(g1, f - vec2(1.0, 0.0)), v2 = dot(g2, f - vec2(0.0, 1.0)), v3 = dot(g3, f - vec2(1.0, 1.0));
  return g0 + u.x * (g1 - g0) + u.y * (g2 - g0) + u.x * u.y * (g0 - g1 - g2 + g3) + du * (u.yx * (v0 - v1 - v2 + v3) + vec2(v1, v2) - v0);
}
vec2 pcCurl(vec2 c) { vec2 g = pcPerlinGrad(c); return vec2(g.y, -g.x); }
vec2 pcKeep(vec3 pos, vec2 xz) {
  vec2 k = vec2(smoothstep(pcNear.x, pcNear.x + pcNear.y, distance(pos, vec3(0.0, pcCamR, 0.0))), 1.0);
  if (pcClear.z > 0.0) {
    vec2 v = xz - pcClear.xy;
    float w = 0.6 + 0.8 * texture(pcNoise, vec2(0.3, 0.6) + v / max(length(v), 1e-3) * (8.0 / 6.2831853 / 512.0)).x;
    k.y = smoothstep(pcClear.z * w, pcClear.z * w + pcClear.w, length(v));
  }
  return k;
}
float pcAddBoost(vec2 xz) {
  float boost = 0.0;
  float wob = 0.6 + 0.8 * texture(pcNoise, 0.0000065 * xz + 0.5).y;
  for (int i = 0; i < 4; i++) {
    if (i >= pcAddN) break;
    boost = max(boost, pcAdd[i].w * (1.0 - smoothstep(0.25 * pcAdd[i].z, pcAdd[i].z, distance(xz, pcAdd[i].xy) / wob)));
  }
  return boost;
}
float pcPhaseHG(float nu, float g) { float gg = g * g; return (PC_ISO - PC_ISO * gg) / pcPow15(1.0 + gg - 2.0 * g * nu); }
float pcPhaseKN(float nu, float e) { return e / (6.2831853 * (e - e * nu + 1.0) * log(2.0 * e + 1.0)); }
float pcPhaseSingle(float c) { return 0.8 * max(pcPhaseKN(c, 2600.0), pcPhaseHG(c, 0.8)) + 0.2 * pcPhaseHG(c, -0.2); }
float pcPhaseMulti(float c, vec3 g) { return 0.65 * pcPhaseHG(c, g.x) + 0.10 * pcPhaseHG(c, g.y) + 0.25 * pcPhaseHG(c, -g.z); }
float pcPowder(float d, float c) { float p = PC_PI * d / (d + 0.15); return mix(p, 1.0, 0.8 * pcSqr(c * 0.5 + 0.5)); }
struct PcRes { vec3 s; float T; float dist; };
PcRes pcNone() { return PcRes(vec3(0.0), 1.0, 1e5); }
vec3 pcAerial(vec3 s, float T, vec3 o, vec3 e, vec3 d, vec3 sky) {
  e = o + 2.0 * (e - o);
  vec3 at = dot(o, o) < dot(e, e)
    ? clamp(atmoTrans(o, d) / max(atmoTrans(e, d), vec3(1e-9)), 0.0, 1.0)
    : clamp(atmoTrans(e, -d) / max(atmoTrans(o, -d), vec3(1e-9)), 0.0, 1.0);
  return mix((1.0 - T) * sky, s, at);
}
PcRes pcBlend(PcRes a, PcRes b) {
  bool bf = b.dist < a.dist;
  return PcRes((bf ? b.s : a.s) + (bf ? b.T : a.T) * (bf ? a.s : b.s), a.T * b.T, min(a.dist, b.dist));
}`;

/** 云形状取样的水平位置：风、偏移、尺寸不是默认值才多拼一截 */
const 形 = (l: 展开层, 名: string, xz: string) => {
  const 移 = l.有偏 ? `(${xz} + ${名}Off)` : `(${xz})`;
  return l.尺寸 === 1 ? 移 : `(${移} * ${f(1 / l.尺寸)})`;
};

/** 积云主步进怎么走：起 = 循环前定 steps、起点 ro；取点 = 每一步开头定这一步的点 p、步长 sl。两者都只用 len、slP、dither */
type 走法 = { 起: string; 取点: string };

/** 等步长：同 大气/云.ts（精确档逐字节不变靠它） */
const 等步长 = (D: string): 走法 => ({
  起: `int steps = int(min(ceil(len / max(slP, 1.0)), float(${D}_MAX)));
  float sl = len / float(max(steps, 1));
  vec3 st = rd * sl;
  vec3 ro = o + rd * (ds.x + sl * dither);`,
  取点: 'vec3 p = ro + st * float(i);',
});

/** 几何增步长（质量.远步增，docs/云.md 第 3 节）：第一步约 slP，往后每步乘 G，几何级数正好加到 len */
const 几何增步长 = (D: string, 增: number): 走法 => {
  const G = f(增);
  return {
    起: `int steps = int(min(ceil(log(1.0 + len * (${G} - 1.0) / max(slP, 1.0)) / log(${G})), float(${D}_MAX)));
  float slN = len * (${G} - 1.0) / (pow(${G}, float(max(steps, 1))) - 1.0);
  vec3 ro = o + rd * ds.x;
  float tAt = 0.0;`,
    取点: `float sl = slN;
    vec3 p = ro + rd * (tAt + sl * dither);
    tAt += sl;
    slN *= ${G};`,
  };
};

// ---- 积云（同 大气/云.ts 的 pcCuBase、pcCuCoverage、pcCuDensity、pcCuOD、pcCumulus） ----
const 积云 = (l: 展开层) => {
  const n = `pcCu${l.号}`, D = `PC_CU${l.号}`;
  const q = l.步;
  const 高度图 = l.平滑 ? 'pcCuHeightS' : 'pcCuHeight';
  const 留 = l.受洞 ? 'keep.x * keep.y' : 'keep.x';
  const 密 = l.密度 === 1 ? '' : ` * ${f(l.密度)}`;
  const 走 = q.增 === 1 ? 等步长(D) : 几何增步长(D, q.增);
  return /* glsl */ `
uniform vec4 ${n}A;
uniform vec4 ${n}B;
uniform vec4 ${n}C;
uniform float ${n}BH;
uniform vec3 ${n}L;
${l.有偏 ? `uniform vec2 ${n}Off;` : ''}
#define ${D}_R (PC_R + ${f(l.R)})
#define ${D}_BH ${f(l.壳BH)}
#define ${D}_T ${f(l.T)}
#define ${D}_TOP (${D}_R + ${D}_BH + ${D}_T)
#define ${D}_H ${q.主H}
#define ${D}_Z ${q.主Z}
#define ${D}_MAX ${q.最多}
#define ${D}_LIGHT ${q.光}
#define ${D}_AMB ${q.环}
#define ${D}_MS ${q.散射}
float ${n}Base(vec2 xz) { return ${D}_R + ${n}BH * texture(${高度图}, 0.000027 * xz).r; }
float ${n}Coverage(vec2 xz) {
  vec2 n = vec2(texture(pcNoise, 0.000002 * xz).x, texture(pcNoise, 0.000027 * xz).w);
  float cu = 0.0, st = 0.0;
  if (${n}B.w < 1.0 - PC_EPS) cu = pcLs(1.0 - mix(${n}A.x, ${n}A.y, n.x), 1.0, n.y);
  if (${n}B.w > PC_EPS) {
    st = pcCubic(pcLs(0.9 - ${n}A.x, 1.0, 2.0 * n.x * ${n}A.y));
    st = 0.5 * st + st * pcLs(0.3, 0.6, n.y);
    st = st / (st + 1.0);
  }
  return mix(cu, st, ${n}B.w);
}
float ${n}Density(vec3 pos, bool detail) {
  float r = length(pos);
  if (r < ${D}_R || r > ${D}_TOP) return 0.0;
  vec2 xz = pos.xz + pcCamXZ;
  vec2 keep = pcKeep(pos, xz);
  float d = ${n}Coverage(${形(l, n, 'xz')}) * ${留};
  if (d < PC_EPS) return 0.0;
  float h = r - ${n}Base(${形(l, n, 'xz')});
  if (h < 0.0 || h > ${D}_T) return 0.0;
  float af = h * ${n}B.z;
  if (${n}B.w > PC_EPS) d = mix(d, clamp(d * pcDampen(clamp(2.0 * af, 0.0, 1.0) * pcLs(0.0, 0.1, af) * pcLs(0.0, 0.6, 1.0 - af)), 0.0, 1.0), ${n}B.w);
  d -= smoothstep(0.2, 1.0, af) * (0.6 - 0.3 * ${n}B.w);
  d *= smoothstep(0.0, 0.2, af);
  if (d < PC_EPS) return 0.0;
  vec2 sxz = ${形(l, n, 'xz')};
  vec3 wp = vec3(sxz.x, pos.y, sxz.y);
  float w0 = detail ? texture(pcWorleyB, wp * 0.0009).x : 0.5;
  float w1 = detail ? texture(pcWorleyS, wp * 0.005).x : 0.5;
  float fade = 0.20 * smoothstep(0.85, 1.0, 1.0 - af) - 0.35 * smoothstep(0.05, 0.5, af) + 0.6;
  d -= ${n}A.z * pcSqr(w0) * pcDampen(1.0 - d);
  d -= ${n}A.w * pcSqr(w1) * pcDampen(1.0 - d) * fade;
  d = max(d, 0.0);
  d = pcLift(d, mix(${n}B.x, ${n}B.y, af));
  return d * (0.1 + 0.9 * smoothstep(0.2, 0.7, af));
}
float ${n}OD(vec3 p, vec3 d, float dither, int n) {
  vec4 st = vec4(d, 1.0) * (0.1 * ${D}_T / float(n));
  float od = 0.0;
  for (int i = 0; i < n; i++) {
    st *= 2.0;
    od += ${n}Density(p + st.xyz * dither, true) * st.w;
    p += st.xyz;
  }
  return od;
}
PcRes ${n}March(vec3 o, vec3 rd, vec3 sky, float dT, float dither) {
  if (${n}A.y < PC_EPS && pcAddN == 0) return pcNone();
  float r = length(o);
  vec2 ds = pcShell(o, rd, ${D}_R, ${D}_TOP);
  bool planet = pcSphere(o, rd, min(r - 10.0, PC_R)).y >= 0.0;
  if (ds.y < 0.0 || planet && r < ${D}_R || dT >= 0.0 && r < ${D}_R && dT < ds.x) return pcNone();
  float len = clamp((dT >= 0.0 ? dT : ds.y) - ds.x, 0.0, 2e4);
  float slP = ${D}_T / max(abs(rd.y), ${D}_T / 2e4) / mix(float(${D}_H), float(${D}_Z), abs(rd.y));
  ${走.起}
  vec3 L = atmoSun;
  float c = dot(rd, L);
  float bounced = 0.4 * L.y / PC_PI;
  float ext = ${n}C.x${密}, sh = ${n}C.y;
  float fall = 0.55 * mix(pcLift(clamp(ext / 0.1, 0.0, 1.0), 0.33), 1.0, c * 0.5 + 0.5);
  float ph0 = pcPhaseSingle(c);
  vec2 sc = vec2(0.0);
  float T = 1.0, dsum = 0.0, wsum = 0.0, glow = 0.0;
  ${l.受亮 ? `float glowBase = pcGlow.w > 0.0 ? ${n}Base(${形(l, n, 'pcGlow.xy')}) : 0.0;` : ''}
  for (int i = 0; i < ${D}_MAX; i++) {
    if (i >= steps || T < ${阈(l)}) break;
    ${走.取点}
    float dens = ${n}Density(p, true);
    if (dens < PC_EPS) continue;
    float dist = distance(ro, p);
    dens *= smoothstep(1.0, 0.95, dist / 2e4);
    dens *= smoothstep(1.0, 0.9, length(p.xz) / 7.5e4);
    float sT = exp(-dens * ext * sl);
    vec2 h = pcHash2(fract(p));
    float lod = ${n}OD(p, L, h.x, ${D}_LIGHT);
    float sod = ${n}OD(p, vec3(0.0, 1.0, 0.0), h.y, ${D}_AMB);
    float af = (length(p) - ${n}Base(${形(l, n, 'p.xz + pcCamXZ')})) / ${D}_T;
    float god = mix(dens, 1.0, clamp(af * 2.0 - 1.0, 0.0, 1.0)) * af * ${D}_T;
    vec2 s = vec2(0.0);
    float sa = ext, ea = ext;
    float pw = pcPowder(dens + dens * ${n}B.w, c);
    float ph = ph0;
    vec3 g = pow(vec3(0.6, 0.9, 0.3), vec3(1.0 + lod));
    for (int k = 0; k < ${D}_MS; k++) {
      s.x += sa * exp(-ea * lod) * ph * (1.0 - 0.5 * sh);
      s.x += sa * exp(-ea * god) * PC_ISO * bounced;
      s.x += sa * exp(-ea * sod) * PC_ISO * sh * 0.5;
      s.y += sa * exp(-ea * sod) * PC_ISO;
      sa *= fall * pw;
      ea *= 0.4;
      g *= 0.8;
      pw = mix(pw, sqrt(pw), 0.5);
      ph = pcPhaseMulti(c, g);
    }
    sc += s * ((1.0 - sT) / ext) * T;
    ${l.受亮 ? `if (pcGlow.w > 0.0) {
      vec2 gd = p.xz + pcCamXZ - pcGlow.xy;
      float gh = length(p) - glowBase;
      glow += (1.0 - sT) * T / (1.0 + (dot(gd, gd) + gh * gh) / (pcGlow.z * pcGlow.z));
    }` : ''}
    T *= sT;
    dsum += dist * dens;
    wsum += dens;
  }
  float cT = pcLs(${阈(l)}, 1.0, T);
  vec3 col = pcAerial(sc.x * ${n}L + sc.y * atmoAmb, cT, o, ro, rd, sky);
  ${l.受亮 ? `if (pcGlow.w > 0.0) col += pcGlowCol * (pcGlow.w * glow * dot(${n}L, vec3(0.2126, 0.7152, 0.0722)));` : ''}
  return PcRes(col, cT, wsum == 0.0 ? 1e6 : dsum / wsum + distance(o, ro));
}`;
};

// ---- 高积云（同 大气/云.ts 的 pcAcDensity、pcAcOD、pcAltocumulus） ----
const 高积云 = (l: 展开层) => {
  const n = `pcAc${l.号}`, D = `PC_AC${l.号}`;
  const q = l.步;
  const 留 = l.受洞 ? 'keep.x * max(keep.y, added)' : 'keep.x';
  const 密 = l.密度 === 1 ? '' : ` * ${f(l.密度)}`;
  return /* glsl */ `
uniform vec4 ${n}P;
uniform vec3 ${n}L;
${l.有偏 ? `uniform vec2 ${n}Off;` : ''}
#define ${D}_R (PC_R + ${f(l.R)})
#define ${D}_T ${f(l.T)}
#define ${D}_TOP (PC_R + ${f(l.R + l.T)})
#define ${D}_H ${q.主H}
#define ${D}_Z ${q.主Z}
#define ${D}_LIGHT ${q.光}
#define ${D}_AMB ${q.环}
#define ${D}_MS ${q.散射}
float ${n}Density(vec3 pos, bool detail) {
  float r = length(pos);
  if (r < ${D}_R || r > ${D}_TOP) return 0.0;
  float af = 0.8 * (r - ${D}_R) / (${D}_T * mix(0.5, 1.0, smoothstep(0.4, 0.6, ${n}P.y)));
  vec2 xz = pos.xz + pcCamXZ;
  vec2 sxz = ${形(l, n, 'xz')};
  vec4 n = vec4(texture(pcNoise, 0.000005 * sxz + 0.01).x, texture(pcNoise, 0.000047 * sxz + 0.3).wx, texture(pcNoise, 0.0001 * sxz + 0.6).w);
  float boost = pcAddBoost(xz);
  float added = pcAddN > 0 ? boost / pcAdd[0].w : 0.0;
  float ac = max(mix(${n}P.x, ${n}P.y, pcDampen(n.x)), boost);
  ac = pcLs(pcSqr(1.0 - ac), 1.0, n.y);
  ac -= 1.9 * pcSqr(1.0 - n.w) * pcDampen(1.0 - ac);
  ac -= smoothstep(0.2, 1.0, af) * 0.6;
  ac *= smoothstep(0.0, 0.2, af);
  float as_ = pcCubic(pcLs(0.9 - ${n}P.x, 1.0, 2.0 * n.x * ${n}P.y));
  as_ = 0.5 * as_ + as_ * pcLs(0.3, 0.6, n.y);
  as_ = 0.5 * as_ + as_ * pcLs(0.3, 0.7, n.z);
  as_ = as_ / (as_ + 1.0);
  as_ *= pcDampen(clamp(2.0 * af, 0.0, 1.0) * pcLs(0.0, 0.1, af) * pcLs(0.0, 0.6, 1.0 - af));
  as_ = clamp(as_, 0.0, 1.0);
  vec2 keep = pcKeep(pos, xz);
  float d = mix(ac, as_, ${n}P.z * (1.0 - added)) * ${留};
  if (d < PC_EPS) return 0.0;
  float w = detail ? texture(pcWorleyS, vec3(sxz.x, pos.y, sxz.y) * 0.003).x : 0.5;
  d -= ${l.细节 === 1 ? '0.3' : f(0.3 * l.细节)} * pcSqr(w) * pcDampen(1.0 - d) * (1.0 - 0.85 * ${n}P.z);
  vec2 e = mix(vec2(3.0, 14.0), vec2(2.0, 7.0), ${n}P.z);
  d = max(d, 0.0);
  d = pcLift(d, mix(e.x, e.y, af));
  return d * (0.1 + 0.9 * smoothstep(0.2, 0.7, af));
}
float ${n}OD(vec3 p, vec3 d, float dither, int n) {
  vec4 st = vec4(d, 1.0) * (0.25 * ${D}_T / float(n));
  float od = 0.0;
  for (int i = 0; i < n; i++) {
    st *= 2.0;
    od += ${n}Density(p + st.xyz * dither, true) * st.w;
    p += st.xyz;
  }
  return od;
}
PcRes ${n}March(vec3 o, vec3 rd, vec3 sky, float dT, float dither) {
  if (${n}P.y < PC_EPS) return pcNone();
  int steps = int(mix(float(${D}_H), float(${D}_Z), abs(rd.y)));
  float r = length(o);
  vec2 ds = pcShell(o, rd, ${D}_R, ${D}_TOP);
  bool planet = pcSphere(o, rd, min(r - 10.0, PC_R)).y >= 0.0;
  if (ds.y < 0.0 || planet && r < ${D}_R || dT >= 0.0 && r < ${D}_R && dT < ds.x) return pcNone();
  float len = clamp((dT >= 0.0 ? dT : ds.y) - ds.x, 0.0, 2e4);
  float sl = len / float(steps);
  vec3 st = rd * sl;
  vec3 ro = o + rd * (ds.x + sl * dither);
  float ext = mix(0.08, 0.16, pcDay) * 0.1 * (2.0 - ${n}P.z)${密};
  vec3 L = atmoSun;
  float c = dot(rd, L);
  float bounced = 0.4 * L.y / PC_PI;
  float fall = 0.5 * mix(pcLift(clamp(ext / 0.05, 0.0, 1.0), 0.33), 1.0, c * 0.5 + 0.5);
  float ph0 = pcPhaseSingle(c);
  vec2 sc = vec2(0.0);
  float T = 1.0, dsum = 0.0, wsum = 0.0;
  for (int i = 0; i < ${D}_H; i++) {
    if (i >= steps || T < ${阈(l)}) break;
    vec3 p = ro + st * float(i);
    float dens = ${n}Density(p, true);
    if (dens < PC_EPS) continue;
    float dist = distance(ro, p);
    dens *= 1.0 - smoothstep(0.95, 1.0, dist / 2e4);
    float sT = exp(-dens * ext * sl);
    vec2 h = pcHash2(fract(p));
    float lod = ${n}OD(p, L, h.x, ${D}_LIGHT);
    float sod = ${n}OD(p, vec3(0.0, 1.0, 0.0), h.y, ${D}_AMB);
    float af = (length(p) - ${D}_R) / ${D}_T;
    float god = mix(dens, 1.0, clamp(af * 2.0 - 1.0, 0.0, 1.0)) * af * ${D}_T;
    vec2 s = vec2(0.0);
    float sa = ext, ea = ext;
    float pw = pcPowder(dens * (1.5 + 3.5 * ${n}P.z), c);
    float ph = ph0;
    vec3 g = pow(vec3(0.6, 0.9, 0.3), vec3(1.0 + lod));
    for (int k = 0; k < ${D}_MS; k++) {
      s.x += sa * exp(-ea * lod) * ph;
      s.x += sa * exp(-ea * god) * PC_ISO * bounced;
      s.y += sa * exp(-ea * sod) * PC_ISO;
      sa *= fall * pw;
      ea *= 0.45;
      g *= 0.7;
      pw = mix(pw, sqrt(pw), 0.5);
      ph = pcPhaseMulti(c, g);
    }
    sc += s * ((1.0 - sT) / ext) * T;
    T *= sT;
    dsum += dist * dens;
    wsum += dens;
  }
  float cT = pcLs(${阈(l)}, 1.0, T);
  vec3 light = ${n}L * (1.0 + 0.4 * pcLs(0.5, 0.6, ${n}P.x) * ${n}P.w);
  vec3 col = pcAerial(sc.x * light + sc.y * atmoAmb, cT, o, ro, rd, sky);
  return PcRes(col, cT, wsum == 0.0 ? 1e6 : dsum / wsum + distance(o, ro));
}`;
};

// ---- 卷云、卷积云（平面；同 大气/云.ts 的 pcCiDensity、pcCiOD、pcCirrus） ----
const 卷云 = (l: 展开层) => {
  const n = `pcCi${l.号}`, D = `PC_CI${l.号}`;
  // 厚：大气/云.ts 写死 PC_CI_THICK 1500、PC_CI_T 900（云空间米），按厚等比
  const 比 = l.T / 1500;
  return /* glsl */ `
uniform vec2 ${n}P;
uniform vec3 ${n}L;
${l.有偏 ? `uniform vec2 ${n}Off;` : ''}
#define ${D}_R (PC_R + ${f(l.R)})
#define ${D}_THICK ${f(l.T)}
#define ${D}_T ${f(900 * 比)}
#define ${D}_EXT ${l.密度 === 1 ? '0.15' : f(0.15 * l.密度)}
float ${n}Density(vec2 coord, float af) {
  coord += pcCamXZ${l.有偏 ? ` + ${n}Off` : ''};
  ${l.尺寸 === 1 ? '' : `coord *= ${f(1 / l.尺寸)};`}
  vec2 curl = pcCurl(0.00002 * coord) * 0.5 + pcCurl(0.00004 * coord) * 0.25 + pcCurl(0.00008 * coord) * 0.125;
  float hs = 1.0 - abs(1.0 - 2.0 * af);
  float ci = 0.7 * texture(pcNoise, 0.000001 * coord + 0.0032 * curl).x + 0.3 * texture(pcNoise, 0.000008 * coord + 0.0064 * curl).x;
  ci = pcLs(0.7 - ${n}P.x, 1.0, ci);
  float amp = 0.2, freq = 0.00002, cs = 0.08;
  for (int i = 0; i < 4; i++) {
    ci -= texture(pcNoise, coord * freq + curl * cs).x * amp;
    amp *= 0.6;
    freq *= 2.0;
    cs *= 4.0;
  }
  ci = mix(1.0, 0.75, pcDay) * pow(max(ci, 0.0), 3.0) * pcSqr(hs) * 0.5;
  float cov = 5.0 * pcLs(0.25, 0.9, ${n}P.y * texture(pcNoise, 0.0000026 * coord + 0.25).w);
  float cc = pcDampen(texture(pcNoise, 0.000025 * coord + 0.033 * curl).w);
  cc = pcLs(1.0 - cov, 1.0, cc);
  vec2 cc2 = pcCurl(0.001 * coord);
  cc -= pcSqr(texture(pcNoise, coord * 0.00005 + 0.003 * cc2).y);
  cc -= pcSqr(texture(pcNoise, coord * 0.0002 + 0.007 * cc2).y) * 0.5;
  cc -= pcSqr(texture(pcNoise, coord * 0.0008 + 0.03 * cc2).y) * 0.1;
  cc = max(cc, 0.0);
  cc = 0.25 * pow(cc, 4.0) * hs;
  return ci + cc;
}
float ${n}OD(vec3 o, vec3 d, float dither) {
  vec2 inner = pcSphere(o, d, ${D}_R - 0.5 * ${D}_THICK);
  vec2 outer = pcSphere(o, d, ${D}_R + 0.5 * ${D}_THICK);
  float len = min(inner.y >= 0.0 ? inner.x : outer.y, 1e3);
  const float growth = 1.5;
  vec3 p = o;
  vec4 st = vec4(d, 1.0) * (len * (growth - 1.0) / (pow(growth, 6.0) - 1.0) / growth);
  float od = 0.0;
  for (int i = 0; i < 6; i++) {
    st *= growth;
    vec3 q = p + st.xyz * dither;
    float r = length(q);
    float af = (r - ${D}_R) / ${D}_THICK + 0.5;
    if (af == clamp(af, 0.0, 1.0)) od += ${n}Density((q * (${D}_R / r)).xz, af) * st.w;
    p += st.xyz;
  }
  return od;
}
PcRes ${n}March(vec3 o, vec3 rd, vec3 sky, float dT, float dither) {
  if (${n}P.x < PC_EPS && ${n}P.y < PC_EPS) return pcNone();
  float r = length(o);
  vec2 ds = pcSphere(o, rd, ${D}_R);
  bool planet = pcSphere(o, rd, min(r - 10.0, PC_R)).y >= 0.0;
  if (ds.y < 0.0 || planet && r < ${D}_R || dT >= 0.0 && r < ${D}_R && dT < ds.y) return pcNone();
  float dsph = r < ${D}_R ? ds.y : ds.x;
  vec3 sp = o + rd * dsph;
  vec3 L = atmoSun;
  float c = dot(rd, L);
  float dens = ${n}Density(sp.xz, 0.5);
  if (dens < PC_EPS) return pcNone();
  float lod = ${n}OD(sp, L, dither);
  float vT = exp(-0.5 * dens * ${D}_EXT * ${D}_THICK / (abs(rd.y) + PC_EPS));
  vec2 s = vec2(0.0);
  float ph = pcPhaseSingle(c);
  vec3 g = vec3(0.6, 0.9, 0.3);
  float pw = 8.0 * (1.0 - exp(-40.0 * dens));
  pw = mix(pw, 1.0, pcPow15(c * 0.5 + 0.5));
  float sa = ${D}_EXT;
  float ea = ${D}_EXT * (1.0 + 0.5 * max(smoothstep(0.0, 0.15, abs(L.y)) - smoothstep(0.5, 0.7, ${n}P.x), 0.0));
  for (int k = 0; k < 4; k++) {
    s.x += sa * exp(-ea * lod) * ph * pw;
    s.y += sa * exp(-0.33 * ${D}_THICK * ea * dens) * PC_ISO;
    sa *= 0.5;
    ea *= 0.25;
    g *= 0.5;
    pw = mix(pw, sqrt(pw), 0.5);
    ph = pcPhaseMulti(c, g);
  }
  s *= (1.0 - vT) / ${D}_EXT;
  vec3 col = pcAerial(s.x * ${n}L + s.y * atmoAmb * 1.41, vT, o, sp, rd, sky);
  return PcRes(col, vT, dsph);
}`;
};

// ---- 贴图层（Agent 写的便宜算法，用户 11-04 定 B5 远层改用它）：一层薄云当一张球面上的贴图，覆盖照高积云的平面噪声（同一套 noise.png 取样，
// 形状和 Photon 高积云一个路数），只在层中间取一次密度；透过率按厚 ÷ 视线仰角，朝太阳只看前后两点的覆盖（自阴影），多次散射 4 次。
// 每像素一次球面求交 + 十来次贴图取样，比体积的高积云（几十步 × 每步十几次）便宜两个数量级 ----
const 贴图层 = (l: 展开层) => {
  const n = `pcTx${l.号}`, D = `PC_TX${l.号}`;
  return /* glsl */ `
uniform vec4 ${n}P;
uniform vec3 ${n}L;
${l.有偏 ? `uniform vec2 ${n}Off;` : ''}
#define ${D}_R (PC_R + ${f(l.R + l.T / 2)})
#define ${D}_T ${f(l.T)}
float ${n}Cov(vec2 xz) {
  vec2 sxz = ${形(l, n, 'xz')};
  vec4 n = vec4(texture(pcNoise, 0.000005 * sxz + 0.01).x, texture(pcNoise, 0.000047 * sxz + 0.3).wx, texture(pcNoise, 0.0001 * sxz + 0.6).w);
  float ac = mix(${n}P.x, ${n}P.y, pcDampen(n.x));
  ac = pcLs(pcSqr(1.0 - ac), 1.0, n.y);
  ac -= 1.9 * pcSqr(1.0 - n.w) * pcDampen(1.0 - ac);
  ac -= 0.25 * pcSqr(texture(pcNoise, 0.0004 * sxz + 0.2).y) * ${n}P.z;
  ${l.受洞 ? 'ac *= pcKeep(vec3(0.0, PC_R + 1e7, 0.0), xz).y;' : ''}
  return max(ac, 0.0);
}
PcRes ${n}March(vec3 o, vec3 rd, vec3 sky, float dT, float dither) {
  if (${n}P.y < PC_EPS) return pcNone();
  float r = length(o);
  vec2 ds = pcSphere(o, rd, ${D}_R);
  bool planet = pcSphere(o, rd, min(r - 10.0, PC_R)).y >= 0.0;
  if (ds.y < 0.0 || planet && r < ${D}_R || dT >= 0.0 && r < ${D}_R && dT < ds.y) return pcNone();
  float dsph = r < ${D}_R ? ds.y : ds.x;
  if (dsph > 7.5e4) return pcNone();
  vec3 sp = o + rd * dsph;
  vec2 xz = sp.xz + pcCamXZ;
  float dens = ${n}Cov(xz) * smoothstep(7.5e4, 6.0e4, dsph);
  if (dens < PC_EPS) return pcNone();
  vec3 L = atmoSun;
  float c = dot(rd, L);
  float ext = ${n}P.w;
  float vT = exp(-dens * ext * ${D}_T / (abs(rd.y) + 0.05));
  vec2 sl = L.xz / max(L.y, 0.1) * (0.5 * ${D}_T);
  float lod = (${n}Cov(xz + sl * (0.5 + dither)) + ${n}Cov(xz + sl * (1.5 + dither))) * 0.5 * ext * ${D}_T / max(L.y, 0.1);
  vec2 s = vec2(0.0);
  float ph = pcPhaseSingle(c);
  vec3 g = vec3(0.6, 0.9, 0.3);
  float pw = pcPowder(dens * 2.0, c);
  float sa = 1.0, ea = 1.0;
  for (int k = 0; k < 4; k++) {
    s.x += sa * exp(-ea * lod) * ph * pw;
    s.y += sa * exp(-ea * dens * ext * ${D}_T * 0.5) * PC_ISO;
    sa *= 0.5;
    ea *= 0.4;
    g *= 0.7;
    pw = mix(pw, sqrt(pw), 0.5);
    ph = pcPhaseMulti(c, g);
  }
  s *= 1.0 - vT;
  vec3 col = pcAerial(s.x * ${n}L + s.y * atmoAmb, vT, o, sp, rd, sky);
  return PcRes(col, vT, dsph);
}`;
};

const 层码 = { Photon积云: 积云, Photon高积云: 高积云, Photon卷云: 卷云, 贴图层 } as const;
const 前缀 = { Photon积云: 'pcCu', Photon高积云: 'pcAc', Photon卷云: 'pcCi', 贴图层: 'pcTx' } as const;
const 底宏 = { Photon积云: 'PC_CU', Photon高积云: 'PC_AC', Photon卷云: 'PC_CI', 贴图层: 'PC_TX' } as const;

/** 按高低前后叠（同 大气/云.ts 的 pcDrawClouds：低的一层挡死、镜头又在它下面就不再往上算） */
const 叠 = (层们: readonly 展开层[]) => {
  const 调 = (l: 展开层) => `${前缀[l.算法]}${l.号}March(o, rd, sky, dTc, dither)`;
  const 递 = (i: number): string => {
    if (i >= 层们.length) return '';
    const l = 层们[i - 1]!;
    const 下 = 递(i + 1);
    return `if (!(res.T < 1e-3 && pcCamR < ${底宏[l.算法]}${l.号}_R)) {\n    res = pcBlend(res, ${调(层们[i]!)});\n    ${下}\n  }`;
  };
  return 层们.length
    ? `PcRes res = ${调(层们[0]!)};\n  ${递(1)}`
    : 'PcRes res = pcNone();';
};

/** 画云：返回 (散射光, 透过率)，apparent = 云的视距离（方块米） */
const 画云函数 = (层们: readonly 展开层[]) => /* glsl */ `
vec4 pcDrawClouds(vec3 rd, vec3 sky, float dT, float dither, out float apparent) {
  vec3 o = vec3(0.0, pcCamR, 0.0);
  float dTc = dT < 0.0 ? -1.0 : dT * PC_S;
  ${叠(层们)}
  apparent = res.dist / PC_S;
  return vec4(res.s, res.T);
}`;

/** 步进起点错开多少（0～1，定义 dither），只按像素坐标取 */
const 抖动码: Record<云抖动, string> = {
  Bayer: `const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  ivec2 bq = ivec2(gl_FragCoord.xy) & 3;
  float dither = (BAYER[bq.y * 4 + bq.x] + 0.5) / 16.0;`,
  交错梯度: 'float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));',
  蓝噪声: `float dither = texelFetch(tBlue, ivec2(gl_FragCoord.xy) & ${蓝噪声边 - 1}, 0).r;`,
};

/** 片元着色器（GLSL3）：tPrep 是这一遍分辨率上的 (对数深度, 这一帧要不要算)；要算的才步进，别的像素 discard、离屏图里留着上一帧的 */
export const 云片元 = (层们: readonly 展开层[], S: number, 抖动: 云抖动, 半: boolean) => /* glsl */ `
precision highp float;
${ATMO_PARS_GLSL}
${ATMO_FN_GLSL}
${共用(S)}
${层们.map((l) => 层码[l.算法](l)).join('\n')}
${画云函数(层们)}
uniform sampler2D tPrep;
uniform sampler2D atmoSky;
${抖动 === '蓝噪声' ? 'uniform sampler2D tBlue;' : ''}
uniform vec2 uSize;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uLogFar;
uniform float uExposure;
layout(location = 0) out highp vec4 oCol;
void main() {
  vec4 prep = texelFetch(tPrep, ivec2(gl_FragCoord.xy), 0);
  if (prep.b < 0.5) discard;
  float d = prep.r;
  vec2 uv = ${半 ? '(2.0 * gl_FragCoord.xy - 0.5) / uSize' : 'gl_FragCoord.xy / uSize'};
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
  vec3 vdir = normalize(vp.xyz / vp.w);
  float fwdK = -vdir.z;
  vec3 wdir = mat3(uCamWorld) * vdir;
  float tScene = d >= 1.0 ? -1.0 : (exp2(d * uLogFar) - 1.0) / fwdK;
  ${抖动码[抖动]}
  vec3 sky = atmoSkyAt(atmoSky, vec3(wdir.x, -wdir.z, wdir.y));
  float apparent;
  vec4 c = pcDrawClouds(wdir, sky, tScene, dither, apparent);
  float A = 1.0 - c.a;
  if (A < 1e-4) {
    oCol = vec4(0.0);
    return;
  }
  vec3 col = atmoDisp(c.rgb / A * uExposure);
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(17.0, 59.0), vec2(0.06711056, 0.00583715))));
  oCol = vec4(col * A + (jit - 0.5) / 255.0 * A, A);
}`;
