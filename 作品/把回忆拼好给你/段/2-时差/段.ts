// 正片第 13 句「我们的爱总有时差」：分屏整句一个镜头（右现实课桌、左服务器门口），开头接第 12 句末的横移、两屏从右边滑进来停稳。
// 帧数、场窗口、原声 cue 从 分镜 推（[第 13 句前导, 第 14 句前导)），段里不写数字。只铺原声：这一句只有歌。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片第13至14句.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';

const clock = segClock('2-时差');

export default defineSeg({
  场: '2-门口',
  秒: clock.秒,
  宽: aspect.宽,
  高: aspect.高,
  地形: [],
  sceneWindow: clock.sceneWindow,
  // 段在一串歌中间，不淡入、不淡出
  声音: [{ ...clock.origTrack, 资产: '配乐/把回忆拼好给你-无男声DJ', 名: '原声', 增益: mainCutOriginalGain }],
});
