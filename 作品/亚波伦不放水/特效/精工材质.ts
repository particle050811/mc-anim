// 精工器物的材质：金、暗金、宝石（受光，MeshStandardMaterial 加自带的反射环境），光（不受光的亮线），芒（加色的光芒），晕（加色的柔光带）。
// 依据 rules/通用.toml「自制模型贴图风格」（用户 11-10 定：自制的模型往真实、细腻做，照拔刀剑的路子）。
// 做法照 @库/物品/拔刀剑.tsx 的 KA_ENV：场景里没有环境贴图，金属的亮全靠反射，这里在着色器里按反射方向现算一个环境
// （天地渐变、地平线一道暗带、机位身后左上一块柔光箱、右下一块小的补光），只作用在用这些材质的网格上，不影响场景里别的东西。
// 和拔刀剑不同：环境的亮度写死，不跟场景的灯换算（神环自己带光，暗红的下界里金也要亮）；没有刀轴、刃部雾面那些只属于刀的东西。
// 小到一个屏幕像素盖住好几个零件时，粗糙度下限抬高（同拔刀剑的 KA_ROUGH），细面上的高光不一帧帧闪。
// 颜色走顶点色（一种材质类一个网格）。宝石另加按顶点色算的自发光。亮线和宝石上的溢光用 @库/物品/拔刀剑泛光.tsx（只作用在打了层的网格上）。
import * as THREE from 'three';

export type 材质类 = '金' | '暗金' | '宝石' | '光' | '芒';

// 反射环境（线性值），照珠宝棚拍的布光：天亮、地暗，地平线下面一道更暗的带（圆管、珠粒上因此有亮暗相间的反射，才像抛光的金属）；
// 机位身后左上一块大柔光箱（朝着镜头的平面反射到它的边，带一点渐变），右侧一道竖的细条灯（圆管上一条细亮线），右下一块小补光。
// 灯的方向在视空间（+Z 朝机位身后，+Y 上，+X 右），天地按世界的上下
const 环境 = {
  天: [1.05, 0.98, 0.88],
  天顶: [0.55, 0.5, 0.46],
  地: [0.3, 0.2, 0.13],
  地底: [0.06, 0.04, 0.03],
  主: [2.6, 2.45, 2.2],
  主向: new THREE.Vector3(-0.38, 0.42, 1).normalize().toArray(),
  主宽: 0.11,
  条: [2.2, 2.0, 1.7],
  补: [1.0, 0.75, 0.55],
  补向: new THREE.Vector3(0.55, -0.45, 1).normalize().toArray(),
  补宽: 0.03,
} as const;
// 各类：金属度、粗糙度、反射天地几成、反射灯几成、自发光（顶点色 × 几）
const 表: Record<'金' | '暗金' | '宝石', { 金属: number; 粗糙: number; 天地: number; 光: number; 自发光: number }> = {
  金: { 金属: 1, 粗糙: 0.14, 天地: 1, 光: 1, 自发光: 0 },
  暗金: { 金属: 1, 粗糙: 0.45, 天地: 0.8, 光: 0.5, 自发光: 0 },
  // 宝石：当成底下衬了箔的有色宝石，切面各自反射环境的一块（带宝石的颜色），里面再透一点自己的光
  宝石: { 金属: 0.9, 粗糙: 0.05, 天地: 1.1, 光: 0.9, 自发光: 0.14 },
};

