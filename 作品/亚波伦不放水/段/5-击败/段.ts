import { windowSeg } from '@engine/段/窗口段.ts';
import { musicInSec } from '../../角色/动作/忘情牛肉面时长.ts';
import { realNetherPack } from '../../地点/真下界位置.ts';
import timeline from '../../场/1-台地/时间线.ts';
import { shotStart, cursorMove, yaBoLunBeats, actDur, actStart, landSec } from '../../场/1-台地/击败拍.ts';
import soundTable from './声音表.生成.ts';

const mainPeakDb = -10;
const peakDb = -18;
/** 结算曲（同 6-结算舞 的 段.ts）：那一段从文件第 musicInSec 秒起放、卡着舞；文件头那一截放在本段最后 musicInSec 秒，到段缝正好接上，
 *  不然曲子从唱词半截冒出来（用户 11-19「此处和后面所有切音乐的时候都做一点衔接操作」）。响度同那边；开头 0.06 秒等功率淡入，免得咔哒一声 */
const danceMusic = '配乐/结算舞/DreamFunk忘情牛肉面';
const danceLeadFadeSec = 0.06;

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
      play('音效/诡厄巫法/goety.heavy_woosh.1', yaBoLunBeats.dashStart, { peakDb: peakDb, name: '她冲' }),
      play('音效/诡厄巫法/goety.heavy_woosh.2', yaBoLunBeats.descendStart, { peakDb: peakDb, name: '俯冲' }),
      play('音效/entity.generic.small_fall', landSec - actStart, { peakDb: peakDb, name: '落地' }),
      // 死亡界面上光标点「重生」
      play('音效/ui.button.click', shotStart.deathScreen + cursorMove.points, { peakDb: mainPeakDb, name: '点重生' }),
      play(danceMusic, durSec - musicInSec, {
        loudness: -18,
        长秒: musicInSec,
        gainEnvelope: [
          { sec: durSec - musicInSec, db: -Infinity },
          { sec: durSec - musicInSec + danceLeadFadeSec, db: 0, curve: 'equalPowerIn' },
        ],
        name: '结算曲',
      }),
    ];
  },
});
