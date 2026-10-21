// 九胡（酒狐女仆）：照抄 Yes Steve Model（YSM）模组内置的「大正女仆酒狐」模型和贴图，几何、贴图都是模组里的原样。
// 来源：ysm-2.6.5-forge+mc1.20.1-release.jar 的 assets/yes_steve_model/builtin/wine_fox/01_taisho_maid/ 下 models/main.json + textures/skin.png，由取材配方「九胡模型」（旧项目 工具/游戏取材/导出模型.py）导出成资产 模型/角色/九胡、贴图/角色/九胡。
// 导出时去掉了不属于人形本体的骨骼：FOX（小狐狸形态）、Backgrounds（选模型界面的背景）、molang*（只存表达式的空骨骼）。
// 大小：YSM 按 ysm.json 的 height_scale / width_scale 缩放，这个模型没写，用默认的 0.7（头顶 1.69 格，耳尖约 1.9 格）。
// 游戏里靠动画决定显示哪些部件，这里按平常状态摆：Mask（头侧的狐狸面具）只在头上戴东西时才显示 → 藏；Expression（表情动作用的整套五官）→ 藏；
//   嘴：几种嘴型都做在头里面，要显示的那个往前推 1 像素。站着用 Mouth_smile2（idle 动画），跑动用 Mouth_smile（run 动画）。
// 坐标和 骨架.tsx 的 `Figure` 一致：原点在脚底，Z 朝上，朝向 +Y，右手在 +X。
//
// ===== 反重力裙子 =====
// 裙底不能露出来（用户 10-06：怕审核；也不要靠加安全裤，不掀开裙子就好）。
// 模组原样的裙子是挂在上身的一圈布片，里面没有衬，底下就是白色内裤（UpBody 下沿的三块）。
// 一圈分前、后、左、右四组（clothe 下的 FrontClothe、BackClothe、LeftClothe、RightClothe），每条从腰到裙摆分三节：腰上一节（FR、BM、LF…）、髋那一节（FR1、BM2、LF2…，前片这节的关节正好在髋高度、贴大腿前面）、裙摆一节。
// 模组跑步动画里前、后两组整片跟着摆得更远的那条腿掀起 0.7 倍，从前下方、后下方都看得进去。
// 现在几何、贴图不动，只改裙片骨骼转角：裙片始终下垂、贴身盖住髋部，只有挨着腿、不让开会穿出来的那几条，跟着那条腿转到刚好盖住。
// 转多少是按几何定的：腿和裙片朝外那面不相交，从前下、后下、侧下往里看露出的内裤最少（按姿态做正向运动学、对内裤表面往各方向打光线核对）。
// - 站：不动。
// - 跑（`skirtBones`）：右边几条只跟右腿、左边只跟左腿，前面正中那条跟摆得更远的那条腿；另一条腿那边的照样垂着，两侧正中那条不动。
//   后面正中那条（BM）也不动：它要是跟着往后摆的腿贴到大腿后面去，另一条腿往前一迈，两腿中间裆下就空出一条缝，从后下方看得见内裤。
//   腿往前摆 a 度：前面的裙片在髋那一节往前转 0.5a，腰上那一节等腿摆过 20° 以后才跟着转 0.3 倍（大腿根顶到它下沿）。
//   腿往后摆 b 度：后片髋那一节的关节在髋下面，大腿往后一抬就扫过去，所以整条从腰上转 b − 15°（裙片本来往外张 15°，转完刚好和大腿平行），髋那一节再转 0.3b。
// - 弯腰（`bend`）：上身往前弯，后片就往后上方翘。整圈裙子往回转一半：全转回来垂直的话，腰带跟着上身往前挪，后片会压进屁股里、白色反而从后面露出来。
// 骑扫帚的坐姿在 骑扫帚.tsx 的 `jiuhuRideBones` 里，同一个做法。
import React from 'react';
import { rad } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';
import type { Mouth } from './口型.ts';
import { type BedrockModel, BedrockModelView, type BonePose } from '../../engine/model/基岩模型.tsx';
import type { FigurePose } from './骨架.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/角色/九胡';
import { type MouthSpec, TalkingMouth } from './嘴.tsx';
import skin from 'asset:贴图/角色/九胡';

