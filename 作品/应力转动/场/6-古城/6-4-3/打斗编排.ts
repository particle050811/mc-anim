// 6-4-3b、6-4-3c 的正式演法（用户 10-17 嫌打斗僵硬，对照《设身处地10》改）：剧情、箭和人的物理时刻都同 时间线.ts 的主方案，只换演法。
// 主方案（段.tsx 的跟拍备选、6-4-3关键帧 还在用）的问题：刀在镜头从跟拍挪到侧面那 0.9 秒里挥完，镜头停稳时刀已到正前，之后 1/500～1/80 慢放 2.5 秒，招架闪光（寿命 4 刻）跟着定住，读成卡帧。
// 这里改成「蓄 → 斩 → 停 → 收」：
// - 时钟：跟拍 1/2（用户 10-18 定：原速「太快了 改成 1/2 倍速」，整个画面一起慢）；刀甩出那一刻硬切到李樱（用户 10-18：要直接挥出，不看抽刀），挥刀 1/6，弹开定住（打击停顿，lib/anim.ts 的 `HIT_STOP_FRAMES`；弹开慢动作是用户 10-10 要的），
//   挥完的余势 1/16，然后 0.04 剧情秒里回到原速；
// - 人：听到「哄」压低重心、往后拧着蓄力，刀甩出时收回（编排/李樱.ts 的 李樱演法）；
// - 镜头：跟拍一直在箭的右手边（北）贴着侧拍往左看（用户 10-18）；切到南侧对着李樱拍挥刀，一直慢推，弹开不震屏（用户 10-18 嫌冲击镜头不好，全删）。
//   用户 10-18 删掉了刹车、等他直身转身（「还等他转身干嘛」）和挥完抬头看那两截：6-4-3b 挥完就完，6-4-3c 从切黄叛（C2）起，中间跳过的 0.3 秒不演；
//   用户 10-18 定：删掉意义不明的运镜，6-4-3c 只留黄叛愣住（C2），C3 李樱身后慢推那一镜不演，接 6-4-4。
import { exception } from '@engine/core/例外.ts';
import { HIT_STOP_FRAMES } from '../../../默认.ts';
import type { V3 } from '@engine/model/parts.tsx';
import * as choreo from './编排.ts';
import { sideCamPos, sideTarget } from './编排/机位.ts';
import { add, cross, norm } from './编排/公用.ts';
import * as geom from './几何.ts';
import { buildTimeline, frameFractional as mainFrameFractional, cuts, cutFrames as mainCutFrames } from './时间线.ts';
import { lerpV, smoothstep01 } from '@engine/core/数学.ts';
import type { Cam } from '@engine/core/机位.ts';

// 6-1-2 居合关键帧 → 剧情秒（同 编排/李樱.ts 的 OLD）
const iaiSec = (k: number) => (k <= 104 ? geom.drawStart + ((k - 98) / 6) * (geom.swingTime - geom.drawStart) : geom.swingTime + ((k - 104) / 4) * 0.03);
// 定在弹开后 0.4 毫秒：招架闪光（按主方案弹开帧的剧情秒起算）刚亮出来，箭刚被挑开 0.4 米
const pauseTime = geom.deflect + 0.0004;
const momentumEnd = iaiSec(108);
const returnSpeedTime = momentumEnd + 0.04;
// 切到李樱：刀甩出（关键帧 102.2，这时早已转过身、刀拔到一半），箭还在十几米外，两三帧后撞上刀
const cutToLiYing = iaiSec(102.2);
// 挥完、开始抬头（编排/李樱.ts 的 lookUpAt）之前收尾
const bEnd = geom.deflect + 0.1;
const followClock = 1 / 2;
export const tl = buildTimeline(followClock, {
  followAfter: exception(
    '不放慢',
    [
      [cutToLiYing, followClock],
      [cutToLiYing + 1e-6, 1 / 6],
      [geom.deflect, 1 / 6],
      [geom.deflect + 0.003, 1 / 16, true],
      [momentumEnd, 1 / 16],
      [returnSpeedTime, 1, true],
    ],
    { 段: '6-挡箭', 原因: '用户 10-10 点名要弹开慢动作' },
  ),
  pause: { storySec: pauseTime },
});
const startFrame = tl.segTable['6-4-3b'].起;
const cutStartFrame = tl.帧(cuts.C2);
export const deflectArrowFrames = tl.帧(bEnd) - startFrame;
export const flickArrowFrames = tl.帧(cuts.C3) - cutStartFrame;
// 给 工具/机位核对/导出.ts：段内第 0 帧在这条时间线上的全局帧；全局帧 → 主方案时间线上（带小数）的帧
export const segStartFrame = { '6-4-3b': startFrame, '6-4-3c': cutStartFrame };
export const mainPlanFrame = (f: number) => mainFrameFractional(tl.storyTime(f));

