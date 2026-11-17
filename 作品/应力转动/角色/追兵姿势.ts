// 追兵两人的姿势：拉弓、走跑步态、骑马坐姿，刘心忠拿杖的右臂和杖的前倾角。纯数，不带贴图、react、three。
// 编排要姿势就从这里引，不用把 追兵.tsx（皮肤贴图、组件、杖的四元数）拖进闭包；追兵.tsx 原样转出。杖怎么拿的来龙去脉见 追兵.tsx「右手拿匠师之杖」那段。
import type { V3 } from '@engine/core/坐标.ts';
import { smoothstep01 } from '@engine/core/数学.ts';
import { standPose, type FigurePose } from '@库/角色/骨架姿势.ts';
import { riderFeet, VANILLA_RIDE } from '@库/生物/幽灵马骑乘.ts';

// 拉弓（6-4-3 风矢）：照原版 `HumanoidModel.setupAnim` 的 BOW_AND_ARROW 摆两臂：拿弓的手 yRot = 0.1 + 头的左右、另一只手 yRot = −0.1 − 0.4 + 头的左右，两臂 xRot = −π/2 + 头的俯仰。
//   原版右手持弓，黄叛左手持弓，左右镜像；原版 yRot 正 = 往右，这里 `armYaw` 正 = 往左，号反过来。
// draw 0～1：从垂手站着过渡到拉满；头的转向、俯仰按度给（headYaw 正 = 往左、headPitch 负 = 低头，同 `FigurePose`）
export const drawBowPose = (loc: V3, yaw: number, headYaw: number, headPitch: number, draw = 1): FigurePose => {
  const k = Math.min(1, Math.max(0, draw));
  const deg = 180 / Math.PI;
  return {
    ...standPose(loc),
    yaw,
    headYaw,
    headPitch,
    armL: (90 + headPitch) * k,
    armLYaw: (-0.1 * deg + headYaw) * k,
    armLRoll: 0,
    armR: (90 + headPitch) * k,
    armRYaw: (0.5 * deg + headYaw) * k,
    armRRoll: 0,
  };
};

// ---------- 刘心忠拿杖 ----------
// 杖往前倾多少度（身体坐标系里杖头往前为正）：手臂在腰以下（armR ≤ 40）时 30°；往上举慢慢收到竖直（armR 90）；举过头顶（armR 140 以上）后仰 5°。
//   30° 是量出来的：杖和胳膊夹角要到 40° 左右才离开胳膊（半宽 2、杖半粗 0.5），`liuHoldStaff` 把右臂最往后压在 10°～20°，30 + 10 = 40。
//   举过头顶时再前倾杖尾会戳回胳膊和头（6-3-10），仰多了杖身又从头顶横过（6-3-8）；工具/追兵/持杖核对.ts 扫过 0～30° 和杖侧 −12～8°，后仰 5°、杖侧 0 最好。
// 身子前倾（跑步 pitch −15～−18°）时，腰以下那 30° 按世界竖直算（扣掉身子前倾，不然杖斜到 45°，俯拍像端长枪）；举起来后跟着身子走
export const liuStaffLean = (armR: number, pitch = 0) => (30 + pitch) * (1 - smoothstep01((armR - 40) / 50)) - 5 * smoothstep01((armR - 90) / 50);
// 拿着杖的右臂（`LiuXinzhong` 每帧先过这一道，别的骨骼不动，各段编排不用改）：
// - 不往后甩：走跑的摆臂（`walkPose`、`runPose`）右臂会后摆到 −36°、−50°，杖再怎么前倾也贴着胳膊。拄杖走路的人拿杖手基本不摆，所以 armR 低于 `armFloor` 的部分只留 15%，往前摆、举杖照旧。
//   `armFloor` = 20° 减身子前倾（站着 20°，跑步前倾 15° 时 35°），身子前倾时杖在身体坐标系倾得少（见 `liuStaffLean`），胳膊得更往前才拉得开那 40°。
// - 手不往身前收：手臂在腰以下时 roll 最多 6°（6-4-7 挥手开头收尾 roll 收到 15°，杖尾会戳进下摆和大腿）；举到 80° 以上不管。
// - 不弯肘：刘心忠胳膊是整根 4×4×12 方盒（没有前臂部件），弯肘只会把握点挪到胳膊外，杖悬空飘着，所以拿杖这只手一律不弯肘。
export const liuHoldStaff = (pose: FigurePose): FigurePose => {
  const armFloor = 20 - Math.min(0, pose.pitch);
  const armR = pose.armR < armFloor ? armFloor - (armFloor - pose.armR) * 0.15 : pose.armR;
  const belowWaist = 1 - smoothstep01((armR - 40) / 40);
  const armRRoll = pose.armRRoll > 6 ? pose.armRRoll - (pose.armRRoll - 6) * belowWaist : pose.armRRoll;
  return { ...pose, armR, armRRoll, elbowR: 0 };
};
// 刘心忠的身高（格），`Figure` 和 `liuStaffQuat` 共用
export const liuHeight = 1.95;

// 走 / 跑的步态（两人共用）：phase 是走过的距离换算的相位（弧度），amp 0～1
export const walkPose = (loc: V3, yaw: number, phase: number, amp: number, lean = 0): FigurePose => {
  const sw = 45 * Math.sin(phase) * amp;
  return {
    loc,
    pitch: -lean,
    squash: 1,
    headPitch: lean * 0.6,
    headYaw: 0,
    legR: sw,
    legL: -sw,
    kneeR: Math.max(0, -sw) * 0.8 + 10 * amp,
    kneeL: Math.max(0, sw) * 0.8 + 10 * amp,
    armR: -sw * 0.8,
    armRRoll: 4,
    armL: sw * 0.8,
    armLRoll: 4,
    yaw,
  };
};

// 骑马坐姿（7-4-1 加）：照原版 `HumanoidModel.setupAnim` 的 riding——两腿 xRot −81°、yRot ±18°（骨架.tsx 的 `legRYaw` / `legLYaw`），两臂 xRot −36°（去拉缰绳），身子头不动。
// 脚底 = 幽灵马骑乘.ts 的 `riderFeet`（马脚底 + 骑乘高 0.85 格，马起跳人立时往后上挪），ground 0（原版骑马模型不下沉）。
// horse：马脚底（场景坐标）、yaw（同 `FigurePose`，正 = 往左）、人立量（各镜头 horseState 用 `steedRear` 算的）。o 里的字段盖在原版姿势上（前倾、回头、举杖等由编排加）。
export const ridePose = (horse: { p: V3; yaw: number; rear?: { rider: number } }, o: Partial<FigurePose> = {}): FigurePose => ({
  ...standPose(riderFeet(horse.p, horse.yaw, horse.rear?.rider ?? 0)),
  ground: 0,
  yaw: horse.yaw,
  legR: -VANILLA_RIDE.legXRot,
  legL: -VANILLA_RIDE.legXRot,
  legRYaw: VANILLA_RIDE.legYRot,
  legLYaw: VANILLA_RIDE.legYRot,
  armR: -VANILLA_RIDE.armXRot,
  armL: -VANILLA_RIDE.armXRot,
  armRRoll: 0,
  armLRoll: 0,
  ...o,
});
