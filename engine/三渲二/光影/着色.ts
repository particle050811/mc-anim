// 光影层的着色器片段：受光的平涂材质（平涂.tsx 派生的）上再补一段，按太阳的影子图、灯光重算颜色；标了水的材质补波纹、天光反射和太阳碎光。
// 都接在平涂那段后面（同在 opaque_fragment 前），用它算好的 flatC（贴图 × 顶点色，sRGB 数值）、flatS（MC 面明暗）、flatK（色调，发光区里是 1）、flatN（世界法线，朝镜头）、vFlatW（世界坐标）。
// three 的世界 Y 朝上（场景 Z 朝上的 group 转过来），方块格在两边都是整数格，所以贴图像素（1/16 格）的网格在 three 世界里照样对齐。
// 自己写的（用户 11-02 定），没有搬光影包的代码；天色、云用仓库里已经移植的 Photon（engine/light/大气.ts、大气/云.ts，许可证见 engine/light/大气/Photon-LICENSE.txt）。
import * as THREE from 'three';
import { ATMO_FN_GLSL, ATMO_PARS_GLSL, atmoUniforms } from '../../light/大气.ts';
import { 最多发光区 } from '../平涂.tsx';

export type 光影统一量 = ReturnType<typeof 新光影统一量>;

/** 粒子照亮最多几个点光源（粒子按格子并成团，取最亮的几团） */
export const 最多粒子光 = 8;

export const 新光影统一量 = () => ({
  gyShadowMap: { value: null as THREE.Texture | null },
  gyShadowMat: { value: new THREE.Matrix4() },
  gyShadowOn: { value: 0 },
  /** 法线方向往外挪多少（格）再查影子，防自身打影 */
  gyShadowBias: { value: 0.04 },
  /** 指向太阳（three 世界） */
  gySun: { value: new THREE.Vector3(0, 1, 0) },
  gySunCol: { value: new THREE.Color(1, 1, 1) },
  gyShadeCol: { value: new THREE.Color(1, 1, 1) },
  gyDirK: { value: 0 },
  gyFaceK: { value: 1 },
  gyGlowK: { value: 1 },
  gyLampR: { value: 10 },
  gyLampCol: { value: new THREE.Color(0, 0, 0) },
  gyPixel: { value: 1 },
  gyTime: { value: 0 },
  gyWaterPix: { value: 0 },
  gyZenith: { value: new THREE.Color() },
  gyRefl: { value: 0 },
  gyGlintCol: { value: new THREE.Color() },
  gyWaterBody: { value: new THREE.Color() },
  gyReflMin: { value: 0 },
  /** 水面反射、远处融进的天色改取 Photon 的天色图（天的样式是 Photon平滑 时） */
  gyAtmoOn: { value: 0 },
  gyAtmoSky: { value: null as THREE.Texture | null },
  /** 主画面的深度（粒子泛光源按它丢掉被挡住的） */
  gyDepth: { value: null as THREE.Texture | null },
  /** 天顶往场景色板拉（Photon 天，水面反射这边）：色（sRGB 数值）、拉多少、到多高（仰角的 sin）拉满 */
  gyZenCol: { value: new THREE.Color() },
  gyZenK: { value: 0 },
  gyZenH: { value: 0.6 },
  /** 粒子照亮：几个点光源（three 世界坐标、线性颜色）和半径（格） */
  gyFlashN: { value: 0 },
  gyFlashPos: { value: Array.from({ length: 最多粒子光 }, () => new THREE.Vector3()) },
  gyFlashCol: { value: Array.from({ length: 最多粒子光 }, () => new THREE.Color()) },
  gyFlashR: { value: 16 },
});

