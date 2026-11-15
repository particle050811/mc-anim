// X
// Voxy 做法（voxy/src/main/…/client/core/SSAO.java、NormalRenderPipeline.java、shaders/post/ssao.comp）：
// - 时机：LOD 地形不透明部分画完、半透明还没画时算一遍 AO 乘到颜色上。只压 LOD 地形里 hasAO（方块模型 isShaded）的像素（颜色 alpha 里的标记位），原版近处区块和实体不压，但照样挡别人。
// - 算法：BEST（24 采样）/ BETTER（12 采样）是 Photon SSAO 的 BETTER_SSAO 分支。法线 = 像素所在面的朝向；在切平面取圆盘：切向、副切向各 1 格投到屏幕，限长 0.1 屏幕（`SSAO_MAX_RADIUS_SCREEN`），乘 1.5（`SSAO_RADIUS`），
//   即世界半径 1.5 格、近处不超过屏幕 0.15。采样点固定（黄金比例 R1 序列，无抖动不模糊）；采到天空或同深度跳过；否则还原该点得偏移 o，累加 clamp(cosθ,0,1) × 1/(1 + |o|/1.5)，AO = (1 − 和/采样数)^2.5，在 sRGB 数值上直接乘。不做距离截断。
// - AO 先乘、雾后加（最后 blit 时按距离混雾色），雾里的远处不被压暗。
// 这里的做法（WebGL2 没有计算着色器，改成两遍画 + 全屏片元着色器）：
// 1. 不透明的先画进离屏图（颜色 + 深度，抗锯齿同画布）。离屏图标成「XR 渲染目标」、sRGB，three 按画到屏幕的写法出色，存的就是画面数值，乘 AO 即 Voxy 的「在 sRGB 上乘」。半透明的（云、粒子、星星、虚影、加色特效）这遍先藏起来。
//    要压暗的材质（`material.userData.ScreenAo = '压暗'`：体素世界方块，见 lib/体素/材质.ts）改成自定义混合、alpha 写 0，别的不透明写 1，背景清成 1：离屏图 alpha = 1 − 体素方块覆盖率。
//    导出网格（lib/方块网格.tsx，平滑光照已烤进顶点色）、人物、物品不压，只当遮挡物。
//    这一遍不在片元写对数深度，用光栅器的反向深度（engine/core/光栅深度.ts）：被挡住的片元不再全额着色。阴影图照旧画（普通深度），画完才换；
//    画完把反向深度换算成对数深度存进一张单通道浮点图，第 2 遍和中间步骤（云）读的还是对数深度。
//    有一份不透明材质不认（自己写着色器又没接 three 的对数深度片段、透射，见 光栅深度.ts 的 `光栅兼容`）、画布没开对数深度、不是透视镜头、浏览器没有 EXT_clip_control 时，整遍退回片元写对数深度的老路。
//    多重采样解析出来的深度是像素里偏离中心的一点的，换算时推回像素中心（见下面 `换算FS`）；量不出是哪一点（`解析偏移` 返回 null）也退回老路。
//    多边形偏移这一遍只留固定的那份（units，方向跟着反向深度反过来），按斜率的那份（factor）不要：对数深度下偏移本来不起作用（片元写的深度盖掉了），
//    叠在同一个面上的两层（亚波伦祭坛的眼睛）靠浮点误差定谁赢，是一片雪花点；光栅深度下同一个三角形要么全赢要么全输，眼睛会整只没掉，所以让偏移起作用。
//    factor 在侧着看的面上把贴层拉到挡在它前面的东西之前（祭坛侧面的眼睛从旁边的方块后面露出一条绿边），固定的那份够把共面的分开。
//    体素世界花草（`userData.ScreenAo = '不挡'`）挪到第 3 遍画，不挡别人也不压：花草只在第 0 级有，当遮挡物会让近处草地整片发暗、外圈不暗，镜头一动是跟着走的暗圈（6-1-4 第 96 帧）；游戏平滑光照里花草本来也不挡光。
// 2. 全屏片元着色器画到画布：读离屏颜色和深度，算 AO 乘上去，并把深度写回画布。深度是对数深度（一镜画面开了 `logarithmicDepthBuffer`）：three 写 log2(1 + w) / log2(far + 1)，反推。
//    法线没有 Voxy 的面朝向标记，用深度还原（左右、上下各取差得少的一边，不跨物体边缘），翻到朝镜头那面。
//    雾：three 的雾在出色之后按纵深混雾色，这里先减掉雾那份、乘 AO、再加回，等于 Voxy 先乘后加。雾公式同材质：线性 / 指数平方，再叠高度雾（lib/高度雾.ts）；算错 AO 会把雾也压暗。
// 3. 再把半透明的（和花草）画到画布，不清屏，按第 2 步写回的深度遮挡，所以半透明不被压暗。
// 三遍离屏（第 1 遍用了光栅深度、开了多重采样、留到第 3 遍的材质也都认光栅深度时）：第 2、3 遍和中间步骤不上画布，接着画在第 1 遍那张多重采样的离屏图里，最后拷到画布。
//    第 3 遍也挂 `RASTER_DEPTH` 宏、不在片元写深度，和第 1 遍共用同一张多重采样的反向深度、逐采样点比：花草、积雪层、水被挡住的片元不再全额着色；
//    也不用再把解析出来的深度「推回像素中心」（那是近似，远处一个像素高的台阶顶面上的积雪层会输一部分、略灰）。
//    第 2 遍不整张重写颜色，改成往离屏图上混（各采样点 颜色 × 留下的比例 + 加回的雾，和重写解析后的颜色算出来一样）：各采样点自己的颜色留着，
//    第 3 遍的东西只盖住它挡得住的采样点，前景轮廓和水、草交界的地方按覆盖率混，不再是整个像素有或没有。
//    three 每次往多重采样目标 render 完都解析一次（颜色、深度各拷一遍），第 2 遍到第 3 遍之间的解析没人读，按住不做，画完解析一次颜色。
//    画布的深度这时不写；之后还要拿场景深度比的（库/物品/拔刀剑泛光.tsx）在 中间步骤.ts 登记，最后拷到画布时把深度（换算回对数深度）一起写上。
//    留到第 3 遍的材质里有不认光栅深度的，退回上面的走法（第 2、3 遍上画布，深度推回像素中心）。
// 不做 Voxy 以外的处理：不按距离截断，不模糊。镂空树叶：表层缝里看到内层，被 SSAO 压暗，正是原顶点 AO 干的事（材质里的缝色 `HOLE` 按这个定）。
// 尺寸用画布实际像素（dpr、超采样跟着变）；半径按世界尺度。
import { useFrame } from '@react-three/fiber';
import { voxelsPending } from './世界.tsx';
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { DIR_FOG_GLSL, HEIGHT_FOG_GLSL, SKY_FOG_GLSL, dirFog, heightFog, skyFogUniforms } from '../light/高度雾.ts';
import { ATMO_FN_GLSL, ATMO_PARS_GLSL, atmoOn, atmoUniforms } from '../light/大气.ts';
import { PHOTON_CLOUD_COMMON_GLSL, PHOTON_CLOUD_SHADOW_GLSL, cloudUniforms, updateCloudUniforms } from '../light/大气/云.ts';
import { aoPassUniform } from './材质.ts';
import { postFxRenderers } from '../post/后期.tsx';
import { midPassesOf, sceneDepthNeeded, type MidPassContext } from './中间步骤.ts';
import { renderInput } from '../core/渲染设置.ts';
import { toggleShaderMacro } from '../core/着色宏.ts';
import { rasterCompatible, toggleRasterMacro, reverseCompare, reverseCoeffs, toReverseProjection, analyticOffset } from '../core/光栅深度.ts';

