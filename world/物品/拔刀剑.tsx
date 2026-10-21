// 拔刀剑（李樱的日本刀）：全部用几何体建，单位 MC 像素（手臂 4 像素宽），挂到角色骨架上跟着缩放。粗细、弯度、外观都以 设定/物品/拔刀剑.png 中间那把为准（用户 10-19 定）。
// 粗细：中间那把按柄轴线摆正、柄头到刀尖算 24.88（1 MC 像素 ≈ 63.8 图像像素）逐列量：柄高 0.98、护手高 2.62、鎺高 1.0、刀宽刀根 0.86 到横手 0.64；
//   鞘高按最上面那把「鞘高 / 柄高 = 1.12」配到柄高上，金具、下绪照上下两把相对鞘高的比例。长度沿用旧模型（护手到刀尖 18.6、柄长 6.3、鞘长 19.8，用户定的缩小比例）。
// 弯度（`BLADE_ARC`）：刀身从护手起顺着柄轴线出来、不折角（用户 10-20 嫌刀柄和刀身不在一条直线上看着歪），按半径 112 的圆弧往刀背弯，刀尖前再多翘一点，刀尖中心比柄轴线高 1.62；鞘是同一段圆弧。
//   和中间那把（原样摆着、柄头到刀尖对齐）比中心线：整把顺时针转 4.1° 后刀身最多差 0.03，柄比参考多斜 2.6°（参考在护手处往刃口折了约 2.5°）；柄和刀身一起拟是转 3.6°、最多差 0.14。
// 两个坐标系（组件局部坐标，6-1-2 的编排直接用）：
//   出鞘 `DrawnKatana`：握持点在原点（护手柄侧那面往柄尾 2 像素，拳头正好顶住护手），刀身沿 +Z，刃口朝 -Y，刀尖往 +Y 弯。
//   入鞘 `Sheath`：鞘口中心在原点，鞘口切线沿 +Z、往 +Y 弯，刃口朝 -Y（和出鞘同向）；刀柄从鞘口往 -Z 露出、护手贴住鞘口（`SHEATHED_BLADE`）。
//   李樱佩刀刃口朝下、鞘尾往上翘（用户 10-18、10-19 定），挂法只绕 X 转（`SHEATH_HANG`），鞘自己的坐标已经是刃口朝下。
// 凸出的纹样（樋、鎺回纹、柄卷、护手台阶、金具回纹、下绪）都是真几何；光影靠刀自带的反射环境（KA_ENV，按场景的灯换算），泛光见 拔刀剑泛光.tsx，颜色材质在 拔刀剑对照.tsx 的灯光下对着参考图量。
import React, { useContext } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Ghost } from '../../engine/model/parts.tsx';
import { KATANA_BLOOM_LAYER, useKatanaBloom } from './拔刀剑泛光.tsx';

type P2 = [number, number];

// 1 个 obj 单位（旧模组网格）= 多少 MC 像素。旧网格已不用，常量留给引用它的地方
export const KATANA_SCALE = 18.6 / 250;

// ---------- 尺寸（出鞘坐标系，MC 像素） ----------
const HILT = { ax: 0.39, by: 0.49 }; // 刀柄半厚（X）、半高（Y，刀背到刃口方向）：柄高 0.98，厚高比沿用枯石太刀三视图
const PART_Z = {
  kashira: -3.68, // 柄头末端（和旧模型同一位置）
  kashiraGold: -3.26, // 柄头铁盖到这里，接着金箍
  wrap0: -3.02, // 柄卷起止
  wrap1: 1.75,
  fuchi: 2.0, // 缘（金色柄口）到这里，接着是护手；握刀的拳头盖到 z = 2，护手不能再往柄这边挪
  tsuba: 2.6, // 护手靠刀身一面
  habaki: 3.3, // 鎺（金色刀镡座）末端：参考图透视里露出的鎺长约是鎺高的 0.7 倍
  tip: 21.2, // 刀尖：护手到刀尖 18.6
};
const KISSAKI = 1.0; // 切先长（横手和镐筋的交点到刀尖）
// 刀身中心线：护手那面中心起、切线沿柄轴线，按半径 r 往刀背弯成一段圆弧。圆弧不截在护手：sweep 要在刀根两边取切线
const BLADE_ARC = { r: 112 };
const arc = (z: number) => BLADE_ARC.r - Math.sqrt(BLADE_ARC.r ** 2 - (z - PART_Z.tsuba) ** 2);
// 刀尖前 2 像素比圆弧再往刀背多翘 0.06（参考图切先一带弯得更急）；鞘只按圆弧，刀尖那点余量在鞘里放得下
const TIP_LIFT = { z0: 19.1, len: 1.5, dy: 0.06 };
const bend = (z: number) => {
  const t = Math.min(1, Math.max(0, (z - TIP_LIFT.z0) / TIP_LIFT.len));
  return arc(z) + TIP_LIFT.dy * t * t * (3 - 2 * t);
};

// 鞘（入鞘坐标系）：半厚、半高（鞘尾几乎不收，参考图鞘高从头到尾不变）；截面八角，侧面（±X）上下的斜面 X 向收 chx、Y 向收 chy，
// 侧面和斜面之间的棱再倒一道宽 ridge 的窄边当高光线（参考图侧视：侧面平面约占鞘高一半多，上斜面底下一道亮棱）
const SAYA = { len: 19.8, sx0: 0.41, sy0: 0.55, sx1: 0.4, sy1: 0.54, chx: 0.176, chy: 0.24, ridge: 0.03 };
// 鞘中心线：和刀身同一段圆弧，鞘口切线沿 +Z（完全入鞘时刀根切线转到 +Z，刀身正好在鞘里）
const sayaBend = (z: number) => BLADE_ARC.r - Math.sqrt(BLADE_ARC.r ** 2 - z * z);
const sayaTilt = (z: number) => -Math.asin(z / BLADE_ARC.r); // 站位 z 处截面绕 X 转多少才垂直于中心线
// 编排对齐刀和鞘用（6-1-2 收刀）：护手、刀尖、柄头在出鞘坐标系里的 Z，刀和鞘圆弧的半径
export const KATANA_DIMS = { tsubaZ: PART_Z.tsuba, tipZ: PART_Z.tip, kashiraZ: PART_Z.kashira, arcR: BLADE_ARC.r, sheathLen: SAYA.len, sheathHalfThick: SAYA.sx0, sheathHalfHeight: SAYA.sy0 };
// 刀身中心线在出鞘坐标 z 处的 Y（护手以内是柄轴线 0）；鞘中心线在鞘本地站位 s 处的 Y
export const bladeCenterY = (z: number) => (z <= PART_Z.tsuba ? 0 : bend(z));
export const sheathCenterY = sayaBend;
// 完全入鞘时出鞘坐标 → 入鞘坐标：护手那面中心放到鞘口（刀根和鞘口的切线都沿 +Z）
export const SHEATHED_BLADE = new THREE.Matrix4().makeTranslation(0, 0, -PART_Z.tsuba);

// ---------- 颜色 ----------
// 场景用 NeutralToneMapping，会从暗色里再减一份"镜面反射底色"，深紫的鞘、柄会被压黑；和 李樱.tsx 一样先把这份底色加回去
const liftForNeutral = (rgb: [number, number, number]): [number, number, number] => {
  const x = Math.min(...rgb);
  const lift = (x < 0.04 ? 0.4 * Math.sqrt(x) : x + 0.04) - x;
  return [rgb[0] + lift, rgb[1] + lift, rgb[2] + lift];
};
const colorCache = new Map<string, [number, number, number]>();
const lin = (hex: string) => {
  let color = colorCache.get(hex);
  if (!color) {
    const t = new THREE.Color(hex);
    color = liftForNeutral([t.r, t.g, t.b]);
    colorCache.set(hex, color);
  }
  return color;
};

// 刀身：各面的反射率（金属的颜色就是反射率，亮暗主要看这一面反射到环境的哪儿，见 KA_ENV）。中性钢灰（参考图的钢不偏蓝）。
// 按 拔刀剑.png 中间那把逐带比：庵棟是一道暗线；樋上半暗、下壁朝上反射天、下沿一道亮线；高光里镐地、平地到白，樋仍是暗槽；刃部（雾面）比平地亮
const STEEL = {
  mune: '#808284', // 庵棟
  shinoji: '#d8d9da', // 鎬地（樋上沿、樋下那条）
  shinojiTip: '#e4e5e6', // 樋收头往前到切先的鎬地（参考图这段是亮的），从樋收头处渐变过来
  hiTop: '#b4b6b8', // 樋上壁
  hiDark: '#a0a2a4', // 樋上半
  hiMid: '#c0c2c4', // 樋底往下壁渐亮
  hiLow: '#dcdddf', // 樋下壁
  hiLip: '#f6f6f6', // 樋下沿的亮线
  ji: '#d6d7d8', // 平地
  jiLow: '#cecfd0',
  ha: '#c8c9ca', // 刃部（刃文以下，雾面），往刃口更亮
  haLow: '#d0d1d2',
  edge: '#f4f4f4', // 刃口斜面
  kissaki: '#dedfe0', // 切先的面
};
// 柄、鞘的金具和鞘的金是同一种金（GOLD / GOLD_DARK），鎺单独一类（材质 habaki）：参考图鎺是抛光金，一道近白的亮线、往下压成暗褐
const GOLD = '#c8a062';
const GOLD_DARK = '#6c4e36';
const IRON = '#68676d'; // 护手、柄头的铁（深枪灰）；倒角那一圈给浅一档的 IRON_EDGE（不比面亮太多，不然像描边），见 `ironEdges`
const IRON_EDGE = '#86858a';
const IRON_DEEP = '#151417'; // 柄头凹窗、护手夹层的暗芯
const CORD = '#2f1f30'; // 柄卷绳（参考图近黑的暗紫）
const CORD_DARK = '#1e1220'; // 绳下的底、柄卷每节的侧壁（叠瓦的台阶）
const SAME = '#62407a'; // 菱形窗里的鲛皮（浅紫，比绳亮出一截）
// 鞘：灯光偏暖，要渲出参考图的冷一点的深紫，底色得比目标更偏蓝；斜面比侧面浅一档、棱线再亮，侧面受光少时才显出八角的棱
const LACQUER = '#1e1728'; // 鞘漆侧面、上下面
const LACQUER_BEVEL = '#3b2a40'; // 八角的四道斜面
const LACQUER_HI = '#73627a'; // 侧面和斜面之间的窄棱（高光线）
const SAGEO = '#341f48'; // 下绪（鞘上的扁绳）
const HORN = '#1b1a24'; // 栗形（鞘侧的黑钮）
const SLOT = '#141014'; // 鞘口里面

