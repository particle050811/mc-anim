// 6-3-6 落进古城以后的落地：锤砸到古城地面 → 定一下 → 借锤往前翻、收腿 → 半蹲着地缓冲 → 弹簧似的起身、冲过一点 → 站定、扭头扫一眼四周。
// 用户 10-13 指出落地僵（直着落地、没缓冲），照 6-1-9 落地的思路：着地半蹲、蹲住一下、起身冲过头再回、各部位错开、站定后不定格。
// 纯函数，输入 `s` = 物理时间 − 落地时刻（秒，见 ../6-3-下坠/编排.ts 的 `liYingShaft().landSec`；6-3-6 原速，1 物理秒 = 24 帧）。
// 骨架约定同 骨架.tsx：pitch 负 = 前倾，腿、臂正 = 往前摆，膝 = 小腿往后折，headPitch 负 = 低头；ground = 1 时骨架自己把低的那只脚贴到脚底。
// 末了的姿势就是段末站姿（手臂 20°、肘 30°、roll 18°、腿站直，6-4-1/跳搭.ts 的 `startStance` 抄的它），6-4-1 首帧接得上。
import { 例外 } from '@engine/core/例外.ts';
import { type Key, sampleLag } from '@engine/anim/anim.ts';
import type { FigurePose } from '@库/角色/骨架.tsx';

