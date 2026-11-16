// 正片第 1 句「我们都是渺小真实存在」（画面 1.81 起到第 2 句首字 4.95）：接着 2-选择世界 一镜不切，镜头钻进「新的世界」的图标，图标里的旧照片一格一格透掉，
// 露出你第一次进这个世界的那片平原；你朝远处的樱花林走几步，镜头落到你脚下的地面剖面（还是下午），第 2 句（2-第一晚）接着拍。
import { defineSeg } from '@engine/段/段定义.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { segClock } from '../../分镜/正片开场.ts';
import { originalGain } from '../../场/2-选择世界/参数.ts';

const clock = segClock('2-初入');

export default defineSeg({
  // 跨场的段记开头那场（docs/命名.md）：开头还在选择世界界面里，钻进图标才到新世界
  scene: '2-选择世界',
  continuous: true,
  sec: clock.sec,
  width: aspect.width,
  height: aspect.height,
  terrain: [],
  sceneWindow: clock.sceneWindow,
  sound: [{ ...clock.origTrack, asset: '配乐/把回忆拼好给你-无男声DJ', name: '原声', 增益: originalGain }],
});
