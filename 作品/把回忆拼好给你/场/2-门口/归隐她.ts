// 第 14 句（段 2-归隐）里她每一帧的样子：站哪、朝哪、头看哪、手怎么摆、手里拿什么。分寸在 归隐参数.ts。
// 一直在左屏里：告示牌旁挂铃 → 转身朝东走进门 → 照片墙前按住合照、打一下框、合照落进手里 → 转过来低头看着它 → 她消失 那一拍带着合照传送走，以后不在了。
// 头上不冒气泡：这一句顶上有歌词，文字一时只走一路（规矩 看得懂的速度）。纯模块（第14句.test.ts 也读），画法在 归隐.tsx。
import { clamp01 } from '@engine/anim/anim.ts';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import type { 魔法酒狐全部表情 } from '@库/角色/魔法酒狐新动作.ts';
import { 正片事件 } from '../../分镜.ts';
import {
  主手,
  副手捧花,
  她的头,
  取照站位,
  按伸帧,
  打框收帧,
  挂铃停帧,
  挂铃放下帧,
  挂铃站位,
  挂铃朝向,
  步,
  走到,
  走路朝向,
  转头帧,
  转身帧,
} from './归隐参数.ts';

const 事 = 正片事件;

type 骨表 = Record<string, BonePose>;
const 缓 = (t: number) => t * t * (3 - 2 * t);
const 插 = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);
/** 两个骨骼摆法之间插（只插 rot；两边都要有同一批骨骼） */
const 插骨 = (a: 骨表, b: 骨表, t: number): 骨表 =>
  Object.fromEntries(Object.keys(b).map((k) => [k, { rot: 插(a[k]?.rot ?? [0, 0, 0], b[k]!.rot ?? [0, 0, 0], t) as [number, number, number] }]));
/** 从 起 那一帧起 帧数 帧里从 0 缓到 1 */
const 过 = (帧: number, 起: number, 帧数: number) => 缓(clamp01((帧 - 起) / 帧数));

export type 她态 = {
  x: number;
  yaw: number;
  看: [number, number];
  表情: 魔法酒狐全部表情;
  骨骼: 骨表;
  右手: '合照' | null;
  左手: '花';
};

/** 主手这一帧怎么摆（没加走路的摆臂） */
const 主手于 = (帧: number): 骨表 => {
  const 放下起 = 事.挂铃.帧 + 挂铃停帧;
  const 按起 = 事.手按合照.帧 - 按伸帧;
  const 收起 = 事.打框.帧 - 打框收帧;
  if (帧 >= 事.取照.帧) return 主手.垂;
  if (帧 > 事.打框.帧) return 插骨(主手.打, 主手.垂, (帧 - 事.打框.帧) / (事.取照.帧 - 事.打框.帧));
  if (帧 === 事.打框.帧) return 主手.打;
  if (帧 > 收起) return 插骨(主手.按, 主手.收, (帧 - 收起) / 打框收帧);
  if (帧 >= 事.手按合照.帧) return 主手.按;
  if (帧 > 按起) return 插骨(主手.静, 主手.按, 过(帧, 按起, 按伸帧));
  return 插骨(主手.挂铃, 主手.静, 过(帧, 放下起, 挂铃放下帧));
};

/** 她在 帧（歌曲帧）的样子；她消失 以后不在了 */
export const 她于 = (帧: number): 她态 | null => {
  if (帧 >= 事.她消失.帧) return null;
  const 走 = 走到(帧);
  const 在走 = 帧 > 事.走向照片墙.帧 && 走.x < 取照站位;

  // 身子：挂铃朝镜头 → 走向照片墙 起转朝东 → 取照 那一帧起转回来朝镜头（拿着合照看）
  const 转东 = 过(帧, 事.走向照片墙.帧, 转身帧);
  const 转回 = 过(帧, 事.取照.帧, 转身帧);
  const yaw = 挂铃朝向 + (走路朝向 - 挂铃朝向) * 转东 * (1 - 转回);

  // 头：看铃 → 走路平视 → 到站前一帧起抬头看合照 → 取照起低头看手里的
  let 看 = 插(她的头.看铃, 她的头.平视, 过(帧, 事.走向照片墙.帧, 转头帧)) as [number, number];
  const 到站 = 事.手按合照.帧 - 按伸帧;
  if (帧 >= 到站 - 1) 看 = 插(她的头.平视, 她的头.看合照, 过(帧, 到站 - 1, 转头帧)) as [number, number];
  if (帧 >= 事.取照.帧) 看 = 插(她的头.看合照, 她的头.看手里, 过(帧, 事.取照.帧, 转头帧)) as [number, number];

  // 走路：原版那样腿、空着的右胳膊前后摆（相位按走过的路），副手一直捧着花；起步、停下时摆幅跟着速度收
  let 骨骼: 骨表 = { ...主手于(帧), ...副手捧花 };
  if (在走) {
    const s = Math.sin(走.周期 * Math.PI * 2);
    const 前后 = 走到(帧 + 1).x - 走到(帧 - 1).x;
    const 幅 = clamp01(前后 / 0.35);
    const 臂 = 骨骼.RightArm!.rot!;
    骨骼 = {
      ...骨骼,
      RightLeg: { rot: [步.腿 * s * 幅, 0, 2.5] },
      LeftLeg: { rot: [-步.腿 * s * 幅, 0, -2.5] },
      RightArm: { rot: [臂[0] - 步.胳膊 * s * 幅, 臂[1], 臂[2]] },
    };
  }
  return {
    x: 走.x,
    yaw,
    看,
    表情: 帧 >= 事.取照.帧 ? '难过' : '无',
    骨骼,
    右手: 帧 >= 事.取照.帧 ? '合照' : null,
    左手: '花',
  };
};
