// 正片第 12 句「我却已无法自拔」：小木屋卧室侧剖面，整句一个镜头。你下线后的第一夜，她抚平你那张空床的被子、坐在床沿守着门，窗光从月光一档一档挪到天亮，天亮她猛地看门口，没有人。
// 帧数、场窗口、原声 cue 都从 分镜 推（[第 12 句起, 第 13 句前导)），增益取正片共用的 配乐/正片.ts，段里不写数字。没有音效：这一句只有歌。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片第12句.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';

const clock = segClock('2-空床');

export default defineSeg({
  场: '2-卧室',
  秒: clock.秒,
  宽: aspect.宽,
  高: aspect.高,
  地形: [],
  sceneWindow: clock.sceneWindow,
  // 段在一串歌中间，不淡入、不淡出
  声音: [{ ...clock.origTrack, 资产: '配乐/把回忆拼好给你-无男声DJ', 名: '原声', 增益: mainCutOriginalGain }],
});
