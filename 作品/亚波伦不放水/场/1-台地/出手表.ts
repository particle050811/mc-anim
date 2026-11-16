// 出手表的纯计算部分：一发是什么、从哪打到哪、几时命中（段.ts 排声音也引，不引 React、贴图）。画法在同目录 出手.tsx。
import type { V3 } from '@engine/model/parts.tsx';
import { focusKey } from '../../界面/轮盘法术.ts';
import { spellTable } from '../../法术/法术表.ts';
import { spellDuration, type SpellOptions } from '../../法术/演出/接口.ts';
import { getSpellMeta } from '../../法术/演出/元表.ts';

export type Launch = {
  /** 法术表的注册名，如 fireball */
  id: string;
  /** 出手的时刻 */
  sec: number;
  /** 不给 = 出手那一刻的杖尖 */
  from?: V3;
  /** 不给 = 出手那一刻史蒂夫的脚底 */
  target?: V3;
  /** 持续施法的（光束、吐息、绕身的风）起点跟着施法者走：画的时候每帧取这一刻的位置当起点；命中时刻照出手那一刻的 起点 算 */
  follow?: (sec: number) => V3;
  seed?: number;
  /** 画到这一刻为止（硬切）：挡住人的大件在切镜头时收掉 */
  end?: number;
  /** 这一发自己的钟（编排的钟 → 演到哪一刻）：打击停顿时这一发定住几帧、别的照走。不给 = 跟编排的钟走 */
  clock?: (sec: number) => number;
  /** 聚晶附魔、施法条件（法术/演出/接口.ts 的 法术选项）；不给 = 不附魔、原版快慢 */
  options?: SpellOptions;
};

/** 这一幕里随时间变的东西，出手 要用的那几样 */
export type SceneCtx = {
  wandTip: (sec: number) => V3;
  steveFoot: (sec: number) => V3;
};

const keyTable = new Map(spellTable.map((spell) => [spell.registryName, focusKey(spell)]));
export const fireKey = (id: string): string => {
  const focusKey = keyTable.get(id);
  if (!focusKey) throw new Error(`法术表里没有 ${id}`);
  return focusKey;
};

export const launchFrom = (cast: Launch, sceneCtx: SceneCtx): V3 => cast.from ?? sceneCtx.wandTip(cast.sec);
export const launchTarget = (cast: Launch, sceneCtx: SceneCtx): V3 => cast.target ?? sceneCtx.steveFoot(cast.sec);
/** 这一发命中的时刻；没有命中一说的返回 undefined */
export const launchHit = (cast: Launch, sceneCtx: SceneCtx): number | undefined => {
  const hitSec = spellDuration(getSpellMeta(cast.id), launchFrom(cast, sceneCtx), launchTarget(cast, sceneCtx), cast.options).hitSec;
  return hitSec === undefined ? undefined : cast.sec + hitSec;
};
