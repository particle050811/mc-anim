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
/** 补光最多几盏（光影选项.补光） */
export const 最多补光 = 4;

export const 新光影统一量 = () => ({
  gyShadowMap: { value: null as THREE.Texture | null },
  gyShadowMat: { value: new THREE.Matrix4() },
  gyShadowOn: { value: 0 },
  /** 法线方向往外挪多少（格）再查影子，防自身打影 */
  gyShadowBias: { value: 0.04 },
  /** 影子过滤（光影参数.影子过滤）：0 硬比较；> 0 是一个纹素在影子图上的 UV 宽，按相邻 2×2 纹素双线性加权取 */
  gyShadowFilter: { value: 0 },
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
  /** 水面样式比较（用户 11-05 要几版并排挑）：0 平滑波纹、1 像素波纹（这两种同 gyWaterPix 的老写法）、2 Photon 式波纹、3 FFT 海（Ultra-Water 的谱） */
  gyWaterMode: { value: 0 },
  gySlope0: { value: null as THREE.Texture | null },
  gySlope1: { value: null as THREE.Texture | null },
  gySlope2: { value: null as THREE.Texture | null },
  gySlope3: { value: null as THREE.Texture | null },
  /** FFT 四层的边长（格 = 米） */
  gyFftLen: { value: new THREE.Vector4(1, 1, 1, 1) },
  /** FFT 三层的位移（海面网格按它起伏） */
  gyDisp0: { value: null as THREE.Texture | null },
  gyDisp1: { value: null as THREE.Texture | null },
  gyDisp2: { value: null as THREE.Texture | null },
  /** FFT 的水体按散射算（Ultra-Water 的做法）：开 = 1；散射色（线性）；透光 = 浪尖逆光透出来的那层（Ultra-Water uSSS 的 x、y、z） */
  gyScatOn: { value: 0 },
  gyScat: { value: new THREE.Color(0, 0.05, 0.08) },
  gySSS: { value: new THREE.Vector3(1.6, 0.06, 0.05) },
  /** 透水（用户 11-05「水下是完全看不到吗」）：开 = 1；水下那遍画面（rgb = 主画面的值，a = 视深）；每米衰减（线性 RGB，吸收 + 散射）；画面像素尺寸 */
  gyThruOn: { value: 0 },
  gyUnder: { value: null as THREE.Texture | null },
  gyAtt: { value: new THREE.Vector3(0.46, 0.07, 0.025) },
  gyRes: { value: new THREE.Vector2(1, 1) },
  /** 远处（用户 11-05 看到地平线一排黑浪：海只画到场景视距 192 格，起伏的浪头挡住后面的雾色、又正对着镜头不反光）：
   *  远 = FFT 海改画到多远（格，0 = 照场景视距）；雾 = 大气透视，每多少格淡掉 63%（0 = 不加）；边平 = 1 时浪高到画的边上压平，边缘不留剪影 */
  /** 反射里的云（用户 11-05 看到地平线一排黑浪：水面只映不带云的晴空，夕阳下满天的亮云映不出来）：开 = 1；朝天另画的一张云（画面值、预乘）、那台相机的投影 × 视图 */
  gyCloudOn: { value: 0 },
  gyLinMix: { value: 0 },
  gyCloudMap: { value: null as THREE.Texture | null },
  gyCloudVP: { value: new THREE.Matrix4() },
  gyFarR: { value: 0 },
  gyHaze: { value: 0 },
  gyEdgeFlat: { value: 0 },
  /** 浪强：Photon 式、FFT 的浪高和坡度一起乘它（网格起伏和法线对得上）；FFT 的坡度方差只乘一次方（乘平方的话浪强 8 以上整片糙成一片灰、碎光没了，预览 1105-1619） */
  gyWaveK: { value: 1 },
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
  /** 补光：几盏不打影子的灯（three 世界）。半径 0 = 方向光，Pos 是指向光源的方向；不然是点光，Pos 是位置 */
  gyFillN: { value: 0 },
  gyFillPos: { value: Array.from({ length: 最多补光 }, () => new THREE.Vector3()) },
  gyFillCol: { value: Array.from({ length: 最多补光 }, () => new THREE.Color()) },
  gyFillR: { value: Array.from({ length: 最多补光 }, () => 0) },
  gyFillSh: { value: Array.from({ length: 最多补光 }, () => 0) },
});

