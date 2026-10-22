// 魔法酒狐：照抄车万女仆（TLM）1.5.3 内置的 geckolib 模型 winefox_magical，戴贴图 _3（百花），几何、贴图都是模组里的原样。
// 来源：取材配方「魔法酒狐模型」从 touhoulittlemaid-1.5.3 jar 导出成 模型/角色/魔法酒狐、贴图/角色/魔法酒狐/百花（去掉了 FOX、gui、molang*）。
// 动作数值抄同一个 jar 的 geckolib/animation/winefox_magical.main.animation.json：显隐取 pre_parallel0/1，坐姿取 sit，法杖浮动取 pre_parallel1，三个环取 parallel5。
// 大小：TLM 按 maid_model.json 的 render_entity_scale 0.65 缩放（不是九胡 YSM 的 0.7）。
// 默认状态照隐世之境结构里那只女仆：坐着（Sitting 1）、戴着头盔（所以魔女帽显示、狐耳藏起来）、背后法杖显示。
// 坐标和 骨架.tsx 的 `Figure` 一致：原点在脚底，Z 朝上，朝向 +Y，右手在 +X。模型自带 0.7、1.48 像素的原点偏移，游戏里也是这样画的，不补。
// 逐面 UV、负的 uv_size 照 基岩模型.tsx 原样画就和游戏一样（取法和 GeckoLib 逐面相同，坐姿和游戏截图叠在一起也对得上），所以加载时不改写 json。
// 坑：厚度为 0 的片，基岩模型.tsx 留 up、north 面，游戏里后画的 down、south 盖在上面；这个模型里两面贴图不同的只在平时藏着的魔法阵和手持法杖上。
import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { rad, sampleV, type VKey } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';
import { type BedrockBone, type BedrockModel, BedrockModelView, type BonePose } from '../../engine/model/基岩模型.tsx';
import type { FigurePose } from './骨架.tsx';
import { png } from '../../engine/model/贴图.ts';
import { magicalWineFoxMotion, type 魔法酒狐表情 } from './魔法酒狐动作.ts';
import raw from 'asset:模型/角色/魔法酒狐';
import skin from 'asset:贴图/角色/魔法酒狐/百花';

const MODEL = { ...(raw as unknown as object), texture: png(skin) } as unknown as BedrockModel; // json 资产 import 进来是解析好的对象

// 发光：TLM 的 GeoBone.glow 是「骨骼名以 ysmGlow 开头」，IGeoRenderer.renderRecursively 只给这根骨骼自己的方块用满亮度
// LightTexture.pack(15, 15)，画子骨骼时传回原来的光照（javap 反汇编）。所以按骨骼自己的名字拆，不往下传：
// 眼珠高光 RightEyeDot、LeftEyeDot 和 LongLeftHair 挂在 ysmGlow 骨骼下面，游戏里照常受光。
// 模型拆成两份、各画一个 BedrockModelView，同一张姿势表：主体去掉 ysmGlow 骨骼的方块，发光那份只留它们（加上祖先骨骼，变换才对）。
// 不改 engine/model/基岩模型.tsx 的材质：迁移期改了，用到它的应力转动段指纹都会变。旧项目退役以后再把发光并进去（docs/待办.md）。
const isGlow = (name: string) => name.startsWith('ysmGlow');
const BODY: BedrockModel = { ...MODEL, bones: MODEL.bones.map((b) => (isGlow(b.name) ? { ...b, cubes: undefined } : b)) };
const GLOW: BedrockModel = (() => {
  const parent = new Map(MODEL.bones.map((b) => [b.name, b.parent]));
  const keep = new Set<string>();
  for (const b of MODEL.bones) {
    if (!isGlow(b.name) || !b.cubes?.length) continue;
    for (let n: string | undefined = b.name; n && !keep.has(n); n = parent.get(n)) keep.add(n);
  }
  const bones: BedrockBone[] = MODEL.bones.filter((b) => keep.has(b.name)).map((b) => (isGlow(b.name) ? b : { ...b, cubes: undefined }));
  return { ...MODEL, bones };
})();

