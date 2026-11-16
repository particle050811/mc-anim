// 6-3-6 落进古城以后的落地：锤砸到古城地面 → 定一下 → 借锤往前翻、收腿 → 半蹲着地缓冲 → 弹簧似的起身、冲过一点 → 站定、扭头扫一眼四周。
// 用户 10-13 指出落地僵（直着落地、没缓冲），照 6-1-9 落地的思路：着地半蹲、蹲住一下、起身冲过头再回、各部位错开、站定后不定格。
// 纯函数，输入 `s` = 物理时间 − 落地时刻（秒，见 ../6-3-下坠/编排.ts 的 `liYingShaft().landSec`；6-3-6 原速）。
// 骨架约定同 骨架.tsx：pitch 负 = 前倾，腿、臂正 = 往前摆，膝 = 小腿往后折，headPitch 负 = 低头；ground = 1 时骨架自己把低的那只脚贴到脚底。
// 末了的姿势就是段末站姿（手臂 20°、肘 30°、roll 18°、腿站直，6-4-1/跳搭.ts 的 `startStance` 抄的它），6-4-1 首帧接得上。
import { exception } from '@engine/core/例外.ts';
import { type Key, sampleLag } from '@engine/anim/anim.ts';
import type { FigurePose } from '@库/角色/骨架.tsx';