const 受光头 = /* glsl */ `
uniform sampler2D gyShadowMap;
uniform mat4 gyShadowMat;
uniform float gyShadowOn;
uniform float gyShadowBias;
uniform float gyShadowFilter;
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
uniform int gyFillN;
uniform vec3 gyFillPos[ ${最多补光} ];
uniform vec3 gyFillCol[ ${最多补光} ];
uniform float gyFillR[ ${最多补光} ];
uniform float gyFillSh[ ${最多补光} ];
float gyShadowAt( vec3 p ) {
  vec4 c = gyShadowMat * vec4( p, 1.0 );
  vec3 u = c.xyz / c.w * 0.5 + 0.5;
  if ( u.x <= 0.0 || u.y <= 0.0 || u.x >= 1.0 || u.y >= 1.0 || u.z >= 1.0 ) return 1.0;
  if ( gyShadowFilter <= 0.0 ) return u.z - 0.0005 <= texture2D( gyShadowMap, u.xy ).r ? 1.0 : 0.0;
  // 相邻 2×2 纹素的比较结果按双线性加权：影子边只在一个纹素宽里过渡，台阶变成平的斜边，不往外糊（4×4 试过，这一镜纹素约 1/16 格，糊成一团）
  vec2 t = u.xy / gyShadowFilter - 0.5;
  vec2 f = fract( t );
  vec2 b = ( floor( t ) + 0.5 ) * gyShadowFilter;
  float s00 = u.z - 0.0005 <= texture2D( gyShadowMap, b ).r ? 1.0 : 0.0;
  float s10 = u.z - 0.0005 <= texture2D( gyShadowMap, b + vec2( gyShadowFilter, 0.0 ) ).r ? 1.0 : 0.0;
  float s01 = u.z - 0.0005 <= texture2D( gyShadowMap, b + vec2( 0.0, gyShadowFilter ) ).r ? 1.0 : 0.0;
  float s11 = u.z - 0.0005 <= texture2D( gyShadowMap, b + vec2( gyShadowFilter ) ).r ? 1.0 : 0.0;
  return mix( mix( s00, s10, f.x ), mix( s01, s11, f.x ), f.y );
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
// 补光：不打影子；点光按距离平方衰减到半径处为 0（平滑，不分级），朝向同粒子照亮（背着的面留四分之一）；只补影子里的按太阳照到几成减掉
vec3 gyFi = vec3( 0.0 );
for ( int i = 0; i < ${最多补光}; i ++ ) {
  if ( i >= gyFillN ) break;
  vec3 d = gyFillPos[ i ];
  float a = 1.0;
  if ( gyFillR[ i ] > 0.0 ) {
    d = gyFillPos[ i ] - gyP;
    float l = length( d );
    d /= max( l, 1e-3 );
    a = clamp( 1.0 - l / gyFillR[ i ], 0.0, 1.0 );
    a *= a;
  }
  if ( gyFillSh[ i ] > 0.5 ) a *= 1.0 - gyLit * gyDir;
  gyFi += gyFillCol[ i ] * a * clamp( dot( flatN, d ) * 0.75 + 0.25, 0.0, 1.0 );
}
vec3 gyOut = gyGlow ? flatC * flatS * flatK * gyGlowK : flatC * mix( 1.0, flatS, gyFaceK ) * ( flatK * gyLight + gyLampCol * gyLb + gyFl + gyFi );
outgoingLight = sRGBTransferEOTF( vec4( gyOut, 1.0 ) ).rgb;
`;

/** 补在平涂派生的受光材质上（平涂那段已经插在 opaque_fragment 前，这段跟在它后面） */
export const 补受光 = (shader: THREE.WebGLProgramParametersWithUniforms, u: 光影统一量) => {
  Object.assign(shader.uniforms, u);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${受光头}`).replace('#include <opaque_fragment>', `${受光身}\n#include <opaque_fragment>`);
};