// 发光那份的材质：同一张贴图，不受场景灯光、不过色调映射，画出来就是贴图原色（对应游戏里亮度图拉满）。
// 游戏里满亮度的面还乘实体的两盏方向光（minecraft_mix_light），竖直面只剩贴图色的 0.74 左右（游戏截图里眼睛的三种颜色核过）；这里不做，整块按贴图原色画。
const glowMats = new WeakMap<THREE.Texture, THREE.MeshBasicMaterial>();
const glowMaterial = (map: THREE.Texture) => {
  let mat = glowMats.get(map);
  if (!mat) glowMats.set(map, (mat = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false })));
  return mat;
};

// 套住发光那份：每次提交后把里面的 mesh 换成满亮度材质，关掉发光就换回原来受光的材质。
// 不写依赖、每次都跑：显隐一变会挂上新的 mesh，它们拿到的还是 基岩模型.tsx 建的受光材质。重复跑结果一样。
const GlowLayer: React.FC<{ 亮: boolean; children: React.ReactNode }> = ({ 亮, children }) => {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const lit = (mesh.userData.受光材质 ??= mesh.material) as THREE.MeshStandardMaterial;
      mesh.material = 亮 && lit.map ? glowMaterial(lit.map) : lit;
    });
  });
  return <group ref={ref}>{children}</group>;
};

export const MAGICAL_WINE_FOX = {
  scale: 0.65 / 16, // 一像素是多少格
  headTop: (37.3 * 0.65) / 16, // 站着时头顶高度（格），量到头发顶，不含帽子、耳朵
  // Head 骨骼 pivot（头转动的中心）在她自己坐标系里的位置（格，朝向 +Y），按 基岩模型.tsx 的变换对坐姿表做正向运动学算出来；看向 用
  head: { 坐: [-0.028, -0.088, 0.615] as V3, 站: [-0.028, -0.06, 1.152] as V3 },
};

const HIDE: BonePose = { scale: 0 };

// 游戏里平时藏着的骨骼：pre_parallel0、pre_parallel1 每帧把它们的 scale 设成 0。
// MfazhenL/R 自己没有方块，子骨骼 ysmGlowmofazhenL/R 已经藏了。动画里还藏 RightSword，这个模型里没有，不列。
// 魔女帽 witchcap 的 scale 是 has_helmet、狐耳 Ear 是 !has_helmet：她戴着头盔，所以帽子显、耳朵藏。
// 背后法杖 mofazhang2 的 scale 是 v.roaming.B == 0：TLM 里没有这个变量、按 0 算，所以显示。
export const magicalWineFoxHidden: Record<string, BonePose> = Object.fromEntries(
  [
    'ysmGlowdamofazhen', 'ysmGlowdamofazhen2', 'ysmGlowmofazhen', 'ysmGlowmofazhen2', 'ysmGlowmofazhen3', 'ysmGlowmofazhen4',
    'Mask', 'mofazhang', 'mofazhang3', 'ysmGlowmofazhen14', 'ysmGlowdamofazhen3', 'ysmGlowmofazhen19', 'witchcap3',
    'ysmGlowmofazhenL', 'ysmGlowmofazhenR', 'Ear',
  ].map((name) => [name, HIDE]),
);