const fps = 24; // 关键帧按「物理秒 × 24」写（帧）
// 节奏（帧，0 = 锤砸到古城地面）：0～2 打击停顿（只定人，金光、碎块照走）；2～8 借锤往前翻（翻角 155 → 360）、收腿，第 8 帧两脚着地；
//   8～11 往下压到最深（膝 118°，髋比站直低 0.37 格），11～17 蹲住（镜头已落到他侧前方，看得见这一蹲）；17～27 起身、冲过一点（上身微后仰、手往后带），30 回压，35 站定；
//   37～47 扭头往左（东，镜头这边）扫一眼、身子微拧，停到段末（6-3-6 末帧 = 锤砸地后 52 帧）。
export const touchdownFrame = 8;
export const settleFrame = 35;
const stopEnd = 例外('打击停顿', 2, { 段: '6-举锤砸穿', 原因: '锤砸地；用户 10-21 定按看过的版本' });
// 翻角（度）：155 头朝下 → 360 站直；着地那一刻冲过 6°（身子顺势往前栽一下），再回
const flipKeys: Key[] = [[0, 155], [stopEnd, 155], [touchdownFrame, 366], [12, 360]];
export const flipAngle = (s: number) => sampleLag(flipKeys, s * fps);
// 绝对姿势（度）。第一个关键帧写 NaN = 接打击姿势的原值（落地前那一刻的 p）
const inherit = NaN;
const poseKeys: Record<string, Key[]> = {
  pitch: [[0, inherit], [stopEnd, inherit], [touchdownFrame, -18], [11, -30], [17, -27], [27, 4], [30, -1.5], [settleFrame, 0]],
  headPitch: [[0, inherit], [stopEnd, inherit], [touchdownFrame, 10], [11, 22], [17, 18], [27, -3], [30, 1], [settleFrame, 0]],
  legR: [[0, inherit], [stopEnd, inherit], [6, 70], [touchdownFrame, 62], [11, 84], [17, 78], [27, 3], [30, 1], [settleFrame, 0]],
  legL: [[0, inherit], [stopEnd, inherit], [6, 55], [touchdownFrame, 50], [11, 70], [17, 64], [27, 1], [30, 1], [settleFrame, 0]],
  kneeR: [[0, inherit], [stopEnd, inherit], [6, 100], [touchdownFrame, 92], [11, 118], [17, 108], [27, 4], [30, 6], [settleFrame, 0]],
  kneeL: [[0, inherit], [stopEnd, inherit], [6, 110], [touchdownFrame, 100], [11, 118], [17, 108], [27, 3], [30, 5], [settleFrame, 0]],
  legRRoll: [[0, inherit], [stopEnd, inherit], [touchdownFrame, -8], [17, -8], [27, 2], [settleFrame, 2]],
  legLRoll: [[0, inherit], [stopEnd, inherit], [touchdownFrame, -10], [17, -10], [27, 2], [settleFrame, 2]],
  // 右手握锤：翻的时候锤从头顶甩到身前、着地时锤头往前下方杵着稳住重心，起身时往后带一下再垂下来
  armR: [[0, inherit], [stopEnd, inherit], [touchdownFrame, 60], [11, 48], [17, 44], [27, 6], [30, 16], [settleFrame, 20]],
  elbowR: [[0, inherit], [stopEnd, inherit], [touchdownFrame, 20], [17, 26], [27, 36], [settleFrame, 30]],
  armRRoll: [[0, inherit], [stopEnd, inherit], [touchdownFrame, 10], [17, 12], [27, 20], [settleFrame, 18]],
  // 左手空着：着地时往外张开压稳，起身时往后带一下
  armL: [[0, inherit], [stopEnd, inherit], [touchdownFrame, 50], [11, 40], [17, 36], [27, -8], [30, 14], [settleFrame, 20]],
  elbowL: [[0, inherit], [stopEnd, inherit], [touchdownFrame, 30], [17, 34], [27, 26], [settleFrame, 30]],
  armLRoll: [[0, inherit], [stopEnd, inherit], [touchdownFrame, -46], [11, -40], [17, -36], [27, 6], [30, 16], [settleFrame, 18]],
  // 站定以后扫一眼：往左（东，镜头那边），头先动、身子晚几帧跟一点
  headYaw: [[0, 0], [settleFrame + 2, 0], [47, 36], [51, 33], [62, 26]],
  twist: [[0, 0], [settleFrame + 2, 0], [49, 9], [55, 8], [64, 6]],
};
// 手臂、头比身子晚 1 帧（被身子带着走）；扭头时身子比头晚 3 帧
const lagFrames: Record<string, number> = { headPitch: 1, armR: 1, armL: 1, armRRoll: 1, armLRoll: 1, elbowR: 1, elbowL: 1, twist: 3 };
// 着地前 ground 0（翻着身、骨架不贴地），着地那一帧起 1
export const landingPose = (sinceLand: number, p0: FigurePose): FigurePose => {
  const frame = sinceLand * fps;
  const out: FigurePose = { ...p0, ground: frame >= touchdownFrame ? 1 : 0 };
  for (const [k, keys] of Object.entries(poseKeys)) {
    const v0 = (p0[k as keyof FigurePose] as number | undefined) ?? 0;
    const ks = keys.map(([keyFrame, keyValue, interp]) => [keyFrame, Number.isNaN(keyValue) ? v0 : keyValue, interp] as Key);
    (out as Record<string, unknown>)[k] = sampleLag(ks, frame, lagFrames[k] ?? 0);
  }
  // 站着别定格：站定以后很轻的呼吸（上身前后 0.8°、两臂 1.5°，3.2 秒一次）
  const breath = frame > settleFrame ? Math.min(1, (frame - settleFrame) / 12) * Math.sin(((frame - settleFrame) / fps) * ((2 * Math.PI) / 3.2)) : 0;
  out.pitch += -0.8 * breath;
  out.armL += 1.5 * breath;
  out.armR += 1.0 * breath;
  return out;
};
// 着地前（翻身那几帧）髋离古城地面多高：从打击姿势的高度（锤底贴地时的髋高）降到着地那一刻的骨架髋高（编排.ts 按骨架算的贴地髋高接上）
export const flipHipHeight = (sinceLand: number, startHeight: number, touchdownHeight: number) => {
  const k = Math.min(1, Math.max(0, (sinceLand * fps - stopEnd) / (touchdownFrame - stopEnd)));
  // 先借锤撑一下略往上抬（0.15 格），再落下来：抛物线
  return startHeight + (touchdownHeight - startHeight) * k * k + 0.15 * 4 * k * (1 - k);
};