const MODEL = { ...(raw as unknown as object), texture: png(skin) } as unknown as BedrockModel; // json 资产 import 进来是解析好的对象

// 配色取自模型贴图（碎屑、特效之类要跟角色配色时用）
export const JIUHU = {
  hair: '#d9a44e',
  hairDark: '#c48b53',
  earTip: '#3a2c3a',
  earIn: '#efe6dc',
  skin: '#f2ddcf',
  eye: '#c0462c',
  jacket: '#b8302c',
  white: '#e8e6e2',
  skirt: '#262a42',
  obi: '#2e3150',
  gold: '#d0a848',
  sock: '#dcdce0',
  getaStrap: '#d8453c',
  sole: '#343444',
  tail: '#d8a043',
  tailTip: '#eeece8',
  scale: 0.7 / 16, // 一像素是多少格
  headTop: (38.7 * 0.7) / 16, // 头顶高度（格），不含耳朵
};

const HIDE: BonePose = { scale: 0 };

// 模组自带的几种嘴（文件头），口型预览里对照用
export const JIUHU_MOUTHS = ['Mouth_smile2', 'Mouth_chill', 'Mouth_smile', 'Mouth_surprise'] as const;
// 说话的口型（口型.ts）：模组的嘴只有几种固定形状，换着用是硬切（用户 10-15 嫌切来切去）。
// 说话时藏起 ω 嘴（`JIUHU_TALK_BONES`），在原处画 嘴.tsx 那张嘴。格子取 1/20 像素，和 ω 那几块小方块一个精度。
// 挂在 Mouth 骨骼上（原点 = 它的 pivot，单位像素，正面 −Z）：ω 在 y 0.09～0.22，下巴在 −0.35，嘴不能张过下巴（用户 10-15）
export const JIUHU_TALK_BONES: Record<string, BonePose> = { Mouth_smile2: {}, Mouth_smile: {} }; // 合并到骨骼姿势最后，盖掉站、跑推出来的嘴
const MOUTH: MouthSpec = { cell: 0.05, w: 0.7, h: 0.44, closedW: 0.4, closedH: 0.05, colors: { lip: '#c0566a', inside: '#8e2a3e', tongue: '#e8848e' } };
const MOUTH_AT: V3 = [0, 0.2, -1.505]; // 上沿在 ω 中间；头正面在 −1.5，挡在脸前面一点

export const jiuhuMouthAttach = (mouth?: Mouth): Record<string, React.ReactNode> | undefined =>
  mouth
    ? {
        Mouth: (
          <group position={MOUTH_AT} rotation={[0, Math.PI, 0]}>
            <TalkingMouth mouth={mouth} spec={MOUTH} />
          </group>
        ),
      }
    : undefined;