const 受光头 = /* glsl */ `
uniform sampler2D gyShadowMap;
uniform mat4 gyShadowMat;
uniform float gyShadowOn;
uniform float gyShadowBias;
uniform vec3 gySun;
uniform vec3 gySunCol;
uniform vec3 gyShadeCol;
uniform float gyDirK;
uniform float gyFaceK;
uniform float gyGlowK;
uniform float gyLampR;
uniform vec3 gyLampCol;
uniform float gyPixel;
uniform int gyFlashN;
uniform vec3 gyFlashPos[ ${最多粒子光} ];
uniform vec3 gyFlashCol[ ${最多粒子光} ];
uniform float gyFlashR;
float gyShadowAt( vec3 p ) {
  vec4 c = gyShadowMat * vec4( p, 1.0 );
  vec3 u = c.xyz / c.w * 0.5 + 0.5;
  if ( u.x <= 0.0 || u.y <= 0.0 || u.x >= 1.0 || u.y >= 1.0 || u.z >= 1.0 ) return 1.0;
  return u.z - 0.0005 <= texture2D( gyShadowMap, u.xy ).r ? 1.0 : 0.0;
}
`;

// 像素阴影：面上的两个方向吸到贴图像素中心，法线那个方向不动（面所在的那一层），一个贴图像素里影子只有一个值
const 受光身 = /* glsl */ `
vec3 gyA = abs( flatN );
vec3 gyAxis = ( gyA.x >= gyA.y && gyA.x >= gyA.z ) ? vec3( 1.0, 0.0, 0.0 ) : ( ( gyA.y >= gyA.z ) ? vec3( 0.0, 1.0, 0.0 ) : vec3( 0.0, 0.0, 1.0 ) );
vec3 gyP = gyPixel > 0.5 ? mix( ( floor( vFlatW * 16.0 ) + 0.5 ) / 16.0, vFlatW, gyAxis ) : vFlatW;
vec3 gyPL = ( flatToLocal * vec4( gyP, 1.0 ) ).xyz;
bool gyGlow = false;
float gyLampD = 1e5;
for ( int i = 0; i < ${最多发光区}; i ++ ) {
  if ( i >= flatGlowCount ) break;
  if ( all( greaterThanEqual( flatL, flatGlowMin[ i ] ) ) && all( lessThanEqual( flatL, flatGlowMax[ i ] ) ) ) gyGlow = true;
  gyLampD = min( gyLampD, length( gyPL - clamp( gyPL, flatGlowMin[ i ], flatGlowMax[ i ] ) ) );
}
float gyNL = dot( flatN, gySun );
float gyLit = gyNL > 0.0 ? ( gyShadowOn > 0.5 ? gyShadowAt( gyP + flatN * gyShadowBias ) : 1.0 ) : 0.0;
float gyDir = mix( 1.0, clamp( gyNL * 1.5, 0.0, 1.0 ), gyDirK );
vec3 gyLight = mix( gyShadeCol, gySunCol, gyLit * gyDir );
// 灯光：照原版方块光，一格降一级（15 级），亮度按原版光照图的曲线 l / (4 − 3l)
float gyLv = floor( clamp( 1.0 - gyLampD / gyLampR, 0.0, 1.0 ) * 15.0 + 0.5 ) / 15.0;
float gyLb = gyLv / ( 4.0 - 3.0 * gyLv );
// 粒子照亮：每团粒子当一个点光源，距离照原版方块光一格降一级（同灯光），再乘朝向（背着的面不亮），不打影子
vec3 gyFl = vec3( 0.0 );
for ( int i = 0; i < ${最多粒子光}; i ++ ) {
  if ( i >= gyFlashN ) break;
  vec3 d = gyFlashPos[ i ] - gyP;
  float l = length( d );
  float v = floor( clamp( 1.0 - l / gyFlashR, 0.0, 1.0 ) * 15.0 + 0.5 ) / 15.0;
  gyFl += gyFlashCol[ i ] * ( v / ( 4.0 - 3.0 * v ) ) * clamp( dot( flatN, d / max( l, 1e-3 ) ) * 0.75 + 0.25, 0.0, 1.0 );
}
vec3 gyOut = gyGlow ? flatC * flatS * flatK * gyGlowK : flatC * mix( 1.0, flatS, gyFaceK ) * ( flatK * gyLight + gyLampCol * gyLb + gyFl );
outgoingLight = sRGBTransferEOTF( vec4( gyOut, 1.0 ) ).rgb;
`;