export type ScreenAoProps = {
  // 每个像素的采样数：Voxy BEST = 24、BETTER = 12；离线渲染用 24
  sampleCount?: number;
  // 采样圆盘的半径（格 = 米）：SSAO_RADIUS
  radius?: number;
  // 切向、副切向投到屏幕上最长多少（占屏幕宽、高的比例）：SSAO_MAX_RADIUS_SCREEN
  maxScreenRadius?: number;
  // 导出网格（lib/方块网格.tsx 的实心、镂空层）也压暗。默认不压：平滑光照已烤在网格顶点色里，再压缝里会比体素世界暗，两条方块管线颜色要一致（用户 10-01）。
  // 6-1-2 这种只有导出网格的近景可以打开（见 镜头/6-1-2/娜迦参考模型.tsx）
  applyToMesh?: boolean;
  // 兼容已认可的地下画面：仅后期保留指定机位的大气和云影，世界雾仍由场景决定；不读取上一帧的机位。
  atmosphereCamera?: THREE.Camera;
};

// 圆盘里的采样点：SSAO.java 里预先算好的常量数组（r = sqrt(fract(i/φ + 0.5))，角度 = (i + 0.5)/n 圈）
const diskSamplesGlsl = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const turn = (i + 0.5) / n;
    const radius = Math.sqrt((i / 1.6180339887 + 0.5) % 1);
    const t = turn * 6.2831853;
    return `vec2(${(radius * Math.cos(t)).toFixed(7)}, ${(radius * Math.sin(t)).toFixed(7)})`;
  }).join(', ');