const TAIL_BONES = ['Tail', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7'];

// 跑起来尾巴左右甩（用户 10-01 要求）：照抄 YSM 酒狐 main.animation.json 里 run 动画的尾巴关键帧。
// 一个跑步周期（0.667 秒，左右脚各一步）里，尾巴根（MTail）左右各甩 16.6°、同时往上翘 16～19°，尾巴尖（Tail7）晚 1/4 周期左右甩 15°，像鞭子一样甩过去。这里按步态相位取样（一个周期 = 两步）。
// 相位对齐：run 动画里右腿在 0.375 周期时摆到最前，Figure 的 `legR` = sin 在 0.25 周期最前，所以取样时加 0.125 周期
const RUN_TAIL: Record<'MTail' | 'Tail7', [number, number[]][]> = {
  MTail: [[0.0, [15.59, 16.61, 3.27]], [0.0417, [16.48, 15.61, 3.24]], [0.0833, [18.62, 9.82, 1.99]], [0.125, [18.43, 4.06, 0.98]], [0.1667, [17.86, -1.32, -0.01]], [0.2083, [17.22, -6.34, -0.97]], [0.25, [16.56, -10.88, -1.87]], [0.2917, [15.96, -14.63, -2.68]], [0.3333, [15.59, -16.61, -3.27]], [0.375, [16.48, -15.61, -3.24]], [0.4167, [18.62, -9.82, -1.99]], [0.4583, [18.43, -4.06, -0.98]], [0.5, [17.86, 1.32, 0.01]], [0.5417, [17.22, 6.34, 0.97]], [0.5833, [16.56, 10.88, 1.87]], [0.625, [15.96, 14.63, 2.68]], [0.6667, [15.59, 16.61, 3.27]]],
  Tail7: [[0.0, [0, 10, 0]], [0.0417, [0, 5.27, 0]], [0.0833, [0, 0, 0]], [0.125, [0, -5.27, 0]], [0.1667, [0, -10, 0]], [0.2083, [0, -13.54, 0]], [0.25, [0, -15, 0]], [0.2917, [0, -13.54, 0]], [0.3333, [0, -10, 0]], [0.375, [0, -5.27, 0]], [0.4167, [0, 0, 0]], [0.4583, [0, 5.27, 0]], [0.5, [0, 10, 0]], [0.5417, [0, 13.54, 0]], [0.5833, [0, 15, 0]], [0.625, [0, 13.54, 0]], [0.6667, [0, 10, 0]]],
};
const RUN_PHASE0 = 0.125;
const sampleCycle = (keys: [number, number[]][], cyclePos: number) => {
  const period = keys[keys.length - 1][0];
  const t = ((((cyclePos + RUN_PHASE0) % 1) + 1) % 1) * period;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, startVals] = keys[i];
  const [t1, endVals] = keys[i + 1];
  const k = (t - t0) / (t1 - t0);
  return startVals.map((v, c) => v + (endVals[c] - v) * k);
};

// 跑、弯腰时的裙片（见文件头「反重力裙子」）。legR / legL：腿往前摆的角度（Figure 的约定，负 = 往后）
// top：腰上那一节；hinge：髋那一节；side：跟哪条腿（M = 前面正中，跟摆得更远的那条）。不在表里的（两侧正中、后面正中）不动
const SKIRT: { top: string; hinge: string; side: 'R' | 'L' | 'M'; front: boolean }[] = [
  { top: 'FR', hinge: 'FR1', side: 'R', front: true },
  { top: 'FFM3', hinge: 'FFM3_1', side: 'R', front: true }, // 围裙右片
  { top: 'RF', hinge: 'RF2', side: 'R', front: true }, // 右侧组靠前那条
  { top: 'FL', hinge: 'FL1', side: 'L', front: true },
  { top: 'FFM2', hinge: 'FFM2_1', side: 'L', front: true },
  { top: 'LF', hinge: 'LF2', side: 'L', front: true },
  { top: 'FM', hinge: 'FM1', side: 'M', front: true },
  { top: 'FFM1', hinge: 'FFM1_1', side: 'M', front: true },
  { top: 'BR', hinge: 'BR2', side: 'R', front: false },
  { top: 'RB', hinge: 'RB2', side: 'R', front: false },
  { top: 'BL', hinge: 'BL2', side: 'L', front: false },
  { top: 'LB', hinge: 'LB2', side: 'L', front: false },
];
const skirtBones = (legR: number, legL: number, bend: number): Record<string, BonePose> => {
  const bones: Record<string, BonePose> = { clothe: { rot: [-bend * 0.5, 0, 0] } };
  for (const piece of SKIRT) {
    const swing = (leg: number) => Math.max(0, piece.front ? leg : -leg);
    const swingDeg = piece.side === 'R' ? swing(legR) : piece.side === 'L' ? swing(legL) : Math.max(swing(legR), swing(legL));
    if (piece.front) {
      bones[piece.top] = { rot: [-0.3 * Math.max(0, swingDeg - 20), 0, 0] };
      bones[piece.hinge] = { rot: [-0.5 * swingDeg, 0, 0] };
    } else {
      bones[piece.top] = { rot: [Math.max(0, swingDeg - 15), 0, 0] };
      bones[piece.hinge] = { rot: [0.3 * swingDeg, 0, 0] };
    }
  }
  return bones;
};