const v3 = (v: readonly number[]) => `vec3(${v.map((x) => x.toFixed(4)).join(', ')})`;
const 环境GLSL = /* glsl */ `
uniform vec4 jgCls;
uniform float jgGlow;
varying float vJgUnit;
vec3 jgEnv(vec3 rv, float rough) {
  vec3 rw = inverseTransformDirection(rv, viewMatrix);
  float a = rough * rough;
  float up = rw.y;
  vec3 sky = mix(${v3(环境.天)}, ${v3(环境.天顶)}, smoothstep(0.15, 0.95, up));
  vec3 gnd = mix(${v3(环境.地)}, ${v3(环境.地底)}, smoothstep(-0.05, -0.6, up));
  vec3 col = mix(gnd, sky, smoothstep(-0.04 - a, 0.04 + a, up));
  col *= 1.0 - 0.75 * (1.0 - min(1.0, 1.5 * a)) * exp(-pow((up + 0.2) / (0.09 + a), 2.0));
  col *= jgCls.x;
  float w1 = ${环境.主宽.toFixed(4)} + a;
  col += ${v3(环境.主)} * jgCls.y * exp(-pow((1.0 - dot(rv, ${v3(环境.主向)})) / w1, 2.0));
  float ws = 0.035 + a;
  col += ${v3(环境.条)} * jgCls.y * exp(-pow((rv.x - 0.72) / ws, 2.0)) * smoothstep(-0.5, -0.2, rv.y) * (1.0 - smoothstep(0.6, 0.85, rv.y)) * (0.035 / ws);
  float w2 = ${环境.补宽.toFixed(4)} + a;
  col += ${v3(环境.补)} * jgCls.y * exp(-(1.0 - dot(rv, ${v3(环境.补向)})) / w2) * (${环境.补宽.toFixed(4)} / w2);
  return col;
}`;
const 粗糙下限 = /* glsl */ `
material.roughness = max(material.roughness, clamp((length(fwidth(vViewPosition)) / vJgUnit - 0.02) * 2.0, 0.0, 0.5));`;
const 加环境 = /* glsl */ `
#if defined( RE_IndirectSpecular )
radiance += jgEnv(normalize(mix(reflect(-geometryViewDir, geometryNormal), geometryNormal, pow4(material.roughness))), material.roughness);
#endif
#if defined( RE_IndirectDiffuse )
iblIrradiance += PI * jgEnv(geometryNormal, 1.0);
#endif`;

const 受光材质 = (类: '金' | '暗金' | '宝石'): THREE.MeshStandardMaterial => {
  const t = 表[类];
  const 材质 = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: t.金属, roughness: t.粗糙, side: THREE.DoubleSide });
  const cls = { value: new THREE.Vector4(t.天地, t.光, 0, 0) };
  const glow = { value: t.自发光 };
  材质.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { jgCls: cls, jgGlow: glow });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vJgUnit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvJgUnit = max(length(modelMatrix[0].xyz), max(length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${环境GLSL}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * jgGlow;')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${粗糙下限}`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${加环境}`);
  };
  材质.customProgramCacheKey = () => '精工-环境';
  return 材质;
};

let 缓存: Record<材质类, THREE.Material> | undefined;
/** 各类的材质（全局各一份） */
export const 精工材质 = (): Record<材质类, THREE.Material> =>
  (缓存 ??= {
    金: 受光材质('金'),
    暗金: 受光材质('暗金'),
    宝石: 受光材质('宝石'),
    // 亮线：不受光、不过色调映射，顶点色就是画面上的颜色
    光: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, fog: false }),
    // 光芒：加色，顶点色往尖上收到黑（加色里黑 = 没有）；不写深度，雾不往上混（加色的东西混雾色会把暗底抬亮）
    芒: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  });
/** 哪几类的亮处往外溢一圈柔光（打 KATANA_BLOOM_LAYER）：亮线和宝石。金不算，金的高光溢出来像发光的塑料 */
export const 溢光类: ReadonlySet<材质类> = new Set(['光', '宝石']);

/** 一圈柔光带（加色）：片上离圆心 半径 处最亮，往两边按高斯落下去（宽 = 标准差），单位同片的坐标 */
export const 晕材质 = (带们: readonly { 半径: number; 宽: number; 色: string; 强: number }[]): THREE.ShaderMaterial => {
  const 项 = 带们
    .map((b) => {
      const c = new THREE.Color(b.色);
      return `col += ${v3([c.r * b.强, c.g * b.强, c.b * b.强])} * exp(-pow((d - ${b.半径.toFixed(4)}) / ${b.宽.toFixed(4)}, 2.0));`;
    })
    .join('\n  ');
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `varying vec2 vP;\nvoid main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying vec2 vP;\nvoid main() {\n  float d = length(vP);\n  vec3 col = vec3(0.0);\n  ${项}\n  gl_FragColor = vec4(col, 1.0);\n  #include <colorspace_fragment>\n}`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
};