// TLM 的待命坐（sit，常量、循环）。动画文件里还有 LeftClothe2、RightClothe2，模型里没有这两根骨骼，不抄。
// 坑：背后法杖 mofazhang2 是根骨骼、不挂在身体上，坐下时 TLM 单独给它 pos −11，和 MRoot 一起降到地上。
// TLM 动画控制器的覆盖规则：位置、缩放后来的控制器整个盖掉前面的，sit 在 main 里、排在 pre_parallel 后面，
// 所以坐着时 pre_parallel1 的法杖上下浮动、pre_parallel2 对 Tail2 的摆动都被盖掉了；只有 parallel_ 开头的控制器的转角是叠加的。
export const magicalWineFoxSitBones: Record<string, BonePose> = {
  MRoot: { pos: [0, -11, 0] },
  mofazhang2: { pos: [0, -11, 0] },
  Root: { pos: [0, -2, 2] },
  UpBody: { rot: [20, 0, 0] },
  UpperBody: { rot: [-20, 0, 0] },
  DownBody: { rot: [-10, 0, 0] },
  LeftArm: { rot: [-22.81484, 67.44549, -15.48236] },
  LeftForeArm: { rot: [-82.66733, 53.26745, -137.6027] },
  RightArm: { rot: [-22.81484, -67.44549, 15.48236] },
  RightForeArm: { rot: [-82.66733, -53.26745, 137.6027] },
  LeftLeg: { rot: [-62.5, 0, 0] },
  RightLeg: { rot: [-62.5, 0, 0] },
  LeftLowerLeg: { rot: [165, 0, 0] },
  RightLowerLeg: { rot: [165, 0, 0] },
  LeftFoot: { rot: [35, 0, 0] },
  RightFoot: { rot: [40, 0, 0] },
  AllBody: { rot: [0, 0, 0], scale: 1 },
  Head: { rot: [0, 0, 0] },
  AllHead: { rot: [0, 0, 0] },
  LongHair: { rot: [12.5, 0, 0] },
  LeftClothe: { rot: [-92.62116, 17.48281, -8.28795], pos: [1, -2.5, 2.25], scale: [1, 0.8, 0.8] },
  RightClothe: { rot: [-92.62116, -17.48281, 8.28795], pos: [-1, -2.5, 2.25], scale: [1, 0.8, 0.8] },
  BackClothe: { rot: [-12.5, 0, 0], scale: [1, 0.8, 1] },
  FrontClothe: { rot: [-65, 0, 0], scale: [1, 0.7, 1] },
  BR2: { rot: [-90, 0, 0] },
  BL2: { rot: [-90, 0, 0] },
  BM2: { rot: [-90, 0, 0] },
  LeftHand: { rot: [0, -85, 15] },
  LF2: { rot: [7.5, 0, 0] },
  LF3: { rot: [15, 0, 0] },
  LB2: { rot: [-7.5, 0, 0] },
  LM3: { scale: [1, 1, 0.7] },
  RM3: { scale: [1, 1, 0.7] },
  RB: { rot: [-7.5, 0, 0] },
  RF: { rot: [7.5, 0, 0] },
  RF3: { rot: [15, 0, 0] },
  FL2: { rot: [62.5, 0, 0] },
  FR2: { rot: [62.5, 0, 0] },
  FM2: { rot: [62.5, 0, 0] },
  weixiao: { pos: [0, 0, -0.91406] }, // 微笑的嘴往前推出来（嘴型都做在头里面）
  Tail2: { rot: [-15, 0, 0] },
  rightshou: { rot: [-20, 0, 0] },
  bowL1: { rot: [-47.5, 0, 0], pos: [0, -1, 0] },
  bowR1: { rot: [-44.06983, -2.87623, 2.78097], pos: [0, -1, 0] },
  RightHandLocator: { rot: [-23.63899, -79.54436, -168.65703] },
};

// 看向：TLM 把实体的视线俯仰、偏头直接加在 Head 骨骼上（GeckoMaidEntity.updateHead）。坐着时上身前倾 20° 又被 UpperBody 转回来，头本来就是平视
const lookBones = ([俯仰, 左右]: [number, number]): Record<string, BonePose> => ({ Head: { rot: [-俯仰, -左右, 0] } });

