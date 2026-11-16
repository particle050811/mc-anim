// 正片第 15 句后半（49.54–52.94），隐世之境你的视角一镜到底：樱花风散开、她回头 → 49.96 对视（封面帧）→ 递蛋糕、驯服、她笑，一路推向她的脸。
// 帧数、场窗口、原声 cue 从 分镜 推；铃声、风声是上一段 2-摇铃 拖过来的尾巴（场/2-门口/第15句声音.ts），推门声从 场/2-隐世之境/重逢声音.ts 来。段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片第15句.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';
import { clipToSegment, type SongSound } from '../../声音/跨段音效.ts';
import { bellSound, windSound } from '../../场/2-门口/第15句声音.ts';
import { doorOpenSound } from '../../场/2-隐世之境/重逢声音.ts';

const clock = segClock('2-重逢');
const toCue = (cue: SongSound) => {
  const c = clipToSegment(clock.sceneWindow, cue);
  if (!c) throw new Error(`${cue.name} 不在 2-重逢 的窗口里`);
  return c;
};

export default defineSeg({
  scene: '2-隐世之境',
  sec: clock.sec,
  width: aspect.width,
  height: aspect.height,
  terrain: [],
  sceneWindow: clock.sceneWindow,
  sound: [{ ...clock.origTrack, asset: '配乐/把回忆拼好给你-无男声DJ', name: '原声', 增益: mainCutOriginalGain }, toCue(bellSound), toCue(windSound), toCue(doorOpenSound)],
});
