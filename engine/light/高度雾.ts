// 高度雾：在 three 的线性雾 / 指数平方雾上叠一层解析指数高度雾（照 Photon 的 include/fog/overworld/analytic.glsl，Photon 许可证允许个人修改和再分发部分代码），
// 低处浓、高处淡，高空往下看谷底先被雾填上、山脊露在外面，0.2～5 公里也有远近层次（用户 10-04 定）。
// 改的是 three 的 fog_* 着色块，所有材质（three 自带的、onBeforeCompile 改过的、合并了 UniformsLib.fog 的 ShaderMaterial）走同一套。
// 浓度：密度(h) = 浓度 × 2^(−(h − 起点) / 半衰)（每米），沿视线积分有解析解（Photon 的 air_fog_analytic_airmass），透过率 = exp(−积分)；
// 和原来的雾合起来：雾 = 1 − (1 − 原来的雾) × 透过率，雾色仍是场景雾色。
// 参数在共用 uniform（fogHeight = 起点、半衰、浓度），由 `useHeightFog` 按镜头设，浓度 0 = 不开（主世界、古城不开）。
// 屏幕 AO 的第 2 遍“先减雾、乘 AO、再加雾”要按同一公式算雾（lib/体素/屏幕AO.tsx 用 `HEIGHT_FOG_GLSL`）。
import * as THREE from 'three';
import { use写入者, 新写入槽 } from '../core/写入者.ts';
import { ATMO_FN_GLSL, ATMO_PARS_GLSL } from './大气.ts';

export type HeightFogParams = { start: number; halfLife: number; density: number };

// 场景坐标 Z 朝上，three 的世界坐标是 Y 朝上（场景放在 rotation [−90°, 0, 0] 的组里），所以高度是世界坐标的 y
const heightFogVec = { x: 0, y: 1, z: 0 };
// 普通对象（不是 THREE.Vector3）：three 克隆材质的 uniform 时只复制引用（UniformsUtils.cloneUniforms），所有材质共用这一份
const fogHeight = { value: heightFogVec };
for (const k of Object.keys(THREE.ShaderLib) as (keyof typeof THREE.ShaderLib)[]) {
  const uniforms = THREE.ShaderLib[k].uniforms as Record<string, THREE.IUniform>;
  if (uniforms.fogColor) uniforms.fogHeight = fogHeight;
}
(THREE.UniformsLib.fog as Record<string, THREE.IUniform>).fogHeight = fogHeight;

// 方向雾色（黄昏，用户 10-07 问云为什么不染黄）：雾色按视线和太阳的水平夹角在雾色和余晖色之间混，混多少 = 强 × cos³（同 模型/场景/天空.tsx 暮色天空的余晖，天边接得上），
// 背着太阳那边仍是薄荷绿；强 0 = 不开。
// fogSun：世界坐标（Y 朝上）的太阳水平方向 (x, z) 和强度 w；fogGlow：余晖色（画面数值，同 fogColor：雾在 colorspace 之后混）
const glowDir = { x: 0, y: 0, z: 0, w: 0 };
const glowColor = { x: 1, y: 1, z: 1 };
const fogSun = { value: glowDir };
const fogGlow = { value: glowColor };
for (const k of Object.keys(THREE.ShaderLib) as (keyof typeof THREE.ShaderLib)[]) {
  const uniforms = THREE.ShaderLib[k].uniforms as Record<string, THREE.IUniform>;
  if (uniforms.fogColor) {
    uniforms.fogSun = fogSun;
    uniforms.fogGlow = fogGlow;
  }
}
(THREE.UniformsLib.fog as Record<string, THREE.IUniform>).fogSun = fogSun;
(THREE.UniformsLib.fog as Record<string, THREE.IUniform>).fogGlow = fogGlow;
export const dirFog = { dir: glowDir, color: glowColor };
const 方向雾槽 = 新写入槽();
const 关方向雾 = () => {
  glowDir.w = 0;
};
// 光向：场景坐标（Z 朝上）指向太阳；色：#rrggbb（sRGB，画面数值）；强：0～1
export const useDirFog = (opts: { sunDir: number[]; color: string; strength: number } | null) => {
  use写入者(方向雾槽, 关方向雾);
  if (opts) {
    const horizLen = Math.hypot(opts.sunDir[0], opts.sunDir[1]) || 1;
    // 场景 (x, y, z) → 世界 (x, z, −y)
    glowDir.x = opts.sunDir[0] / horizLen;
    glowDir.z = -opts.sunDir[1] / horizLen;
    glowDir.w = opts.strength;
    const rgbInt = parseInt(opts.color.slice(1), 16);
    glowColor.x = ((rgbInt >> 16) & 255) / 255;
    glowColor.y = ((rgbInt >> 8) & 255) / 255;
    glowColor.z = (rgbInt & 255) / 255;
  } else glowDir.w = 0;
};
// 视线从 o 到 e（世界坐标）方向上的雾色
export const DIR_FOG_GLSL = /* glsl */ `
vec3 dirFogColor( vec3 fc, vec3 o, vec3 e, vec4 sun, vec3 glow ) {
  if ( sun.w <= 0.0 ) return fc;
  vec2 v = e.xz - o.xz;
  float l = length( v );
  if ( l < 1e-3 ) return fc;
  float c = max( dot( v / l, sun.xz ), 0.0 );
  return mix( fc, glow, sun.w * c * c * c );
}`;