const VS = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FS = (n: number, radius: number, maxScreen: number) => /* glsl */ `
uniform sampler2D tColor; // 画面数值；alpha = 1 − 体素覆盖率
uniform sampler2D tDepth; // 对数深度
uniform vec2 uSize;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform float uLogFar; // log2(far + 1)
uniform int uLogDepth; // 1 = 对数深度（一镜画面），0 = 普通透视深度（6-1-2 的画布没开对数深度）
uniform vec2 uNearFar;
uniform int uFogType; // 0 没有雾、1 线性雾、2 指数雾
uniform vec3 uFog; // 近、远、浓度
uniform vec3 uFogColor; // 雾色（画面数值，和材质里的雾色一样）
uniform vec3 uFogHeight; // 高度雾：起点、半衰、浓度（lib/高度雾.ts）
uniform mat4 uCamWorld; // 镜头 → 世界
uniform vec4 uFogSun; // 方向雾色（黄昏）：太阳水平方向、强度（lib/高度雾.ts 的 方向雾）
uniform vec3 uFogGlow;
${HEIGHT_FOG_GLSL}
${DIR_FOG_GLSL}
${SKY_FOG_GLSL}
#ifdef ATMO
${ATMO_PARS_GLSL}
${ATMO_FN_GLSL}
${PHOTON_CLOUD_COMMON_GLSL}
${PHOTON_CLOUD_SHADOW_GLSL}
// 云影只压日光那一份：日光占的比例按 FlightSky 的平行光 3.2、天光和环境光约 1.8 估，换成画面值上的系数
float cloudShadowAt(vec3 rel, float y, float ndl) {
  if (ndl <= 0.0) return 1.0;
  float v = pcCloudShadow(rel, y, atmoSun);
  return pow(1.0 - (1.0 - v) * 3.2 * ndl / (3.2 * ndl + 1.8), 1.0 / 2.2);
}
#endif

#define STEPS ${n}
#define SSAO_RADIUS ${radius.toFixed(4)}
#define SSAO_MAX_RADIUS_SCREEN ${maxScreen.toFixed(4)}
const vec2 SAMPLE_POINTS[STEPS] = vec2[STEPS](${diskSamplesGlsl(n)});

float depthAt(vec2 uv) { return texture2D(tDepth, uv).r; }
// 对数深度 → 纵深 w → 镜头空间的点（透视：从原点出发过近平面上那一点的射线，走到纵深 w）
vec3 viewPos(vec2 uv, float d) {
  float n = uNearFar.x, fr = uNearFar.y;
  float w = uLogDepth == 1 ? exp2(d * uLogFar) - 1.0 : n * fr / (fr - d * (fr - n));
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
  p.xyz /= p.w;
  return p.xyz * (w / -p.z);
}
vec2 projUv(vec3 p) {
  vec4 c = uProj * vec4(p, 1.0);
  return c.xy / c.w * 0.5 + 0.5;
}
vec2 clampLength(vec2 a, float lo, float hi) {
  float l = length(a);
  return l < 1e-12 ? vec2(0.0) : a / l * clamp(l, lo, hi);
}
mat3 tbnOf(vec3 n) {
  vec3 t = abs(n.y) > 0.9999 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), n));
  vec3 b = normalize(cross(t, n));
  return mat3(t, b, n);
}

// ssao.comp 的 computeAO（BETTER_SSAO 分支），镜头空间
float computeAO(vec2 uv, float d, vec3 P, vec3 N) {
  mat3 tbn = tbnOf(N);
  mat2 S = SSAO_RADIUS * mat2(
    clampLength(projUv(P + tbn[0]) - uv, 0.0, SSAO_MAX_RADIUS_SCREEN),
    clampLength(projUv(P + tbn[1]) - uv, 0.0, SSAO_MAX_RADIUS_SCREEN)
  );
  float ao = 0.0;
  for (int i = 0; i < STEPS; ++i) {
    vec2 suv = clamp(uv + S * SAMPLE_POINTS[i], vec2(0.0), vec2(1.0));
    suv = (floor(suv * uSize) + 0.5) / uSize;
    float sd = depthAt(suv);
    if (sd >= 1.0 || sd == d) continue;
    vec3 o = viewPos(suv, sd) - P;
    float rlen = inversesqrt(dot(o, o));
    float cosT = clamp(dot(o, N) * rlen, 0.0, 1.0);
    float falloff = 1.0 / (1.0 + (1.0 / rlen) * (1.0 / SSAO_RADIUS));
    ao += cosT * falloff;
  }
  return pow(clamp(1.0 - ao * (1.0 / float(STEPS)), 0.0, 1.0), 2.5);
}

// AO_BLEND（三遍离屏，见文件头）：不出整张颜色，出「加回的那份、留下的比例」，由混合算 目标 × 比例 + 加回，和 (颜色 − 底) × 比例 + 底 是同一个数
#ifdef AO_BLEND
#define APPLY(base, k) { keepK = (k); add = (base) * (1.0 - keepK); }
#else
#define APPLY(base, k) col.rgb = (col.rgb - (base)) * (k) + (base);
#endif

void main() {
  vec2 px = 1.0 / uSize;
  vec2 uv = gl_FragCoord.xy * px;
  vec4 col = texture2D(tColor, uv);
  float d = depthAt(uv);
  float cover = 1.0 - col.a;
#ifdef AO_BLEND
  vec3 add = vec3(0.0);
  float keepK = 1.0;
#endif
#ifdef ATMO
  // 大气打开时（lib/大气.ts）：材质里的雾是 画面 = 出色 × keep + B，先减 B、乘 AO 和云影、再加回；云影要压所有不透明物，不只体素方块
  if (d < 1.0) {
#else
  if (d < 1.0 && cover > 0.002) {
#endif
    vec3 P = viewPos(uv, d);
    // 法线：左右、上下各取纵深差得少的那一边（不跨物体边缘），叉乘
    vec3 L = viewPos(uv - vec2(px.x, 0.0), depthAt(uv - vec2(px.x, 0.0)));
    vec3 R = viewPos(uv + vec2(px.x, 0.0), depthAt(uv + vec2(px.x, 0.0)));
    vec3 D = viewPos(uv - vec2(0.0, px.y), depthAt(uv - vec2(0.0, px.y)));
    vec3 U = viewPos(uv + vec2(0.0, px.y), depthAt(uv + vec2(0.0, px.y)));
    vec3 dx = abs(R.z - P.z) < abs(P.z - L.z) ? R - P : P - L;
    vec3 dy = abs(U.z - P.z) < abs(P.z - D.z) ? U - P : P - D;
    vec3 N = normalize(cross(dx, dy));
    if (dot(N, P) > 0.0) N = -N;
#ifdef ATMO
    float ao = cover > 0.002 ? mix(1.0, computeAO(uv, d, P, N), cover) : 1.0;
    vec3 Pw = (uCamWorld * vec4(P, 1.0)).xyz;
    vec3 Cw = uCamWorld[3].xyz;
    vec3 keep;
    vec3 B = atmoFogParts(Cw, Pw, keep);
    float sh = cloudShadowAt(Pw - Cw, Pw.y, dot(mat3(uCamWorld) * N, atmoSun));
    APPLY(B, ao * sh)
#else
    float ao = mix(1.0, computeAO(uv, d, P, N), cover);
    // 雾：材质里是 画面 = mix(出色, 雾色, f)，f 按纵深算；先减掉雾那一份，乘 AO，再加回来（= Voxy 的先乘 AO 后混雾）
    float w = -P.z;
    float f = uFogType == 1 ? smoothstep(uFog.x, uFog.y, w) : uFogType == 2 ? 1.0 - exp(-uFog.z * uFog.z * w * w) : 0.0;
    vec3 Pw = (uCamWorld * vec4(P, 1.0)).xyz;
    if (uFogType > 0) f = addHeightFog(f, uCamWorld[3].xyz, Pw, uFogHeight);
    vec3 F = skyFogMix(dirFogColor(uFogColor, uCamWorld[3].xyz, Pw, uFogSun, uFogGlow), uCamWorld[3].xyz, Pw, f) * f;
    APPLY(F, ao)
#endif
  }
#ifdef AO_BLEND
  gl_FragColor = vec4(add, keepK);
#else
  gl_FragColor = vec4(col.rgb, 1.0);
  gl_FragDepth = d;
#endif
}`;