/** 补在平涂派生的受光材质上（平涂那段已经插在 opaque_fragment 前，这段跟在它后面） */
export const 补受光 = (shader: THREE.WebGLProgramParametersWithUniforms, u: 光影统一量) => {
  Object.assign(shader.uniforms, u);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${受光头}`).replace('#include <opaque_fragment>', `${受光身}\n#include <opaque_fragment>`);
};

const 水头 = /* glsl */ `
uniform vec3 gySun;
uniform float gyTime;
uniform float gyWaterPix;
uniform vec3 gyZenith;
uniform float gyRefl;
uniform vec3 gyGlintCol;
uniform vec3 gyWaterBody;
uniform float gyReflMin;
uniform float gyAtmoOn;
uniform sampler2D gyAtmoSky;
uniform vec3 gyZenCol;
uniform float gyZenK;
uniform float gyZenH;
${ATMO_PARS_GLSL}
${ATMO_FN_GLSL}
`;

// 水面：认的是 作品/把回忆拼好给你/场/2-海上/海面.tsx 着色器里的变量（seaT 水贴图、seaDeep、seaWater、seaTint、seaFogC 这一方位的地平色、seaF 远处雾档、seaDist），
// 在它算完之后重算一遍颜色：水体色 → 按菲涅尔混反射的天色 → 加太阳碎光 → 照旧淡进雾档。不要它的光路图案（太阳底下那条换成碎光），
// 也不要原版水贴图（用户 11-02：「原版水的颗粒的材质还在 这个是不是应该去掉啊？」），近处靠 近反射 托着，照样看得到波纹映的天。
// 天的样式是 Photon平滑 时，反射的天、远处融进的地平色都取 Photon 的天色图，和画布里画的天接得上。
// 波纹：几道方向、波长不同的正弦（深水色散 ω = √(gk)），时间取画面秒数，乱序出帧一样。远处波纹的细节在一个像素里平均掉了，
// 不做抗锯齿就会闪成噪点，所以按距离把高光的锐度降下来、范围放大（远处的碎光连成一条）。
// 像素版：波纹按贴图像素（1/16 格）的格子取值，一格一个法线、一个高光，和水贴图的像素一样大。
const 水身 = /* glsl */ `
vec2 gyWp = vSeaW.xz;
if ( gyWaterPix > 0.5 ) gyWp = ( floor( gyWp * 16.0 ) + 0.5 ) / 16.0;
float gyFar = clamp( seaDist / 96.0, 0.0, 1.0 );
vec2 gyG = vec2( 0.0 );
for ( int i = 0; i < 7; i ++ ) {
  float fi = float( i );
  float a = fi * 2.39996 + 0.7;
  vec2 dir = vec2( cos( a ), sin( a ) );
  float wl = 0.6 * pow( 1.5, fi );
  float k = 6.2831853 / wl;
  float w = sqrt( 9.8 * k ) * 0.5;
  gyG += dir * ( 0.08 * ( 1.0 - 0.06 * fi ) ) * cos( dot( dir, gyWp ) * k - w * gyTime + fi * 1.7 );
}
gyG *= mix( 1.0, 0.45, gyFar );
vec3 gyN = normalize( vec3( - gyG.x, 1.0, - gyG.y ) );
vec3 gyV = normalize( vSeaW - cameraPosition );
vec3 gyR = reflect( gyV, gyN );
gyR.y = abs( gyR.y );
float gyCos = clamp( dot( - gyV, gyN ), 0.0, 1.0 );
float gyFr = mix( gyReflMin, 1.0, pow( 1.0 - gyCos, 5.0 ) );
vec3 gyHor = seaFogC;
vec3 gySky;
if ( gyAtmoOn > 0.5 ) {
  gyHor = atmoDisp( atmoSkyAt( gyAtmoSky, normalize( vec3( gyV.x, - gyV.z, 0.0 ) ) ) );
  gySky = atmoDisp( atmoSkyAt( gyAtmoSky, vec3( gyR.x, - gyR.z, gyR.y ) ) );
  gySky = mix( gySky, gyZenCol, gyZenK * smoothstep( 0.0, gyZenH, gyR.y ) );
} else gySky = mix( seaFogC, gyZenith, smoothstep( 0.0, 0.8, gyR.y ) );
float gySd = max( dot( gyR, gySun ), 0.0 );
float gyGl = pow( gySd, mix( 1800.0, 220.0, gyFar ) ) * mix( 1.0, 2.2, gyFar );
gyGl = gyWaterPix > 0.5 ? step( 0.35, gyGl ) * 1.4 : smoothstep( 0.05, 0.6, gyGl ) * 1.4;
vec3 gyBody = mix( gyWaterBody, gyHor, 0.3 );
// 碎光封顶：sRGB 数值过 1 以后转线性是 2.4 次方往上翻，不封的话近处一块碎光的泛光糊成一大团，像素版的方块也被糊没
vec3 gyC = min( mix( gyBody, gySky, clamp( gyFr * gyRefl, 0.0, 1.0 ) ) + gyGlintCol * gyGl, vec3( 1.5 ) );
outgoingLight = sRGBTransferEOTF( vec4( mix( gyC, gyHor, seaF ), 1.0 ) ).rgb;
`;