// FigurePose → 模型骨骼。基岩动画的角度约定：rot.x 正 = 低头 / 手脚往后摆，rot.y 正 = 往右转，
// rot.z 负 = 右手往身体中线收（左手相反）；和 Figure 的约定（正 = 往前摆、抬头、往左转、往中线收）正好都差一个负号。
const bonePose = (pose: FigurePose, tail: number, bend: number, gait: number, run: number): Record<string, BonePose> => {
  const running = Math.max(Math.abs(pose.legR), Math.abs(pose.legL)) > 5;
  const bones: Record<string, BonePose> = {
    Mask: HIDE,
    Expression: HIDE,
    [running ? 'Mouth_smile' : 'Mouth_smile2']: { pos: [0, 0, -1] },
    Head: { rot: [-pose.headPitch, -pose.headYaw, 0] },
    UpBody: { rot: [bend, 0, 0] },
    RightLeg: { rot: [-pose.legR, 0, 0] },
    LeftLeg: { rot: [-pose.legL, 0, 0] },
    // 往后摆的那条腿膝盖弯一点（模组的腿分大腿、小腿两节，跑步动画里后腿也是弯的），往前摆的腿保持伸直
    RightLowerLeg: { rot: [Math.max(0, -pose.legR) * 0.5, 0, 0] },
    LeftLowerLeg: { rot: [Math.max(0, -pose.legL) * 0.5, 0, 0] },
    RightArm: { rot: [-pose.armR, 0, -pose.armRRoll] },
    LeftArm: { rot: [-pose.armL, 0, pose.armLRoll] },
    ...skirtBones(pose.legR, pose.legL, bend),
  };
  // 尾巴：站着时从根到尖一节比一节晚半拍地轻轻摆；跑起来换成 run 动画的左右甩（run 是跑步的权重）
  TAIL_BONES.forEach((name, i) => {
    bones[name] = { rot: [0, Math.sin(tail - i * 0.6) * (i < 3 ? 8 : 5) * (1 - run), 0] };
  });
  if (run > 0) {
    bones.MTail = { rot: sampleCycle(RUN_TAIL.MTail, gait).map((v) => v * run) };
    bones.Tail7 = { rot: sampleCycle(RUN_TAIL.Tail7, gait).map((v) => v * run) };
  }
  return bones;
};

// tail：站着时尾巴轻摆的相位（弧度）；gait：跑步的步态相位（周期数，一个周期两步，和腿的摆动同一个相位：legR 按 sin(2π·gait) 摆）；
// 站、跑的骨骼姿势（Jiuhu 组件用的同一份），镜头里算手的位置时用
export const jiuhuStandBones = bonePose;

// run：跑步的权重（0 站着、1 全速跑），尾巴按它在轻摆和跑步左右甩之间过渡；bend：腰往前弯的角度（上半身连头、手、尾巴一起），弯腰喘气用。
// 整体前倾用 pose.pitch 是绕脚底转，腿也跟着斜，弯腰只能弯腰上。嘴：说话时的口型。
// 骨骼：最后叠上的骨骼姿势（Figure 没有九胡的肘，弯肘给 RightForeArm）；右手：挂在右手握持点（RightHandLocator）上的东西，坐标见 engine/model/基岩模型.tsx 的 attach
export const Jiuhu: React.FC<{ pose: FigurePose; tail: number; bend?: number; gait?: number; run?: number; 嘴?: Mouth; 骨骼?: Record<string, BonePose>; 右手?: React.ReactNode }> = ({ pose, tail, bend = 0, gait = 0, run = 0, 嘴: mouth, 骨骼: boneOverrides, 右手: rightHand }) => (
  <group position={pose.loc as V3} rotation={[0, 0, rad(pose.yaw ?? 0)]}>
    <group rotation={[rad(pose.pitch), 0, 0]} scale={[1, 1, pose.squash]}>
      <BedrockModelView
        model={MODEL}
        scale={JIUHU.scale}
        pose={{ ...bonePose(pose, tail, bend, gait, run), ...(boneOverrides ?? {}), ...(mouth ? JIUHU_TALK_BONES : {}) }}
        attach={rightHand ? { ...jiuhuMouthAttach(mouth), RightHandLocator: rightHand } : jiuhuMouthAttach(mouth)}
      />
    </group>
  </group>
);