// ---------- 材质分组：同一材质的零件合并成一个网格，颜色走顶点色 ----------
type Cls = 'steel' | 'habaki' | 'gold' | 'iron' | 'cord' | 'same' | 'lacquer' | 'dark';
// 金属的亮几乎全靠反射刀自己的环境（下面的 KA_ENV，场景里没有环境贴图）：sky、ground 是反射天、地的倍数，box 是反射柔光箱的倍数，
// grad 是反射方向的仰角正弦从多少到多少由地渐变到天。刀身照参考图是亮灰棚拍；金要"上沿一道亮、往下大片暗"：地压低，渐变放在地平线往上；
// 铁是参考图的暗枪灰，正面对着镜头的大面也不发黑：地不压，渐变放低。
// steel 的 frost 是刃部（刃文以下）的雾面粗糙度，哪些面是雾面、各面反射柔光箱几成见 BLADE_FACE
type Finish = { metal: number; rough: number; sky: number; ground: number; grad: readonly [number, number]; box: number; frost?: number };
const MAT: Record<Cls, Finish> = {
  steel: { metal: 1, rough: 0.12, sky: 1, ground: 1, grad: [-0.3, 0.7], box: 1, frost: 0.42 },
  habaki: { metal: 0.95, rough: 0.1, sky: 1.4, ground: 0.1, grad: [-0.05, 0.5], box: 4 },
  gold: { metal: 0.95, rough: 0.2, sky: 1.15, ground: 0.35, grad: [-0.1, 0.55], box: 0.03 },
  iron: { metal: 0.9, rough: 0.65, sky: 1, ground: 1.1, grad: [-0.3, 0.6], box: 0.04 },
  cord: { metal: 0.2, rough: 0.45, sky: 0.4, ground: 0.25, grad: [-0.3, 0.6], box: 0.2 },
  same: { metal: 0, rough: 0.9, sky: 0.26, ground: 0.07, grad: [-0.3, 0.6], box: 0 },
  lacquer: { metal: 0.05, rough: 0.22, sky: 0.4, ground: 0.12, grad: [-0.15, 0.5], box: 0.12 },
  dark: { metal: 0, rough: 0.9, sky: 0, ground: 0, grad: [-0.3, 0.6], box: 0 },
};

// ---------- 反射环境（只给刀用，不影响场景里别的东西） ----------
// 着色器里按方向现算、不用贴图：天地按世界上下渐变，再加一块柔光箱。柔光箱挂在机位身后、往主光那边偏一点，长边横过刀身（窄的那一边顺着刀轴投到箱面上的方向），
// 刀身沿刀长微凸的法线（`SHEEN`）把它反射成参考图中段那一片高光，刀一转、一挥高光就沿刀身走。参考图那片高光从柄那侧慢慢亮起、往刀尖那侧收得快，
// 箱子顺刀轴往刀尖那侧窄、往柄那侧宽；柄那侧外面只留一层很淡的余光（tail），到刀根再亮一些（参考图刀根、鎺前那段是亮的）。
// 参考图刀尖那半的平地、樋下比柄那半暗一截，横手前、切先又亮：反射方向偏刀尖那侧的天、地按 dim 压暗，再往外留一段不压。
// 天、地、柔光箱的亮度和颜色按场景里的灯换算（`sceneEnv`），下面的数是在 拔刀剑对照.tsx 的灯下定的。
const KA_ENV = {
  sky: '#d0d1d2', // 天：刀背、樋下壁这些朝上的面反射它
  ground: '#7c7c7e', // 地：平地、刃部往刃口收薄、略朝下，反射它
  key: 2.4, // 柔光箱亮度（白，线性）
  box: [0.07, 0.16, 0.5] as const, // 柔光箱半宽（切平面上）：顺刀轴往刀尖那侧、往柄那侧，横过刀身；粗糙时按 GGX 的 α 放大、总能量不变
  tail: [0.06, 1.2, 4, 0.55] as const, // 柄那侧余光：占柔光箱亮度几成、铺多宽、刀根处再 ×(1 + 几)、从箱外多远开始加
  dim: [0.6, 0.05, 0.25, 0.5] as const, // 刀尖那侧压暗：压到几成、从哪到哪压满（反射方向沿刀轴的分量）、到哪又不压；各面压几成见 BLADE_FACE
  toKey: [0.2, 0.05] as const, // 柔光箱从机位正后方往主光方向偏多少（横、竖）
};
// 灯换算出的倍数（相对对照的灯）限在这个范围里。黄昏林间、人在影子里，出鞘的刀身也要读得出是亮银、高光看得见（用户 10-19 定）：
// 柔光箱（高光）不比对照图暗；天、地（高光以外）跟着场景暗，但只暗到八成。上限：灯很亮的场景（古城夜视）刀身不冲成白条，金、铁不冲成奶白
const ENV_RANGE = { sky: [0.8, 1], ground: [0.8, 1], key: [1, 1.1] } as const;
const KEY_IN_SHADOW = 0.75; // 主光被挡住时柔光箱还剩几成（同上：影子里的刀也看得见高光）
// 刃部雾面的金属度：磨过的钢带一点漫反射，受光跟着场景的灯（参考图刃部是一条均匀的浅灰雾带，不跟着高光走）
const FROST_METAL = 0.85;
// 旧项目 拔刀剑对照.tsx 的灯（模型/场景/天空.tsx 的 SunLight 默认值 + 环境光 0.5）：直射、天光（天色、地色）、环境光
const REF_LIGHTS = { key: ['#fff0d8', 8.4], sky: '#cfe0f5', ground: '#6a6a3a', hemi: 1, ambient: 0.5 } as const;

const vec = (v: readonly number[]) => `vec${v.length}(${v.map((x) => x.toFixed(4)).join(', ')})`;
const KA_GLSL = /* glsl */ `
uniform vec3 kaSky;
uniform vec3 kaGround;
uniform vec3 kaKey;
uniform vec3 kaBoxDir;
uniform vec4 kaCls;
uniform vec2 kaGrad;
varying float vKaUnit;
varying vec3 vKaAxis;
#ifdef KA_FACE
varying vec3 vKaFace;
#endif
vec3 kaEnv(vec3 rv, float rough, float box, float dim) {
  vec3 rw = inverseTransformDirection(rv, viewMatrix);
  float a = rough * rough;
  vec3 col = mix(kaGround * kaCls.w, kaSky * kaCls.x, smoothstep(kaGrad.x - a, kaGrad.y + a, rw.y));
  // 箱面上顺刀轴的方向；刀轴差不多正对机位时退回横向（先把横向翻到和刀轴同侧，两者混合时不会抵消）
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), kaBoxDir));
  vec3 along = vKaAxis - kaBoxDir * dot(vKaAxis, kaBoxDir);
  float la = length(along);
  side *= dot(side, along) < 0.0 ? -1.0 : 1.0;
  vec3 ax = normalize(mix(side, along / max(la, 1e-4), smoothstep(0.05, 0.25, la)));
  vec3 ay = cross(kaBoxDir, ax);
  // 反射方向偏刀尖那侧时天、地压暗（KA_DIM），再往外不压
  float u = dot(rv, ax);
  col *= mix(1.0, KA_DIM.x, dim * smoothstep(KA_DIM.y - a, KA_DIM.z + a, u) * (1.0 - smoothstep(KA_DIM.w - a, KA_DIM.w + 0.12 + a, u)));
  float c = dot(rv, kaBoxDir);
  if (c > 0.02) {
    vec2 q = vec2(dot(rv, ax), dot(rv, ay)) / c;
    vec3 hw = KA_BOX + 2.0 * a;
    float sx = q.x / (q.x > 0.0 ? hw.x : hw.y);
    float sy = q.y / hw.z;
    sy *= sy;
    float tail = KA_TAIL.x * (1.0 + KA_TAIL.z * smoothstep(KA_TAIL.w - a, KA_TAIL.w + 0.25 + a, -q.x)) * exp(-pow(max(-q.x, 0.0) / (KA_TAIL.y + 2.0 * a), 4.0));
    float lit = max(exp(-sx * sx), q.x < 0.0 ? tail : 0.0) * exp(-sy * sy);
    col += kaKey * box * lit * ((KA_BOX.x + KA_BOX.y) * KA_BOX.z) / ((hw.x + hw.y) * hw.z);
  }
  return col;
}`;
// 粗糙度：刃部雾面；刀在画面里小的时候细面上的镜面高光会一帧帧闪，一个屏幕像素盖住的 MC 像素越多，粗糙度下限越高
// （vKaUnit 是 1 MC 像素在视空间多长，刀跟着角色缩放；在顶点里按模型矩阵算，同一材质的几把刀大小不同也各算各的）
const KA_ROUGH = /* glsl */ `
#ifdef KA_FACE
material.roughness = mix(material.roughness, kaCls.z, vKaFace.x);
material.metalness = mix(material.metalness, KA_FROST_METAL, vKaFace.x);
material.diffuseContribution = diffuseColor.rgb * (1.0 - material.metalness);
material.specularColorBlended = mix(material.specularColor, diffuseColor.rgb, material.metalness);
#endif
material.roughness = max(material.roughness, clamp((length(fwidth(vViewPosition)) / vKaUnit - 0.03) * 2.5, 0.0, 0.55));`;
// 柔光箱代表主光，主光被挡住（刀在影子里）时它跟着暗到 KEY_IN_SHADOW；场景里投影的灯只有主光，取第 0 盏的影子。
// 刀身因此不再要灯自己的镜面高光：那是同一盏主光再算一遍，刀小、掠射时粗糙度下限（KA_ROUGH）把它铺开，整段刀身冲成白条（6-4-5 引祸挥刀）
const KA_ADD = /* glsl */ `
float kaLit = kaCls.y;
float kaDim = 0.0;
#ifdef KA_FACE
kaLit *= vKaFace.y;
kaDim = vKaFace.z;
reflectedLight.directSpecular = vec3(0.0);
#endif
#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
if (receiveShadow) kaLit *= mix(KA_SHADOW, 1.0, getSunShadow(sunShadowMap[0], sunLightShadows[0], 0));
#elif defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
if (receiveShadow) kaLit *= mix(KA_SHADOW, 1.0, getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]));
#endif
#if defined( RE_IndirectSpecular )
radiance += kaEnv(normalize(mix(reflect(-geometryViewDir, geometryNormal), geometryNormal, pow4(material.roughness))), material.roughness, kaLit, kaDim);
#endif
#if defined( RE_IndirectDiffuse )
iblIrradiance += PI * kaEnv(geometryNormal, 1.0, kaLit, kaDim);
#endif`;

