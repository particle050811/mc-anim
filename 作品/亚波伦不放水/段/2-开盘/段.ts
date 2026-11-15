// 第 2 幕 偷袭（用户 11-11 重排）：史蒂夫拿断曜流光潜行挥剑冲两次，第一次她瞬移走，第二次她往上一拉、他从她脚底下冲过去；
// 她拉升里转身、伸杖、杖尖张盘，慢放、镜头绕着她转，停在祭坛上空 12 格、盘张开、杖指着他。窗口、声音 cue。纯模块。
// 声音的时刻按世界秒排（场/1-台地/开盘拍.ts、开盘时刻.ts），放的时候换成片秒（慢放里的声音落在慢下来的画面上，本身不放慢，只有拉升那阵风压低了放）。
// 响度三档（同 声音表.md 6.1 节）：主要（冲刺、瞬移、张盘）峰值 −10 dBFS，次要（脚步、风、瞬移前兆）−18 dBFS。
// 一个事件有几个文件的挑哪个、多响、拉升那阵风放慢多少都是 Agent 取的，用户没听过。
import { windowSeg } from '@engine/段/窗口段.ts';
import { realNetherPack } from '../../地点/真下界位置.ts';
import { valetteinDash, type DashTrail } from '../../物品/断曜流光冲刺.ts';
import { firstDash, secondDash, beats, toClipSec } from '../../场/1-台地/开盘时刻.ts';
import timeline from '../../场/1-台地/时间线.ts';
import soundTable from './声音表.生成.ts';

const mainPeakDb = -10;
const peakDb = -18;

/** 冲出去以后在地上滑的脚步：照原版 Entity.move，在地上的每一刻 moveDist 加 位移 × 0.6，过了 nextStep（取整 + 1）就响一声（一刻最多一声） */
const slideSteps = (startSec: number, track: DashTrail): number[] => {
  const stepTimes: number[] = [];
  let [walked, nextStep] = [0, 1];
  for (let k = 1; k < track.点.length; k++) {
    if (!track.onGround[k]) continue;
    const [a, b] = [track.点[k - 1]!, track.点[k]!];
    walked += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 0.6;
    if (walked > nextStep) {
      stepTimes.push(startSec + k / 20);
      nextStep = Math.floor(walked) + 1;
    }
  }
  return stepTimes;
};

export default windowSeg(timeline, {
  起: '召唤完',
  止: '开盘完',
  地形: [realNetherPack],
  soundTable,
  声音: ({ 放: play }) => {
    const sounds: ReturnType<typeof play>[] = [];
    /** 世界秒放一个声音 */
    const playAt = (asset: string, beatTime: number, options: Parameters<typeof play>[2]) => sounds.push(play(asset, toClipSec(beatTime), options));
    // 断曜流光冲刺：挥那一下放 TRIDENT_RIPTIDE_1，音高 1.3（游戏里就这一个声音，物品不放别的）
    for (const [i, sec] of [beats.dashFirstSec, beats.dashSecondSec].entries()) playAt(valetteinDash.sound, sec, { 峰值: mainPeakDb, 速率: valetteinDash.音高, 名: `冲刺${i + 1}` });
    for (const [i, [startSec, track]] of ([[beats.dashFirstSec, firstDash], [beats.dashSecondSec, secondDash]] as const).entries())
      for (const [j, sec] of slideSteps(startSec, track).entries()) playAt(`音效/block.stone.step.${((i * 3 + j) % 6) + 1}`, sec, { 峰值: peakDb, 名: `滑步${i + 1}-${j + 1}` });
    // 她：从祭坛一蹬飞出来、瞬移出来那一冲带一阵风；往上一拉那阵风落在慢放里，压低放（Agent 取的）
    playAt('音效/诡厄巫法/goety.wind.1', beats.takeoff, { 峰值: peakDb, 名: '飞出来' });
    playAt('音效/诡厄巫法/goety.wind.3', beats.移, { 峰值: peakDb, 名: '瞬移出来' });
    playAt('音效/诡厄巫法/goety.wind.2', beats.dashSecondSec, { 峰值: peakDb, 速率: 0.7, 名: '拉升' });
    // 瞬移：开始冒烟时前兆，挪过去那一下传送声
    playAt('音效/诡厄巫法/goety.apostle_pre_teleport', beats.smokeStart, { 峰值: peakDb, 名: '瞬移前兆' });
    playAt('音效/诡厄巫法/goety.apostle_teleport.1', beats.移, { 峰值: mainPeakDb, 名: '瞬移' });
    // 张盘（11-11 起又回到第 2 幕：她拉升里张开，用户「飞行的时候伸出法杖 圆环缓缓张开」）
    playAt('音效/诡厄巫法/goety.apostle_prepare_spell.1', beats.openWheelSec, { 峰值: mainPeakDb, 名: '张盘' });
    return sounds;
  },
});