// 第 1 遍的反向深度 → 对数深度（three 的写法：log2(1 + w) / log2(far + 1)）；没画到的地方（清成 0）是天空，写 1。
// 三遍离屏时（不带 CENTER 宏）只做这一步换算，给第 2 遍和云读；下面「推回像素中心」是第 3 遍留在画布上画时（带 CENTER 宏）才做的。
// 解析出来的深度是像素里偏离中心的一点的（uOff，见 engine/core/光栅深度.ts 的 `解析偏移`），先推回像素中心：片元写对数深度时存的就是像素中心的，
// 第 3 遍贴着地面的东西（积雪层）按像素中心的深度比。反向深度在同一个面上沿屏幕是线性的，按左右、上下相邻像素的差推：
// - 一般：两边各一个差，取小的那边（不跨物体边缘，同第 2 遍还原法线）；一边是天空或出了画面只看另一边；两边一正一负（只占一个像素的东西、棱）不推。
// - 方块的面都沿世界轴：三个轴向各算一遍「过这一点、朝这个轴的面」每像素该差多少，和左、右、下、上四个差对，对上两个以上、没有并列的就按这个面推。
//   台阶地形顶面和立面交替、深度连着，「取小的」会拿到立面的斜率，顶面推不够，上面的积雪层成片输掉（飞越第 713 帧背光坡发灰）；
//   只有一个像素高的横条上下都是别的面，靠左右两个差也认得出朝向。
//   只靠一个方向的两个差认朝向要防认错：正对镜头的面片（粒子、烟）左右差是 0，镜头不歪时朝上的面左右也该是 0，
//   在镜头自己的地平线那几行朝上的面上下该差极大，认错了整条推到近裁面，把后面画的闪电切出一道缝（亚波伦 4-齐放 第 99 帧）。
//   所以另一个方向得像棱：有邻居、两边自己不成一个平面、哪边的差都不小于这个面该有的一成（正对镜头的面片是 0；台阶上只有一个像素高的顶面，
//   上下两个差是顶面和立面的斜率按棱的位置混出来的，门槛提到四分之一就有一半顶面认不出）。
const convertFragment = /* glsl */ `
uniform sampler2D tRev;
uniform vec2 uAB;
uniform float uLogFar;
uniform vec2 uOff;
uniform vec4 uRay; // 镜头空间视线（z = −1）的 x、y = 像素坐标 × uRay.xy + uRay.zw
uniform vec2 uGrad; // 面的法线 ÷ 平面常数 的 x、y = 反向深度每像素的差 × uGrad
uniform mat3 uToView; // 各列是世界轴在镜头空间的方向
float at(ivec2 p) { return texelFetch(tRev, p, 0).r; }
float pick(vec2 s, bvec2 ok) {
  if (!ok.x) return ok.y ? s.y : 0.0;
  if (!ok.y) return s.x;
  if (s.x * s.y < 0.0) return 0.0;
  return abs(s.x) < abs(s.y) ? s.x : s.y;
}
// 一个方向左右（上下）两个差自己对得上：这一小块是一个平面，量出来的斜率就是它的
bool plane(vec2 s, bvec2 ok, float c) { return ok.x && ok.y && abs(s.x - s.y) <= 0.02 * max(abs(s.x), abs(s.y)) + 2e-6 * c; }
// 这个方向没有一个差对得上斜率 g 的面时，它像不像这个面的棱
bool crease(vec2 s, bvec2 ok, bool isPlane, float g) {
  if (isPlane || !(ok.x || ok.y)) return false;
  float least = 0.1 * abs(g);
  return (!ok.x || abs(s.x) >= least) && (!ok.y || abs(s.y) >= least);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float c = at(p);
  float logD = 1.0;
  if (c > 0.0) {
#ifdef CENTER
    ivec2 hi = textureSize(tRev, 0) - 1;
    float l = p.x > 0 ? at(p - ivec2(1, 0)) : 0.0;
    float r = p.x < hi.x ? at(p + ivec2(1, 0)) : 0.0;
    float dn = p.y > 0 ? at(p - ivec2(0, 1)) : 0.0;
    float up = p.y < hi.y ? at(p + ivec2(0, 1)) : 0.0;
    vec2 sx = vec2(c - l, r - c), sy = vec2(c - dn, up - c);
    bvec2 okx = bvec2(l > 0.0, r > 0.0), oky = bvec2(dn > 0.0, up > 0.0);
    vec2 s = vec2(pick(sx, okx), pick(sy, oky));
    // 平面 n·X = k、X = 视线 × 纵深：1 ÷ 纵深 = n·视线 ÷ k，沿屏幕线性；面朝某个轴、又过这一点，n ÷ k 就定了
    float q = (c + uAB.y) / uAB.x;
    vec3 ray = vec3(gl_FragCoord.xy * uRay.xy + uRay.zw, -1.0);
    vec4 seen = vec4(sx, sy);
    bvec2 flat2 = bvec2(plane(sx, okx, c), plane(sy, oky, c));
    int most = 1;
    bool tie = false, sure = false;
    vec2 along = vec2(0.0);
    for (int a = 0; a < 3; a++) {
      vec3 n = uToView[a];
      float t = dot(n, ray);
      if (abs(t) < 1e-4) continue;
      vec2 g = n.xy * (q / t) / uGrad;
      vec2 tol = 0.02 * abs(g) + 2e-6 * c;
      vec4 e = abs(seen - g.xxyy);
      int hx = int(okx.x && e.x <= tol.x) + int(okx.y && e.y <= tol.x);
      int hy = int(oky.x && e.z <= tol.y) + int(oky.y && e.w <= tol.y);
      int hit = hx + hy;
      if (hit > most) {
        most = hit; along = g; tie = false;
        sure = (hx > 0 || crease(sx, okx, flat2.x, g.x)) && (hy > 0 || crease(sy, oky, flat2.y, g.y));
      } else if (hit == most && hit > 1) tie = true;
    }
    // 并列先算（不看把关）：正对镜头的立面和顶面左右都对得上时，把关只会放过斜率小的立面，顶面上的像素就一点不推了
    if (most > 1 && !tie && sure) s = along;
    // 贴着地平线的像素斜率和深度本身一样大，别推过头
    float d = clamp(c - dot(uOff, s), 0.25 * c, 1.0);
#else
    float d = c;
#endif
    logD = log2(1.0 + uAB.x / (d + uAB.y)) / uLogFar;
  }
  gl_FragColor = vec4(logD, 0.0, 0.0, 1.0);
}`;

