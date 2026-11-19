// 第 1 幕 召唤：史蒂夫在基座外放环（走上来那一镜 11-11 删了）、安息仪式（短方案）、亚波伦现身、睁眼转向他。窗口、声音 cue。纯模块。
// 声音（用户 11-11「为什么没有声音啊」）：仪式照游戏里的时刻表（特效/安息仪式时序.ts 的 召唤声音，从 放环 起算），他的脚步、拔剑的时刻取 场/1-台地/开盘时刻.ts。
// 配乐、下界氛围垫底在场时间线上；游戏里提示那一刻还会放一声 ambient.nether_wastes.mood，和垫底的 mood.2 重了，这里不放。
// 现身的雷声、甩杖那阵风响过段尾，在场时间线上（场/1-台地/时间线.ts），不在这里。
// 响度三档（同 声音表.md 6.1 节）：仪式开始、完成、现身的雷峰值 −10 dBFS；仪式循环 −28 LUFS（环境）；低语、祭品被吃、扣灵魂、脚步、拔剑、甩杖峰值 −18 dBFS。
// 一个事件有几个文件的挑哪个、多响都是 Agent 取的，用户没听过。
import { windowSeg } from '@engine/段/窗口段.ts';
import { realNetherPack } from '../../地点/真下界位置.ts';
import { summonPlans, summonSounds } from '../../特效/安息仪式时序.ts';
import { act1, act1Steps } from '../../场/1-台地/开盘时刻.ts';
import timeline from '../../场/1-台地/时间线.ts';
import soundTable from './声音表.生成.ts';

/** 召唤声音 的名 → 怎么放（不在表里的不放）。雷声响过段尾，写在场时间线的声音里 */
const ritualLoudness: Record<string, { peakDb: number } | { loudness: number }> = {
  仪式开始: { peakDb: -10 },
  仪式完成: { peakDb: -10 },
  仪式循环: { loudness: -28 },
  使徒低语: { peakDb: -18 },
  祭品被吃: { peakDb: -18 },
};

export default windowSeg(timeline, {
  start: '开始',
  end: 'summonDone',
  terrain: [realNetherPack],
  soundTable,
  sound: ({ 放: play, events: events }) => {
    const sounds: ReturnType<typeof play>[] = [];
    // 仪式：多选一的取第一个；扣灵魂（幽匿催发体绽放声，13 个文件）一秒一声，轮着用
    let cycleIndex = 0;
    for (const summonSound of summonSounds(summonPlans.短)) {
      const sec = events.placeRing + summonSound.sec;
      if (summonSound.name.startsWith('扣灵魂')) {
        sounds.push(play(summonSound.asset[cycleIndex++ % summonSound.asset.length]!, sec, { peakDb: -18, name: summonSound.name }));
        continue;
      }
      const loudLevel = ritualLoudness[summonSound.name];
      if (loudLevel) sounds.push(play(summonSound.asset[0]!, sec, { ...loudLevel, name: summonSound.name }));
    }
    // 编排的钟（现身后几秒）→ 段内秒
    const segSec = (t: number) => events.yaBoLunAppears + t;
    for (const [i, t] of act1Steps.entries()) sounds.push(play(`音效/block.stone.step.${(i % 6) + 1}`, segSec(t), { peakDb: -18, name: `脚步${i + 1}` }));
    // 拔剑：原版没有拔剑声，借穿装备的声音
    sounds.push(play('音效/item.armor.equip_generic.1', segSec(act1.drawSwordSec), { peakDb: -18, name: '拔剑' }));
    return sounds;
  },
});
