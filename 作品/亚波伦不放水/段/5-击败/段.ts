// 第 5 幕 击败：他死、东西撒一地，死亡界面盖着，后面她收盘落地（七版 5-03）。窗口、声音 cue。纯模块。
// 声音（用户 11-11「为什么没有声音啊」）：时刻从 场/1-台地/击败拍.ts 取，不抄数。他死（原版死亡声），结界没了（原版 stopSpell 的信标熄灭），
// 收盘，俯冲一声破风，落地，死亡界面点「重生」。响度两档同第 4 幕：主要峰值 −10 dBFS、次要 −18 dBFS。七版 5-01 她那一冲连镜头一起去掉了。
// 收盘、落地游戏里没有专门的声音：收盘借本体 goety.cast_spell、落地借原版 small_fall，都是 Agent 取的，用户没听过。
import { windowSeg } from '@engine/段/窗口段.ts';
import { realNetherPack } from '../../地点/真下界位置.ts';
import timeline from '../../场/1-台地/时间线.ts';
import { cursorMove, yaBoLunBeats, actDur, actStart, landSec } from '../../场/1-台地/击败拍.ts';
import soundTable from './声音表.生成.ts';

const mainPeakDb = -10;
const peakDb = -18;

export default windowSeg(timeline, {
  start: 'volleyDone',
  end: 'defeatDone',
  terrain: [realNetherPack],
  soundTable,
  sound: ({ 放: play, sec: durSec }) => {
    if (Math.abs(durSec - actDur) > 1 / 60) throw new Error(`击败段长 ${durSec} 秒和 击败拍.ts 的幕长 ${actDur} 对不上`);
    return [
      // 他死在本幕第 0 秒（第 4 幕卫射照满那一刻），结界跟着没了
      play('音效/entity.player.death.1', 0, { peakDb: mainPeakDb, name: '他死' }),
      play('音效/block.beacon.deactivate', 0, { peakDb: peakDb, name: '结界灭' }),
      play('音效/诡厄巫法/goety.cast_spell.2', yaBoLunBeats.retractStart, { peakDb: peakDb, name: '收盘' }),
      play('音效/诡厄巫法/goety.heavy_woosh.2', yaBoLunBeats.descendStart, { peakDb: peakDb, name: '俯冲' }),
      play('音效/entity.generic.small_fall', landSec - actStart, { peakDb: peakDb, name: '落地' }),
      // 死亡界面上光标点「重生」
      play('音效/ui.button.click', cursorMove.points, { peakDb: mainPeakDb, name: '点重生' }),
    ];
  },
});
