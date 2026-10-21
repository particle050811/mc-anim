// 高度雾：在 three 的线性雾 / 指数平方雾上叠一层解析指数高度雾（照 Photon 的 include/fog/overworld/analytic.glsl，Photon 许可证允许个人修改和再分发部分代码），
// 低处浓、高处淡，高空往下看谷底先被雾填上、山脊露在外面，0.2～5 公里也有远近层次（用户 10-04 定）。
// 改的是 three 的 fog_* 着色块，所有材质（three 自带的、onBeforeCompile 改过的、合并了 UniformsLib.fog 的 ShaderMaterial）走同一套。
// 浓度：密度(h) = 浓度 × 2^(−(h − 起点) / 半衰)（每米），沿视线积分有解析解（Photon 的 air_fog_analytic_airmass），透过率 = exp(−积分)；
// 和原来的雾合起来：雾 = 1 − (1 − 原来的雾) × 透过率，雾色仍是场景雾色。
// 参数在共用 uniform（fogHeight = 起点、半衰、浓度），由 `useHeightFog` 按镜头设，浓度 0 = 不开（主世界、古城不开）。
// 屏幕 AO 的第 2 遍“先减雾、乘 AO、再加雾”要按同一公式算雾（lib/体素/屏幕AO.tsx 用 `HEIGHT_FOG_GLSL`）。
import { useEffect } from 'react';
import * as THREE from 'three';
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
// 光向：场景坐标（Z 朝上）指向太阳；色：#rrggbb（sRGB，画面数值）；强：0～1
export const useDirFog = (opts: { sunDir: number[]; color: string; strength: number } | null) => {
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
  useEffect(
    () => () => {
      glowDir.w = 0;
    },
    [],
  );
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

export const heightFog = heightFogVec;
export const useHeightFog = (params: HeightFogParams) => {
  heightFogVec.x = params.start;
  heightFogVec.y = params.halfLife;
  heightFogVec.z = params.density;
  useEffect(
    () => () => {
      heightFogVec.z = 0;
    },
    [],
  );
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
	gl_FragColor.rgb = mix( gl_FragColor.rgb, dirFogColor( fogColor, cameraPosition, vFogWorld, fogSun, fogGlow ), fogFactor );
	}
#endif
`;
