// 季风（goety:monsoon_focus）的元数据。出处见 季风.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 云出来到开始下雨：activateTime 20 刻 */
export const monsoonActiveTick = 20;
/** 下雨刻数：游戏里 lifeSpan 100 刻；片里只放 60 刻（自己定的） */
export const monsoonRainTicks = 60;
/** 落雷的刻（云下有人时每刻 5% 概率；这里按种子抽，保证至少一道，见 季风.tsx）。给声音用，得是纯函数 */
export const monsoonStrikeTicks = (seed: number): number[] => {
  let x = (seed * 2654435761) >>> 0;
  const rand = () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
  const strikeTicks: number[] = [];
  for (let t = monsoonActiveTick + 1; t < monsoonActiveTick + monsoonRainTicks; t++) if (rand() <= 0.05) strikeTicks.push(t);
  return strikeTicks.length ? strikeTicks : [monsoonActiveTick + 20];
};

export default defineSpellMeta({
  id: 'monsoon',
  长秒: (monsoonActiveTick + monsoonRainTicks + 10) / 20,
  hitSec: monsoonActiveTick / 20,
  // MonsoonCloud 出生：LIGHTNING_BOLT_THUNDER 音量 0.5、音高 1.25；施法音 prepare_spell。落雷的 thunderbolt 声按种子 1 的那一发排（段里种子不同时声音可能和画面差几刻，见 季风.tsx）
  声音: [
    { 资产: '音效/entity.lightning_bolt.thunder.1', 秒: 0, 音量: 0.5, 音高: 1.25 },
    { 资产: '音效/诡厄巫法/goety.prepare_spell.1', 秒: 0 },
    ...monsoonStrikeTicks(1).map((t) => ({ 资产: '音效/诡厄巫法/goety.thunderbolt.1', 秒: t / 20 })),
  ],
});