/** 这份着色器是不是认得的水面 */
export const 是水面着色器 = (shader: THREE.WebGLProgramParametersWithUniforms) => shader.fragmentShader.includes('seaFogC') && shader.fragmentShader.includes('vSeaW');

export const 补水面 = (shader: THREE.WebGLProgramParametersWithUniforms, u: 光影统一量) => {
  if (!是水面着色器(shader)) return;
  Object.assign(shader.uniforms, atmoUniforms, u);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${水头}`).replace('#include <opaque_fragment>', `${水身}\n#include <opaque_fragment>`);
};

// 粒子面片（库/特效/粒子面片.tsx 的着色器：烟花火花、闪光）：主画面里照原样画（颜色不变）；另画一遍只有粒子的「泛光源」，
// 被主画面挡住的丢掉（和主画面的深度比），不过阈直接进泛光。这样烟花有光晕，人物的发光贴图（同样满亮度）不晕
export const 是粒子材质 = (m: THREE.Material) => (m as THREE.ShaderMaterial).isShaderMaterial && (m as THREE.ShaderMaterial).vertexShader.includes('attribute vec3 iCenter');
export const 补粒子源 = (shader: THREE.WebGLProgramParametersWithUniforms, u: 光影统一量) => {
  shader.uniforms.gyDepth = u.gyDepth;
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform sampler2D gyDepth;\nvoid main() {\n  if ( gl_FragCoord.z > texelFetch( gyDepth, ivec2( gl_FragCoord.xy ), 0 ).r + 1e-5 ) discard;')
    // 取最亮混色不乘 alpha：半透明的粒子在这里自己乘上
    .replace(/\}\s*$/, '  gl_FragColor = vec4( gl_FragColor.rgb * gl_FragColor.a, 1.0 );\n}');
};

// ---------- 全屏几遍：深度换算、泛光、合成 ----------

/** 主画面的深度 → Photon 云要的对数深度（log2(1 + 视深) / log2(远 + 1)，天 = 1；同 engine/light/大气/云.ts 读的那种） */
export const 对数深度片元 = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform float cNear;
uniform float cFar;
varying vec2 vUv;
void main() {
  float z = texture2D( tDepth, vUv ).r;
  if ( z >= 1.0 ) { gl_FragColor = vec4( 1.0 ); return; }
  float d = - perspectiveDepthToViewZ( z, cNear, cFar );
  gl_FragColor = vec4( log2( 1.0 + d ) / log2( cFar + 1.0 ) );
}`;

export const 全屏顶点 = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';

/** 取亮部顺带缩到一半：主画面（sRGB 编码、预乘）解回线性（预乘照原样），四个采样平均；粒子泛光源（线性）不过阈，乘 addK 直接加 */
export const 取亮片元 = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tAdd;
uniform float addK;
uniform vec2 texel;
uniform float threshold;
uniform float knee;
varying vec2 vUv;
vec3 pick( vec2 uv ) {
  vec4 t = texture2D( tSrc, uv );
  vec3 c = t.a > 0.0 ? sRGBTransferEOTF( vec4( max( t.rgb / t.a, 0.0 ), 1.0 ) ).rgb * t.a : vec3( 0.0 );
  float l = max( c.r, max( c.g, c.b ) );
  return c * smoothstep( threshold, threshold + knee, l ) + texture2D( tAdd, uv ).rgb * addK;
}
void main() {
  vec3 s = pick( vUv + texel * vec2( - 1.0, - 1.0 ) ) + pick( vUv + texel * vec2( 1.0, - 1.0 ) ) + pick( vUv + texel * vec2( - 1.0, 1.0 ) ) + pick( vUv + texel * vec2( 1.0, 1.0 ) );
  gl_FragColor = vec4( s * 0.25, 1.0 );
}`;

