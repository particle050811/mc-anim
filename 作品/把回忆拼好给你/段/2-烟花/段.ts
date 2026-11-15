// 正片第 10 句「像转瞬即逝的烟花」（31.26–34.80），门这个机位的夜里：你放三发烟花火箭，她仰头看，每炸开一下牌子、树苗跟着亮一下。
// 帧数、场窗口、原声 cue 从 分镜 推；音效从 场/2-门口/门口之夜声音.ts 切出落在本段的那几截（跨段的接着放）。段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片第9至11句.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';
import { segSounds } from '../../场/2-门口/门口之夜声音.ts';

const clock = segClock('2-烟花');

export default defineSeg({
  场: '2-门口',
  秒: clock.秒,
  宽: aspect.宽,
  高: aspect.高,
  地形: [],
  sceneWindow: clock.sceneWindow,
  声音: [{ ...clock.origTrack, 资产: '配乐/把回忆拼好给你-无男声DJ', 名: '原声', 增益: mainCutOriginalGain }, ...segSounds(clock.sceneWindow)],
});
