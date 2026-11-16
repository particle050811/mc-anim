// 正片第 14 句末到第 15 句开头（合屏到位 47.83 – 风散开 49.54），门这个机位一个镜头（接 2-归隐 合屏拉开的那个镜头）：你上线、摇响告示牌上的寻风之铃，樱花风卷到盖满画面转场。
// 帧数、场窗口、原声 cue 从 分镜 推；铃声、风声从 场/2-门口/第15句声音.ts 切出落在本段的那一截（风声拖进下一段 2-重逢）。段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片第15句.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';
import { clipToSegment } from '../../声音/跨段音效.ts';
import { bellSound, windSound } from '../../场/2-门口/第15句声音.ts';

const clock = segClock('2-摇铃');
const toCue = (cue: Parameters<typeof clipToSegment>[1]) => {
  const c = clipToSegment(clock.sceneWindow, cue);
  if (!c) throw new Error(`${cue.name} 不在 2-摇铃 的窗口里`);
  return c;
};

export default defineSeg({
  scene: '2-门口',
  sec: clock.sec,
  width: aspect.width,
  height: aspect.height,
  terrain: [],
  sceneWindow: clock.sceneWindow,
  sound: [{ ...clock.origTrack, asset: '配乐/把回忆拼好给你-无男声DJ', name: '原声', 增益: mainCutOriginalGain }, toCue(bellSound), toCue(windSound)],
});