/** 缩一半 */
export const 缩片元 = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 s = texture2D( tSrc, vUv + texel * vec2( - 1.0, - 1.0 ) ).rgb + texture2D( tSrc, vUv + texel * vec2( 1.0, - 1.0 ) ).rgb
    + texture2D( tSrc, vUv + texel * vec2( - 1.0, 1.0 ) ).rgb + texture2D( tSrc, vUv + texel * vec2( 1.0, 1.0 ) ).rgb;
  gl_FragColor = vec4( s * 0.25, 1.0 );
}`;

/** 9 抽头高斯（双线性取 5 次），dir 是一个纹素的步长 */
export const 糊片元 = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D( tSrc, vUv ).rgb * 0.2270270270;
  s += ( texture2D( tSrc, vUv + dir * 1.3846153846 ).rgb + texture2D( tSrc, vUv - dir * 1.3846153846 ).rgb ) * 0.3162162162;
  s += ( texture2D( tSrc, vUv + dir * 3.2307692308 ).rgb + texture2D( tSrc, vUv - dir * 3.2307692308 ).rgb ) * 0.0702702703;
  gl_FragColor = vec4( s, 1.0 );
}`;

/** 合成到画布：原图（sRGB 编码、预乘）去预乘 → 调色 → 叠在天、云上 → 加泛光 → 再乘回透明度。泛光在透明的地方也加（叠在画布后面的 2D 天上，算加色）。
 *  天（skyOn）：透明的地方画 Photon 天色（同 engine/light/天空.tsx 大气打开时的穹顶：天色图 × 空气透过率 + 内散射）；
 *  云（cloudOn）：Photon 云那一遍画好的（画面值、预乘）叠在天上、画面底下；
 *  太阳：按 2D 天那样叠原版方形太阳（本体 8×8 贴图像素、外面两圈硬边光圈，加色），叠在云上、整块按云挡了多少压暗 */
