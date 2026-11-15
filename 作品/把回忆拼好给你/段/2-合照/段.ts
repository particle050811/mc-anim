// 正片 15 尾（52.94–54.65）：硬切到侧面合照、她靠到你肩上，「咔哒」那一帧切到片尾的闪白。画法在 场/2-隐世之境/合照.tsx。
// 帧数、场窗口、原声 cue 从 分镜 推；咔哒从 场/2-隐世之境/合照声音.ts 来（放过段尾的那截给片尾）。第 15 句铃声、风声、推门声的尾巴都在 52.94 以前放完了。段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片15尾.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';
import { clipToSegment } from '../../声音/跨段音效.ts';
import { groupPhotoClickSound } from '../../场/2-隐世之境/合照声音.ts';

const clock = segClock('2-合照');
const clickClip = clipToSegment(clock.sceneWindow, groupPhotoClickSound);
if (!clickClip) throw new Error('咔哒不在 2-合照 的窗口里');

export default defineSeg({
  场: '2-隐世之境',
  秒: clock.秒,
  宽: aspect.宽,
  高: aspect.高,
  地形: [],
  sceneWindow: clock.sceneWindow,
  声音: [{ ...clock.origTrack, 资产: '配乐/把回忆拼好给你-无男声DJ', 名: '原声', 增益: mainCutOriginalGain }, clickClip],
});
