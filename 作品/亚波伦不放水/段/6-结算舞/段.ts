// 第 6 幕结算：只跳真人原片的短舞，史蒂夫躺在旁边。
// 配乐：用户 11-11「音乐也配上」。只有这一首，没有环境声、音效；响度是 Agent 取的，用户没听过。
// 衔接（用户 11-19「此处和后面所有切音乐的时候都做一点衔接操作」）：文件头到 musicInSec 那一截在 5-击败 段尾放，本段接着放；收尾片尾前 1.5 秒等功率淡出到 0。
import { windowSeg } from '@engine/段/窗口段.ts';
import { musicInSec } from '../../角色/动作/忘情牛肉面时长.ts';
import timeline from '../../场/2-教堂/时间线.ts';
import soundTable from './声音表.生成.ts';

const danceMusic = '配乐/结算舞/DreamFunk忘情牛肉面';
const endFadeSec = 1.5;

export default windowSeg(timeline, {
  start: '开始',
  end: '结束',
  soundTable,
  sound: ({ 放: play, events, sec: durSec }) => [
    play(danceMusic, events.danceStart, {
      入点秒: musicInSec,
      loudness: -18,
      gainEnvelope: [
        { sec: durSec - endFadeSec, db: 0 },
        { sec: durSec, db: -Infinity, curve: 'equalPowerOut' },
      ],
      name: '结算曲',
    }),
  ],
});