const 浪函数 = /* glsl */ `
float gyHash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float gyVnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( gyHash12( i ), gyHash12( i + vec2( 1.0, 0.0 ) ), u.x ), mix( gyHash12( i + vec2( 0.0, 1.0 ) ), gyHash12( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
// Photon（sixthsurge/photon include/surface/water_normal.glsl）的水面高度：6 道 Gerstner（sin² 尖浪顶），每道相位按噪声挪、方向按黄金角转，大范围浪高再按噪声起伏。
// 照它的参数自己写的（它的 noisetex 换成值噪声，256 格一周期同它的贴图）
float gyGer( vec2 c, vec2 dir, float t, float n, float wl ) {
  float k = 6.2831853 / wl;
  float x = sqrt( 9.8 * k ) * t - k * ( dot( dir, c ) + n );
  float s = sin( x ) * 0.5 + 0.5;
  return s * s;
}
float gyPhotonH( vec2 c, float t ) {
  vec2 dir = vec2( 0.8660254, 0.5 );
  mat2 rot = mat2( cos( 2.39996 ), sin( 2.39996 ), - sin( 2.39996 ), cos( 2.39996 ) );
  vec2 nc = ( c + vec2( 0.0, 0.25 * t ) ) * 0.007 * 256.0;
  float h = 0.0, amp = 1.0, freq = 0.7, wl = 1.0;
  for ( int i = 0; i < 6; i ++ ) {
    h += gyGer( c * freq, dir, t, gyVnoise( nc ) * 2.0, wl ) * amp;
    nc *= 2.5; amp *= 0.5; freq *= 1.7; wl *= 1.5; dir = rot * dir;
  }
  float hv = gyVnoise( ( c + vec2( 0.0, 0.1 * t ) ) * 0.001 * 256.0 );
  return h * max( 0.4, hv * 2.0 - 0.5 ) * ( 0.5 / ( 1.0 - pow( 0.5, 6.0 ) ) );
}
`;

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
uniform float gyWaterMode;
uniform sampler2D gySlope0;
uniform sampler2D gySlope1;
uniform sampler2D gySlope2;
uniform sampler2D gySlope3;
uniform vec4 gyFftLen;
uniform float gyWaveK;
varying vec2 gyU;
varying float gyHgt;
uniform float gyScatOn;
uniform vec3 gyScat;
uniform vec3 gySSS;
uniform float gyThruOn;
uniform sampler2D gyUnder;
uniform vec3 gyAtt;
uniform vec2 gyRes;
uniform float gyFarR;
uniform float gyHaze;
uniform float gyCloudOn;
uniform float gyLinMix;
uniform sampler2D gyCloudMap;
uniform mat4 gyCloudVP;
${ATMO_PARS_GLSL}
${ATMO_FN_GLSL}
${浪函数}
`;

// 水面：认的是 作品/把回忆拼好给你/场/2-海上/海面.tsx 着色器里的变量（seaT 水贴图、seaDeep、seaWater、seaTint、seaFogC 这一方位的地平色、seaF 远处雾档、seaDist），
// 在它算完之后重算一遍颜色：水体色 → 按菲涅尔混反射的天色 → 加太阳碎光 → 照旧淡进雾档。不要它的光路图案（太阳底下那条换成碎光），
// 也不要原版水贴图（用户 11-02：「原版水的颗粒的材质还在 这个是不是应该去掉啊？」），近处靠 近反射 托着，照样看得到波纹映的天。
// 天的样式是 Photon平滑 时，反射的天、远处融进的地平色都取 Photon 的天色图，和画布里画的天接得上。
// 波纹：几道方向、波长不同的正弦（深水色散 ω = √(gk)），时间取画面秒数，乱序出帧一样。远处波纹的细节在一个像素里平均掉了，
// 不做抗锯齿就会闪成噪点，所以按距离把高光的锐度降下来、范围放大（远处的碎光连成一条）。
// 像素版：波纹按贴图像素（1/16 格）的格子取值，一格一个法线、一个高光，和水贴图的像素一样大。
const 水身 = /* glsl */ `
vec3 gyHor = seaFogC;
vec3 gyC;
if ( gyWaterMode < 1.5 ) {
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
gyC = min( mix( gyBody, gySky, clamp( gyFr * gyRefl, 0.0, 1.0 ) ) + gyGlintCol * gyGl, vec3( 1.5 ) );
} else {
// 新两种（Photon 式、FFT）共用一套光：GGX 太阳（粗糙度下限当太阳是个小面光源）、坡度方差进粗糙度（远处不闪、碎光自己连成光路）、
// Lagarde 菲涅尔（粗糙的远处不发白）、反射 Photon 的天；碎光照 Ultra-Water 按每个像素里有几个小镜面按泊松抽（近处碎成点、远处平滑）
vec2 gyP0 = gyWaterMode > 1.5 ? gyU : vSeaW.xz;
vec2 gyWq = gyWaterPix > 0.5 ? ( floor( gyP0 * 16.0 ) + 0.5 ) / 16.0 : gyP0;
vec2 gySl = vec2( 0.0 );
vec2 gyVar = vec2( 0.0 );
vec3 gyVv = normalize( cameraPosition - vSeaW );
if ( gyWaterMode < 2.5 ) {
  float gyT = 0.5 * gyTime;
  float gyH0 = gyPhotonH( gyWq, gyT );
  vec2 gyD = vec2( gyPhotonH( gyWq + vec2( 0.1, 0.0 ), gyT ) - gyH0, gyPhotonH( gyWq + vec2( 0.0, 0.1 ), gyT ) - gyH0 ) / 0.1;
  // Photon 主世界开阔水面 0.04，平视时压平防噪点
  gySl = gyD * 0.04 * gyWaveK * smoothstep( 0.0, 0.15, abs( gyVv.y ) );
} else {
  vec2 gx = dFdx( gyP0 ), gy = dFdy( gyP0 );
  vec4 s0 = textureGrad( gySlope0, gyWq / gyFftLen.x, gx / gyFftLen.x, gy / gyFftLen.x );
  vec4 s1 = textureGrad( gySlope1, gyWq / gyFftLen.y, gx / gyFftLen.y, gy / gyFftLen.y );
  vec4 s2 = textureGrad( gySlope2, gyWq / gyFftLen.z, gx / gyFftLen.z, gy / gyFftLen.z );
  vec4 s3 = textureGrad( gySlope3, gyWq / gyFftLen.w, gx / gyFftLen.w, gy / gyFftLen.w );
  // 风带（表面活性物质压住短浪）：远处分成平、糙的条带，不是一片均匀的噪点
  float slick = smoothstep( 0.3, 0.7, gyVnoise( gyP0 * 0.006 + gyTime * 0.01 ) );
  float sl2 = mix( 0.75, 1.0, slick ), sl3 = mix( 0.4, 1.0, slick );
  s2.xy *= sl2; s2.zw *= sl2 * sl2; s3.xy *= sl3; s3.zw *= sl3 * sl3;
  gySl = ( s0.xy + s1.xy + s2.xy + s3.xy ) * gyWaveK;
  gyVar = ( max( s0.zw - s0.xy * s0.xy, 0.0 ) + max( s1.zw - s1.xy * s1.xy, 0.0 ) + max( s2.zw - s2.xy * s2.xy, 0.0 ) + max( s3.zw - s3.xy * s3.xy, 0.0 ) ) * gyWaveK;
}
vec3 gyN = normalize( vec3( - gySl.x, 1.0, - gySl.y ) );
vec3 dndx = dFdx( gyN ), dndy = dFdy( gyN );
float geoVar = min( 0.25 * ( dot( dndx, dndx ) + dot( dndy, dndy ) ), 0.18 );
float alpha = sqrt( 0.0004 + gyVar.x + gyVar.y + geoVar );
float NoV = max( dot( gyN, gyVv ), 1e-4 );
float F90 = max( 1.0 - 0.7 * sqrt( alpha ), 0.02 );
float gyFr = 0.02 + ( F90 - 0.02 ) * pow( 1.0 - NoV, 5.0 );
vec3 gyV = - gyVv;
vec3 gyR = reflect( gyV, gyN );
gyR.y = abs( gyR.y );
vec3 gySky;
if ( gyAtmoOn > 0.5 ) {
  gyHor = atmoDisp( atmoSkyAt( gyAtmoSky, normalize( vec3( gyV.x, - gyV.z, 0.0 ) ) ) );
  gySky = atmoDisp( atmoSkyAt( gyAtmoSky, vec3( gyR.x, - gyR.z, gyR.y ) ) );
  gySky = mix( gySky, gyZenCol, gyZenK * smoothstep( 0.0, gyZenH, gyR.y ) );
} else gySky = mix( seaFogC, gyZenith, smoothstep( 0.0, 0.8, gyR.y ) );
if ( gyCloudOn > 0.5 ) {
  // 反射方向在朝天那台相机里落在哪（方向当无穷远的点，只取旋转），落在图里就把那里的云叠在天上（同合成：云 + 天 ×（1 − 不透明度））
  vec4 cc = gyCloudVP * vec4( gyR, 0.0 );
  vec2 cuv = cc.xy / cc.w * 0.5 + 0.5;
  if ( cc.w > 0.0 && all( greaterThan( cuv, vec2( 0.0 ) ) ) && all( lessThan( cuv, vec2( 1.0 ) ) ) ) {
    vec4 cl = texture2D( gyCloudMap, cuv );
    gySky = cl.rgb + gySky * ( 1.0 - cl.a );
  }
}
float aS = max( alpha, 0.015 );
float aS2 = aS * aS;
vec3 H = normalize( gySun + gyVv );
float NoH = max( dot( gyN, H ), 0.0 );
float nl = max( dot( gyN, gySun ), 0.0 );
float dd = NoH * NoH * ( aS2 - 1.0 ) + 1.0;
float D = aS2 / ( 3.14159265 * dd * dd );
float vis = 0.5 / ( nl * sqrt( NoV * NoV * ( 1.0 - aS2 ) + aS2 ) + NoV * sqrt( nl * nl * ( 1.0 - aS2 ) + aS2 ) + 1e-5 );
float Fs = 0.02 + 0.98 * pow( 1.0 - max( dot( gyVv, H ), 0.0 ), 5.0 );
float spec = 3.14159265 * D * vis * Fs * nl;
if ( spec > 0.02 ) {
  vec2 fw = fwidth( gyP0 );
  float lf = log2( max( max( fw.x, fw.y ), 1e-3 ) ) + 1.0;
  float l0 = floor( lf );
  float lam1 = 2e4 * D * NoH * 6.8e-5 / ( 4.0 * max( dot( gyVv, H ), 0.05 ) );
  float m = 0.0;
  for ( int j = 0; j < 2; j ++ ) {
    float l = l0 + float( j ), sz = exp2( l );
    vec2 cell = floor( gyP0 / sz );
    float lam = lam1 * sz * sz;
    float u = clamp( gyHash12( cell * 1.31 + floor( gyTime * 3.0 + gyHash12( cell + l * 17.17 ) * 64.0 ) * 3.7 ), 1e-4, 0.9999 );
    float n;
    if ( lam > 6.0 ) n = max( 0.0, lam + sqrt( lam ) * log( u / ( 1.0 - u ) ) / 1.702 );
    else { float pp = exp( - lam ), F = pp; n = 0.0; for ( int k = 0; k < 14; k ++ ) { if ( u <= F ) break; n += 1.0; pp *= lam / n; F += pp; } }
    m += ( j == 0 ? 1.0 - ( lf - l0 ) : lf - l0 ) * min( n / max( lam, 1e-4 ), 30.0 );
  }
  spec *= mix( 1.0, m, smoothstep( 4.0, 30.0, seaDist ) );
}
vec3 gyBody = mix( gyWaterBody, gyHor, 0.3 );
if ( gyScatOn > 0.5 ) {
  // 照 Ultra-Water（OceanSurface.js 的 lighting 一节，深海没有海底可折射）：水体 = 散射色 ×（天光 + 太阳）；
  // 透光：浪尖越高、越是迎着太阳看、背光面越透（k1），正对着往下看也透一点（k2），受光面再加一点（z）。这几样在线性空间算，再换回 sRGB 数值
  vec3 amb = pow( max( gyAtmoOn > 0.5 ? atmoDisp( atmoSkyAt( gyAtmoSky, vec3( 0.0, 0.0, 1.0 ) ) ) : gyZenith, 0.0 ), vec3( 2.2 ) );
  vec3 sunL = pow( max( gyGlintCol, 0.0 ), vec3( 2.2 ) );
  float sunUp = max( gySun.y, 0.0 );
  vec3 insc = gyScat * ( amb + sunL * sunUp );
  float k1 = gySSS.x * max( gyHgt, 0.0 ) * pow( clamp( dot( gySun, - gyVv ), 0.0, 1.0 ), 4.0 ) * pow( 0.5 - 0.5 * dot( gyN, gySun ), 3.0 );
  float k2 = gySSS.y * NoV * NoV;
  vec3 sss = ( k1 + k2 ) * gyScat * sunL + gySSS.z * nl * gyScat * sunL;
  vec3 gyLin = insc + sss;
  if ( gyThruOn > 0.5 ) {
    // 透水：水下那遍画面按折射挪一点取（坡度 × 离水面越远挪得越多，取到水面前面的东西就不挪），
    // 视线在水里走 L 米、海底那点在水面下 dz 米（光先往下照到它，按漫射天光近似走 dz），每米按 gyAtt 衰减；水里走过的那段散射出 insc ×（1 − 透过）
    vec2 suv = gl_FragCoord.xy / gyRes;
    float dw = vSeaClip.w;
    float s2w = length( vSeaW - cameraPosition ) / dw;
    vec4 bg = texture2D( gyUnder, suv + gySl * 0.3 / max( dw, 1.0 ) );
    if ( bg.a < dw ) bg = texture2D( gyUnder, suv );
    // 背后是天（深度 1e9）= 没打着东西，不能拿来算水下多深：原来这样算出 dz = 0、路程 0，视线朝上（比眼睛高的浪脊）的水体连浪尖透光一起归零，
    // 成了地平线前一条黑带（用户 11-05「上边为什么会变成黑色」）。屏幕上背后是天不等于光穿过了薄浪：迎着眼睛的浪坡折射进水后还是往下走进深水，按深水算
    if ( bg.a < 1e8 ) {
      // 水下那一点在水面下多深按直线视线算；视线进水以后折弯（折射率 1.33），水里实际走 dz / cos(折射角)，比直线短（平视时差两倍）
      float dz = max( vSeaW.y - ( cameraPosition.y + gyV.y * bg.a * s2w ), 0.0 );
      float cosT = sqrt( max( 1.0 - ( 1.0 - NoV * NoV ) / 1.769, 1e-4 ) );
      float L = min( max( bg.a - dw, 0.0 ) * s2w, dz / cosT );
      vec3 Tv = exp( - gyAtt * min( L, 1e4 ) );
      vec3 Tb = Tv * exp( - gyAtt * min( dz, 1e4 ) );
      vec3 under = pow( max( bg.rgb, 0.0 ), vec3( 2.2 ) );
      gyLin = under * Tb + gyLin * ( 1.0 - Tv );
    }
  }
  gyBody = pow( gyLin, vec3( 1.0 / 2.2 ) );
}
// 反射和水体按线性光强混（gyLinMix；原来直接混 sRGB 数值，反射占两成时只有线性混的一半亮）
float gyFW = clamp( gyFr * gyRefl / 0.9, 0.0, 1.0 );
vec3 gyMix = gyLinMix > 0.5 ? pow( mix( pow( max( gyBody, 0.0 ), vec3( 2.2 ) ), pow( max( gySky, 0.0 ), vec3( 2.2 ) ), gyFW ), vec3( 1.0 / 2.2 ) ) : mix( gyBody, gySky, gyFW );
gyC = min( gyMix + gyGlintCol * spec * 0.05, vec3( 1.5 ) );
}
float gyFog = seaF;
if ( gyWaterMode > 1.5 && ( gyFarR > 0.0 || gyHaze > 0.0 ) ) {
  float gyEnd = gyFarR > 0.0 ? gyFarR : seaFar;
  // 大气透视往同一方位的地平色淡；画到头之前那三成再补满，海的尽头和天接上，不留一道边
  gyFog = max( gyHaze > 0.0 ? 1.0 - exp( - seaDist / gyHaze ) : 0.0, smoothstep( 0.7 * gyEnd, gyEnd, seaDist ) );
  if ( gyFarR <= 0.0 ) gyFog = max( gyFog, seaF );
}
outgoingLight = sRGBTransferEOTF( vec4( mix( gyC, gyHor, gyFog ), 1.0 ) ).rgb;
`;

/** 这份着色器是不是认得的水面 */
export const 是水面着色器 = (shader: THREE.WebGLProgramParametersWithUniforms) => shader.fragmentShader.includes('seaFogC') && shader.fragmentShader.includes('vSeaW');

// 海面起伏（Photon 式、FFT）：网格换成 光影渲染.tsx 的 起伏网格（围着镜头、越远越疏），顶点在三维世界里按浪高挪：
// FFT 取 Ultra-Water 三层的位移（含水平挤压，浪顶变尖），Photon 式取同一个高度函数，高 = 0.04 × 浪强 × 高度（和法线用的坡度一致）
const 起伏顶点头 = /* glsl */ `
uniform float gyWaterMode;
uniform float gyTime;
uniform float gyWaveK;
uniform sampler2D gyDisp0;
uniform sampler2D gyDisp1;
uniform sampler2D gyDisp2;
uniform vec4 gyFftLen;
uniform float gyFarR;
uniform float gyEdgeFlat;
uniform float seaFar;
varying vec2 gyU;
varying float gyHgt;
${浪函数}
`;
const 起伏顶点身 = /* glsl */ `
vec4 gyW = modelMatrix * vec4( transformed, 1.0 );
gyU = gyW.xz;
gyHgt = 0.0;
if ( gyWaterMode > 2.5 ) {
  vec3 d = textureLod( gyDisp0, gyU / gyFftLen.x, 0.0 ).xyz + textureLod( gyDisp1, gyU / gyFftLen.y, 0.0 ).xyz + textureLod( gyDisp2, gyU / gyFftLen.z, 0.0 ).xyz;
  if ( gyEdgeFlat > 0.5 ) {
    float gyEnd = gyFarR > 0.0 ? gyFarR : seaFar;
    d *= 1.0 - smoothstep( 0.6 * gyEnd, 0.95 * gyEnd, length( gyU - cameraPosition.xz ) );
  }
  gyW.xyz += d * gyWaveK;
  gyHgt = d.y * gyWaveK;
} else if ( gyWaterMode > 1.5 ) {
  gyW.y += 0.04 * gyWaveK * ( gyPhotonH( gyU, 0.5 * gyTime ) - 0.5 );
}
gl_Position = projectionMatrix * viewMatrix * gyW;
vSeaW = gyW.xyz;
vSeaClip = gl_Position;
`;

export const 补水面 = (shader: THREE.WebGLProgramParametersWithUniforms, u: 光影统一量) => {
  if (!是水面着色器(shader)) return;
  Object.assign(shader.uniforms, atmoUniforms, u);
  if (!shader.vertexShader.includes('vSeaClip = gl_Position;')) throw new Error('海面顶点着色器认不出（没有 vSeaClip = gl_Position;）');
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${起伏顶点头}`).replace('vSeaClip = gl_Position;', `vSeaClip = gl_Position;\nif ( gyWaterMode > 1.5 ) {\n${起伏顶点身}\n}`);
  if (!shader.fragmentShader.includes('if ( seaDist > seaFar ) discard;')) throw new Error('海面片元着色器认不出（没有 seaDist > seaFar 的 discard）');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${水头}`)
    .replace('if ( seaDist > seaFar ) discard;', 'if ( seaDist > ( gyWaterMode > 1.5 && gyFarR > 0.0 ? gyFarR : seaFar ) ) discard;')
    .replace('#include <opaque_fragment>', `${水身}\n#include <opaque_fragment>`);
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
/** 水下那遍：rgb 照抄主画面，a = 视深（格；没东西 = 1e9），水面着色器按它算水里走了多远 */
export const 水下片元 = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float cNear;
uniform float cFar;
varying vec2 vUv;
void main() {
  float z = texture2D( tDepth, vUv ).r;
  gl_FragColor = vec4( texture2D( tColor, vUv ).rgb, z >= 1.0 ? 1e9 : - perspectiveDepthToViewZ( z, cNear, cFar ) );
}`;

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

/** 取亮部顺带缩到一半：主画面（sRGB 编码、预乘）解回线性（预乘照原样），四个采样平均；粒子泛光源（线性）不过阈，乘 addK 直接加。
 *  透明度通道带粒子的覆盖率（这一块有几成是粒子），跟着各层一起缩、一起糊，合成时按它压粒子挤成一团的地方（压密光晕） */
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
// 覆盖率另算一路，颜色那一路的算式照原样（不压时和原来逐像素一样）
float cover( vec2 uv ) { return texture2D( tAdd, uv ).a; }
void main() {
  vec3 s = pick( vUv + texel * vec2( - 1.0, - 1.0 ) ) + pick( vUv + texel * vec2( 1.0, - 1.0 ) ) + pick( vUv + texel * vec2( - 1.0, 1.0 ) ) + pick( vUv + texel * vec2( 1.0, 1.0 ) );
  float a = addK > 0.0 ? ( cover( vUv + texel * vec2( - 1.0, - 1.0 ) ) + cover( vUv + texel * vec2( 1.0, - 1.0 ) ) + cover( vUv + texel * vec2( - 1.0, 1.0 ) ) + cover( vUv + texel * vec2( 1.0, 1.0 ) ) ) * 0.25 : 0.0;
  gl_FragColor = vec4( s * 0.25, a );
}`;

