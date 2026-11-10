// 出手：正片里「第几秒放哪个法术」的表怎么画。每一发从杖尖出发打向史蒂夫（起点、目标也可以逐发另给）；
// 用户 11-10 定：法术都从法杖尖放，不从盘上那一格放（「不然看着很诡异」），盘上那格只管亮。
// 连带算出名签（挂在盘上亮的那格旁）、计数、盘上哪几格亮、史蒂夫几时挨打。时钟由段定（各段的 编排.ts 用「现身后几秒」）。
import React from 'react';
import type { Cam } from '@engine/core/机位.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { 盘格位置, type 盘位姿 } from '../../界面/杖尖盘位姿.ts';
import type { 多圈轮盘参数 } from '../../界面/多圈轮盘.tsx';
import { 聚晶键 } from '../../界面/轮盘法术.ts';
import { 名签秒, type 名签 } from '../../界面/战斗界面.tsx';
import { 法术表 } from '../../法术/法术表.ts';
import { 法术时长 } from '../../法术/演出/接口.ts';
import { 取法术元 } from '../../法术/演出/元表.ts';
import { 法术演出 } from '../../法术/演出/注册表.tsx';
import { 投到画面 } from './台地场.tsx';

export type 一发 = {
  /** 法术表的注册名，如 fireball */
  id: string;
  /** 出手的时刻 */
  秒: number;
  /** 不给 = 出手那一刻的杖尖 */
  起点?: V3;
  /** 不给 = 出手那一刻史蒂夫的脚底 */
  目标?: V3;
  种子?: number;
  /** 画到这一刻为止（硬切）：一波结束清场，长秒拖过波末的法术不让它跨波 */
  止?: number;
};

/** 这一幕里随时间变的东西，出手 要用的那几样 */
export type 场况 = {
  盘位: (秒: number) => 盘位姿;
  轮盘参: (秒: number) => 多圈轮盘参数 | null;
  每像素格: number;
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
/** 这一刻盘上它那一格在哪（名签挂这里）；盘还没张到那一圈就用杖尖 */
export const 发格点 = (发: 一发, 秒: number, 况: 场况): V3 => {
  const 参 = 况.轮盘参(秒);
  return (参 && 盘格位置(况.盘位(秒), 况.每像素格, 参, 发键(发.id))) ?? 况.杖尖(秒);
};
export const 发目标 = (发: 一发, 况: 场况): V3 => 发.目标 ?? 况.史蒂夫脚(发.秒);
/** 这一发命中的时刻；没有命中一说的返回 undefined */
export const 发命中 = (发: 一发, 况: 场况): number | undefined => {
  const 命中 = 法术时长(取法术元(发.id), 发起点(发, 况), 发目标(发, 况)).命中秒;
  return 命中 === undefined ? undefined : 发.秒 + 命中;
};

/** 画这一刻还在演的每一发；放在场景坐标的 group 里 */
export const 出手们: React.FC<{ 表: readonly 一发[]; 秒: number; 况: 场况 }> = ({ 表, 秒, 况 }) => (
  <>
    {表.map((发, i) =>
      秒 < 发.秒 || (发.止 !== undefined && 秒 >= 发.止) ? null : <法术演出 key={`${发.id}-${i}`} id={发.id} 秒={秒 - 发.秒} 起点={发起点(发, 况)} 目标={发目标(发, 况)} 种子={发.种子 ?? 101 + i * 7} />,
    )}
  </>
);

/** 出手后 名签秒 内的名签，挂在盘上那一格右下 */
export const 出手名签 = (表: readonly 一发[], 秒: number, 况: 场况, 机位: Cam): 名签[] =>
  表.flatMap((发) => {
    const 年龄秒 = 秒 - 发.秒;
    if (年龄秒 < 0 || 年龄秒 >= 名签秒) return [];
    const p = 投到画面(机位, 发格点(发, 秒, 况));
    return p.前 ? [{ 键: 发键(发.id), x: p.x + 14, y: p.y + 6, 年龄秒 }] : [];
  });

export const 已出手 = (表: readonly 一发[], 秒: number): number => 表.filter((发) => 发.秒 <= 秒).length;
/** 盘上这一刻亮着的格：出手后 留秒 内 */
export const 亮格 = (表: readonly 一发[], 秒: number, 留秒 = 0.5): string[] => 表.filter((发) => 秒 >= 发.秒 && 秒 < 发.秒 + 留秒).map((发) => 发键(发.id));
/** 距最近一次命中几秒；还没挨过返回 undefined。不挡 给不算挨打的那几发（放在她自己身上的） */
export const 距命中 = (表: readonly 一发[], 秒: number, 况: 场况, 不挡: (发: 一发) => boolean = () => true): number | undefined => {
  let 近: number | undefined;
  for (const 发 of 表) {
    if (!不挡(发)) continue;
    const 命中 = 发命中(发, 况);
    if (命中 !== undefined && 命中 <= 秒 && (近 === undefined || 秒 - 命中 < 近)) 近 = 秒 - 命中;
  }
  return 近;
};