export const liying = choreo.makeLiying({ windup: true });
// 镜头（用户 10-18：一直在箭右侧往左看、贴近，箭越快视角拉得越广，同一镜到底飞行巡航换广角）：
// 跟拍在箭右 1.5 米、上 0.6 米（2 米以外在箭路 192～196 米处撞墙，工具/挡箭/机位核对.py --跟拍 每 0.5 米核过），看点在箭前 1 米，箭在画面偏左、往右飞；
// 焦距按画面上的箭速（米/画面秒）从 22mm 广到 12mm，同时镜头往后落 1 米。
// 切到李樱用主方案的侧面机位（弹开点正南，往人身上挪近 55%、16mm），之后一直慢推到回原速；箭从画面右边飞进来。
// 挡箭不放北侧：李樱北边、东边是台阶柱和兵营东墙，北侧机位（机位核对.py --搜 搜的几处，静帧比过）都只拍到墙后面他一个头
const cutFrame = tl.frameFractional(cutToLiYing);
const push1 = tl.frameFractional(returnSpeedTime);
const stopFrame = tl.帧(pauseTime);
const arrowRight: V3 = norm(cross(geom.incomingDir, [0, 0, 1]));
const arrowUp: V3 = norm(cross(arrowRight, geom.incomingDir));
// 画面上的箭速 → 0（慢）～1（快）：8 米/秒（接 6-4-3a 风道里的 1/120）起，167 米/秒以上算满
const speedWeight = (f: number) => {
  const t = tl.storyTime(f);
  const screenSpeed = geom.arrowSpeed(Math.max(0, geom.incomingArrowDist(t - geom.shootTime))) * tl.clock(t);
  return smoothstep01(Math.log(Math.max(1, screenSpeed) / 8) / Math.log(167 / 8));
};
const followPose = (dist: number, speed: number): Cam => {
  const arrowPos = add(geom.nockPoint, geom.incomingDir, dist);
  const pos = add(add(add(arrowPos, arrowRight, 1.5), arrowUp, 0.6), geom.incomingDir, -speed);
  return { pos, tgt: add(arrowPos, geom.incomingDir, 1), lens: Math.exp(Math.log(22) + (Math.log(12) - Math.log(22)) * speed) };
};
const arrowDistAt = (f: number) => Math.max(0, geom.incomingArrowDist(tl.storyTime(f) - geom.shootTime));
export const cameraAt = (f: number): Cam => {
  const t = tl.storyTime(f);
  // 主方案按整帧切机位（主切帧），这条时间线切在剧情时间上：剧情时间过了切点、换到主方案还差不到一帧的，算到切点那一帧，不然 6-4-3c 第 0 帧还是上一个机位
  if (t >= cuts.C2) return choreo.camera(Math.max(mainFrameFractional(t), mainCutFrames.C2, t >= cuts.C3 ? mainCutFrames.C3 : 0));
  if (t < cutToLiYing) return followPose(arrowDistAt(f), speedWeight(f));
  const push = smoothstep01((f - cutFrame) / (push1 - cutFrame));
  return { pos: lerpV(sideCamPos, sideTarget, 0.55 + 0.12 * push), tgt: sideTarget, lens: 16 + push };
};

// 特效按画面时间（用户 10-17：格挡特效存在时间太长）：招架闪光在定住的那几帧停在第一帧，之后按画面时间放完寿命 4 刻（0.2 秒），不跟慢放拉长；
// 刀光拖尾留的长度也按画面时间算成 0.15 秒（剧情秒 = 0.15 × 时钟），挥完以后按余势的时钟定住长度、0.2 秒画面时间淡掉，免得时钟回到原速时拖尾又往回长
export const fxAt = (f: number) => {
  const t = tl.storyTime(f);
  const sinceStop = f - stopFrame;
  return {
    parrySec: sinceStop < 0 ? -1 : Math.max(0, sinceStop - HIT_STOP_FRAMES) / tl.FPS,
    trailVisibleSec: 0.15 * (t < momentumEnd ? tl.clock(t) : 1 / 16),
    trailFadeSec: 0.2 / 16,
    exactParry: true,
  };
};