/** 让她的头对准 目标（场景坐标）要的 看 角度 [俯仰, 左右]（度，正 = 抬头、往左） */
export const magicalWineFoxLookAt = (pose: Pick<FigurePose, 'loc' | 'yaw'>, 目标: V3, 姿势: '坐' | '站' = '坐'): [number, number] => {
  const yaw = rad(pose.yaw ?? 0);
  const [hx, hy, hz] = MAGICAL_WINE_FOX.head[姿势];
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  const head = [pose.loc[0] + c * hx - s * hy, pose.loc[1] + s * hx + c * hy, pose.loc[2] + hz];
  const [dx, dy, dz] = [目标[0] - head[0], 目标[1] - head[1], 目标[2] - head[2]];
  const [lx, ly] = [c * dx + s * dy, -s * dx + c * dy]; // 换进她自己的坐标系：+Y 是正前方，−X 是她的左边
  const deg = 180 / Math.PI;
  return [Math.atan2(dz, Math.hypot(lx, ly)) * deg, Math.atan2(-lx, ly) * deg];
};

// 关键帧照抄动画文件，都是线性插值（没写 lerp_mode 的 GeckoLib 默认线性），时间按动画长度循环
const linear = (keys: [number, number[]][]): VKey[] => keys.map(([t, v]) => [t, v, 'linear']);
const loop = (秒: number, 长: number) => ((秒 % 长) + 长) % 长;

// 背后法杖上下浮动：pre_parallel1，2 秒一循环，单位像素。坐着时 sit 的 pos 把它盖掉（见上面的覆盖规则），只有站着才浮。
const STAFF_FLOAT = linear([[0, [0, 2, 0]], [0.8, [0, 0.25, 0]], [1, [0, 0, 0]], [1.8, [0, 1.5, 0]], [2, [0, 2, 0]]]);
// 法杖上的三个环：parallel5，2 秒一循环。parallel_ 控制器的转角是叠加的，没有别的控制器动这三根，所以直接加在骨骼自带的 rotation 上。
// 后两个环一圈只转 340°、347.5°，循环时跳回 0；环是一圈近似对称的虚线，跳一下不显眼（推断，没在游戏里看过动态）。parallel5 里别的骨骼都在平时藏着的法杖、法阵下面，不抄。
const RINGS: Record<string, VKey[]> = {
  ysmGlowquan10: linear([[0, [0, 0, 0]], [1, [0, 0, -180]], [2, [0, 0, -360]]]),
  ysmGlowquan12: linear([[0, [0, 0, 0]], [1, [0, 0, 167.5]], [2, [0, 0, 340]]]),
  ysmGlowquan14: linear([[0, [0, 0, 0]], [1, [0, 0, 170]], [2, [-0.34219, 0.31225, 347.49237]]]),
};
/** 背后法杖在第 秒 秒的浮动和三个环的转角（姿势 '坐' 时只有环转） */
export const magicalWineFoxStaffBones = (秒: number, 姿势: '坐' | '站' = '坐'): Record<string, BonePose> => {
  const t = loop(秒, 2);
  const out: Record<string, BonePose> = Object.fromEntries(Object.entries(RINGS).map(([name, keys]) => [name, { rot: sampleV(keys, t) }]));
  if (姿势 === '站') out.mofazhang2 = { pos: sampleV(STAFF_FLOAT, t) };
  return out;
};

// 摘了头盔：魔女帽藏起来、狐耳露出来（pre_parallel0 的 has_helmet）。耳朵每 4 秒抖一下，也是 pre_parallel0 的关键帧。
const EAR_TWITCH = {
  Left_ear: linear([[0.0833, [0, 0, 0]], [0.125, [0, -23.75, 0]], [0.1667, [0, 0, 0]]]),
  Right_ear: linear([[0, [0, 0, 0]], [0.0417, [0, 23.75, 0]], [0.0833, [0, 0, 0]]]),
};
/** 不戴帽子时要改的骨骼：帽子藏、耳朵显，耳朵按 秒 抖 */
export const magicalWineFoxHatOffBones = (秒: number): Record<string, BonePose> => {
  const t = loop(秒, 4);
  return {
    witchcap: HIDE,
    Ear: {},
    Left_ear: { rot: sampleV(EAR_TWITCH.Left_ear, t) },
    Right_ear: { rot: sampleV(EAR_TWITCH.Right_ear, t) },
  };
};

