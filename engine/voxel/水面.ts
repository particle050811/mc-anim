// 水面：导出网格（lib/方块网格.tsx 半透明层里的水）和体素世界（lib/体素/材质.ts 的 水）共用同一段着色器，两条方块管线的水一个样（用户 10-01 要求两条管线颜色、材质一致）。
// 照光影包的做法（不做平面反射：要多画一遍场景）：
// - 波纹法线：几道不同方向、波长的正弦叠起来，只扰动朝上的水面；时间取渲染帧号（`waterSky`.时间，由 天空.tsx 的 `SkyDome` 每帧设），Remotion 乱序出帧也一样。坡度很小（最陡约 5°），远看只是细碎纹；
// - 菲涅尔：Schlick（水 F0 = 0.02），正对着几乎透明、越斜越像镜子，封顶按天定（暮色 0.6；主世界不反射，见 `waterSky`.反射上限）；
// - 天光反射：反射方向上的天色，就是穹顶同一套按仰角的渐变（`SkyDome` 写进 `waterSky`），不用 PMREM 环境图，同走材质色调映射，倒影和天接得上；
// - 太阳高光：粗糙度压到 0.12，主光高光照着波纹法线落出碎亮点（逆光最明显）。
// 接口：`水面GLSL`（片元函数）、`patchWaterShader`(shader, 判水) 在 onBeforeCompile 里调；`waterSky` 是共用 uniform。
import { getInputProps } from 'remotion';
import * as THREE from 'three';

// 试档用：--props='{"waterReflMax":0.3}'，给了就盖掉下面按天定的上限
const cliReflMax = (getInputProps() as { waterReflMax?: number }).waterReflMax;
export const skyBandCount = 8;
// 天色：穹顶按仰角正弦的渐变（线性颜色，同穹顶着色器里的 Color）；时间：秒（帧号 / fps）
export const waterSky = {
  skyColors: { value: Array.from({ length: skyBandCount }, () => new THREE.Color('#9fb6d0')) },
  elevation: { value: Array.from({ length: skyBandCount }, (_, i) => i / (skyBandCount - 1)) },
  time: { value: 0 },
  // 天光反射的上限（菲涅尔封顶），由 天空.tsx 的 `useWaterSky` 按天写：暮色天 0.6；主世界 0——主世界天地平线一圈米白，远处海面掠射反射会把整片海冲成灰白像蒙雾（用户 10-13 看 6-1-1 开头），关掉就是原来的青绿水色，波纹和太阳高光照旧
  reflectionMax: { value: cliReflMax ?? 0.6 },
};
export const skyReflMax = (isTwilight: boolean) => cliReflMax ?? (isTwilight ? 0.6 : 0);

const VERT_HEAD = /* glsl */ `
varying vec3 vWaterW;`;
const VERT_BODY = /* glsl */ `
vWaterW = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

const FRAG_HEAD = /* glsl */ `
uniform vec3 waterSky[${skyBandCount}];
uniform float waterSkyAt[${skyBandCount}];
uniform float waterTime;
uniform float waterReflMax;
varying vec3 vWaterW;
// 波纹高度场的梯度（世界坐标 xz，米）：四道正弦，方向、波长、速度各不同，互不成倍数，看不出重复
vec2 waterSlope(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 d; float k, w, a;
  d = normalize(vec2(1.0, 0.31)); k = 6.2832 / 1.7; w = 1.9; a = 0.006; g += d * (a * k) * cos(dot(d, p) * k + t * w);
  d = normalize(vec2(-0.47, 1.0)); k = 6.2832 / 1.13; w = 2.6; a = 0.004; g += d * (a * k) * cos(dot(d, p) * k + t * w);
  d = normalize(vec2(0.83, -0.92)); k = 6.2832 / 0.61; w = 3.7; a = 0.0018; g += d * (a * k) * cos(dot(d, p) * k + t * w);
  d = normalize(vec2(-1.0, -0.21)); k = 6.2832 / 2.9; w = 1.3; a = 0.009; g += d * (a * k) * cos(dot(d, p) * k + t * w);
  return g;
}
vec3 waterSkyColor(float h) {
  vec3 col = waterSky[0];
  for (int i = 1; i < ${skyBandCount}; i++) col = mix(col, waterSky[i], smoothstep(waterSkyAt[i - 1], waterSkyAt[i], h));
  return col;
}
bool waterIsTop;
// 面法线按世界坐标的导数算（体素世界的网格没有法线属性，flatShading 也是这么算的）
vec3 waterNormalW() {
  vec3 n = normalize(cross(dFdx(vWaterW), dFdy(vWaterW)));
  waterIsTop = n.y > 0.9;
  if (!waterIsTop) return n;
  vec2 s = waterSlope(vWaterW.xz, waterTime);
  return normalize(vec3(-s.x, 1.0, -s.y));
}`;

// shader：onBeforeCompile 拿到的；判水：GLSL 布尔表达式（片元里），哪些像素按水画（导出网格按顶点色认：水按群系染成蓝色，冰、玻璃是灰白的）
export const patchWaterShader = (shader: THREE.WebGLProgramParametersWithUniforms, isWaterExpr = 'true') => {
  shader.uniforms.waterSky = waterSky.skyColors;
  shader.uniforms.waterSkyAt = waterSky.elevation;
  shader.uniforms.waterTime = waterSky.time;
  shader.uniforms.waterReflMax = waterSky.reflectionMax;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
    // 法线换成波纹法线（视空间）：只扰动朝上的水面，侧面照旧
    .replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
  bool isWater = ${isWaterExpr};
  // 导数要在分支外面求
  vec3 waterNW = waterNormalW();
  if (isWater && waterIsTop) normal = normalize((viewMatrix * vec4(waterNW, 0.0)).xyz);`,
    )
    // 菲涅尔 + 天光反射：反射方向上的天色按菲涅尔盖上去，掠射处不透明度也跟着升（镜面那部分不再透出水底）
    .replace(
      '#include <opaque_fragment>',
      `if (isWater && waterIsTop) {
    vec3 V = normalize(cameraPosition - vWaterW);
    float cosT = clamp(dot(waterNW, V), 0.0, 1.0);
    // 封顶（waterReflMax，见 水天.反射上限）：远处掠射的湖海原样是 1，整片成了地平线的米白色，看着像雪地（6-2-6 第 60 帧）
    float F = min(0.02 + 0.98 * pow(1.0 - cosT, 5.0), waterReflMax);
    vec3 R = reflect(-V, waterNW);
    outgoingLight = mix(outgoingLight, waterSkyColor(max(R.y, 0.0)), F);
    diffuseColor.a = mix(diffuseColor.a, 1.0, F);
  }
  #include <opaque_fragment>`,
    );
};
