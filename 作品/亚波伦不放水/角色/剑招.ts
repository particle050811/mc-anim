// 史蒂夫的剑招：下劈、横斩、上撩、跳劈，按「蓄 → 斩 → 停 → 收」摆右臂、肘、腕、转腰、重心。纯计算，史蒂夫关节动作.ts 调。
// 用户 11-11 嫌原来的挥剑「诡异」：原来是原版挥手（手臂往前下甩 1.2 弧度、6 刻）叠一个把剑横扛在头后的蓄力，
// 出手后剑从头后翻到脸前竖着朝上停住，刀刃没有劈过对手；地上那刀拳头收到胸前、剑尖朝下戳在腿边；身子不转、重心不动。
// 原版的剑从拳头里垂直伸出去（item/handheld），劈到前下方时剑尖朝上，所以这里加了腕（剑绕手的左右轴转），劈完剑身顺着手臂往前下指。
// 侧面看剑的朝向（从正下方往前量的度数）≈ 臂 + 肘 + 90 − 腕 − 倾，招表按这个摆（核对-史蒂夫关节 的剑招连拍对过）。
// 拍子：出手（点击）前由 蓄力 0～1 摆到蓄的姿势；点击后 斩 秒从蓄经中间一拍甩到末，停 秒定在末，收 秒回平时的姿势。出手快、不放慢（用户 10-18「我没有要求就别放慢」）。
// 姿势照 Linker 知识库里 YSM swing:sword 的要点：预备时上身反扭、出手转过去，大臂转 100° 以上，小臂先屈着再甩直，快到末那一拍才翻手腕。
// 角度都是 Agent 取的，用户没看过。单位度：臂 = 上臂往前抬（0 垂着、90 平举、180 朝天），滚 = 往外张为负（同 FigurePose 的 armRRoll），
// 转 = 抬完再绕竖轴往左转，肘 = 前臂往前折，腕 = 剑尖往手臂延长线那边压（90 = 剑身顺着前臂伸出去），拧 = 胸往左转（右肩往前送），
// 倾 = 身子往前倾，左臂、左滚 = 左臂往前抬、往外张，沉 = 两膝下蹲的权（0～1）。
import { clamp01, lerp, smoothstep01 } from '@engine/core/数学.ts';

export type MoveName = '下劈' | '横斩' | '上撩' | '跳劈';
export type MovePose = { 臂: number; 滚: number; 转: number; 肘: number; 腕: number; 拧: number; 倾: number; 左臂: number; 左滚: number; 沉: number };
const movePose = (p: Partial<MovePose>): MovePose => ({ 臂: 0, 滚: 0, 转: 0, 肘: 0, 腕: 0, 拧: 0, 倾: 0, 左臂: 0, 左滚: 0, 沉: 0, ...p });