// 各材质共用的环境 uniform，画刀前由 `sceneEnv` 填
const kaUniforms = {
  kaSky: { value: new THREE.Color() },
  kaGround: { value: new THREE.Color() },
  kaKey: { value: new THREE.Color() },
  kaBoxDir: { value: new THREE.Vector3(0, 0, 1) },
};
type LightSum = { key: THREE.Color; keyDir: THREE.Vector3; sky: THREE.Color; ground: THREE.Color };
const refLights: LightSum = {
  key: new THREE.Color(REF_LIGHTS.key[0]).multiplyScalar(REF_LIGHTS.key[1]),
  keyDir: new THREE.Vector3(),
  sky: new THREE.Color(REF_LIGHTS.sky).multiplyScalar(REF_LIGHTS.hemi).addScalar(REF_LIGHTS.ambient),
  ground: new THREE.Color(REF_LIGHTS.ground).multiplyScalar(REF_LIGHTS.hemi).addScalar(REF_LIGHTS.ambient),
};
const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
// 场景的灯比参考的灯：亮度按比例，颜色只取一部分（主光是落日橙时刀身高光偏暖、黄昏蓝紫的天光下刀身偏冷，但还认得出是银白的钢），最后亮度限在 range 里
const tint = (out: THREE.Color, base: THREE.Color, scene: THREE.Color, ref: THREE.Color, hue: number, range: readonly [number, number]) => {
  const k = luminance(scene) / Math.max(1e-6, luminance(ref));
  out.setRGB(
    base.r * lerp(k, scene.r / Math.max(1e-6, ref.r), hue),
    base.g * lerp(k, scene.g / Math.max(1e-6, ref.g), hue),
    base.b * lerp(k, scene.b / Math.max(1e-6, ref.b), hue),
  );
  const s = luminance(out) / luminance(base);
  if (s < 1e-4) return out.copy(base).multiplyScalar(range[0]);
  return out.multiplyScalar(THREE.MathUtils.clamp(s, range[0], range[1]) / s);
};
const ENV_SKY = new THREE.Color(KA_ENV.sky);
const ENV_GROUND = new THREE.Color(KA_ENV.ground);
const ENV_KEY = new THREE.Color(1, 1, 1).multiplyScalar(KA_ENV.key);
// 场景的灯 → 环境的天、地、柔光箱：画刀前扫一遍场景里的灯；按 gl.render 的次数缓存（同一次 render 里各零件只算一次，
// 一帧里屏幕AO、泛光遮挡这些另起的 render 会再算一遍，多画布也各自对）
const sceneCache = { frame: -1, scene: null as THREE.Object3D | null, camera: null as THREE.Camera | null };
const sum: LightSum = { key: new THREE.Color(), keyDir: new THREE.Vector3(), sky: new THREE.Color(), ground: new THREE.Color() };
const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const sceneEnv = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => {
  const frame = renderer.info.render.frame;
  if (sceneCache.frame === frame && sceneCache.scene === scene && sceneCache.camera === camera) return;
  Object.assign(sceneCache, { frame, scene, camera });
  sum.key.setRGB(0, 0, 0);
  sum.sky.setRGB(0, 0, 0);
  sum.ground.setRGB(0, 0, 0);
  let keyMax = 0;
  scene.traverseVisible((obj) => {
    const light = obj as THREE.Light & { isSunLight?: boolean; isHemisphereLight?: boolean; isAmbientLight?: boolean; isDirectionalLight?: boolean; groundColor?: THREE.Color; target?: THREE.Object3D };
    if (!light.isLight) return;
    if (light.isSunLight || light.isDirectionalLight) {
      tmpC.copy(light.color).multiplyScalar(light.intensity);
      sum.key.add(tmpC);
      if (luminance(tmpC) > keyMax) {
        keyMax = luminance(tmpC);
        sum.keyDir.setFromMatrixPosition(light.matrixWorld);
        if (light.isDirectionalLight && light.target) sum.keyDir.sub(tmpV.setFromMatrixPosition(light.target.matrixWorld));
        sum.keyDir.normalize();
      }
    } else if (light.isHemisphereLight) {
      sum.sky.add(tmpC.copy(light.color).multiplyScalar(light.intensity));
      sum.ground.add(tmpC.copy(light.groundColor!).multiplyScalar(light.intensity));
    } else if (light.isAmbientLight) {
      tmpC.copy(light.color).multiplyScalar(light.intensity);
      sum.sky.add(tmpC);
      sum.ground.add(tmpC);
    }
  });
  tint(kaUniforms.kaSky.value, ENV_SKY, sum.sky, refLights.sky, 0.25, ENV_RANGE.sky);
  tint(kaUniforms.kaGround.value, ENV_GROUND, sum.ground, refLights.ground, 0.25, ENV_RANGE.ground);
  // 柔光箱：机位身后（视空间 +Z）往主光偏 toKey。主光在被摄物背后也不减弱：逆光里的刀也要看得见高光（同 ENV_RANGE 的下限）
  const keyView = tmpV.copy(sum.keyDir).transformDirection(camera.matrixWorldInverse);
  const [toX, toY] = keyMax > 0 ? KA_ENV.toKey : [0, 0];
  kaUniforms.kaBoxDir.value.set(toX * keyView.x, toY * keyView.y, 1).normalize();
  tint(kaUniforms.kaKey.value, ENV_KEY, sum.key, refLights.key, 0.5, ENV_RANGE.key);
};
// 网格画之前：灯 → 环境
const kaBeforeRender = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => sceneEnv(renderer, scene, camera);

const kaMaterial = (cls: Cls) => {
  const { metal, rough, sky, ground, grad, box, frost } = MAT[cls];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: metal, roughness: rough, side: THREE.DoubleSide });
  const clsUniform = { value: new THREE.Vector4(sky, box, frost ?? rough, ground) };
  const faces = frost !== undefined; // 刀身：各面带 kaFace（雾面、柔光箱倍数、刀尖那侧压暗）
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, kaUniforms, { kaCls: clsUniform, kaGrad: { value: new THREE.Vector2(...grad) } });
    const defs = `#define KA_BOX ${vec(KA_ENV.box)}\n#define KA_TAIL ${vec(KA_ENV.tail)}\n#define KA_DIM ${vec(KA_ENV.dim)}\n#define KA_SHADOW ${KEY_IN_SHADOW.toFixed(3)}\n#define KA_FROST_METAL ${FROST_METAL.toFixed(3)}\n${faces ? '#define KA_FACE\n' : ''}`;
    const unit = 'vKaUnit = max(length(modelMatrix[0].xyz), max(length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)));\nvKaAxis = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying float vKaUnit;\nvarying vec3 vKaAxis;\n${faces ? 'attribute vec3 kaFace;\nvarying vec3 vKaFace;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${unit}\n${faces ? 'vKaFace = kaFace;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${defs}${KA_GLSL}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${KA_ROUGH}`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${KA_ADD}`);
  };
  material.customProgramCacheKey = () => `katana-env-${faces ? 'face' : 'plain'}`;
  return material;
};
const MATERIALS = Object.fromEntries((Object.keys(MAT) as Cls[]).map((cls) => [cls, kaMaterial(cls)])) as Record<Cls, THREE.MeshStandardMaterial>;

// 金的法线按离刀轴（y = 0）的高度往 ±Y 掰，最高处掰 GOLD_PILLOW（正切）：平的侧面也是上半反射天、下半反射暗地，
// 出参考图抛光金"上沿一道亮、往下大片暗褐"的渐变。pillowH 是这一件按多高算满（同一个面上的几块零件要给同一个值）
const GOLD_PILLOW = 0.5;
const HABAKI_PILLOW = 1.5; // 鎺掰得多：柔光箱只照亮中间窄窄一道（参考图鎺上那道近白的亮线），下半大片暗
const pillow = (geo: THREE.BufferGeometry, pillowH?: number, k = GOLD_PILLOW) => {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  geo.computeBoundingBox();
  const h = pillowH ?? Math.max(Math.abs(geo.boundingBox!.min.y), Math.abs(geo.boundingBox!.max.y));
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i);
    n.y += k * Math.max(-1, Math.min(1, pos.getY(i) / h));
    n.normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
};

