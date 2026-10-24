// 魔法酒狐坐船：车万女仆（TLM）1.5.3 的 geckolib/animation/winefox_magical.main.animation.json 里的 boat（坐在船上时 main 控制器放它，常量、循环），数值照抄。
// 纯模块（不 import react、three）。用法：<MagicalWineFox 姿势="站" 骨骼={{ ...magicalWineFoxBoatBones, ...别的 }} />。
// 和 sit 比：腿一样跪坐，但没有 MRoot、mofazhang2 往下 11 的那一截（船上的座位本来就低），Root 往上 2；右手多一个 RightHand 转角；
// 没给 Tail2、背后法杖，所以尾巴照 pre_parallel2 摆、背后法杖照 pre_parallel1 上下浮（组件 姿势 给 '站' 就是这样）。
// 动画里还有 LeftClothe2、RightClothe2（模型里没有这两根骨骼）和 FOX（小狐狸形态，模型里去掉了），不抄。
import type { 骨骼姿势 } from './魔法酒狐动作.ts';

export const magicalWineFoxBoatBones: Readonly<Record<string, 骨骼姿势>> = {
  Root: { pos: [0, 2, 2] },
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
  RightHand: { rot: [0, 85, -15] },
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
  weixiao: { pos: [0, 0, -0.90625] },
};