/** 每一招的蓄、中（斩到一半）、末（斩完、停住） */
export const moveTable: Record<MoveName, { windUpPose: MovePose; 中: MovePose; followThrough: MovePose }> = {
  /** 举过头往下劈：剑在背后往下垂着蓄、身子后仰右肩往后，过头顶劈下去，重心压低、右肩送出去，剑停在身前略往下 */
  下劈: {
    windUpPose: movePose({ 臂: 175, 滚: -10, 肘: 80, 拧: -22, 倾: -8, 左臂: 45, 左滚: -10, 沉: 0.15 }),
    中: movePose({ 臂: 120, 转: 5, 腕: 20, 倾: 8, 左臂: 20, 沉: 0.25 }),
    followThrough: movePose({ 臂: 55, 滚: 5, 转: 10, 肘: 5, 腕: 50, 拧: 40, 倾: 22, 左臂: -35, 左滚: -20, 沉: 0.45 }),
  },
  /**
   * 从右往左横斩：腰往右拧、手臂摆到右后方，剑身顺着手臂平着，甩过身前扫到左前方停住。
   * 剑在水平面上的朝向 ≈ 拧 + 转（0 = 正前方，他面朝着她）：蓄 −140 → 中 −50 → 末 +30。剑在斩的第 4 帧前后（e ≈ 0.8）扫过正前方，停住时只过了她 30 度。
   * 五版末是 拧 45 + 转 75 = 120 度，剑停在左后方、背着她，只有中间那一下扫过她（五版自列的毛病，用户 11-11「都修一下」）
   */
  横斩: {
    windUpPose: movePose({ 臂: 85, 滚: -15, 转: -95, 肘: 10, 腕: 95, 拧: -45, 倾: 5, 左臂: 35, 左滚: -30, 沉: 0.25 }),
    中: movePose({ 臂: 88, 转: -40, 肘: 5, 腕: 93, 拧: -10, 倾: 10, 沉: 0.3 }),
    followThrough: movePose({ 臂: 82, 滚: 5, 转: 0, 肘: 12, 腕: 98, 拧: 30, 倾: 14, 左臂: -35, 左滚: -35, 沉: 0.35 }),
  },
  /** 从右后下往前上撩：压低身子、剑拖在右后下方，撩过身前举过头，身子跟着直起来往后仰 */
  上撩: {
    windUpPose: movePose({ 臂: -25, 滚: -25, 转: -40, 肘: 5, 腕: 100, 拧: -25, 倾: 18, 左臂: 30, 沉: 0.45 }),
    中: movePose({ 臂: 70, 滚: -10, 转: -5, 腕: 60, 倾: 5, 沉: 0.25 }),
    followThrough: movePose({ 臂: 165, 滚: 5, 转: 20, 肘: 10, 腕: 70, 拧: 30, 倾: -10, 左臂: -30 }),
  },
  /** 空中的劈：剑在背后垂得更低、身子弓得更开，劈到底身子折下去、剑往前下（腿由空中收腿管，这里不蹲） */
  跳劈: {
    windUpPose: movePose({ 臂: 185, 滚: -8, 肘: 85, 拧: -20, 倾: -15, 左臂: 60 }),
    中: movePose({ 臂: 125, 腕: 25, 倾: 10, 左臂: 20 }),
    followThrough: movePose({ 臂: 40, 腕: 45, 拧: 35, 倾: 30, 左臂: -40 }),
  },
};

/** 点击后：斩几秒甩完（出手 4.8 帧）、停几秒（姿势定在劈完那一下，21 帧）、收几秒回平时（21 帧）。照 Linker 知识库的单招节奏（60 帧：出手 4～6、停 20～35、收 20～45），
 *  Agent 取的，用户没看过。下一招不用等收完：出手后过了 斩 就能蓄下一招（史蒂夫关节动作.ts） */
export const swordBeats = { slash: 0.08, 停: 0.35, 收: 0.35 } as const;
export const swordMoveLength = swordBeats.slash + swordBeats.停 + swordBeats.收;

const mix = (a: MovePose, b: MovePose, k: number): MovePose => {
  const result = { ...a };
  for (const poseKey of Object.keys(a) as (keyof MovePose)[]) result[poseKey] = lerp(a[poseKey], b[poseKey], k);
  return result;
};

/** 点击后第 s 秒这一招摆成什么样、盖过平时姿势的权；s 不在 [0, 剑招长) 里 = null */
export const slashStateAt = (move: MoveName, s: number): { pose: MovePose; blendWeight: number } | null => {
  if (!(s >= 0 && s < swordMoveLength)) return null;
  const poseTable = moveTable[move];
  const { slash, 停: hold, 收: recoverSec } = swordBeats;
  if (s < slash) {
    // 出手段线性（Linker：自动平滑会把接触变成漂移），到末那一帧直接停住
    const e = s / slash;
    return { pose: e < 0.5 ? mix(poseTable.windUpPose, poseTable.中, e * 2) : mix(poseTable.中, poseTable.followThrough, e * 2 - 1), blendWeight: 1 };
  }
  if (s < slash + hold) return { pose: poseTable.followThrough, blendWeight: 1 };
  return { pose: poseTable.followThrough, blendWeight: 1 - smoothstep01(clamp01((s - slash - hold) / recoverSec)) };
};