// 三遍离屏画完，离屏图解析出来的颜色原样拷到画布；WITH_DEPTH：连深度（反向深度换算回对数深度，没画到的是 1）一起写
const copyFragment = /* glsl */ `
uniform sampler2D tColor;
#ifdef WITH_DEPTH
uniform sampler2D tRev;
uniform vec2 uAB;
uniform float uLogFar;
#endif
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  gl_FragColor = texelFetch(tColor, p, 0);
#ifdef WITH_DEPTH
  float c = texelFetch(tRev, p, 0).r;
  gl_FragDepth = c > 0.0 ? log2(1.0 + uAB.x / (c + uAB.y)) / uLogFar : 1.0;
#endif
}`;

// 比改前改后用：渲染输入给 `光栅深度: false`，第 1 遍退回片元写对数深度；`三遍离屏: false`，第 2、3 遍照旧上画布
const rasterDepthOff = (renderInput() as { rasterDepth?: boolean }).rasterDepth === false;
const offscreenOff = (renderInput() as { threePassOffscreen?: boolean }).threePassOffscreen === false;
const warned = new WeakSet<object>();
type ClipControl = { clipControlEXT: (origin: number, depth: number) => void; LOWER_LEFT_EXT: number; ZERO_TO_ONE_EXT: number; NEGATIVE_ONE_TO_ONE_EXT: number };

// 第 1 遍藏起来、留到第 3 遍画的：三维画布本来就按半透明另排一队的（transparent）、不是普通混合的（加色的特效之类）、标了不挡的
const aoDisabled = (renderInput() as { screenAo?: boolean }).screenAo === false;
const drawLater = (m: THREE.Material) => m.transparent || m.blending !== THREE.NormalBlending || m.userData.screenAo === '不挡';

type SavedMaterial = { m: THREE.Material; visible: boolean; blending: THREE.Blending; src: THREE.BlendingSrcFactor; dst: THREE.BlendingDstFactor; srcA: THREE.BlendingSrcFactor | null; dstA: THREE.BlendingDstFactor | null; depthFunc: THREE.DepthModes; offsetFactor: number; raster: boolean };