class Kit {
  private parts = new Map<Cls, THREE.BufferGeometry[]>();
  // color 为空时 geo 自带顶点色（刀身）；pillowH 只对金有用，见 `pillow`
  add(cls: Cls, geo: THREE.BufferGeometry, color?: string, matrix?: THREE.Matrix4, pillowH?: number) {
    let prepared = geo.index ? geo.toNonIndexed() : geo.clone();
    prepared.deleteAttribute('uv');
    if (cls === 'gold' || cls === 'habaki') pillow(prepared, pillowH, cls === 'habaki' ? HABAKI_PILLOW : GOLD_PILLOW);
    if (matrix) prepared.applyMatrix4(matrix);
    if (color) {
      const [red, gg, blue] = lin(color);
      const vertCount = prepared.getAttribute('position').count;
      const col = new Float32Array(vertCount * 3);
      for (let i = 0; i < vertCount; i++) col.set([red, gg, blue], i * 3);
      prepared.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    if (!prepared.getAttribute('normal')) prepared.computeVertexNormals();
    const list = this.parts.get(cls) ?? [];
    list.push(prepared);
    this.parts.set(cls, list);
    return this;
  }
  build() {
    return [...this.parts].map(([cls, gs]) => ({ cls, geo: mergeGeometries(gs)! }));
  }
}

// ---------- 几何工具 ----------
// 铁件：倒角那一圈（法线斜着的面）给 IRON_EDGE、其余 IRON，参考图护手侧看是一级级暗铁板、每级的棱一道亮边
const ironEdges = (geo: THREE.BufferGeometry) => {
  const out = geo.index ? geo.toNonIndexed() : geo;
  out.computeVertexNormals();
  const nor = out.getAttribute('normal');
  const col = new Float32Array(nor.count * 3);
  for (let i = 0; i < nor.count; i++) {
    const nz = Math.abs(nor.getZ(i));
    col.set(lin(nz > 0.2 && nz < 0.95 ? IRON_EDGE : IRON), i * 3);
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
};
const shape = (pts: P2[], holes: P2[][] = []) => {
  const shape2d = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape2d.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape2d;
};

const extrude = (shape2d: THREE.Shape, z0: number, z1: number, bevel = 0) => {
  const bevelSize = Math.min(bevel, (z1 - z0) / 3);
  const geo = new THREE.ExtrudeGeometry(shape2d, {
    depth: z1 - z0 - 2 * bevelSize,
    bevelEnabled: bevelSize > 0,
    bevelThickness: bevelSize,
    bevelSize,
    bevelOffset: -bevelSize,
    bevelSegments: 1,
    curveSegments: 3,
  });
  geo.translate(0, 0, z0 + bevelSize);
  return geo;
};

const roundRect = (hx: number, hy: number, radius: number, segments = 4): P2[] => {
  const out: P2[] = [];
  const corners: [number, number, number][] = [[hx - radius, hy - radius, 0], [-hx + radius, hy - radius, 90], [-hx + radius, -hy + radius, 180], [hx - radius, -hy + radius, 270]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= segments; i++) {
      const angle = ((a0 + (90 * i) / segments) * Math.PI) / 180;
      out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
  }
  return out;
};

// 截面扫掠：rings 是沿中心线的一串截面（点数相同，逆时针），每条边单独成带，带内沿长度平滑、带间是硬棱（刀身棱线、鞘八角棱靠这个）。
// 每个点是 [x, y, 站位 s]（切先的横手是斜的，同一圈上的点不在同一站位）；center(s) 是站位 s 处中心线往 Y 的偏移，截面垂直于中心线；cols[e] 是第 e 条边两端的颜色，
// faces[e]（可选）是这条边两端的 kaFace（见 BLADE_FACE）。
type Face = readonly [number, number, number];
type RingAt = { pts: [number, number, number][]; cols: [string, string][]; faces?: [Face, Face][] };
const sweepAt = (rings: RingAt[], center: (station: number) => number) => {
  const edgeCount = rings[0].pts.length;
  const place = ([x, y, s]: [number, number, number]) => {
    const eps = 1e-3;
    const th = Math.atan((center(s + eps) - center(s - eps)) / (2 * eps));
    return [x, center(s) + y * Math.cos(th), s - y * Math.sin(th)];
  };
  const strips: THREE.BufferGeometry[] = [];
  for (let edge = 0; edge < edgeCount; edge++) {
    const pos: number[] = [];
    const col: number[] = [];
    const face: number[] = [];
    const idx: number[] = [];
    rings.forEach((ring, i) => {
      pos.push(...place(ring.pts[edge]), ...place(ring.pts[(edge + 1) % edgeCount]));
      col.push(...lin(ring.cols[edge][0]), ...lin(ring.cols[edge][1]));
      if (ring.faces) face.push(...ring.faces[edge][0], ...ring.faces[edge][1]);
      if (i > 0) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2 + 1, (i - 1) * 2, i * 2 + 1, i * 2);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (face.length) geo.setAttribute('kaFace', new THREE.Float32BufferAttribute(face, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    strips.push(geo.toNonIndexed());
  }
  return mergeGeometries(strips)!;
};
// 整圈在同一站位 s 的简写
type Ring = { s: number; pts: P2[]; cols: [string, string][] };
const sweep = (rings: Ring[], center: (station: number) => number) =>
  sweepAt(rings.map(({ s, pts, cols }) => ({ pts: pts.map(([x, y]) => [x, y, s] as [number, number, number]), cols })), center);

// 平面图形贴到侧面：多边形在 (u, v) 平面（u 沿刀长 Z、v 沿 Y，逆时针），沿侧面法线挤出 w0..w1；side = +1 右侧（+X），-1 左侧。
// 右侧基是 (Z, −Y, X) 才是右手系，所以先把多边形上下翻一次
const onSide = (poly: P2[], side: 1 | -1, w0: number, w1: number, bevel = 0) => {
  const pts = side === 1 ? poly.map(([uPos, vPos]) => [uPos, -vPos] as P2).reverse() : poly;
  const basis =
    side === 1
      ? new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0))
      : new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
  return extrude(shape(pts), w0, w1, bevel).applyMatrix4(basis);
};

const clipRect = (poly: P2[], u0: number, u1: number, v0: number, v1: number): P2[] => {
  const planes: [(pt: P2) => number][] = [[(p) => p[0] - u0], [(p) => u1 - p[0]], [(p) => p[1] - v0], [(p) => v1 - p[1]]];
  let out = poly;
  for (const [planeFn] of planes) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const ptA = inp[i];
      const ptB = inp[(i + 1) % inp.length];
      const fa = planeFn(ptA);
      const fb = planeFn(ptB);
      if (fa >= 0) out.push(ptA);
      if (fa >= 0 !== fb >= 0) {
        const t = fa / (fa - fb);
        out.push([ptA[0] + (ptB[0] - ptA[0]) * t, ptA[1] + (ptB[1] - ptA[1]) * t]);
      }
    }
    if (!out.length) break;
  }
  return out;
};

const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

// ---------- 刀身 ----------
// 截面（刀背到刃口，位置照 拔刀剑.png 中间那把逐列拉直量）：庵棟 → 樋（真凹槽）→ 樋下沿亮线 → 窄鎬地 → 镐筋 → 平地 → 刃文（尖头互の目）→ 刃部 → 刃口斜面。
// 明暗都是截面上真实的面、颜色按面给，刃文锯齿和樋的起收是顶点沿刀身逐段移动出来的；切先横手下半是斜的，截面点各带站位。
// 下面的比例都是占刀宽、从刀背量起；站位 s 从护手量起
const BLADE = {
  w0: 0.865, // 刀宽：刀根、横手
  w1: 0.635,
  t0: 0.2, // 镐筋处厚度：刀根、横手（约刀宽的 0.23 倍）
  t1: 0.135,
  mune: 0.05, // 庵棟
  shino: 0.44, // 镐筋：也是切先 "<" 的顶点高度（参考图镐筋紧贴樋下沿那道亮线）
  niku: 0.065, // 镐筋往下这一段平地几乎竖直，再往刃口收薄
  bevel: 0.05, // 刃口斜面
};
const BLADE_LEN = PART_Z.tip - PART_Z.tsuba;
const YOKOTE = BLADE_LEN - KISSAKI;
// 樋：上下沿、下沿亮线宽；鎺前 0.35 起头（"<" 尖头，0.25 长到全宽），横手前 0.4 收头：上沿不动、下沿在最后 0.6 里弧线往上收到上沿（参考图的樋是这样收尖的）；
// 槽深是该处鎬地半厚的 45%
const HI = { top: 0.085, bot: 0.37, lip: 0.035, start: PART_Z.habaki - PART_Z.tsuba + 0.35, ramp: 0.25, gap: 0.4, endLen: 0.6, endAt: 0.04, depth: 0.45 };
// 切先：小镐从 "<" 顶点斜升，到 0.42 个切先长处贴近刀背、再顺刀背到刀尖；横手下半往刀尖斜，刃口那头晚 0.21 个切先长。
// ふくら（刃口弧）：离顶点 v 个切先长处的刀宽比，照参考图逐列量
const KISSAKI_RIDGE = 0.42;
const YOKOTE_SLANT = 0.21;
const FUKURA: P2[] = [[0, 1], [0.2, 0.92], [0.36, 0.856], [0.52, 0.73], [0.67, 0.554], [0.82, 0.353], [0.9, 0.215], [1, 0]];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lookup = (table: P2[], x: number) => {
  let i = 0;
  while (i < table.length - 2 && x > table[i + 1][0]) i++;
  const [x0, y0] = table[i];
  const [x1, y1] = table[i + 1];
  return lerp(y0, y1, Math.min(1, Math.max(0, (x - x0) / (x1 - x0))));
};
const hash = (n: number) => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

// 刃文：尖头互の目，谷（离刃口 0.225～0.265 刀宽）和峰（0.29～0.355）交替连直线；周期平均是刀宽的 0.55 倍（参考图约 0.5～0.8 倍，再密在远景会闪）。
// 参考图的峰高低、间距、歪向都不齐，用固定伪随机抖开，免得像锯条；峰最高 0.355 是平地鼓起处（bladePoint 的点 10）往下留的余量
const HAMON_KEYS: P2[] = (() => {
  const keys: P2[] = [];
  for (let s = 0, k = 1; s < YOKOTE + 0.5; k++) {
    const period = 0.55 * lerp(BLADE.w0, BLADE.w1, Math.min(1, s / YOKOTE)) * (0.78 + 0.44 * hash(k));
    keys.push([s, 0.225 + 0.04 * hash(k + 101)]);
    keys.push([s + period * (0.32 + 0.3 * hash(k + 202)), 0.29 + 0.065 * hash(k + 303)]);
    s += period;
  }
  return keys;
})();
const hamonAt = (s: number) => lookup(HAMON_KEYS, s);

// 站位 s 处的外形：刀背 top、镐筋（切先里是小镐）ysh、刃口 ye 的 Y，镐筋处厚度 T
const bladeOutline = (s: number) => {
  if (s <= YOKOTE) {
    const t = s / YOKOTE;
    const W = lerp(BLADE.w0, BLADE.w1, t);
    return { W, T: lerp(BLADE.t0, BLADE.t1, t), top: W / 2, ysh: W / 2 - BLADE.shino * W, ye: -W / 2 };
  }
  const v = Math.min(1, (s - YOKOTE) / KISSAKI);
  const W = BLADE.w1;
  const top = W / 2;
  const ridge = v < KISSAKI_RIDGE ? lerp(BLADE.shino, 0.06, v / KISSAKI_RIDGE) : (0.06 * (1 - v)) / (1 - KISSAKI_RIDGE);
  return { W, T: BLADE.t1 * Math.pow(1 - v, 0.6), top, ysh: top - ridge * W, ye: top - W * lookup(FUKURA, v) };
};

// 樋在站位 s 的状态：中心 c、半宽 h（都是"刀背到镐筋"那段的比例）、深度系数 d（0 = 没有槽，点都缩在中心线上）
const A_MUNE = BLADE.mune / BLADE.shino;
const A_TOP = HI.top / BLADE.shino;
const A_BOT = HI.bot / BLADE.shino;
const grooveAt = (s: number) => {
  const end = YOKOTE - HI.gap;
  const endC = lerp(A_TOP, A_BOT, HI.endAt);
  if (s >= end - HI.endLen) {
    const f = Math.max(0, 1 - ((s - (end - HI.endLen)) / HI.endLen) ** 2);
    const upper = lerp(endC, A_TOP, f);
    const lower = lerp(endC, A_BOT, f);
    return { c: (upper + lower) / 2, h: (lower - upper) / 2, d: Math.sqrt(f) };
  }
  const k = Math.min(1, Math.max(0, (s - HI.start) / HI.ramp));
  return { c: (A_TOP + A_BOT) / 2, h: (k * (A_BOT - A_TOP)) / 2, d: k };
};
// 槽内各点：离中心几个半宽、深度占几成。圆底偏上：下半一路朝上斜，反射天（参考图樋上半暗、下半亮）
const GROOVE_PTS: [number, number][] = [[-1, 0], [-0.75, 0.8], [-0.35, 1], [0.15, 0.95], [0.6, 0.65], [1, 0]];

// 半边截面（x ≥ 0，刀背 → 刃口）的第 i 个点在站位 s 处的位置。点：0 刀背、1 庵棟肩、2～7 樋（上沿 → 槽底 → 下沿）、8 下沿亮线下缘、
// 9 镐筋、10 平地鼓起处、11 刃文、12 刃口斜面起点、13 刃口
const HALF_N = 14;
const bladePoint = (i: number, s: number): P2 => {
  const { W, T, top, ysh, ye } = bladeOutline(s);
  const face = (a: number) => T * lerp(0.3, 0.5, (a - A_MUNE) / (1 - A_MUNE)); // 鎬地面（庵棟肩到镐筋）的半厚
  const onFace = (a: number, depth = 0): P2 => [face(a) * (1 - depth), top - a * (top - ysh)];
  if (i === 0) return [0, top];
  if (i === 1) return onFace(A_MUNE);
  if (i <= 8) {
    const g = grooveAt(s);
    if (i === 8) return onFace(g.c + g.h + (g.h / ((A_BOT - A_TOP) / 2)) * (HI.lip / BLADE.shino));
    const [off, dep] = GROOVE_PTS[i - 2];
    return onFace(g.c + off * g.h, dep * g.d * HI.depth);
  }
  const yn = ysh - (BLADE.niku / (1 - BLADE.shino)) * (ysh - ye);
  const yb = ye + Math.min(BLADE.bevel * W, 0.3 * (ysh - ye));
  if (i === 9) return [0.5 * T, ysh];
  if (i === 10) return [0.47 * T, yn];
  if (i === 12) return [0.07 * T, yb];
  if (i === 13) return [0, ye];
  // 切先里刃文点只是切先面上的一个顶点，不再走锯齿（同一圈的点站位不同，锯齿会把面折出棱）
  const hr = s > YOKOTE ? 0.65 : hamonAt(s) / (1 - BLADE.shino);
  const yh = Math.max(yb, Math.min(yn - 0.01 * W, ye + hr * (ysh - ye)));
  return [yn - yb > 1e-6 ? lerp(0.07 * T, 0.47 * T, (yh - yb) / (yn - yb)) : 0, yh];
};

// 半边各条边（点 i → i+1）的颜色：刀身主体（站位 s 处）、切先
const mixHex = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
const mainCols = (s: number): [string, string][] => {
  const shinoji = mixHex(STEEL.shinoji, STEEL.shinojiTip, Math.min(1, Math.max(0, (s - (YOKOTE - HI.gap - HI.endLen)) / (HI.endLen + HI.gap))));
  return [
    [STEEL.mune, STEEL.mune],
    [shinoji, shinoji],
    [STEEL.hiTop, STEEL.hiTop],
    [STEEL.hiDark, STEEL.hiDark],
    [STEEL.hiDark, STEEL.hiMid],
    [STEEL.hiMid, STEEL.hiLow],
    [STEEL.hiLow, STEEL.hiLow],
    [STEEL.hiLip, STEEL.hiLip],
    [shinoji, shinoji],
    [STEEL.ji, STEEL.ji],
    [STEEL.ji, STEEL.jiLow],
    [STEEL.ha, STEEL.haLow],
    [STEEL.edge, STEEL.edge],
  ];
};
const TIP_COLS: [string, string][] = mainCols(YOKOTE).map((c, e) => (e >= 9 && e <= 11 ? [STEEL.kissaki, STEEL.kissaki] : c));
// 各面的 kaFace：[雾面 0～1, 反射柔光箱几成, 刀尖那侧压暗几成（KA_ENV.dim）]。刃部雾面、不跟着压暗；樋是凹槽，参考图高光里樋仍是一道暗槽；
// 樋下沿的亮线、切先不压暗（参考图刀尖那半它们还是亮的）；刃文那条边从平地渐变到刃部（nioi）
const BLADE_FACE: Record<string, Face> = { plain: [0, 1, 1], hi: [0, 0.8, 1.3], lip: [0, 1, 0], nioi: [0.5, 0.5, 0.3], ha: [1, 0.1, 0], kissaki: [0, 1, 0] };
const MAIN_FACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((e): [Face, Face] => {
  const f = e >= 2 && e <= 5 ? BLADE_FACE.hi : e === 7 ? BLADE_FACE.lip : e === 11 ? BLADE_FACE.ha : BLADE_FACE.plain;
  return e === 10 ? [f, BLADE_FACE.nioi] : [f, f];
});
const TIP_FACES = MAIN_FACES.map((f, e): [Face, Face] => (e <= 11 ? [BLADE_FACE.kissaki, BLADE_FACE.kissaki] : f));

// 一圈截面：半边各点的站位 sts，两面镜像拼成逆时针一圈（0 = 刀背，HALF_N−1 = 刃口）
const bladeRing = (sts: number[], halfCols: [string, string][], halfFaces: [Face, Face][]): RingAt => {
  const half = sts.map((s, i) => [...bladePoint(i, s), PART_Z.tsuba + s] as [number, number, number]);
  const left = half.map(([x, y, z]) => [-x, y, z] as [number, number, number]);
  const pts = [...left, ...half.slice(1, HALF_N - 1).reverse()];
  const cols: [string, string][] = [...halfCols, ...halfCols.slice(0, HALF_N - 1).map(([a, b]) => [b, a] as [string, string]).reverse()];
  const faces: [Face, Face][] = [...halfFaces, ...halfFaces.slice(0, HALF_N - 1).map(([a, b]) => [b, a] as [Face, Face]).reverse()];
  return { pts, cols, faces };
};

// 刀身的光：沿刀长微凸（法线离 SHEEN.z 每 MC 像素往刀长方向掰 SHEEN.k 弧度），平的侧面也像一条弯镜子，把柔光箱反射成中段一片、往两头渐暗的高光，
// 刀一转这片高光就沿刀身走；SHEEN.z 定对照机位下高光落在哪（参考图中间那把最亮处在护手往前约 9.5 像素）。
const SHEEN = { z: lerp(PART_Z.tsuba, PART_Z.tip, 0.45), k: 0.045 };
const bladeFinish = (geo: THREE.BufferGeometry) => {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i);
    n.z += SHEEN.k * (pos.getZ(i) - SHEEN.z);
    n.normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return geo;
};

