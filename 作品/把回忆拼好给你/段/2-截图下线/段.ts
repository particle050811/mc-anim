// 正片第 11 句「只停在绽放一刹那」（34.80–38.43）：最后一发升空、最大的一发炸开，「绽」咔哒定格成拍立得，世界碎掉，你下线、照片缩成褪色的方形图标。
// 帧数、场窗口、原声 cue 从 分镜 推；音效从 场/2-门口/门口之夜声音.ts 切出落在本段的那几截（第三发的闪烁噼啪声从上一段接过来）。段里不写数字。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片第9至11句.ts';
import { mainCutOriginalGain } from '../../配乐/正片.ts';
import { segSounds } from '../../场/2-门口/门口之夜声音.ts';

const clock = segClock('2-截图下线');

export default defineSeg({
  scene: '2-门口',
  sec: clock.sec,
  width: aspect.width,
  height: aspect.height,
  terrain: [],
  sceneWindow: clock.sceneWindow,
  sound: [{ ...clock.origTrack, asset: '配乐/把回忆拼好给你-无男声DJ', name: '原声', 增益: mainCutOriginalGain }, ...segSounds(clock.sceneWindow)],
});
