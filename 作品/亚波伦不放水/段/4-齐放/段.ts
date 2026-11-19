// 第 4 幕（轰炸）：第 2 幕末盘已张开，她按住不放地连放，结界罩住他，晋升之环像不死图腾一样救他一次，几秒后被炸死。窗口、声音 cue。纯模块。
// 段键还叫 4-齐放（段名是永久身份）；用户 11-11 要的是连放、狂轰滥炸，见 场/1-台地/齐放拍.ts 开头。
// 声音（用户 11-11「放法术的音效你都得加上啊」）：时刻都从 场/1-台地/齐放拍.ts 取，不抄数。每一发的起手、出手、命中在 场/1-台地/齐放声.ts（按同时几声压响度）；
// 这里是她（开幕一顶、每一下冲）、索命劈中和晋升之环炸开、他挨打、结界的火。
// 响度两档（三个 Agent 统一，用户没听过）：主要的峰值 −10 dBFS、次要的 −18 dBFS；结界的火是环境，−26 LUFS。配乐在场时间线上（−22 LUFS）。
// 挑哪几个、哪个算主要都是 Agent 取的，用户没听过。
import { windowSeg } from '@engine/段/窗口段.ts';
import { realNetherPack } from '../../地点/真下界位置.ts';
import timeline from '../../场/1-台地/时间线.ts';
import { killingPause, dashRanges, castStart, totemSec, actStart, actDur, takenHitsWorld, deathTime, coverFullSec } from '../../场/1-台地/齐放拍.ts';
import { massCastSounds } from '../../场/1-台地/齐放声.ts';
import soundTable from './声音表.生成.ts';

const mainPeakDb = -10;
const peakDb = -18;
/** 一个事件有几个文件的，轮着用 */
const roundRobin = (prefix: string, n: number, i: number) => `${prefix}.${(i % n) + 1}`;

export default windowSeg(timeline, {
  start: 'wheelOpenDone',
  end: 'volleyDone',
  terrain: [realNetherPack],
  soundTable,
  sound: ({ 放: play, sec: durSec }) => {
    if (Math.abs(durSec - actDur) > 1 / 60) throw new Error(`齐放段长 ${durSec} 秒和 齐放拍.ts 的幕长 ${actDur} 对不上`);
    return [
      // 她：开幕杖往前一顶、第一轮离手（结界的施放声就是使徒这一声，游戏里她起手放炼狱）
      play('音效/诡厄巫法/goety.apostle_cast_spell.1', castStart, { peakDb: mainPeakDb, name: '齐放' }),
      // 她每一下冲：一声破风
      ...dashRanges.map((c, i) => play(roundRobin('音效/诡厄巫法/goety.heavy_woosh', 5, i), c.start, { peakDb: peakDb, name: `冲${i + 1}` })),
      // 每一发的起手、出手、飞行、命中（场/1-台地/齐放声.ts）
      ...massCastSounds().map((x) => play(x.asset, x.sec, { peakDb: x.peakDb, name: x.name, ...(x.速率 ? { 速率: x.速率 } : {}) })),
      // 索命劈中（打击停顿 16 帧的开头）：雷霆、闪电劈，游戏里两个一起响；同一刻晋升之环炸开，照不死图腾响 item.totem.use
      play('音效/诡厄巫法/goety.thunderbolt.1', killingPause.start, { peakDb: mainPeakDb, name: '索命' }),
      play('音效/entity.lightning_bolt.impact.1', killingPause.start, { peakDb: mainPeakDb, name: '索命-劈' }),
      play('音效/item.totem.use', totemSec - actStart, { peakDb: mainPeakDb, name: '图腾' }),
      // 他：挨打（0.5 秒里挨几下只响一下，同变红）
      ...takenHitsWorld.map((h, i) => play(roundRobin('音效/entity.player.hurt', 3, i), h.sec, { peakDb: h.重 ? mainPeakDb : peakDb, name: `挨打${i + 1}` })),
      // 结界：罩严后人在火里，原版每刻烧人响 block.fire.ambient；他死就停
      play('音效/block.fire.ambient', coverFullSec, { loudness: -26, 循环: true, 长秒: deathTime - coverFullSec, name: '结界火' }),
    ];
  },
});