const bladeGeometry = () => {
  // 站位：刃文每个峰谷、樋起收的关键处，空隙大于 0.3 的补点
  const end = YOKOTE - HI.gap;
  const keys = [0, HI.start, HI.start + HI.ramp, ...HAMON_KEYS.map(([s]) => s)];
  for (const t of [0, 0.35, 0.6, 0.75, 0.86, 0.93, 0.97, 0.99, 1]) keys.push(end - HI.endLen * (1 - t));
  const sorted = keys.filter((s) => s >= 0 && s < YOKOTE - 0.02).sort((a, b) => a - b);
  const stations: number[] = [];
  for (const s of sorted) {
    const last = stations[stations.length - 1];
    if (last !== undefined && s - last < 0.02) continue;
    if (last !== undefined && s - last > 0.3) for (let k = 1, n = Math.ceil((s - last) / 0.3); k < n; k++) stations.push(lerp(last, s, k / n));
    stations.push(s);
  }
  const rings = stations.map((s) => bladeRing(Array(HALF_N).fill(s), mainCols(s), MAIN_FACES));
  // 横手：镐筋以上在 YOKOTE，以下越靠刃口越往刀尖斜；同一圈点出两份（主体色、切先色），颜色在这里硬切
  const slantOf = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, BLADE.niku / (1 - BLADE.shino), 0.7, 1 - BLADE.bevel / (1 - BLADE.shino), 1];
  const yokote = slantOf.map((f) => YOKOTE + YOKOTE_SLANT * KISSAKI * f);
  rings.push(bladeRing(yokote, mainCols(YOKOTE), MAIN_FACES));
  const tipSteps = 16;
  for (let k = 0; k <= tipSteps; k++) rings.push(bladeRing(yokote.map((s) => lerp(s, BLADE_LEN, k / tipSteps)), TIP_COLS, TIP_FACES));
  return sweepAt(rings, bend);
};

// ---------- 刀柄（柄头、柄卷、缘、护手） ----------
// 柄卷是一节节鳞片似的扁绳（交叉处一上一下），菱形窗里露出浅紫鲛皮，交叉点有小金钉；护手是像素台阶的厚铁镡，中间夹一层带齿的金。
// 沿刀长的分段照 拔刀剑.png 中间那把量（占柄头到护手的比例：柄头铁 6～7%、金箍 3.5%、柄卷 76%、缘 4%、护手 10%），截面方向按柄高换算。
const CORD_T = 0.06; // 柄卷绳的厚度：绳面最高处正好到 HILT
const CORE = { hx: HILT.ax - CORD_T, hy: HILT.by - CORD_T, r: 0.17 }; // 绳下面的柄芯
// 柄卷：参考图柄卷长 8.75 个节距，第一个交叉点离柄卷起点 0.3 节距，菱形窗宽 0.75 节距、高 0.43 个柄高
const WRAP_PITCH = (PART_Z.wrap1 - PART_Z.wrap0) / 8.75;
const crossZ = (k: number) => PART_Z.wrap0 + (k + 0.3) * WRAP_PITCH; // 第 k 个交叉点（侧面中线上，有金钉），k = 0..8
const WIN = { hz: 0.375 * WRAP_PITCH, hy: 0.21 };

// 三角面片：按 outward 统一朝外（DoubleSide 也要顶点法线朝外，背光面才不发黑）；smooth 时共点平滑
const triGeo = (pos: THREE.Vector3[], tris: [number, number, number][], outward: THREE.Vector3, smooth: boolean) => {
  const probe = tris.find(([i, j, k]) => new THREE.Vector3().subVectors(pos[j], pos[i]).cross(new THREE.Vector3().subVectors(pos[k], pos[i])).lengthSq() > 1e-12);
  const flip = probe && new THREE.Vector3().subVectors(pos[probe[1]], pos[probe[0]]).cross(new THREE.Vector3().subVectors(pos[probe[2]], pos[probe[0]])).dot(outward) < 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.flatMap((p) => [p.x, p.y, p.z]), 3));
  geo.setIndex(tris.flatMap(([i, j, k]) => (flip ? [i, k, j] : [i, j, k])));
  if (smooth) {
    geo.computeVertexNormals();
    return geo.toNonIndexed();
  }
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
};

// 柄卷的一节绳（参考图上一片片的"鳞"）：交叉点 zk 上方（ySign = 1）或下方的两股绳并成一片，从 −X 侧面的交叉点绕过刀背（或刃口）一侧到 +X 侧面。
// 侧面上两边贴着菱形窗的斜边；窗顶往上像瓦片一样叠：每节靠柄头那边（−Z）多伸出 SHINGLE 压住上一节，绳面从压人的那头往被压的那头略低下去，
// 柄的轮廓是连续的、节与节之间不露缝（参考图柄卷外沿是平滑的）。over：交叉处压在另一节上面（尖往下多伸一点）。返回绳面和侧壁（侧壁上暗色当缝线）
const SHINGLE = 0.05;
const STRAP_H = [[0, 0.95], [0.06, 1], [0.35, 0.94], [0.7, 0.87], [1, 0.8]]; // 从压人的那头（0）到被压的那头（1），绳面高度占 CORD_T 几成
const wrapStrap = (zk: number, ySign: 1 | -1, over: boolean) => {
  const { hx, hy, r } = CORE;
  const half = WRAP_PITCH / 2;
  // lead：往 −Z 伸多远（压住上一节），tail：往 +Z 伸多远（被下一节压住）
  type Row = { x: number; y: number; nx: number; ny: number; lead: number; tail: number; k: number };
  const sideW = (v: number) => Math.min(half - 0.02, half - WIN.hz * (1 - v / WIN.hy));
  const tipK = over ? 1 : 0.7; // 被压在下面的那节在交叉处薄一点
  // 窗顶往上，节与节的分界越往刀背越往柄头偏（偏 lean 个 SHINGLE），侧看是一道弧，像鱼鳞；叠的宽度不变
  const upper = (lean: number) => ({ lead: half + SHINGLE * (1 + lean), tail: half - 0.01 - SHINGLE * lean });
  const side: Row[] = [
    ...(over ? [{ x: -hx, y: -0.05, nx: -1, ny: 0, lead: 0, tail: 0, k: 1 }] : []),
    { x: -hx, y: 0, nx: -1, ny: 0, lead: sideW(0), tail: sideW(0), k: tipK },
    { x: -hx, y: WIN.hy, nx: -1, ny: 0, lead: sideW(WIN.hy), tail: sideW(WIN.hy), k: 1 },
    { x: -hx, y: hy - r, nx: -1, ny: 0, ...upper(0), k: 1 },
  ];
  for (const [deg, lean] of [[150, 0.8], [120, 1.8], [90, 2.6]]) {
    const angle = (deg * Math.PI) / 180;
    side.push({ x: -hx + r + r * Math.cos(angle), y: hy - r + r * Math.sin(angle), nx: Math.cos(angle), ny: Math.sin(angle), ...upper(lean), k: 1 });
  }
  const rows = [...side, { x: 0, y: hy, nx: 0, ny: 1, ...upper(3), k: 1 }, ...side.slice().reverse().map((row) => ({ ...row, x: -row.x, nx: -row.nx }))];
  const nc = STRAP_H.length;
  const top: THREE.Vector3[] = [];
  const base: THREE.Vector3[] = [];
  for (const row of rows) {
    for (const [t, hk] of STRAP_H) {
      const u = Math.min(PART_Z.wrap1, Math.max(PART_Z.wrap0, zk - row.lead + t * (row.lead + row.tail)));
      const h = CORD_T * hk * row.k;
      top.push(new THREE.Vector3(row.x + row.nx * h, ySign * (row.y + row.ny * h), u));
      base.push(new THREE.Vector3(row.x - row.nx * 0.01, ySign * (row.y - row.ny * 0.01), u));
    }
  }
  const surf: [number, number, number][] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    for (let j = 0; j + 1 < nc; j++) {
      const p = i * nc + j;
      surf.push([p, p + nc, p + nc + 1], [p, p + nc + 1, p + 1]);
    }
  }
  const face = triGeo(top, surf, new THREE.Vector3(0, ySign, 0), true);
  // 四周的侧壁：左右两边（贴菱形窗、叠瓦的台阶）和两头（交叉处）
  const walls: THREE.BufferGeometry[] = [];
  const wall = (ring: number[], outward: THREE.Vector3) => {
    const pos = [...ring.map((i) => top[i]), ...ring.map((i) => base[i])];
    const n = ring.length;
    const tris: [number, number, number][] = [];
    for (let i = 0; i + 1 < n; i++) tris.push([i, i + 1, n + i + 1], [i, n + i + 1, n + i]);
    walls.push(triGeo(pos, tris, outward, false));
  };
  wall(rows.map((_, i) => i * nc), new THREE.Vector3(0, 0, -1));
  wall(rows.map((_, i) => i * nc + nc - 1), new THREE.Vector3(0, 0, 1));
  if (!over) {
    wall(STRAP_H.map((_, j) => j), new THREE.Vector3(0, -ySign, 0));
    wall(STRAP_H.map((_, j) => (rows.length - 1) * nc + j), new THREE.Vector3(0, -ySign, 0));
  }
  return { face, walls: mergeGeometries(walls)! };
};