type 开关 = { 帽子: boolean; 背后法杖: boolean; 秒: number };

// 组装顺序：隐藏表 → 坐姿表 → 看向 → 法杖和环 → 帽子、背后法杖的开关 → 骨骼。
// 表情、眨眼、尾巴（魔法酒狐动作.ts）该在坐姿表和看向之间；它们和后面几层不碰同一根骨骼，组件里跟 骨骼 一起传进来，效果一样。
const bonePose = (
  姿势: '坐' | '站',
  看: [number, number] | undefined,
  骨骼: Record<string, BonePose> | undefined,
  { 帽子, 背后法杖, 秒 }: 开关,
): Record<string, BonePose> => ({
  ...magicalWineFoxHidden,
  ...(姿势 === '坐' ? magicalWineFoxSitBones : {}),
  ...(看 ? lookBones(看) : {}),
  ...magicalWineFoxStaffBones(秒, 姿势),
  ...(帽子 ? {} : magicalWineFoxHatOffBones(秒)),
  ...(背后法杖 ? {} : { mofazhang2: HIDE }),
  ...(骨骼 ?? {}),
});

// pose：只用 loc、yaw、pitch、squash，头往哪看用 看。姿势：默认坐；'站' 现在只是模型的静止姿势（四肢没接 FigurePose）。
// 看：头的 [俯仰, 左右]（度，正 = 抬头、往左），对准某一点用 magicalWineFoxLookAt 算。
// 骨骼：最后叠上的骨骼姿势，按骨骼整条替换。右手：挂在右手握持点（RightHandLocator）上的东西，坐标见 engine/model/基岩模型.tsx 的 attach
// 秒：法杖浮动、三个环、耳朵抖按它取样（都按动画长度循环，不给按 0 秒算）。帽子、背后法杖、发光：默认都开，照游戏里那只女仆。
// 表情、眨眼、秒：见 魔法酒狐动作.ts 的 magicalWineFoxMotion（不给 秒 就是静止姿势，表情不给就照坐姿表微笑）
export const MagicalWineFox: React.FC<{
  pose: FigurePose;
  姿势?: '坐' | '站';
  看?: [number, number];
  骨骼?: Record<string, BonePose>;
  右手?: React.ReactNode;
  表情?: 魔法酒狐表情;
  眨眼?: number | 'auto';
  秒?: number;
  帽子?: boolean;
  背后法杖?: boolean;
  发光?: boolean;
}> = ({ pose, 姿势 = '坐', 看, 骨骼, 右手, 表情, 眨眼 = 'auto', 秒, 帽子 = true, 背后法杖 = true, 发光 = true }) => {
  const bones = bonePose(姿势, 看, { ...magicalWineFoxMotion({ 姿势, 表情, 眨眼, 秒 }), ...骨骼 }, { 帽子, 背后法杖, 秒: 秒 ?? 0 });
  return (
    <group position={pose.loc as V3} rotation={[0, 0, rad(pose.yaw ?? 0)]}>
      <group rotation={[rad(pose.pitch), 0, 0]} scale={[1, 1, pose.squash]}>
        <BedrockModelView
          model={BODY}
          scale={MAGICAL_WINE_FOX.scale}
          pose={bones}
          attach={右手 ? { RightHandLocator: 右手 } : undefined}
        />
        <GlowLayer 亮={发光}>
          <BedrockModelView model={GLOW} scale={MAGICAL_WINE_FOX.scale} pose={bones} />
        </GlowLayer>
      </group>
    </group>
  );
};
