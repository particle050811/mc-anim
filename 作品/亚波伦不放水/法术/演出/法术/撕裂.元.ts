// 撕裂（goety:rupture_focus）的元数据。出处见 撕裂.tsx。
import { defineSpellMeta, type SpellSound, type SpellOptions } from '../接口.ts';

/** 撕开的预热：游戏里 蓄力 120 − 5 = 115 刻；片里压成 60（自己定的） */
export const tearWarmupTick = 60;
/** 裂隙开着的刻数：游戏里 duration 300；片里只放 60（自己定的） */
export const tearOpenTicks = 60;
/** 合上的刻数：写死 20，之后爆 */
export const tearCloseTicks = 20;
export const tearBurstTick = tearWarmupTick + tearOpenTicks + tearCloseTicks;
/** 这一发的预热、爆在第几刻：给了 施法刻 照游戏（VoidRiftSpell 蓄到 施法刻 − 5 撕开），不给照上面自己定的 60 */
export const tearBeat = (options?: SpellOptions) => {
  const warmup = options?.castTick !== undefined ? options.castTick - 5 : tearWarmupTick;
  return { warmup, burstTick: warmup + tearOpenTicks + tearCloseTicks };
};
const makeSounds = (options?: SpellOptions): SpellSound[] => {
  const { warmup, burstTick } = tearBeat(options);
  return [
    { asset: '音效/诡厄巫法/goety.void_prepare_spell.1', sec: 0 },
    { asset: '音效/诡厄巫法/goety.rumble.1', sec: 0, 音量: 2 },
    { asset: '音效/诡厄巫法/goety.rumble.2', sec: warmup / 3 / 20, 音量: 2 },
    { asset: '音效/诡厄巫法/goety.rumble.3', sec: (warmup * 2) / 3 / 20, 音量: 2 },
    { asset: '音效/诡厄巫法/goety.void_rift_open', sec: warmup / 20, 音量: 5 },
    { asset: '音效/block.respawn_anchor.deplete.1', sec: burstTick / 20, 音量: 5, 音高: 0.5 },
    { asset: '音效/entity.generic.explode.1', sec: burstTick / 20, 音量: 5, 音高: 0.5 },
  ];
};

export default defineSpellMeta({
  id: 'rupture',
  长秒: (tearBurstTick + 30) / 20,
  hitSec: tearBurstTick / 20,
  duration: (unusedStart, unusedTarget, options) => ({ 长秒: (tearBeat(options).burstTick + 30) / 20, hitSec: tearBeat(options).burstTick / 20 }),
  sound: makeSounds(),
  soundsFor: makeSounds,
});