// 菱形窗里的鲛皮：一块平板（参考图是均匀的细颗粒，做成小格起伏近看像格子呢）；窗被柄卷两头截断的照样截
const sameWindow = (kit: Kit, center: number, side: 1 | -1) => {
  const diamond: P2[] = [[center + WIN.hz, 0], [center, WIN.hy], [center - WIN.hz, 0], [center, -WIN.hy]];
  const clipped = clipRect(diamond, PART_Z.wrap0, PART_Z.wrap1, -1, 1);
  if (clipped.length >= 3) kit.add('same', onSide(clipped, side, CORE.hx - 0.004, CORE.hx + 0.009), SAME);
};

// 侧面（±X）在 |y| ≤ notch 处开一道深 depth 的槽的圆角矩形（柄头的コ形铁框、金箍的缺口）
const notchedRoundRect = (hx: number, hy: number, radius: number, notch: number, depth: number): P2[] => {
  const pts = roundRect(hx, hy, radius, 5);
  const arc = pts.length / 4;
  return [
    ...pts.slice(0, 2 * arc),
    [-hx, notch], [-hx + depth, notch], [-hx + depth, -notch], [-hx, -notch],
    ...pts.slice(2 * arc),
    [hx, -notch], [hx - depth, -notch], [hx - depth, notch], [hx, notch],
  ];
};

