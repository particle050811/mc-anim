// 第 1 幕 召唤：史蒂夫在基座外放环（走上来那一镜 11-11 删了）、安息仪式（短方案）、亚波伦现身、睁眼转向他。窗口、声音 cue。纯模块。
// 声音（用户 11-11「为什么没有声音啊」）：仪式照游戏里的时刻表（特效/安息仪式时序.ts 的 召唤声音，从 放环 起算），他的脚步、拔剑和她甩杖的时刻取 场/1-台地/开盘时刻.ts。
// 配乐、下界氛围垫底在场时间线上；游戏里提示那一刻还会放一声 ambient.nether_wastes.mood，和垫底的 mood.2 重了，这里不放。
// 响度三档（同 声音表.md 6.1 节）：仪式开始、完成、现身的雷峰值 −10 dBFS；仪式循环 −28 LUFS（环境）；低语、祭品被吃、扣灵魂、脚步、拔剑、甩杖峰值 −18 dBFS。
// 一个事件有几个文件的挑哪个、多响都是 Agent 取的，用户没听过。
import { windowSeg } from '@engine/段/窗口段.ts';
import { realNetherPack } from '../../地点/真下界位置.ts';
import { summonPlans, summonSounds } from '../../特效/安息仪式时序.ts';
import { act1, act1Steps } from '../../场/1-台地/开盘时刻.ts';
import timeline from '../../场/1-台地/时间线.ts';
import soundTable from './声音表.生成.ts';

/** 召唤声音 的名 → 怎么放（不在表里的不放） */
const ritualLoudness: Record<string, { 峰值: number } | { 响度: number }> = {
  仪式开始: { 峰值: -10 },
  仪式完成: { 峰值: -10 },
  雷声: { 峰值: -10 },
  仪式循环: { 响度: -28 },
  使徒低语: { 峰值: -18 },
  祭品被吃: { 峰值: -18 },
};

export default windowSeg(timeline, {
  起: '开始',
  止: 'summonDone',
  地形: [realNetherPack],
  soundTable,
  声音: ({ 放: play, 事件: events }) => {
    const sounds: ReturnType<typeof play>[] = [];
    // 仪式：多选一的取第一个；扣灵魂（幽匿催发体绽放声，13 个文件）一秒一声，轮着用
    let cycleIndex = 0;
    for (const summonSound of summonSounds(summonPlans.短)) {
      const sec = events.placeRing + summonSound.秒;
      if (summonSound.名.startsWith('扣灵魂')) {
        sounds.push(play(summonSound.资产[cycleIndex++ % summonSound.资产.length]!, sec, { 峰值: -18, 名: summonSound.名 }));
        continue;
      }
      const loudLevel = ritualLoudness[summonSound.名];
      if (loudLevel) sounds.push(play(summonSound.资产[0]!, sec, { ...loudLevel, 名: summonSound.名 }));
    }
    // 编排的钟（现身后几秒）→ 段内秒
    const segSec = (t: number) => events.yaBoLunAppears + t;
    for (const [i, t] of act1Steps.entries()) sounds.push(play(`音效/block.stone.step.${(i % 6) + 1}`, segSec(t), { 峰值: -18, 名: `脚步${i + 1}` }));
    // 拔剑：原版没有拔剑声，借穿装备的声音
    sounds.push(play('音效/item.armor.equip_generic.1', segSec(act1.drawSwordSec), { 峰值: -18, 名: '拔剑' }));
    sounds.push(play('音效/诡厄巫法/goety.wind.1', segSec(act1.staffFlick[0]), { 峰值: -18, 名: '甩杖' }));
    return sounds;
  },
});
