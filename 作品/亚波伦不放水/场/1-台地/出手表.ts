// 出手表的纯计算部分：一发是什么、从哪打到哪、几时命中（段.ts 排声音也引，不引 React、贴图）。画法在同目录 出手.tsx。
import type { V3 } from '@engine/model/parts.tsx';
import { 聚晶键 } from '../../界面/轮盘法术.ts';
import { 法术表 } from '../../法术/法术表.ts';
import { 法术时长, type 法术选项 } from '../../法术/演出/接口.ts';
import { 取法术元 } from '../../法术/演出/元表.ts';

export type 一发 = {
  /** 法术表的注册名，如 fireball */
  id: string;
  /** 出手的时刻 */
  秒: number;
  /** 不给 = 出手那一刻的杖尖 */
  起点?: V3;
  /** 不给 = 出手那一刻史蒂夫的脚底 */
  目标?: V3;
  /** 持续施法的（光束、吐息、绕身的风）起点跟着施法者走：画的时候每帧取这一刻的位置当起点；命中时刻照出手那一刻的 起点 算 */
  随?: (秒: number) => V3;
  种子?: number;
  /** 画到这一刻为止（硬切）：挡住人的大件在切镜头时收掉 */
  止?: number;
  /** 这一发自己的钟（编排的钟 → 演到哪一刻）：打击停顿时这一发定住几帧、别的照走。不给 = 跟编排的钟走 */
  钟?: (秒: number) => number;
  /** 聚晶附魔、施法条件（法术/演出/接口.ts 的 法术选项）；不给 = 不附魔、原版快慢 */
  选项?: 法术选项;
};

/** 这一幕里随时间变的东西，出手 要用的那几样 */
export type 场况 = {
  杖尖: (秒: number) => V3;
  史蒂夫脚: (秒: number) => V3;
};

const 键表 = new Map(法术表.map((法) => [法.注册名, 聚晶键(法)]));
export const 发键 = (id: string): string => {
  const 键 = 键表.get(id);
  if (!键) throw new Error(`法术表里没有 ${id}`);
  return 键;
};

export const 发起点 = (发: 一发, 况: 场况): V3 => 发.起点 ?? 况.杖尖(发.秒);
export const 发目标 = (发: 一发, 况: 场况): V3 => 发.目标 ?? 况.史蒂夫脚(发.秒);
/** 这一发命中的时刻；没有命中一说的返回 undefined */
export const 发命中 = (发: 一发, 况: 场况): number | undefined => {
  const 命中 = 法术时长(取法术元(发.id), 发起点(发, 况), 发目标(发, 况), 发.选项).命中秒;
  return 命中 === undefined ? undefined : 发.秒 + 命中;
};