export const 合成片元 = /* glsl */ `
uniform sampler2D atmoSky;
${ATMO_PARS_GLSL}
${ATMO_FN_GLSL}
uniform vec3 zenCol;
uniform float zenK;
uniform float zenH;
uniform float glowCell;
uniform vec2 glowOff;
uniform vec2 res;
uniform float skyOn;
uniform float cloudOn;
uniform sampler2D tCloud;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float sunOn;
uniform sampler2D tSun;
uniform vec2 sunMin;
uniform float sunN;
uniform vec3 haloCol;
uniform sampler2D tColor;
uniform sampler2D tB0;
uniform sampler2D tB1;
uniform sampler2D tB2;
uniform sampler2D tB3;
uniform sampler2D tB4;
uniform sampler2D tB5;
uniform float bw[ 6 ];
uniform float bloom;
uniform float sat;
uniform float con;
uniform vec3 darkTint;
uniform vec3 lightTint;
uniform float split;
varying vec2 vUv;
vec3 toSRGB( vec3 c ) { return sRGBTransferOETF( vec4( max( c, 0.0 ), 1.0 ) ).rgb; }
void main() {
  vec4 src = texture2D( tColor, vUv );
  float a = src.a;
  vec3 c = a > 0.0 ? max( src.rgb / a, 0.0 ) : vec3( 0.0 );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l ), c, sat );
  c = ( c - 0.5 ) * con + 0.5;
  float l2 = clamp( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0, 1.0 );
  c *= mix( vec3( 1.0 ), lightTint, split * l2 );
  c += darkTint * split * ( 1.0 - l2 ) * ( 1.0 - l2 );
  // 像素格光晕：一格（glowCell 个画布像素，格线从 glowOff 起）取格子中心那一点
  vec2 bu = glowCell > 0.0 ? ( ( floor( ( gl_FragCoord.xy - glowOff ) / glowCell ) + 0.5 ) * glowCell + glowOff ) / res : vUv;
  vec3 b = texture2D( tB0, bu ).rgb * bw[ 0 ] + texture2D( tB1, bu ).rgb * bw[ 1 ] + texture2D( tB2, bu ).rgb * bw[ 2 ] + texture2D( tB3, bu ).rgb * bw[ 3 ]
    + texture2D( tB4, bu ).rgb * bw[ 4 ] + texture2D( tB5, bu ).rgb * bw[ 5 ];
  vec3 bs = toSRGB( b * bloom );
  vec3 bg = vec3( 0.0 );
  float bgA = 0.0;
  if ( skyOn > 0.5 && a < 1.0 ) {
    vec4 vp = uInvProj * vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
    vec3 wd = normalize( mat3( uCamWorld ) * normalize( vp.xyz / vp.w ) );
    vec3 d = vec3( wd.x, - wd.z, wd.y );
    vec3 T;
    vec3 S = atmoAir( uCamPos, uCamPos + wd * atmoP.y, T );
    bg = atmoDisp( atmoSkyAt( atmoSky, d ) * T + S );
    bg = mix( bg, zenCol, zenK * smoothstep( 0.0, zenH, d.z ) );
    bgA = 1.0;
  }
  if ( cloudOn > 0.5 ) {
    vec4 cl = texture2D( tCloud, vUv );
    bg = cl.rgb + bg * ( 1.0 - cl.a );
    bgA = cl.a + bgA * ( 1.0 - cl.a );
  }
  // 太阳叠在云上、整块按本体那 8×8 格里云的平均不透明度压暗：逐像素让云挡的话，云缝里漏出一格格碎方块（主会话 11-02 看了说像出错）
  if ( skyOn > 0.5 && a < 1.0 && sunOn > 0.5 ) {
    vec2 q = floor( ( gl_FragCoord.xy - sunMin ) / sunN );
    if ( all( greaterThanEqual( q, vec2( - 2.0 ) ) ) && all( lessThan( q, vec2( 10.0 ) ) ) ) {
      float vis = 1.0;
      if ( cloudOn > 0.5 ) {
        vec2 px = 1.0 / vec2( textureSize( tCloud, 0 ) );
        float ca = 0.0;
        for ( int y = 0; y < 8; y ++ )
          for ( int x = 0; x < 8; x ++ ) ca += texture2D( tCloud, ( sunMin + ( vec2( x, y ) + 0.5 ) * sunN ) * px ).a;
        vis = 1.0 - ca / 64.0;
      }
      vec3 sc = vec3( 0.0 );
      if ( all( greaterThanEqual( q, vec2( 0.0 ) ) ) && all( lessThan( q, vec2( 8.0 ) ) ) ) {
        vec4 t = texelFetch( tSun, ivec2( q ), 0 );
        sc = t.rgb * t.a;
      } else {
        float r = max( max( - q.x - 1.0, q.x - 8.0 ), max( - q.y - 1.0, q.y - 8.0 ) );
        sc = r < 0.5 ? haloCol : haloCol * 0.5;
      }
      bg += sc * vis;
    }
  }
  bg = min( bg, 1.0 );
  vec3 o = clamp( c, 0.0, 1.0 ) * a + bg * ( 1.0 - a ) + bs;
  gl_FragColor = vec4( min( o, 1.0 ), a + bgA * ( 1.0 - a ) );
}`;
