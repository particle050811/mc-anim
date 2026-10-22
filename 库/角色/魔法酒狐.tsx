// 魔法酒狐：照抄车万女仆（TLM）1.5.3 内置的 geckolib 模型 winefox_magical，戴贴图 _3（百花），几何、贴图都是模组里的原样。
// 来源：取材配方「魔法酒狐模型」从 touhoulittlemaid-1.5.3 jar 导出成 模型/角色/魔法酒狐、贴图/角色/魔法酒狐/百花（去掉了 FOX、gui、molang*）。
// 动作数值抄同一个 jar 的 geckolib/animation/winefox_magical.main.animation.json：显隐取 pre_parallel0/1，坐姿取 sit。
// 大小：TLM 按 maid_model.json 的 render_entity_scale 0.65 缩放（不是九胡 YSM 的 0.7）。
// 默认状态照隐世之境结构里那只女仆：坐着（Sitting 1）、戴着头盔（所以魔女帽显示、狐耳藏起来）、背后法杖显示。
// 坐标和 骨架.tsx 的 `Figure` 一致：原点在脚底，Z 朝上，朝向 +Y，右手在 +X。模型自带 0.7、1.48 像素的原点偏移，游戏里也是这样画的，不补。
// 逐面 UV、负的 uv_size 照 基岩模型.tsx 原样画就和游戏一样（取法和 GeckoLib 逐面相同，坐姿和游戏截图叠在一起也对得上），所以加载时不改写 json。
// 坑：厚度为 0 的片，基岩模型.tsx 留 up、north 面，游戏里后画的 down、south 盖在上面；这个模型里两面贴图不同的只在平时藏着的魔法阵和手持法杖上。
import React from 'react';
import { rad } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';
import { type BedrockModel, BedrockModelView, type BonePose } from '../../engine/model/基岩模型.tsx';
import type { FigurePose } from './骨架.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/角色/魔法酒狐';
import skin from 'asset:贴图/角色/魔法酒狐/百花';

const MODEL = { ...(raw as unknown as object), texture: png(skin) } as unknown as BedrockModel; // json 资产 import 进来是解析好的对象

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

// 组装顺序：隐藏表 → 坐姿表 → 看向 → 骨骼。以后加的层按这个位置插：
// 表情、眨眼、尾巴放在坐姿表和看向之间；帽子、背后法杖的开关放在看向之后、骨骼之前；
// 发光（ysmGlow 开头的骨骼满亮度）和三个环的转动要拆模型、按秒取样，在组件里另画一份发光的 BedrockModelView。
const bonePose = (姿势: '坐' | '站', 看: [number, number] | undefined, 骨骼: Record<string, BonePose> | undefined): Record<string, BonePose> => ({
  ...magicalWineFoxHidden,
  ...(姿势 === '坐' ? magicalWineFoxSitBones : {}),
  ...(看 ? lookBones(看) : {}),
  ...(骨骼 ?? {}),
});

// pose：只用 loc、yaw、pitch、squash，头往哪看用 看。姿势：默认坐；'站' 现在只是模型的静止姿势（四肢没接 FigurePose）。
// 看：头的 [俯仰, 左右]（度，正 = 抬头、往左），对准某一点用 magicalWineFoxLookAt 算。
// 骨骼：最后叠上的骨骼姿势，按骨骼整条替换。右手：挂在右手握持点（RightHandLocator）上的东西，坐标见 engine/model/基岩模型.tsx 的 attach
export const MagicalWineFox: React.FC<{
  pose: FigurePose;
  姿势?: '坐' | '站';
  看?: [number, number];
  骨骼?: Record<string, BonePose>;
  右手?: React.ReactNode;
}> = ({ pose, 姿势 = '坐', 看, 骨骼, 右手 }) => (
  <group position={pose.loc as V3} rotation={[0, 0, rad(pose.yaw ?? 0)]}>
    <group rotation={[rad(pose.pitch), 0, 0]} scale={[1, 1, pose.squash]}>
      <BedrockModelView
        model={MODEL}
        scale={MAGICAL_WINE_FOX.scale}
        pose={bonePose(姿势, 看, 骨骼)}
        attach={右手 ? { RightHandLocator: 右手 } : undefined}
      />
    </group>
  </group>
);