// 天色雾（暮色超远景，用户 11-07 定修地平线的雾色带）：雾越浓，雾色越往视线方向上的穹顶颜色靠（照 天空.tsx 暮色那支 skyShader 算，含余晖），
// 全进雾的远处地形就是它背后那片天的颜色，地形远端的边和 32 米一格的远景剪影都融进天里。没开（比例 0）时雾色照旧，主世界和别的暮色镜头不变。
// 共用 uniform 同 方向雾：普通对象、数组里是同一批 Vector4（three 克隆 uniform 时数组只浅拷贝，元素还是这几个），所有材质和屏幕 AO 共用
export const SKY_FOG_BANDS = 8;
const skyFogVec = { x: 0, y: 0, z: 0, w: 0 }; // x 比例 0～1、y 余晖强
const skyFogSun = { x: 0, y: 0, z: 1 }; // 场景坐标（Z 朝上）指向太阳，单位向量
const skyFogGlow = { x: 1, y: 1, z: 1 }; // 余晖色（线性）
const skyFogBands = Array.from({ length: SKY_FOG_BANDS }, () => new THREE.Vector4()); // 天色（线性）和这条色带的仰角正弦
export const skyFogUniforms = { fogSky: { value: skyFogVec }, fogSkySun: { value: skyFogSun }, fogSkyGlow: { value: skyFogGlow }, fogSkyBand: { value: skyFogBands } };
for (const k of Object.keys(THREE.ShaderLib) as (keyof typeof THREE.ShaderLib)[]) {
  const uniforms = THREE.ShaderLib[k].uniforms as Record<string, THREE.IUniform>;
  if (uniforms.fogColor) Object.assign(uniforms, skyFogUniforms);
}
Object.assign(THREE.UniformsLib.fog as Record<string, THREE.IUniform>, skyFogUniforms);
const 天色雾槽 = 新写入槽();
const 关天色雾 = () => {
  skyFogVec.x = 0;
};
// 比例：0 不开、1 全进雾处正好是天色；天色：穹顶的色带 [仰角正弦, #rrggbb]（条数 = SKY_FOG_BANDS）；余晖：色、强，光向：场景坐标指向太阳
export const useSkyFog = (opts: { k: number; bands: [number, string][]; glow: string | null; glowK: number; sunDir: number[] } | null) => {
  use写入者(天色雾槽, 关天色雾);
  if (!opts || opts.k <= 0) {
    skyFogVec.x = 0;
    return;
  }
  if (opts.bands.length !== SKY_FOG_BANDS) throw new Error(`天色雾：色带要 ${SKY_FOG_BANDS} 条`);
  const c = new THREE.Color();
  opts.bands.forEach(([at, hex], i) => {
    c.set(hex);
    skyFogBands[i].set(c.r, c.g, c.b, at);
  });
  c.set(opts.glow ?? '#ffffff');
  Object.assign(skyFogGlow, { x: c.r, y: c.g, z: c.b });
  const l = Math.hypot(opts.sunDir[0], opts.sunDir[1], opts.sunDir[2]) || 1;
  Object.assign(skyFogSun, { x: opts.sunDir[0] / l, y: opts.sunDir[1] / l, z: opts.sunDir[2] / l });
  skyFogVec.x = Math.min(1, opts.k);
  skyFogVec.y = opts.glow ? opts.glowK : 0;
};
// 视线 o → e（世界坐标，Y 朝上）方向上的天色，再按雾的浓淡 f 和原来的雾色混。穹顶跟着镜头、半径 120 公里，视线方向就是穹顶上那一点的方向。
// 出色照地平线上实际看到的：贴着地平线那一圈是远处的 Photon 云（暮色光照.tsx 的 TwilightClouds），云往远处褪成天色时走了大气.ts 的 atmoDisp
// （PBR Neutral 压高光再转 sRGB），比穹顶本身（不压）暗 6% 上下（11-07 量的：穹顶 (255,194,170)、地平线 (240,180,157)）。所以这里也压，
// 照抄 atmoNeutral：屏幕 AO 那份着色器只在开大气时才带 大气.ts 的函数
export const SKY_FOG_GLSL = /* glsl */ `
uniform vec4 fogSky;
uniform vec3 fogSkySun;
uniform vec3 fogSkyGlow;
uniform vec4 fogSkyBand[${SKY_FOG_BANDS}];
vec3 skyFogSrgb( vec3 color ) {
  color = max( color, vec3( 0.0 ) );
  float x = min( color.r, min( color.g, color.b ) );
  color -= x < 0.08 ? x - 6.25 * x * x : 0.04;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak >= 0.76 ) {
    float newPeak = 1.0 - 0.0576 / ( peak - 0.52 );
    color *= newPeak / peak;
    color = mix( color, vec3( newPeak ), 1.0 - 1.0 / ( 0.15 * ( peak - newPeak ) + 1.0 ) );
  }
  vec3 c = clamp( color, 0.0, 1.0 );
  return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), c ) );
}
vec3 skyFogColor( vec3 o, vec3 e ) {
  vec3 w = normalize( e - o );
  vec3 d = vec3( w.x, - w.z, w.y );
  float h = d.z;
  vec3 col = fogSkyBand[0].rgb;
  for ( int i = 1; i < ${SKY_FOG_BANDS}; i++ ) col = mix( col, fogSkyBand[i].rgb, smoothstep( fogSkyBand[i - 1].w, fogSkyBand[i].w, h ) );
  if ( fogSky.y > 0.0 ) {
    float az = max( dot( normalize( d.xy + 1e-5 ), normalize( fogSkySun.xy + 1e-5 ) ), 0.0 );
    col = mix( col, fogSkyGlow, fogSky.y * pow( az, 3.0 ) * ( 1.0 - smoothstep( -0.05, 0.4, h ) ) );
    col += fogSkyGlow * fogSky.y * 0.6 * pow( max( dot( d, fogSkySun ), 0.0 ), 40.0 );
  }
  return skyFogSrgb( col );
}
vec3 skyFogMix( vec3 fc, vec3 o, vec3 e, float f ) {
  return fogSky.x > 0.0 ? mix( fc, skyFogColor( o, e ), fogSky.x * f ) : fc;
}`;

