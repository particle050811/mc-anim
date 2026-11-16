// 正片第 7 句「你让我学会如何拨开阴霾」：接着 2-雷雨 那个镜头，她站起来两手举向天，镜头往后退、往上抬；脚下展开魔法阵，光柱冲上云、撞亮云底，
// 云一圈一圈散开、撕出蓝天，阳光从洞里照下来铺过炸掉一角的屋子、雨停（画法在 场/2-雷雨/画面.tsx）。
// 帧数、场窗口、原声和音效 cue 都从 分镜 推（雨声接着上一段放到雨停，信标声从「拨」起），增益在场参数，段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片第6到7句.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';
import { clipToSegment } from '../../声音/跨段音效.ts';
import { rainSounds, beaconSound } from '../../场/2-雷雨/声音.ts';

const segKey = '2-拨开阴霾';
const clock = segClock(segKey);
const soundCuts = [beaconSound, ...rainSounds].map((cue) => clipToSegment(clock.sceneWindow, cue)).filter((c) => c !== null);

export default defineSeg({
  scene: '2-雷雨',
  sec: clock.sec,
  width: aspect.width,
  height: aspect.height,
  terrain: [],
  sceneWindow: clock.sceneWindow,
  sound: [{ ...clock.origTrack, asset: '配乐/把回忆拼好给你-无男声DJ', name: '原声', 增益: mainCutOriginalGain }, ...soundCuts],
});
