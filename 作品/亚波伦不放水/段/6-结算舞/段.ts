// 第 6 幕 结算舞：中殿里跳一遍忘情牛肉面 → 收住，右边躺着投降的史蒂夫。窗口、声音 cue。纯模块。
// 配乐：用户 11-11「音乐也配上」。只有这一首，没有环境声、音效；响度、淡出是 Agent 取的，用户没听过。
import { windowSeg } from '@engine/段/窗口段.ts';
import { musicLateSec } from '../../角色/动作/忘情牛肉面时长.ts';
import timeline from '../../场/2-教堂/时间线.ts';
import soundTable from './声音表.生成.ts';

export default windowSeg(timeline, {
  起: '开始',
  止: '结束',
  soundTable,
  声音: ({ 放: play, 事件: events }) => [
    // 曲子从文件头放，比舞晚 曲晚秒（对拍怎么量的见 忘情牛肉面时长.ts）；放到段尾，收住那 2 秒淡掉
    play('配乐/结算舞/DreamFunk忘情牛肉面', events.danceStart + musicLateSec, { 响度: -18, fadeOutSec: events.结束 - events.danceDone, 名: '结算曲' }),
  ],
});