// 护手各层的轮廓：像素台阶（每个角 n 级、每级 s），逆时针
const stairQuarter = (hx: number, hy: number, step: number, n: number): P2[] => {
  const quarter: P2[] = [];
  for (let i = 0; i < n; i++) quarter.push([hx - i * step, hy - (n - i) * step], [hx - (i + 1) * step, hy - (n - i) * step]);
  quarter.push([hx - n * step, hy]);
  return quarter;
};
const steppedOutline = (hx: number, hy: number, step: number, n: number): P2[] => {
  const quarter = stairQuarter(hx, hy, step, n);
  return [
    ...quarter,
    ...quarter.slice().reverse().map(([x, y]) => [-x, y] as P2),
    ...quarter.map(([x, y]) => [-x, -y] as P2),
    ...quarter.slice().reverse().map(([x, y]) => [x, -y] as P2),
  ];
};
// 护手夹层四角的铁耳：台阶轮廓的四个角，往里厚 depth，四边中段（|x| < nx、|y| < ny）空着露出里面的金齿
const stairEars = (hx: number, hy: number, step: number, n: number, nx: number, ny: number, depth: number): P2[][] => {
  const ear: P2[] = [[hx, ny], ...stairQuarter(hx, hy, step, n), [nx, hy], [nx, hy - depth], [hx - depth, hy - depth], [hx - depth, ny]];
  return ([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).map(([sx, sy]) => {
    const mapped = ear.map(([x, y]) => [sx * x, sy * y] as P2);
    return sx * sy < 0 ? mapped.reverse() : mapped;
  });
};

// 沿轮廓每条边切出一排长短交替的齿（护手中间那层金的边，侧看像透雕），齿间露出里面的暗芯
const teethAlong = (outline: P2[], depth: number, rhythm: number[], gap: number): P2[][] => {
  const out: P2[][] = [];
  const unit = rhythm.reduce((sum, len) => sum + len + gap, 0) / rhythm.length;
  outline.forEach(([x0, y0], i) => {
    const [x1, y1] = outline[(i + 1) % outline.length];
    const edgeLen = Math.hypot(x1 - x0, y1 - y0);
    const [dx, dy] = [(x1 - x0) / edgeLen, (y1 - y0) / edgeLen];
    const lens = Array.from({ length: Math.max(1, Math.round(edgeLen / unit)) }, (_, j) => rhythm[j % rhythm.length] + gap);
    const fit = edgeLen / lens.reduce((sum, len) => sum + len, 0);
    let pos = 0;
    for (const len of lens) {
      const [a, b] = [pos + (gap / 2) * fit, pos + (len - gap / 2) * fit];
      pos += len * fit;
      if (b - a < 0.03) continue;
      out.push([[x0 + dx * a, y0 + dy * a], [x0 + dx * b, y0 + dy * b], [x0 + dx * b - dy * depth, y0 + dy * b + dx * depth], [x0 + dx * a - dy * depth, y0 + dy * a + dx * depth]]);
    }
  });
  return out;
};

const hiltKit = () => {
  const kit = new Kit();
  const { ax, by } = HILT;
  const [w0, w1] = [PART_Z.wrap0, PART_Z.wrap1];

  // 柄头：铁端盖（端面收一级台阶），侧面一个往柄卷方向开口的凹窗（コ形铁框）；接着金箍，侧面中间断开一道缺口，和铁框的凹窗连成「凵」形
  const k0 = PART_Z.kashira;
  const k1 = PART_Z.kashiraGold;
  const [kx, ky] = [ax + 0.03, by + 0.03]; // 参考图柄头铁盖比柄卷高一点点、金箍再高一点
  kit.add('iron', ironEdges(extrude(shape(roundRect(kx - 0.05, ky - 0.05, 0.2, 6)), k0, k0 + 0.09, 0.025)));
  kit.add('iron', ironEdges(extrude(shape(roundRect(kx, ky, 0.24, 6)), k0 + 0.07, k0 + 0.24, 0.03)));
  kit.add('iron', ironEdges(extrude(shape(notchedRoundRect(kx, ky, 0.24, 0.255, 0.057)), k0 + 0.22, k1, 0.015)));
  for (const side of [1, -1] as const) kit.add('iron', onSide([[k0 + 0.22, -0.255], [k1, -0.255], [k1, 0.255], [k0 + 0.22, 0.255]], side, kx - 0.071, kx - 0.053), IRON_DEEP);
  kit.add('gold', extrude(shape(notchedRoundRect(ax + 0.04, by + 0.04, 0.28, 0.12, 0.114)), k1, w0, 0.02), GOLD);
  for (const side of [1, -1] as const) kit.add('same', onSide([[k1, -0.12], [w0, -0.12], [w0, 0.12], [k1, 0.12]], side, CORE.hx - 0.004, CORE.hx + 0.009), SAME);

  // 柄卷：柄芯 + 菱形窗里的鲛皮 + 一节节的绳 + 交叉点的金钉
  kit.add('cord', extrude(shape(roundRect(CORE.hx, CORE.hy, CORE.r, 5)), k1 + 0.02, w1 + 0.02), CORD_DARK);
  for (let k = -1; k <= 8; k++) for (const side of [1, -1] as const) sameWindow(kit, crossZ(k) + WRAP_PITCH / 2, side);
  for (let k = 0; k <= 8; k++) {
    for (const ySign of [1, -1] as const) {
      const strap = wrapStrap(crossZ(k), ySign, (k + (ySign === 1 ? 0 : 1)) % 2 === 0);
      kit.add('cord', strap.face, CORD);
      kit.add('cord', strap.walls, CORD_DARK);
    }
    for (const side of [1, -1] as const) kit.add('gold', new THREE.CylinderGeometry(0.028, 0.028, 0.04, 6).rotateZ(Math.PI / 2), GOLD, at(side * (ax + 0.006), 0, crossZ(k)), by);
  }

  // 缘：比柄大一圈的金色柄口，靠护手一头是一片更大一点的切羽
  const f1 = PART_Z.fuchi;
  kit.add('gold', extrude(shape(roundRect(ax + 0.05, by + 0.05, 0.3, 6)), w1 - 0.02, f1 - 0.06, 0.035), GOLD);
  kit.add('gold', extrude(shape(roundRect(ax + 0.07, by + 0.07, 0.31, 6)), f1 - 0.07, f1, 0.015), GOLD_DARK);

  // 护手：侧看是一级级的台阶（柄这边两级、中间最高、刀那边一级），像素台阶轮廓；参考图侧看金在靠刀身那一半。
  // 中间夹一层金：四边中段的槽里露出两排长短不齐的金齿（侧看像透雕），四角是整块铁耳；正反两面各开四个 L 形窗露出金面
  const tz = { a: f1, a2: f1 + 0.06, c1: f1 + 0.12, g0: f1 + 0.28, g1: f1 + 0.46, c2: f1 + 0.52, b: PART_Z.tsuba };
  const lWindow = (sx: 1 | -1, sy: 1 | -1): P2[] => {
    const pts: P2[] = [[0.584, 0.1], [0.783, 0.1], [0.783, 0.783], [0.676, 0.783], [0.676, 0.926], [0.1, 0.926], [0.1, 0.755], [0.584, 0.755]];
    const mapped = pts.map(([x, y]) => [sx * x, sy * y] as P2);
    return sx * sy < 0 ? mapped.reverse() : mapped;
  };
  const windows = ([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).map(([sx, sy]) => lWindow(sx, sy));
  const plateC = steppedOutline(1.153, 1.31, 0.107, 3);
  const plateA2 = steppedOutline(0.89, 1.032, 0.071, 2);
  kit.add('iron', ironEdges(extrude(shape(steppedOutline(0.527, 0.712, 0.071, 2)), tz.a, tz.a2 + 0.005, 0.02)));
  kit.add('iron', ironEdges(extrude(shape(plateA2, windows), tz.a2, tz.c1 + 0.005, 0.02)));
  kit.add('iron', ironEdges(extrude(shape(plateC, windows), tz.c1, tz.g0, 0.045)));
  for (const ear of stairEars(1.153, 1.31, 0.107, 3, 0.712, 0.926, 0.178)) kit.add('iron', extrude(shape(ear), tz.g0, tz.g1), IRON);
  kit.add('iron', ironEdges(extrude(shape(plateC, windows), tz.g1, tz.c2, 0.02)));
  kit.add('iron', ironEdges(extrude(shape(plateA2, windows), tz.c2 - 0.005, tz.b, 0.025)));
  kit.add('iron', extrude(shape(steppedOutline(0.997, 1.153, 0.107, 3)), tz.g0 + 0.004, tz.g1 - 0.004), IRON_DEEP);
  kit.add('gold', extrude(shape(steppedOutline(0.975, 1.132, 0.107, 3)), tz.g0, tz.g1), GOLD);
  const gm = (tz.g0 + tz.g1) / 2;
  const teethOutline = steppedOutline(1.068, 1.225, 0.107, 3);
  const inGroove = (tooth: P2[]) => {
    const [cx, cy] = [tooth.reduce((s, p) => s + p[0], 0) / tooth.length, tooth.reduce((s, p) => s + p[1], 0) / tooth.length];
    return Math.abs(cy) < 0.926 || Math.abs(cx) < 0.712; // 四角埋在铁耳里的不做
  };
  for (const [rhythm, z0, z1] of [[[0.242, 0.085, 0.157], tz.g0 + 0.01, gm - 0.015], [[0.114, 0.214, 0.071, 0.171], gm + 0.015, tz.g1 - 0.01]] as const) {
    for (const tooth of teethAlong(teethOutline, 0.071, [...rhythm], 0.07).filter(inGroove)) kit.add('gold', extrude(shape(tooth), z0, z1), GOLD, undefined, 1.225);
  }
  return kit.build();
};

// ---------- 鎺（金色刀镡座）+ 刀身 ----------
// 鎺：一整块金，高和柄差不多；两侧刻一道阶梯形的 "⊃" 回纹（照 设定/物品/拔刀剑.png 中间那把的像素纹量，开口朝护手），是真凹下去的槽、槽底暗金。
// 槽按 Z 分段：每段截面是圆角矩形在两侧挖掉槽那几截，段和段的端面补出槽壁
const HABAKI = { hx: 0.18, hy: 0.5, r: 0.12, depth: 0.025 }; // 圆角大些，上沿才反射到天（参考图鎺上沿一道亮）
// 回纹外沿、内沿（Z 从护手量起，Y 从中线量起），两条都从护手里面起、顺时针；纹长 0.52、高 0.54（参考图 0.53、0.56），台阶一级 0.077
const HABAKI_OUTER: P2[] = [[-0.03, 0.27], [0.445, 0.27], [0.445, 0.193], [0.522, 0.193], [0.522, -0.193], [0.445, -0.193], [0.445, -0.27], [-0.03, -0.27]];
const HABAKI_INNER: P2[] = [[-0.03, 0.193], [0.368, 0.193], [0.368, 0.116], [0.445, 0.116], [0.445, -0.116], [0.368, -0.116], [0.368, -0.193], [-0.03, -0.193]];
const notchedRect = (hx: number, hy: number, r: number, notches: [number, number][], depth: number): P2[] => {
  const base = roundRect(hx, hy, r); // 从右侧上端逆时针，第 10 点起是左侧下端，最后一点是右侧下端
  const up = [...notches].sort((a, b) => a[0] - b[0]);
  const right = up.flatMap(([y0, y1]): P2[] => [[hx, y0], [hx - depth, y0], [hx - depth, y1], [hx, y1]]);
  const left = [...up].reverse().flatMap(([y0, y1]): P2[] => [[-hx, y1], [-hx + depth, y1], [-hx + depth, y0], [-hx, y0]]);
  return [...base.slice(0, 10), ...left, ...base.slice(10), ...right];
};

const bladeKit = () => {
  const kit = new Kit();
  const { hx, hy, r, depth } = HABAKI;
  const z0 = PART_Z.tsuba;
  const len = PART_Z.habaki - z0;
  // 靠护手那头往回多搭 0.03 藏进护手，端面不和护手那面重合
  const segs: [number, number, [number, number][]][] = [
    [-0.03, 0.368, [[0.193, 0.27], [-0.27, -0.193]]],
    [0.368, 0.445, [[0.116, 0.27], [-0.27, -0.116]]],
    [0.445, 0.522, [[-0.193, 0.193]]],
    [0.522, len - 0.06, []],
  ];
  for (const [a, b, notches] of segs) kit.add('habaki', extrude(shape(notchedRect(hx, hy, r, notches, depth)), z0 + a, z0 + b), GOLD);
  // 刀身那头的端头单独一段带倒角，起点往回搭一截，倒角缩进去的那圈藏在上一段里
  kit.add('habaki', extrude(shape(roundRect(hx, hy, r)), z0 + len - 0.08, z0 + len, 0.02), GOLD);
  const floor: P2[] = [...HABAKI_OUTER, ...HABAKI_INNER.slice().reverse()].map(([u, v]) => [z0 + u, v] as P2);
  for (const side of [1, -1] as const) kit.add('habaki', onSide(floor, side, hx - depth + 0.001, hx - depth + 0.004), GOLD_DARK, undefined, hy);
  kit.add('steel', bladeFinish(bladeGeometry()));
  return kit.build();
};

// ---------- 鞘 ----------
// 金具、下绪、栗形、责金照参考图下面那把量，大小和沿鞘长的位置都以鞘高为尺换算。
const oct2 = (hx: number, hy: number, cx: number, cy: number): P2[] => [
  [hx, -hy + cy], [hx, hy - cy], [hx - cx, hy], [-hx + cx, hy], [-hx, hy - cy], [-hx, -hy + cy], [-hx + cx, -hy], [hx - cx, -hy],
];
const sayaOct = (hx: number, hy: number) => oct2(hx, hy, SAYA.chx, SAYA.chy);
const sayaSize = (z: number): [number, number] => {
  const t = Math.min(1, Math.max(0, z / SAYA.len));
  return [SAYA.sx0 + (SAYA.sx1 - SAYA.sx0) * t, SAYA.sy0 + (SAYA.sy1 - SAYA.sy0) * t];
};
// 鞘中心线 z 处、截面垂直于中心线的局部坐标（金具、绳圈这些短部件整段按这一处放直）
const sayaAt = (z: number) => new THREE.Matrix4().makeRotationX(sayaTilt(z)).setPosition(0, sayaBend(z), z);
const area = (poly: P2[]) => poly.reduce((sum, [x0, y0], i) => sum + x0 * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * y0, 0);
const ccw = (poly: P2[]) => (area(poly) < 0 ? poly.slice().reverse() : poly);
// 凸多边形（逆时针）每条边往外平移 d（d < 0 往里收）
const grow = (pts: P2[], d: number): P2[] => {
  const lines = pts.map(([x0, y0], i) => {
    const [x1, y1] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = (y1 - y0) / len;
    const ny = (x0 - x1) / len;
    return { nx, ny, c: nx * x0 + ny * y0 + d };
  });
  return lines.map((cur, i) => {
    const prev = lines[(i + lines.length - 1) % lines.length];
    const det = prev.nx * cur.ny - prev.ny * cur.nx;
    return [(prev.c * cur.ny - prev.ny * cur.c) / det, (prev.nx * cur.c - prev.c * cur.nx) / det] as P2;
  });
};

// 鞘身截面：八角，侧面两头各让出一道 ridge 宽的窄棱（颜色见 LACQUER_HI）
const sayaProfile = (hx: number, hy: number) => {
  const { chx, chy, ridge } = SAYA;
  const kx = (chx / Math.hypot(chx, chy)) * ridge;
  const ky = (chy / Math.hypot(chx, chy)) * ridge;
  const pts: P2[] = [
    [hx, -hy + chy + ridge], [hx, hy - chy - ridge], [hx - kx, hy - chy + ky], [hx - chx, hy],
    [-hx + chx, hy], [-hx + kx, hy - chy + ky], [-hx, hy - chy - ridge], [-hx, -hy + chy + ridge],
    [-hx + kx, -hy + chy - ky], [-hx + chx, -hy], [hx - chx, -hy], [hx - kx, -hy + chy - ky],
  ];
  const faces = [LACQUER, LACQUER_HI, LACQUER_BEVEL, LACQUER, LACQUER_BEVEL, LACQUER_HI, LACQUER, LACQUER_HI, LACQUER_BEVEL, LACQUER, LACQUER_BEVEL, LACQUER_HI];
  return { pts, cols: faces.map((c) => [c, c] as [string, string]) };
};

// 金具（鞘口、鞘尾）：从鞘端往里是端头金箍（鞘尾是两级台阶收小的端盖），再是开窗的金框，窗里露出鞘漆；
// 窗中一道回纹：一条框边伸出的钩（下、拐、再下）加对面框边的短桩，窗朝鞘身那头留一个口。
// 侧视时两端的回纹中心对称（鞘口的钩从下框起、鞘尾的从上框起）；两个侧面绕鞘轴转 180° 对称，翻过来看也一样。
// u：从鞘端往鞘身量；v：正向是钩挂的那条框。len 总长、wall 端头到窗、yw 窗的半高、e 金框比鞘身高出多少
const FIT = { len: 1.35, wall: 0.51, yw: 0.367, e: 0.063, cap: 0.108 };
// 金具外形比鞘身大 d 一圈、斜面小一些：侧面平直的部分要越过窗的上下沿，金框、回纹和窗口才在同一个平面上
const fitOct = (sx: number, sy: number, d: number) => oct2(sx + d, sy + d, SAYA.chx, sy + d - FIT.yw - 0.056);
const fitting = (kit: Kit, atMouth: boolean) => {
  const L = FIT.len;
  const dir = atMouth ? 1 : -1;
  const zm = (atMouth ? 0 : SAYA.len) + (dir * L) / 2;
  const frame = sayaAt(zm);
  const [sx, sy] = sayaSize(zm);
  const body = sayaOct(sx, sy);
  const zOf = (u: number) => dir * (u - L / 2);
  const span = (u0: number, u1: number): [number, number] => [Math.min(zOf(u0), zOf(u1)), Math.max(zOf(u0), zOf(u1))];
  const add = (geo: THREE.BufferGeometry) => kit.add('gold', geo, GOLD, frame, sy + FIT.e);
  const ring = (u0: number, u1: number, outer: P2[], solid: boolean) =>
    add(extrude(shape(outer, solid ? [] : [grow(body, -0.014).reverse()]), ...span(u0, u1), 0.021));
  if (atMouth) {
    ring(0, 0.324, fitOct(sx, sy, 0.092), false);
  } else {
    ring(0, FIT.cap, grow(body, -0.056), true);
    ring(FIT.cap, 0.308, fitOct(sx, sy, 0.07), true);
    ring(0.308, FIT.wall, fitOct(sx, sy, 0.092), false);
  }
  const outline = fitOct(sx, sy, FIT.e);
  const plateFrom = atMouth ? 0.324 : FIT.wall;
  for (const part of [clipRect(outline, -9, 9, FIT.yw, 9), clipRect(outline, -9, 9, -9, -FIT.yw)]) {
    add(extrude(shape(part), ...span(plateFrom, L), 0.014));
  }
  const yw = FIT.yw;
  const hook: P2[] = [[L - 0.524, -0.183], [L - 0.37, -0.183], [L - 0.37, 0.085], [L, 0.085], [L, yw], [L - 0.177, yw], [L - 0.177, 0.204], [L - 0.524, 0.204]];
  const rect = (u0: number, u1: number, v0: number, v1: number): P2[] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const bars = [hook, rect(L - 0.17, L, -yw, -0.155)];
  if (atMouth) bars.push(rect(0.324, FIT.wall, -yw, yw));
  const onFace = (poly: P2[], vs: number) => ccw(poly.map(([u, v]) => [zOf(u), vs * v] as P2));
  for (const side of [1, -1] as const) {
    const vs = (atMouth ? -1 : 1) * -side; // -X 面上鞘口的钩挂在 -Y 框、鞘尾的挂在 +Y 框；+X 面反过来
    for (const bar of bars) add(onSide(onFace(bar, vs), side, sx - 0.042, sx + FIT.e, 0.0085));
    // 窗底垫一块平的鞘漆，盖住窗里露出来的那截高光棱
    kit.add('lacquer', onSide(onFace(rect(FIT.wall, L, -yw, yw), vs), side, sx - 0.085, sx + 0.003), LACQUER, frame);
  }
};

// 一条扁带的侧视轮廓：沿折线 path 宽 width，拐角斜接
const strap = (path: P2[], width: number): P2[] => {
  const unit = ([x, y]: P2): P2 => [x / Math.hypot(x, y), y / Math.hypot(x, y)];
  const segs = path.slice(1).map((p, i) => unit([p[0] - path[i][0], p[1] - path[i][1]]));
  const edges = path.map((p, i) => {
    const a = segs[Math.max(0, i - 1)];
    const b = segs[Math.min(segs.length - 1, i)];
    const t = unit([a[0] + b[0], a[1] + b[1]]);
    const k = width / 2 / (t[0] * b[0] + t[1] * b[1]);
    return [[p[0] - t[1] * k, p[1] + t[0] * k], [p[0] + t[1] * k, p[1] - t[0] * k]] as [P2, P2];
  });
  return ccw([...edges.map((e) => e[0]), ...edges.map((e) => e[1]).reverse()]);
};

// 下绪：扁绳一圈圈平行缠，鞘口那边一组 2 道、栗形两侧各 3 道；后两组在刃口一侧（-Y，佩刀时朝下）把结包在里面，
// 结下两对绳头往鞘口、鞘尾两边斜着往下散开（横拿、挂在腰上都像垂着）。z 是每组第一道的起点
const SAGEO_Z = { a: 2.3, b: 3.0, kuri: 3.76, c: 3.95, seme: 4.77 };
const BAND = 0.2;
const sheathKit = () => {
  const kit = new Kit();
  const bodyEnd = SAYA.len - FIT.cap - 0.045; // 藏进鞘尾实心的第二道金箍里（金具按中点切向放直，端面比弯着的鞘身略靠里）
  const rings: Ring[] = [];
  const ringCount = 40;
  for (let i = 0; i <= ringCount; i++) {
    const station = (bodyEnd * i) / ringCount;
    rings.push({ s: station, ...sayaProfile(...sayaSize(station)) });
  }
  kit.add('lacquer', sweep(rings, sayaBend));
  kit.add('lacquer', new THREE.ShapeGeometry(shape(sayaOct(SAYA.sx0, SAYA.sy0))).rotateY(Math.PI), LACQUER, at(0, 0, 0.002));
  kit.add('dark', new THREE.ShapeGeometry(shape(roundRect(0.12, 0.45, 0.056))).rotateY(Math.PI), SLOT, at(0, 0, -0.004));
  fitting(kit, true);
  fitting(kit, false);

  // 刃口一侧往下鼓出一块包住结的截面（后两组绳圈、结心用）
  const keel = (hx: number, hy: number): P2[] => {
    const pts = sayaOct(hx, hy);
    pts[6] = [-0.21, -hy - 0.155];
    pts[7] = [0.21, -hy - 0.155];
    return pts;
  };
  const band = (z0: number, poly: P2[], col: string) => kit.add('cord', extrude(shape(poly), -BAND / 2 + 0.003, BAND / 2 - 0.003, 0.021), col, sayaAt(z0 + BAND / 2));
  for (let i = 0; i < 2; i++) {
    const z = SAGEO_Z.a + i * BAND;
    band(z, grow(sayaOct(...sayaSize(z)), 0.035 + 0.011 * (i % 2)), SAGEO);
  }
  for (const z0 of [SAGEO_Z.b, SAGEO_Z.c]) {
    for (let i = 0; i < 3; i++) {
      const z = z0 + i * BAND;
      band(z, grow(keel(...sayaSize(z)), 0.039 + 0.011 * (i % 2)), SAGEO);
    }
  }
  const knotFrame = sayaAt(SAGEO_Z.kuri);
  const [kx, ky] = sayaSize(SAGEO_Z.kuri);
  const zb = SAGEO_Z.b - SAGEO_Z.kuri;
  const zc = SAGEO_Z.c + 3 * BAND - SAGEO_Z.kuri;
  kit.add('cord', extrude(shape(clipRect(grow(keel(kx, ky), 0.021), -9, 9, -9, -ky + 0.085)), zb, zc, 0.021), SAGEO, knotFrame);
  // 绳头：[起点 z, 与鞘轴的夹角（往下）, 朝鞘口 -1 / 鞘尾 +1, x 偏移]。参考图的绳头几乎是直的，后段只多偏下一点
  const tails: [number, number, number, number][] = [
    [zb + 0.154, 19, -1, 0.05], [zb + 0.2, 40, -1, -0.05],
    [zc - 0.154, 19, 1, 0.05], [zc - 0.2, 38, 1, -0.05],
  ];
  for (const [z, deg, toward, x] of tails) {
    const dir = (d: number): P2 => [toward * Math.cos((d * Math.PI) / 180), -Math.sin((d * Math.PI) / 180)];
    const p0: P2 = [z, -ky - 0.085];
    const p1: P2 = [p0[0] + 0.46 * dir(deg)[0], p0[1] + 0.46 * dir(deg)[1]];
    const p2: P2 = [p1[0] + 0.32 * dir(deg + 9)[0], p1[1] + 0.32 * dir(deg + 9)[1]];
    kit.add('cord', onSide(strap([p0, p1, p2], 0.12), -1, -x - 0.025, -x + 0.025, 0.011), SAGEO, knotFrame);
  }
  // 栗形：-X 面（佩在左腰时朝外）侧面正中的黑色圆角方钮，底下垫一块金（鵐目），钮两头露出金边
  kit.add('gold', onSide(roundRect(0.254, 0.219, 0.085), -1, kx - 0.07, kx + 0.07, 0.014), GOLD, knotFrame, ky);
  kit.add('lacquer', onSide(roundRect(0.185, 0.331, 0.07), -1, kx - 0.07, kx + 0.17, 0.035), HORN, knotFrame);

  // 责金：下绪后面一道细金箍
  const semeZ = SAGEO_Z.seme + 0.15;
  const seme = sayaOct(...sayaSize(semeZ));
  kit.add('gold', extrude(shape(grow(seme, 0.056), [grow(seme, -0.014).reverse()]), -0.15, 0.15, 0.028), GOLD, sayaAt(semeZ));
  return kit.build();
};

const HILT_PARTS = hiltKit();
const BLADE_PARTS = bladeKit();
const SHEATH_PARTS = sheathKit();

const triCount = (parts: { geo: THREE.BufferGeometry }[]) => parts.reduce((n, p) => n + p.geo.getAttribute('position').count / 3, 0);
export const KATANA_TRIS = { hilt: triCount(HILT_PARTS), blade: triCount(BLADE_PARTS), sheath: triCount(SHEATH_PARTS) };

// 高光会溢出泛光的只有刀身（拔刀剑泛光.tsx）：网格多开一层，画布由 useKatanaBloom 挂上泛光。
// 金具不算：参考图里溢光的是刀身中段那片高光，金的鞘尾、鯉口在暗处会成一圈发光的帽子
const BLOOM_CLS: Cls = 'steel';
const Parts: React.FC<{ parts: { cls: Cls; geo: THREE.BufferGeometry }[] }> = ({ parts }) => {
  const ghost = useContext(Ghost);
  useKatanaBloom();
  return (
    <>
      {parts.map(({ cls, geo }) =>
        ghost ? (
          <mesh key={cls} ref={(m: THREE.Mesh | null) => m?.layers.disable(KATANA_BLOOM_LAYER)} geometry={geo}>
            <meshBasicMaterial color={ghost.color} transparent opacity={ghost.opacity} depthWrite={false} />
          </mesh>
        ) : (
          <mesh
            key={cls}
            ref={(m: THREE.Mesh | null) => m?.layers[cls === BLOOM_CLS ? 'enable' : 'disable'](KATANA_BLOOM_LAYER)}
            geometry={geo}
            material={MATERIALS[cls]}
            onBeforeRender={kaBeforeRender}
            castShadow
            receiveShadow
          />
        ),
      )}
    </>
  );
};

export const DrawnKatana: React.FC = () => (
  <>
    <Parts parts={HILT_PARTS} />
    <Parts parts={BLADE_PARTS} />
  </>
);

// 刀鞘：鞘口在原点，沿 +Z 往鞘尾延伸；sheathed 时刀柄从鞘口露出（-Z 方向），刃口朝 -Y。柄的摆法同 `SHEATHED_BLADE`。
export const Sheath: React.FC<{ sheathed: boolean }> = ({ sheathed }) => (
  <>
    <Parts parts={SHEATH_PARTS} />
    {sheathed && (
      <group position={[0, 0, -PART_Z.tsuba]}>
        <Parts parts={HILT_PARTS} />
      </group>
    )}
  </>
);

// 李樱佩刀：鞘挂在左腰（李樱.tsx 的 hipL），只绕 X 转 `SHEATH_HANG` 度：柄朝前上 30°、鞘尾往后下，刃口朝下、鞘尾往上翘（用户 10-18、10-19 定）。
// 所有镜头都用这一个挂法；收刀时鞘被左手转过来迎刀也从它出发（旧项目 镜头/6-1-2/收刀.ts）。
export const SHEATH_HANG = 120;
export const SHEATH_HANG_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (SHEATH_HANG * Math.PI) / 180);
export const WornSheath: React.FC<{ sheathed?: boolean }> = ({ sheathed = true }) => (
  <group quaternion={SHEATH_HANG_QUAT}>
    <Sheath sheathed={sheathed} />
  </group>
);