export const ScreenAo: React.FC<ScreenAoProps> = ({ sampleCount: sampleCount = 24, radius: radius = 1.5, maxScreenRadius = 0.1, applyToMesh = false, atmosphereCamera }) => {
  const resources = useMemo(() => {
    const depth = new THREE.DepthTexture(1, 1, THREE.FloatType);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depth, generateMipmaps: false });
    // 「XR 渲染目标」+ sRGB：three 按画到屏幕的写法出色（见文件头），颜色按 RGBA8 原样存（不走 sRGB 纹理的硬件解码）
    (rt as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    rt.texture.internalFormat = 'RGBA8';
    const aoUniforms = {
      tColor: { value: rt.texture },
      tDepth: { value: depth },
      uSize: { value: new THREE.Vector2(1, 1) },
      uProj: { value: new THREE.Matrix4() },
      uInvProj: { value: new THREE.Matrix4() },
      uLogFar: { value: 1 },
      uLogDepth: { value: 1 },
      uNearFar: { value: new THREE.Vector2(0.1, 1000) },
      uFogType: { value: 0 },
      uFog: { value: new THREE.Vector3() },
      uFogColor: { value: new THREE.Color() },
      uFogHeight: { value: heightFog },
      uFogSun: { value: dirFog.dir },
      uFogGlow: { value: dirFog.color },
      ...skyFogUniforms,
      uCamWorld: { value: new THREE.Matrix4() },
      ...atmoUniforms,
      ...cloudUniforms,
    };
    const aoFs = FS(sampleCount, radius, maxScreenRadius);
    const mat = new THREE.ShaderMaterial({ uniforms: aoUniforms, vertexShader: VS, fragmentShader: aoFs, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, toneMapped: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    // 三遍离屏的第 2 遍：混到离屏图上（目标 × alpha + 颜色），离屏图的 alpha 这一下不动
    const blendMat = new THREE.ShaderMaterial({
      uniforms: aoUniforms, vertexShader: VS, fragmentShader: aoFs, defines: { AO_BLEND: '' }, depthTest: false, depthWrite: false, toneMapped: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    const copyUniforms = { tColor: { value: rt.texture }, tRev: { value: depth }, uAB: { value: new THREE.Vector2() }, uLogFar: { value: 1 } };
    const copyMat = new THREE.ShaderMaterial({ uniforms: copyUniforms, vertexShader: VS, fragmentShader: copyFragment, depthTest: false, depthWrite: false, toneMapped: false });
    const copyDepthMat = new THREE.ShaderMaterial({ uniforms: copyUniforms, vertexShader: VS, fragmentShader: copyFragment, defines: { WITH_DEPTH: '' }, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, toneMapped: false });
    // 对数深度图：单通道 32 位浮点，最近点采样（和深度纹理一样）
    const logRt = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RedFormat, type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
    const logMat = new THREE.ShaderMaterial({
      uniforms: { tRev: { value: depth }, uAB: { value: new THREE.Vector2() }, uLogFar: { value: 1 }, uOff: { value: new THREE.Vector2() }, uRay: { value: new THREE.Vector4() }, uGrad: { value: new THREE.Vector2() }, uToView: { value: new THREE.Matrix3() } },
      vertexShader: VS,
      fragmentShader: convertFragment,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const logQuad = new THREE.Mesh(quad.geometry, logMat);
    logQuad.frustumCulled = false;
    const logScene = new THREE.Scene();
    logScene.add(logQuad);
    return { rt, mat, blendMat, copyMat, copyDepthMat, quad, quadScene: quadScene, emptyScene: new THREE.Scene(), logRt, logMat, logScene, camera: new THREE.OrthographicCamera(), bufSize: new THREE.Vector2(), saved: [] as SavedMaterial[], proj: new THREE.Matrix4(), projInv: new THREE.Matrix4() };
  }, [sampleCount, radius, maxScreenRadius]);
  useEffect(
    () => () => {
      resources.rt.depthTexture?.dispose();
      resources.rt.dispose();
      resources.mat.dispose();
      resources.blendMat.dispose();
      resources.copyMat.dispose();
      resources.copyDepthMat.dispose();
      resources.logRt.dispose();
      resources.logMat.dispose();
    },
    [resources],
  );

  // 优先级 > 0：R3F 不再自己画，这一帧由这里画
  useFrame(({ gl, scene, camera }) => {
    // 比改前改后用：--props='{"屏幕AO":false}' 只画场景、不压 AO
    if (aoDisabled) {
      gl.render(scene, camera);
      return;
    }
    // 体素世界还在后台建区段：这一遍画出来也是半截的，截图前建齐了会再画一次，这一遍不画
    if (voxelsPending.size) return;
    const { rt, mat, bufSize: bufSize, saved: saved } = resources;
    gl.getDrawingBufferSize(bufSize);
    const width = Math.max(1, Math.floor(bufSize.x));
    const height = Math.max(1, Math.floor(bufSize.y));
    const samples = gl.getContextAttributes()?.antialias ? Math.min(4, gl.capabilities.maxSamples) : 0;
    // 挂了 <后期 />（lib/后期.tsx）的画布：离屏图换成半精度，亮部不在这步量化成 8 位，后期才还原得出场景亮度
    const halfFloat = postFxRenderers.has(gl);
    const texType = halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    if (rt.width !== width || rt.height !== height || rt.samples !== samples || rt.texture.type !== texType) {
      rt.texture.type = texType;
      rt.texture.internalFormat = halfFloat ? 'RGBA16F' : 'RGBA8';
      rt.samples = samples;
      rt.setSize(width, height);
      rt.dispose(); // 采样数变了 three 不会自己重建
    }

    // 收集材质
    saved.length = 0;
    const seen = new Set<THREE.Material>();
    scene.traverse((obj) => {
      const material = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!material) return;
      for (const x of Array.isArray(material) ? material : [material]) {
        if (seen.has(x)) continue;
        seen.add(x);
        saved.push({ m: x, visible: x.visible, blending: x.blending, src: x.blendSrc, dst: x.blendDst, srcA: x.blendSrcAlpha, dstA: x.blendDstAlpha, depthFunc: x.depthFunc, offsetFactor: x.polygonOffsetFactor, raster: false });
      }
    });

    // 第 1 遍：不透明的画进离屏图；要压暗的 alpha 写 0
    const cam = camera as THREE.PerspectiveCamera;
    const clip = gl.extensions.has('EXT_clip_control') ? (gl.extensions.get('EXT_clip_control') as ClipControl) : null;
    let raster = !rasterDepthOff && clip !== null && gl.capabilities.logarithmicDepthBuffer && cam.isPerspectiveCamera === true;
    // 三遍离屏（文件头）还要：开了多重采样（不开的话第 2 遍边读边写同一张图）、留到第 3 遍的材质也都认光栅深度
    let offscreen = raster && !offscreenOff && samples > 0;
    for (const entry of saved) {
      const material = entry.m;
      const later = drawLater(material);
      if (later) material.visible = false;
      if (!raster || !entry.visible || rasterCompatible(material)) continue;
      if (later) offscreen = false;
      else raster = false;
      if (!warned.has(material)) {
        warned.add(material);
        console.warn(`[屏幕AO] ${later ? '第 3 遍留在画布上画（不进离屏图）' : '不透明一遍退回片元写对数深度'}：${material.type}${material.name ? ` ${material.name}` : ''} 不认光栅深度（engine/core/光栅深度.ts 的 光栅兼容）`);
      }
    }
    offscreen &&= raster;
    // 第 3 遍留在画布上时才要推回像素中心
    const resolveOff = raster && !offscreen ? analyticOffset(gl, samples) : null;
    if (raster && !offscreen && !resolveOff) {
      raster = false;
      if (!warned.has(gl)) {
        warned.add(gl);
        console.warn('[屏幕AO] 不透明一遍退回片元写对数深度：量不出多重采样深度解析取的是哪一点（engine/core/光栅深度.ts 的 解析偏移）');
      }
    }
    // 这一遍期间材质换成光栅深度的画法：挂宏、比较反过来、多边形偏移只留固定的那份（见文件头）；记在条目上，画完照着还原
    const toRaster = (entry: SavedMaterial) => {
      const material = entry.m;
      entry.raster = true;
      toggleRasterMacro(material, true);
      material.depthFunc = reverseCompare[material.depthFunc]!;
      material.polygonOffsetFactor = 0;
      material.polygonOffsetUnits = -material.polygonOffsetUnits;
    };
    const fromRaster = (entry: SavedMaterial) => {
      const material = entry.m;
      entry.raster = false;
      toggleRasterMacro(material, false);
      material.depthFunc = entry.depthFunc;
      material.polygonOffsetFactor = entry.offsetFactor;
      material.polygonOffsetUnits = -material.polygonOffsetUnits;
    };
    // 用反向深度画一次场景。阴影图在 gl.render 里先画（正交投影、普通深度），画完才换裁剪范围和投影；three 没有「阴影画完」的钩子，包一下它的入口
    // （视锥剔除、排序在这之前，用的还是原来的投影）。clearDepth：深度清成 0（最远）；three 记着的清屏值是 1，这里绕过它设、清完设回，颜色由 three 接着清
    const renderReversed = (clearDepth: boolean) => {
      const ctx = gl.getContext();
      const shadowRender = gl.shadowMap.render;
      let entered = false;
      gl.shadowMap.render = function (this: unknown, ...a: Parameters<typeof shadowRender>) {
        shadowRender.apply(this, a);
        if (clearDepth) {
          ctx.clearDepth(0);
          gl.state.buffers.depth.setMask(true);
          ctx.clear(ctx.DEPTH_BUFFER_BIT);
          ctx.clearDepth(1);
        }
        clip!.clipControlEXT(clip!.LOWER_LEFT_EXT, clip!.ZERO_TO_ONE_EXT);
        resources.proj.copy(cam.projectionMatrix);
        resources.projInv.copy(cam.projectionMatrixInverse);
        toReverseProjection(cam.projectionMatrix, cam.near, cam.far);
        cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
        entered = true;
      } as typeof shadowRender;
      try {
        gl.render(scene, camera);
      } finally {
        gl.shadowMap.render = shadowRender;
        if (entered) {
          clip!.clipControlEXT(clip!.LOWER_LEFT_EXT, clip!.NEGATIVE_ONE_TO_ONE_EXT);
          cam.projectionMatrix.copy(resources.proj);
          cam.projectionMatrixInverse.copy(resources.projInv);
        }
      }
    };
    for (const entry of saved) {
      const material = entry.m;
      if (drawLater(material)) continue;
      if (raster) toRaster(entry);
      if (material.userData.screenAo === '压暗' || (applyToMesh && material.userData.blockMesh)) {
        material.blending = THREE.CustomBlending;
        material.blendSrc = THREE.OneFactor;
        material.blendDst = THREE.ZeroFactor;
        // `userData.AO按alpha` 的（体素材质）alpha 写材质给的值：按离镜头距离减掉的比例（lib/体素/材质.ts 的 `远处AO`），抗锯齿边照样按覆盖率混。别的压暗材质照旧写 0
        material.blendSrcAlpha = material.userData.aoByAlpha ? THREE.OneFactor : THREE.ZeroFactor;
        material.blendDstAlpha = THREE.ZeroFactor;
      }
    }
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(rt);
    aoPassUniform.value = 1;
    if (raster) {
      const autoClearDepth = gl.autoClearDepth;
      gl.autoClearDepth = false;
      try {
        renderReversed(true);
      } finally {
        gl.autoClearDepth = autoClearDepth;
      }
    } else gl.render(scene, camera);
    aoPassUniform.value = 0;
    for (const entry of saved) {
      const material = entry.m;
      // 记在条目上的：上面压暗的材质改了混合方式，这时再用 drawLater 判就认不出它了
      if (entry.raster) fromRaster(entry);
      material.blending = entry.blending;
      material.blendSrc = entry.src;
      material.blendDst = entry.dst;
      material.blendSrcAlpha = entry.srcA;
      material.blendDstAlpha = entry.dstA;
      material.visible = entry.visible;
    }

    // 反向深度 → 对数深度，第 2 遍和中间步骤都读这张
    let depthTex: THREE.Texture = rt.depthTexture as THREE.DepthTexture;
    const { a: revA, b: revB } = reverseCoeffs(cam.near, cam.far);
    if (raster) {
      const { logRt, logMat } = resources;
      if (logRt.width !== width || logRt.height !== height) logRt.setSize(width, height);
      toggleShaderMacro(logMat, 'CENTER', !offscreen);
      logMat.uniforms.tRev.value = rt.depthTexture;
      (logMat.uniforms.uAB.value as THREE.Vector2).set(revA, revB);
      if (resolveOff) (logMat.uniforms.uOff.value as THREE.Vector2).copy(resolveOff);
      // 这时投影已经还原：x、y 两行反向投影没动过
      const pe = cam.projectionMatrix.elements;
      (logMat.uniforms.uRay.value as THREE.Vector4).set(2 / (width * pe[0]!), 2 / (height * pe[5]!), (pe[8]! - 1) / pe[0]!, (pe[9]! - 1) / pe[5]!);
      (logMat.uniforms.uGrad.value as THREE.Vector2).set((width * pe[0]!) / (2 * revA), (height * pe[5]!) / (2 * revA));
      (logMat.uniforms.uToView.value as THREE.Matrix3).setFromMatrix4(cam.matrixWorldInverse);
      logMat.uniforms.uLogFar.value = Math.log2(cam.far + 1);
      gl.setRenderTarget(logRt);
      gl.render(resources.logScene, resources.camera);
      depthTex = logRt.texture;
    }

    // 第 2 遍：算 AO、乘上去；上画布时连深度写回画布，三遍离屏时混到离屏图上
    const uniforms = mat.uniforms;
    uniforms.tDepth.value = depthTex;
    (uniforms.uSize.value as THREE.Vector2).set(width, height);
    (uniforms.uProj.value as THREE.Matrix4).copy(cam.projectionMatrix);
    (uniforms.uInvProj.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
    uniforms.uLogFar.value = Math.log2(cam.far + 1);
    uniforms.uLogDepth.value = gl.capabilities.logarithmicDepthBuffer ? 1 : 0;
    (uniforms.uNearFar.value as THREE.Vector2).set(cam.near, cam.far);
    (uniforms.uCamWorld.value as THREE.Matrix4).copy(cam.matrixWorld);
    const fog = scene.fog;
    if (fog && (fog as THREE.Fog).isFog) {
      uniforms.uFogType.value = 1;
      (uniforms.uFog.value as THREE.Vector3).set((fog as THREE.Fog).near, (fog as THREE.Fog).far, 0);
    } else if (fog && (fog as THREE.FogExp2).isFogExp2) {
      uniforms.uFogType.value = 2;
      (uniforms.uFog.value as THREE.Vector3).set(0, 0, (fog as THREE.FogExp2).density);
    } else uniforms.uFogType.value = 0;
    // 材质里的雾色按画到屏幕时的色彩空间换算（three 的 getUnlitUniformColorSpace），这里同样
    if (fog) fog.color.getRGB(uniforms.uFogColor.value as THREE.Color, gl.outputColorSpace);
    const atmo = atmoOn() || atmosphereCamera !== undefined;
    // 离开天空后关闭大气后期；需要保留已认可效果的镜头必须显式给参考相机。
    const aoMat = offscreen ? resources.blendMat : mat;
    toggleShaderMacro(aoMat, 'ATMO', atmo);
    if (atmo) updateCloudUniforms(atmosphereCamera ?? cam);
    const ac = [gl.autoClearColor, gl.autoClearDepth, gl.autoClearStencil];
    const shadowAuto = gl.shadowMap.autoUpdate;
    // 三遍离屏：下面都接着画在第 1 遍的离屏图里，不清屏；three 每次 render 完的解析按住（见文件头），到最后才放开
    const target = offscreen ? rt : prevTarget;
    const glc = gl.getContext() as WebGL2RenderingContext;
    const blit = glc.blitFramebuffer;
    if (offscreen) {
      gl.autoClearColor = gl.autoClearDepth = gl.autoClearStencil = false;
      glc.blitFramebuffer = () => {};
    }
    try {
      resources.quad.material = aoMat;
      gl.setRenderTarget(target);
      gl.render(resources.quadScene, resources.camera);
      if (offscreen) {
        // 离屏图的 alpha 第 1 遍拿去记「压暗多少」了，这里整张设回 1：和原来第 2 遍写到画布上的一样，第 3 遍的混合从 1 起算。
        // three 的颜色写入开关只有全开全关，直接调 WebGL 只放开 alpha，用完放回全开（three 记着的也是全开）
        gl.state.buffers.color.setMask(true);
        glc.colorMask(false, false, false, true);
        glc.clearBufferfv(glc.COLOR, 0, [0, 0, 0, 1]);
        glc.colorMask(true, true, true, true);
      }

      // 第 2 遍之后的步骤
      const midPasses = [...midPassesOf(gl)].sort((a, b) => a.order - b.order);
      const latePasses = midPasses.filter((p) => p.afterWater?.());
      let ctx: MidPassContext | null = null;
      if (midPasses.length) {
        ctx = {
          gl,
          camera: cam,
          depth: depthTex,
          width: width,
          height: height,
          target,
          reversed: offscreen ? { a: revA, b: revB } : undefined,
          fog: { type: uniforms.uFogType.value, params: uniforms.uFog.value, color: uniforms.uFogColor.value, height: heightFog },
        };
        for (const pass of midPasses) if (!latePasses.includes(pass)) pass.draw(ctx);
        gl.setRenderTarget(target);
      }

      // 第 3 遍：半透明的接着画，不清屏、不重画阴影
      gl.autoClearColor = gl.autoClearDepth = gl.autoClearStencil = false;
      gl.shadowMap.autoUpdate = false;
      let any = false;
      for (const entry of saved) {
        if (drawLater(entry.m)) {
          any ||= entry.visible;
          if (offscreen && entry.visible) toRaster(entry);
        } else entry.m.visible = false;
      }
      const drawScene = () => (offscreen ? renderReversed(false) : gl.render(scene, camera));
      if (any && latePasses.length && ctx) {
        const water = saved.filter((e) => drawLater(e.m) && e.visible && e.m.userData.waterLevel);
        for (const e of saved) if (drawLater(e.m) && !e.m.userData.waterLevel) e.m.visible = false;
        // 水这一下写深度：花草（屏幕AO 不挡）挪到水后面画了，水不写深度的话水下的海草、海带会盖在海面上（6-1-1 远处整片海成了草地）
        const waterDepthWrite = water.map((e) => e.m.depthWrite);
        for (const e of water) e.m.depthWrite = true;
        if (water.length) drawScene();
        water.forEach((e, i) => (e.m.depthWrite = waterDepthWrite[i]));
        for (const pass of latePasses) pass.draw(ctx);
        gl.setRenderTarget(target);
        for (const e of saved) if (drawLater(e.m)) e.m.visible = e.visible && !e.m.userData.waterLevel;
        drawScene();
      } else {
        if (latePasses.length && ctx) {
          for (const pass of latePasses) pass.draw(ctx);
          gl.setRenderTarget(target);
        }
        if (any) drawScene();
      }
    } finally {
      if (offscreen) glc.blitFramebuffer = blit;
      for (const entry of saved) {
        if (entry.raster) fromRaster(entry);
        entry.m.visible = entry.visible;
      }
      gl.shadowMap.autoUpdate = shadowAuto;
    }
    if (offscreen) {
      // 解析一次：往离屏图画一个空场景，three 画完照例解析；深度只有后面有人要（中间步骤.ts 的 needSceneDepth）才解析
      const withDepth = sceneDepthNeeded(gl);
      rt.resolveDepthBuffer = withDepth;
      gl.setRenderTarget(rt);
      gl.render(resources.emptyScene, resources.camera);
      rt.resolveDepthBuffer = true;
      const cu = resources.copyMat.uniforms;
      (cu.uAB!.value as THREE.Vector2).set(revA, revB);
      cu.uLogFar!.value = Math.log2(cam.far + 1);
      resources.quad.material = withDepth ? resources.copyDepthMat : resources.copyMat;
      [gl.autoClearColor, gl.autoClearDepth, gl.autoClearStencil] = ac;
      gl.setRenderTarget(prevTarget);
      gl.render(resources.quadScene, resources.camera);
    }
    [gl.autoClearColor, gl.autoClearDepth, gl.autoClearStencil] = ac;
    saved.length = 0;
  }, 1);
  return null;
};