export const heightFog = heightFogVec;
const 高度雾槽 = 新写入槽();
const 关高度雾 = () => {
  heightFogVec.z = 0;
};
export const useHeightFog = (params: HeightFogParams) => {
  use写入者(高度雾槽, 关高度雾);
  heightFogVec.x = params.start;
  heightFogVec.y = params.halfLife;
  heightFogVec.z = params.density;
};

// 视线从 o 到 e（世界坐标）的空气量（米 × 相对密度）：∫ 2^(−(h − 起点) / 半衰) dt = L × (两端的相对密度之差) / (ln2 × Δh / 半衰)。
// 写成两端密度相减，不写成「起点密度 × (e^k − 1) / k」：镜头高过起点约 3.8 公里（半衰 30 米时 2^−128）往下看，前一项下溢成 0、后一项上溢成无穷，乘出 NaN。
// 高差 Δh ≈ 0 时取极限：起点密度 × (1 − k/2)
export const HEIGHT_FOG_GLSL = /* glsl */ `
float heightFogAirmass( vec3 o, vec3 e, vec3 fh ) {
  float L = distance( o, e );
  float a = exp2( ( fh.x - o.y ) / fh.y );
  float k = 0.6931472 * ( e.y - o.y ) / fh.y;
  return abs( k ) < 1e-3 ? L * a * ( 1.0 - 0.5 * k ) : L * ( a - exp2( ( fh.x - e.y ) / fh.y ) ) / k;
}
float addHeightFog( float fogFactor, vec3 o, vec3 e, vec3 fh ) {
  return fh.z > 0.0 ? 1.0 - ( 1.0 - fogFactor ) * exp( - fh.z * heightFogAirmass( o, e, fh ) ) : fogFactor;
}`;

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorld;
#endif
`;
// 世界坐标从 mvPosition 推回来（不是所有材质都算 worldPosition）：镜头没有缩放，视图矩阵的旋转部分转置就是逆
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorld = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif
`;
THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec3 fogHeight;
	uniform vec4 fogSun;
	uniform vec3 fogGlow;
	varying float vFogDepth;
	varying vec3 vFogWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	${HEIGHT_FOG_GLSL}
	${DIR_FOG_GLSL}
	${SKY_FOG_GLSL}
	${ATMO_PARS_GLSL}
	${ATMO_FN_GLSL}
#endif
`;
// 大气打开时（lib/大气.ts）换成 Photon 的空气雾 + 边界雾，不再用场景雾色
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	if ( atmoP.x > 0.5 ) gl_FragColor.rgb = atmoFog( gl_FragColor.rgb, cameraPosition, vFogWorld );
	else {
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	fogFactor = addHeightFog( fogFactor, cameraPosition, vFogWorld, fogHeight );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, skyFogMix( dirFogColor( fogColor, cameraPosition, vFogWorld, fogSun, fogGlow ), cameraPosition, vFogWorld, fogFactor ), fogFactor );
	}
#endif
`;
