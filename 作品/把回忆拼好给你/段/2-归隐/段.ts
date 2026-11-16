// 正片第 14 句「也为你骗自己放下」：她归隐。分屏（左她挂铃、进屋取下合照、传送走；右教学楼下你仰头看纸飘下来），纸和花瓣两边一样地飘，
//   她走以后同一个镜头拉开、47.83 合成门口一整个画面（2-摇铃 接着这个镜头）。
// 帧数、场窗口、原声 cue 从 分镜 推（[第 14 句前导, 合屏到位)），段里不写数字。音效见 场/2-门口/第14句声音.ts，全在本段里放完。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片第13至14句.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';
import { clipToSegment } from '../../声音/跨段音效.ts';
import { line14Sounds } from '../../场/2-门口/第14句声音.ts';

const clock = segClock('2-归隐');
const toCue = (cue: Parameters<typeof clipToSegment>[1]) => {
  const c = clipToSegment(clock.sceneWindow, cue);
  if (!c) throw new Error(`${cue.name} 不在 2-归隐 的窗口里`);
  return c;
};

export default defineSeg({
  scene: '2-门口',
  sec: clock.sec,
  width: aspect.width,
  height: aspect.height,
  terrain: [],
  sceneWindow: clock.sceneWindow,
  // 段在一串歌中间，不淡入、不淡出
  sound: [{ ...clock.origTrack, asset: '配乐/把回忆拼好给你-无男声DJ', name: '原声', 增益: mainCutOriginalGain }, ...line14Sounds.map(toCue)],
});
