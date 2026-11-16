// 高度雾：在 three 的线性雾 / 指数平方雾上叠一层解析指数高度雾（照 Photon 的 include/fog/overworld/analytic.glsl，Photon 许可证允许个人修改和再分发部分代码），
// 低处浓、高处淡，高空往下看谷底先被雾填上、山脊露在外面，0.2～5 公里也有远近层次（用户 10-04 定）。
// 改的是 three 的 fog_* 着色块，所有材质（three 自带的、onBeforeCompile 改过的、合并了 UniformsLib.fog 的 ShaderMaterial）走同一套。
// 浓度：密度(h) = 浓度 × 2^(−(h − 起点) / 半衰)（每米），沿视线积分有解析解（Photon 的 air_fog_analytic_airmass），透过率 = exp(−积分)；
// 和原来的雾合起来：雾 = 1 − (1 − 原来的雾) × 透过率，雾色仍是场景雾色。
// 参数在共用 uniform（fogHeight = 起点、半衰、浓度），由 `useHeightFog` 按镜头设，浓度 0 = 不开（主世界、古城不开）。
// 屏幕 AO 的第 2 遍“先减雾、乘 AO、再加雾”要按同一公式算雾（lib/体素/屏幕AO.tsx 用 `HEIGHT_FOG_GLSL`）。
import * as THREE from 'three';
import { useWriter, newWriteSlot } from '../core/写入者.ts';
import { ATMO_FN_GLSL, ATMO_PARS_GLSL } from './大气.ts';
import { trialParams } from '../core/试看.ts';

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
const dirFogSlot = newWriteSlot();
const disableDirFog = () => {
  glowDir.w = 0;
};
// 光向：场景坐标（Z 朝上）指向太阳；色：#rrggbb（sRGB，画面数值）；强：0～1
export const useDirFog = (opts: { sunDir: number[]; color: string; strength: number } | null) => {
  useWriter(dirFogSlot, disableDirFog);
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
const skyFogVec = { x: 0, y: 0, z: 0, w: 0 }; // x 比例 0～1、y 余晖强、z 色带登记了没有（1 = 有）
const skyFogSun = { x: 0, y: 0, z: 1 }; // 场景坐标（Z 朝上）指向太阳，单位向量
const skyFogGlow = { x: 1, y: 1, z: 1 }; // 余晖色（线性）
const skyFogBands = Array.from({ length: SKY_FOG_BANDS }, () => new THREE.Vector4()); // 天色（线性）和这条色带的仰角正弦
export const skyFogUniforms = { fogSky: { value: skyFogVec }, fogSkySun: { value: skyFogSun }, fogSkyGlow: { value: skyFogGlow }, fogSkyBand: { value: skyFogBands } };
for (const k of Object.keys(THREE.ShaderLib) as (keyof typeof THREE.ShaderLib)[]) {
  const uniforms = THREE.ShaderLib[k].uniforms as Record<string, THREE.IUniform>;
  if (uniforms.fogColor) Object.assign(uniforms, skyFogUniforms);
}
Object.assign(THREE.UniformsLib.fog as Record<string, THREE.IUniform>, skyFogUniforms);
const skyFogSlot = newWriteSlot();
const disableSkyFog = () => {
  skyFogVec.x = 0;
  skyFogVec.z = 0;
};
// 比例：0 不开、1 全进雾处正好是天色；天色：穹顶的色带 [仰角正弦, #rrggbb]（条数 = SKY_FOG_BANDS）；余晖：色、强，光向：场景坐标指向太阳。
// 远雾（下面 `useFarFog`）要天色：比例 0 也给色带时只登记天色（z = 1），雾色照旧，远雾在地形尽头照它拉到天色
export const useSkyFog = (opts: { k: number; bands: [number, string][]; glow: string | null; glowK: number; sunDir: number[] } | null) => {
  useWriter(skyFogSlot, disableSkyFog);
  if (!opts) {
    skyFogVec.x = 0;
    skyFogVec.z = 0;
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
  skyFogVec.x = Math.min(1, Math.max(0, opts.k));
  skyFogVec.y = opts.glow ? opts.glowK : 0;
  skyFogVec.z = 1;
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

// 远雾（用户 11-16：「近处应该近似于 0 的雾浓度，然后在接近视距的地方再急剧上升到百分之百」）：公里级镜头的地形最远距离 D 以内，
// 起 × D 以内不加雾，起 × D 到 D 用 smoothstep 升到 1；距离按水平量（同 engine/voxel/区段.ts 挑区段，跨过 D 的最外一圈区段越出 D 的部分全进雾）。
// D 处的颜色拉满成视线方向上的天色，不是雾色：雾色和后面的天不一样时，全进雾的山照样显出剪影。
// - 不开大气（暮色）：远雾代替原来的线性雾 / 指数平方雾当底，高度雾、方向雾色、天色雾照叠；天色按天色雾登记的色带（useSkyFog），D 处拉满。
// - 开大气（主世界，Photon 的空气雾、边界雾接管了材质的雾，three 的雾不起作用）：Photon 那套原样算完，再按远雾往穹顶在这个方向的颜色拉，
//   穹顶色照 天空.tsx 的 atmoSkyMaterial（天色 × 空气雾透过率 + 内散射，再出色）；地平线以下的天色图取的是贴地平线那一行（大气.ts 的 skyRadiance 把仰角钳到 hm），
//   所以天色用 atmoHorizon（16 个方位插值），不另传天色图。
// fogEdge：x 起点（米）、y 终点 D（米，0 = 不开）。共用 uniform 同上：普通对象，所有材质和屏幕 AO 共用
const farFogVec = { x: 0, y: 0, z: 0, w: 0 };
export const farFogUniforms = { fogEdge: { value: farFogVec } };
for (const k of Object.keys(THREE.ShaderLib) as (keyof typeof THREE.ShaderLib)[]) {
  const uniforms = THREE.ShaderLib[k].uniforms as Record<string, THREE.IUniform>;
  if (uniforms.fogColor) Object.assign(uniforms, farFogUniforms);
}
Object.assign(THREE.UniformsLib.fog as Record<string, THREE.IUniform>, farFogUniforms);
// 起：远雾从 D 的几成开始升（用户还没定 0.8 还是 0.9，试看 {"雾曲线": {"起": 0.9}} 换）
export const FAR_FOG_START = 0.8;
export const farFogStart = () => trialParams<{ 起?: number }>('雾曲线')?.起 ?? FAR_FOG_START;
const farFogSlot = newWriteSlot();
const disableFarFog = () => {
  farFogVec.y = 0;
};
// 远：这个镜头的地形最远距离 D（米，VoxelWorld 的 far）；null = 不开。
// 放进：0～1，起止从 从 = [近, 远]（米，原来那条雾的起止）渐到 [起 × D, D]（6-1-3 起飞那几帧跟着超远景一起放进），0 = 不开
export type FarFog = { far: number; ramp?: number; from?: [number, number] };
export const farFogRange = (o: FarFog): [number, number] => {
  const k = o.ramp ?? 1;
  const [n0, f0] = o.from ?? [o.far * farFogStart(), o.far];
  return [n0 + (o.far * farFogStart() - n0) * k, f0 + (o.far - f0) * k];
};
export const useFarFog = (o: FarFog | null) => {
  useWriter(farFogSlot, disableFarFog);
  if (!o || !(o.far > 0) || (o.ramp ?? 1) <= 0) {
    farFogVec.y = 0;
    return;
  }
  [farFogVec.x, farFogVec.y] = farFogRange(o);
};
// 要在 SKY_FOG_GLSL 之后
export const FAR_FOG_GLSL = /* glsl */ `
uniform vec4 fogEdge;
float farFogAt( vec3 o, vec3 e ) {
  return fogEdge.y > 0.0 ? smoothstep( fogEdge.x, fogEdge.y, length( e.xz - o.xz ) ) : 0.0;
}
vec3 farFogSky( vec3 fc, vec3 o, vec3 e, float a ) {
  return fogSky.z > 0.5 ? mix( fc, skyFogColor( o, e ), a ) : fc;
}`;
// 要在 大气.ts 的 ATMO_FN_GLSL 之后
export const FAR_FOG_ATMO_GLSL = /* glsl */ `
vec3 farFogDome( vec3 o, vec3 e ) {
  vec3 d = normalize( e - o );
  vec3 T;
  vec3 S = atmoAir( o, o + d * atmoP.y, T );
  return atmoDisp( atmoHorizon( d ) * T + S );
}
// 画面 = 出色 × keep + B 的两项按远雾改：全进远雾处只剩穹顶色
void farFogAtmoParts( vec3 o, vec3 e, inout vec3 keep, inout vec3 B ) {
  float a = farFogAt( o, e );
  if ( a <= 0.0 ) return;
  keep *= 1.0 - a;
  B = mix( B, farFogDome( o, e ), a );
}`;

export const heightFog = heightFogVec;
const heightFogSlot = newWriteSlot();
const disableHeightFog = () => {
  heightFogVec.z = 0;
};
export const useHeightFog = (params: HeightFogParams) => {
  useWriter(heightFogSlot, disableHeightFog);
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
	${FAR_FOG_GLSL}
	${ATMO_PARS_GLSL}
	${ATMO_FN_GLSL}
	${FAR_FOG_ATMO_GLSL}
#endif
`;
// 大气打开时（lib/大气.ts）换成 Photon 的空气雾 + 边界雾，不再用场景雾色
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	if ( atmoP.x > 0.5 ) {
		vec3 atmoKeep;
		vec3 atmoAdd = atmoFogParts( cameraPosition, vFogWorld, atmoKeep );
		farFogAtmoParts( cameraPosition, vFogWorld, atmoKeep, atmoAdd );
		gl_FragColor.rgb = gl_FragColor.rgb * atmoKeep + atmoAdd;
	} else {
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	float farFog = farFogAt( cameraPosition, vFogWorld );
	if ( fogEdge.y > 0.0 ) fogFactor = farFog;
	fogFactor = addHeightFog( fogFactor, cameraPosition, vFogWorld, fogHeight );
	vec3 fogTint = skyFogMix( dirFogColor( fogColor, cameraPosition, vFogWorld, fogSun, fogGlow ), cameraPosition, vFogWorld, fogFactor );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, farFogSky( fogTint, cameraPosition, vFogWorld, farFog ), fogFactor );
	}
#endif
`;
