// 正片第 6 句「在最灰暗的日子你陪着我发呆」：雷雨里炸掉一角的门口小木屋，她和你坐在坑沿发呆，透视一个镜头从全景慢慢推到两人背影（和 2-拨开阴霾 是同一个镜头，画法在 场/2-雷雨/画面.tsx）。
// 帧数、场窗口、原声和音效 cue 都从 分镜 推（雨声、两声雷是歌上的声音，声音/跨段音效.ts 切出这一段的那截），增益在场参数，段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片第6到7句.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';
import { clipToSegment, type SongSound } from '../../声音/跨段音效.ts';
import { nearThunder, rainSounds, thunder } from '../../场/2-雷雨/声音.ts';

const segKey = '2-雷雨';
const clock = segClock(segKey);
const toCue = (cue: SongSound) => {
  const c = clipToSegment(clock.sceneWindow, cue);
  if (!c) throw new Error(`${cue.名} 不在 ${segKey} 的窗口里`);
  return c;
};

export default defineSeg({
  场: '2-雷雨',
  秒: clock.秒,
  宽: aspect.宽,
  高: aspect.高,
  地形: [],
  sceneWindow: clock.sceneWindow,
  声音: [{ ...clock.origTrack, 资产: '配乐/把回忆拼好给你-无男声DJ', 名: '原声', 增益: mainCutOriginalGain }, toCue(thunder), toCue(nearThunder), ...rainSounds.map((cue) => clipToSegment(clock.sceneWindow, cue)).filter((c) => c !== null)],
});