/** 缩一半 */
export const 缩片元 = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 s = texture2D( tSrc, vUv + texel * vec2( - 1.0, - 1.0 ) ).rgb + texture2D( tSrc, vUv + texel * vec2( 1.0, - 1.0 ) ).rgb
    + texture2D( tSrc, vUv + texel * vec2( - 1.0, 1.0 ) ).rgb + texture2D( tSrc, vUv + texel * vec2( 1.0, 1.0 ) ).rgb;
  float a = texture2D( tSrc, vUv + texel * vec2( - 1.0, - 1.0 ) ).a + texture2D( tSrc, vUv + texel * vec2( 1.0, - 1.0 ) ).a
    + texture2D( tSrc, vUv + texel * vec2( - 1.0, 1.0 ) ).a + texture2D( tSrc, vUv + texel * vec2( 1.0, 1.0 ) ).a;
  gl_FragColor = vec4( s * 0.25, a * 0.25 );
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
  float a = texture2D( tSrc, vUv ).a * 0.2270270270;
  a += ( texture2D( tSrc, vUv + dir * 1.3846153846 ).a + texture2D( tSrc, vUv - dir * 1.3846153846 ).a ) * 0.3162162162;
  a += ( texture2D( tSrc, vUv + dir * 3.2307692308 ).a + texture2D( tSrc, vUv - dir * 3.2307692308 ).a ) * 0.0702702703;
  gl_FragColor = vec4( s, a );
}`;

/** 合成到画布：原图（sRGB 编码、预乘）去预乘 → 调色 → 叠在天、云上 → 加泛光 → 再乘回透明度。泛光在透明的地方也加（叠在画布后面的 2D 天上，算加色）。
 *  天（skyOn）：透明的地方画 Photon 天色（同 engine/light/天空.tsx 大气打开时的穹顶：天色图 × 空气透过率 + 内散射）；
 *  云（cloudOn）：Photon 云那一遍画好的（画面值、预乘）叠在天上、画面底下；
 *  太阳：按 2D 天那样叠原版方形太阳（本体 sunBody × sunBody 个贴图像素：原版 8，材质包高清的按高清像素；外面两圈硬边光圈各一个贴图像素宽，加色），
 *  叠在云上、整块按云挡了多少压暗 */
export const 合成片元 = /* glsl */ `
uniform sampler2D atmoSky;
${ATMO_PARS_GLSL}
${ATMO_FN_GLSL}
uniform vec3 zenCol;
uniform float zenK;
uniform float zenH;
uniform float glowCell;
uniform float denseK;
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
uniform float sunBody;
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
  // 压密光晕：每层按这一层糊过的粒子覆盖率除，覆盖率不到 1 / denseK（零散的火花）不动，挤成一大团的地方压下来；denseK = 0 不压（照上面那行原样）
  if ( denseK > 0.0 ) {
    vec4 t0 = texture2D( tB0, bu ), t1 = texture2D( tB1, bu ), t2 = texture2D( tB2, bu ), t3 = texture2D( tB3, bu ), t4 = texture2D( tB4, bu ), t5 = texture2D( tB5, bu );
    b = t0.rgb * bw[ 0 ] / max( 1.0, t0.a * denseK ) + t1.rgb * bw[ 1 ] / max( 1.0, t1.a * denseK ) + t2.rgb * bw[ 2 ] / max( 1.0, t2.a * denseK )
      + t3.rgb * bw[ 3 ] / max( 1.0, t3.a * denseK ) + t4.rgb * bw[ 4 ] / max( 1.0, t4.a * denseK ) + t5.rgb * bw[ 5 ] / max( 1.0, t5.a * denseK );
  }
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
  // 太阳叠在云上、整块按本体里 8×8 个点上云的平均不透明度压暗：逐像素让云挡的话，云缝里漏出一格格碎方块（主会话 11-02 看了说像出错）
  if ( skyOn > 0.5 && a < 1.0 && sunOn > 0.5 ) {
    vec2 q = floor( ( gl_FragCoord.xy - sunMin ) / sunN );
    if ( all( greaterThanEqual( q, vec2( - 2.0 ) ) ) && all( lessThan( q, vec2( sunBody + 2.0 ) ) ) ) {
      float vis = 1.0;
      if ( cloudOn > 0.5 ) {
        vec2 px = 1.0 / vec2( textureSize( tCloud, 0 ) );
        float ca = 0.0;
        for ( int y = 0; y < 8; y ++ )
          for ( int x = 0; x < 8; x ++ ) ca += texture2D( tCloud, ( sunMin + ( vec2( x, y ) + 0.5 ) * sunN * sunBody / 8.0 ) * px ).a;
        vis = 1.0 - ca / 64.0;
      }
      vec3 sc = vec3( 0.0 );
      if ( all( greaterThanEqual( q, vec2( 0.0 ) ) ) && all( lessThan( q, vec2( sunBody ) ) ) ) {
        vec4 t = texelFetch( tSun, ivec2( q ), 0 );
        sc = t.rgb * t.a;
      } else {
        float r = max( max( - q.x - 1.0, q.x - sunBody ), max( - q.y - 1.0, q.y - sunBody ) );
        sc = r < 0.5 ? haloCol : haloCol * 0.5;
      }
      bg += sc * vis;
    }
  }
  bg = min( bg, 1.0 );
  vec3 o = clamp( c, 0.0, 1.0 ) * a + bg * ( 1.0 - a ) + bs;
  gl_FragColor = vec4( min( o, 1.0 ), a + bgA * ( 1.0 - a ) );
}`;