// 节奏（秒，0 = 锤砸到古城地面；原来按 1/24 秒一格调的，除不尽的写成 n / 24）：0～1/12 打击停顿（只定人，金光、碎块照走）；～1/3 借锤往前翻（翻角 155 → 360）、收腿，1/3 秒两脚着地；
//   ～11/24 往下压到最深（膝 118°，髋比站直低 0.37 格），～17/24 蹲住（镜头已落到他侧前方，看得见这一蹲）；～1.125 起身、冲过一点（上身微后仰、手往后带），1.25 回压，35/24 站定；
//   37/24～47/24 扭头往左（东，镜头这边）扫一眼、身子微拧，停到段末（6-3-6 末帧 = 锤砸地后 52/24 秒）。
export const touchdownSec = 1 / 3;
const settleSec = 35 / 24;
// 打击停顿：规矩的单位是帧（1/24 秒）
const stopEnd = exception('打击停顿', 2, { segment: '6-举锤砸穿', cause: '锤砸地；用户 10-21 定按看过的版本' }) / 24;
// 翻角（度）：155 头朝下 → 360 站直；着地那一刻冲过 6°（身子顺势往前栽一下），再回
const flipKeys: Key[] = [[0, 155], [stopEnd, 155], [touchdownSec, 366], [0.5, 360]];
export const flipAngle = (s: number) => sampleLag(flipKeys, s);
// 绝对姿势（度）。第一个关键帧写 NaN = 接打击姿势的原值（落地前那一刻的 p）
const inherit = NaN;
const poseKeys: Record<string, Key[]> = {
  pitch: [[0, inherit], [stopEnd, inherit], [touchdownSec, -18], [11 / 24, -30], [17 / 24, -27], [1.125, 4], [1.25, -1.5], [settleSec, 0]],
  headPitch: [[0, inherit], [stopEnd, inherit], [touchdownSec, 10], [11 / 24, 22], [17 / 24, 18], [1.125, -3], [1.25, 1], [settleSec, 0]],
  legR: [[0, inherit], [stopEnd, inherit], [0.25, 70], [touchdownSec, 62], [11 / 24, 84], [17 / 24, 78], [1.125, 3], [1.25, 1], [settleSec, 0]],
  legL: [[0, inherit], [stopEnd, inherit], [0.25, 55], [touchdownSec, 50], [11 / 24, 70], [17 / 24, 64], [1.125, 1], [1.25, 1], [settleSec, 0]],
  kneeR: [[0, inherit], [stopEnd, inherit], [0.25, 100], [touchdownSec, 92], [11 / 24, 118], [17 / 24, 108], [1.125, 4], [1.25, 6], [settleSec, 0]],
  kneeL: [[0, inherit], [stopEnd, inherit], [0.25, 110], [touchdownSec, 100], [11 / 24, 118], [17 / 24, 108], [1.125, 3], [1.25, 5], [settleSec, 0]],
  legRRoll: [[0, inherit], [stopEnd, inherit], [touchdownSec, -8], [17 / 24, -8], [1.125, 2], [settleSec, 2]],
  legLRoll: [[0, inherit], [stopEnd, inherit], [touchdownSec, -10], [17 / 24, -10], [1.125, 2], [settleSec, 2]],
  // 右手握锤：翻的时候锤从头顶甩到身前、着地时锤头往前下方杵着稳住重心，起身时往后带一下再垂下来
  armR: [[0, inherit], [stopEnd, inherit], [touchdownSec, 60], [11 / 24, 48], [17 / 24, 44], [1.125, 6], [1.25, 16], [settleSec, 20]],
  elbowR: [[0, inherit], [stopEnd, inherit], [touchdownSec, 20], [17 / 24, 26], [1.125, 36], [settleSec, 30]],
  armRRoll: [[0, inherit], [stopEnd, inherit], [touchdownSec, 10], [17 / 24, 12], [1.125, 20], [settleSec, 18]],
  // 左手空着：着地时往外张开压稳，起身时往后带一下
  armL: [[0, inherit], [stopEnd, inherit], [touchdownSec, 50], [11 / 24, 40], [17 / 24, 36], [1.125, -8], [1.25, 14], [settleSec, 20]],
  elbowL: [[0, inherit], [stopEnd, inherit], [touchdownSec, 30], [17 / 24, 34], [1.125, 26], [settleSec, 30]],
  armLRoll: [[0, inherit], [stopEnd, inherit], [touchdownSec, -46], [11 / 24, -40], [17 / 24, -36], [1.125, 6], [1.25, 16], [settleSec, 18]],
  // 站定以后扫一眼：往左（东，镜头那边），头先动、身子晚一点跟一点
  headYaw: [[0, 0], [settleSec + 1 / 12, 0], [47 / 24, 36], [51 / 24, 33], [62 / 24, 26]],
  twist: [[0, 0], [settleSec + 1 / 12, 0], [49 / 24, 9], [55 / 24, 8], [64 / 24, 6]],
};
// 手臂、头比身子晚 1/24 秒（被身子带着走）；扭头时身子比头晚 0.125 秒
const lagSec: Record<string, number> = { headPitch: 1 / 24, armR: 1 / 24, armL: 1 / 24, armRRoll: 1 / 24, armLRoll: 1 / 24, elbowR: 1 / 24, elbowL: 1 / 24, twist: 0.125 };
// 着地前 ground 0（翻着身、骨架不贴地），着地那一刻起 1
export const landingPose = (sinceLand: number, p0: FigurePose): FigurePose => {
  const out: FigurePose = { ...p0, ground: sinceLand >= touchdownSec ? 1 : 0 };
  for (const [k, keys] of Object.entries(poseKeys)) {
    const v0 = (p0[k as keyof FigurePose] as number | undefined) ?? 0;
    const ks = keys.map(([keyTime, keyValue, interp]) => [keyTime, Number.isNaN(keyValue) ? v0 : keyValue, interp] as Key);
    (out as Record<string, unknown>)[k] = sampleLag(ks, sinceLand, lagSec[k] ?? 0);
  }
  // 站着别定格：站定以后很轻的呼吸（上身前后 0.8°、两臂 1.5°，3.2 秒一次）
  const breath = sinceLand > settleSec ? Math.min(1, (sinceLand - settleSec) / 0.5) * Math.sin((sinceLand - settleSec) * ((2 * Math.PI) / 3.2)) : 0;
  out.pitch += -0.8 * breath;
  out.armL += 1.5 * breath;
  out.armR += 1.0 * breath;
  return out;
};
// 着地前（翻身那一下）髋离古城地面多高：从打击姿势的高度（锤底贴地时的髋高）降到着地那一刻的骨架髋高（编排.ts 按骨架算的贴地髋高接上）
export const flipHipHeight = (sinceLand: number, startHeight: number, touchdownHeight: number) => {
  const k = Math.min(1, Math.max(0, (sinceLand - stopEnd) / (touchdownSec - stopEnd)));
  // 先借锤撑一下略往上抬（0.15 格），再落下来：抛物线
  return startHeight + (touchdownHeight - startHeight) * k * k + 0.15 * 4 * k * (1 - k);
};
