// 第 6 幕结算：只跳真人原片的短舞，史蒂夫躺在旁边。
// 配乐：用户 11-11「音乐也配上」。只有这一首，没有环境声、音效；响度、淡出是 Agent 取的，用户没听过。
import { windowSeg } from '@engine/段/窗口段.ts';
import { musicInSec } from '../../角色/动作/忘情牛肉面时长.ts';
import timeline from '../../场/2-教堂/时间线.ts';
import soundTable from './声音表.生成.ts';

const danceMusic = '配乐/结算舞/DreamFunk忘情牛肉面';

export default windowSeg(timeline, {
  start: '开始',
  end: '结束',
  soundTable,
  sound: ({ 放: play, events }) => [
    play(danceMusic, events.danceStart, {
      入点秒: musicInSec,
      loudness: -18,
      fadeOutSec: 0.24,
      name: '结算曲',
    }),
  ],
});
