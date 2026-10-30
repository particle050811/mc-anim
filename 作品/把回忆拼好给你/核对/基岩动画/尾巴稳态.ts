// 魔法酒狐尾巴的弹簧稳态：从动画文件里求常数和目标，算出 parallel4 弹簧在第 秒 秒的输出，填进变量表（纯模块）。
// 游戏里 parallel4 每渲染一帧推 0.01 秒（显式欧拉），靠跨帧保留的变量表积分；单帧渲染拿不到前面的帧，所以用稳态解代替（同 库/角色/魔法酒狐动作.ts 的手抄版）。
// 只算尾巴（L13）；走路、转身、抬头那几组弹簧（L1～L12）的输入坐着不动时是 0，稳态也是 0，不填（按 0 算）。
import { 取样骨骼, 播放到, type 基岩动画 } from '@engine/anim/基岩动画.ts';

/** 变量表：v.s、v.f（molang3）、L1～L13 的弹簧常数（parallel3 时间线）、tail 目标和 L13_P0… 弹簧输出（稳态） */
export const 尾巴稳态变量 = (动画们: Readonly<Record<string, 基岩动画>>, 秒: number): Record<string, number | string> => {
  const 变量: Record<string, number | string> = {};
  const 选项 = { 环境: { 变量 }, 口径: 'TLM' } as const;
  播放到(动画们.parallel3!, 0.5, 0.01, 选项);
  取样骨骼(动画们.pre_parallel2!, 0, 选项); // molang3 排在 molang2 后面，第一遍才给 v.s、v.f
  const [K1, K2, K3] = ['l13_k1', 'l13_k2', 'l13_k3'].map((k) => 变量[k] as number);
  const ω = (2 * Math.PI * 24) / (变量.s as number); // 目标 sin(t·360/(s/24)) 的角频率
  const 增益 = K3! / Math.hypot(1 - K2! * ω * ω, K1! * ω);
  const 滞后 = Math.atan2(K1! * ω, 1 - K2! * ω * ω) / ω; // 秒
  取样骨骼(动画们.pre_parallel2!, 秒 - 滞后, 选项); // 目标 v.tail1y… 取在滞后的时刻
  for (const k of [1, 2, 3, 4, 5, 6]) for (const a of ['y', 'z']) 变量[`l13_p0${k}${a}`] = 增益 * ((变量[`tail${k}${a}`] as number | undefined) ?? 0);
  return 变量;
};
