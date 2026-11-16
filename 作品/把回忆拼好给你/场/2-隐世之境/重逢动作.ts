// 第 15 句隐世之境这一镜随时间走的几样（纯函数，重逢.tsx 画、测试核）：她回头转到哪、她笑到哪、机位、接过来的聊天行淡到哪、台词气泡弹到哪。
// 秒都是歌上的秒；时刻取 分镜 的 正片事件，数取 重逢参数.ts。
import { fps, oneFrameSec } from '../../分镜/时间.ts';
import { events as lyricEvents } from '../../分镜/歌词.ts';
import { events as mainCutLine15Events } from '../../分镜/正片第15句.ts';
import { lineBubble, lookBack, eyeContactShot, pushShot, laugh, chatLine } from './重逢参数.ts';
import { rad, clamp01 } from '@engine/core/数学.ts';

const mainCutEvents = { ...lyricEvents, ...mainCutLine15Events };

type Vec3 = [number, number, number];
const events = mainCutEvents;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** 对视那一帧画的是哪一秒（帧号取整以后）：回头在这一刻到位，这一帧的机位、她和封面帧一样 */
export const eyeContactFrameSec = events.reunionGaze.frame / fps;
const segTailSec = events.cutToTail.frame / fps;
// 回头、风散开都取帧号取整以后的秒：这一拍落在段头那一帧上，段头那一帧要正好是 0（同 2-摇铃 末帧接得上）
const turnBackSec = events.turnBack.frame / fps;
const windDisperseSec = events.windClears.frame / fps;

/** 她回头转到哪（0～1，缓过的）：身子从回头（风散开那一拍）到对视那一帧转完，头先转、头转秒 里转完 */
export const turnBackProgress = (sec: number) => ({
  bodyTurn: smoothstep(clamp01((sec - turnBackSec) / (eyeContactFrameSec - turnBackSec))),
  头: smoothstep(clamp01((sec - turnBackSec) / lookBack.headTurnSec)),
});

/** 她的头歪到哪（0～1，缓过的）：第15句笑 起 渐秒 里歪到位 */
export const smileProgress = (sec: number) => smoothstep(clamp01((sec - events.reunionSmile.sec) / laugh.rampSec));
/** 这一刻她笑着没有（表情、闭眼一下换上）：硬切落在 第15句笑 取整后那一帧上，同台词气泡、爱心（60 fps 时那一帧比 第15句笑.秒 早 7 毫秒） */
export const hasLaughed = (sec: number) => sec >= events.reunionSmile.frame / fps;

const halfTan = (angleDeg: number) => Math.tan(rad(angleDeg) / 2);
const angleFromHalfTan = (halfTan: number) => (2 * Math.atan(halfTan) * 180) / Math.PI;

/** 推镜的视角：对视那一帧以前按同一个速度收（视角一半的正切按指数收），对视那一帧正好是 对视镜.视角；
 *  对视以后在对数半正切上做三次埃尔米特插值：起点速度同对视以前（不顿），越收越慢，段尾那一刻是 推镜.末视角、速度 0（见 重逢参数.ts 的 推镜） */
export const pushFov = (sec: number) => {
  const u = (sec - eyeContactFrameSec) / (segTailSec - eyeContactFrameSec);
  if (u === 0) return eyeContactShot.fov;
  if (u < 0) return angleFromHalfTan(halfTan(eyeContactShot.fov) * (halfTan(pushShot.origSpeedEndFov) / halfTan(eyeContactShot.fov)) ** u);
  const v = Math.min(u, 1);
  const [L0, L1] = [Math.log(halfTan(eyeContactShot.fov)), Math.log(halfTan(pushShot.finalFov))];
  const logRatio = Math.log(halfTan(pushShot.origSpeedEndFov) / halfTan(eyeContactShot.fov));
  const L = (2 * v ** 3 - 3 * v ** 2 + 1) * L0 + (v ** 3 - 2 * v ** 2 + v) * logRatio + (-2 * v ** 3 + 3 * v ** 2) * L1;
  return angleFromHalfTan(Math.exp(L));
};

/** 这一刻的机位：眼睛不动（对视镜.脚 + 原版眼高 1.62）；看点对视那一帧以前是封面帧的，之后缓缓挪到 推镜.看（段尾到）；视角 推镜视角 */
export const reunionRig = (sec: number) => {
  const k = smoothstep(clamp01((sec - eyeContactFrameSec) / (segTailSec - eyeContactFrameSec)));
  const eye: Vec3 = [eyeContactShot.feet[0], eyeContactShot.feet[1], eyeContactShot.feet[2] + 1.62];
  const lookAt = eyeContactShot.看.map((v, i) => v + (pushShot.看[i]! - v) * k) as Vec3;
  return { kind: '透视' as const, 眼: eye, 看: lookAt, fov: pushFov(sec) };
};

/** 接过来的「Steve加入了游戏」这一刻多不透明（1 = 同 2-摇铃 末帧，0 = 不画）：风散开那一拍是 1，淡秒 里缓到 0；不接过来就一直是 0 */
export const chatLineOpacity = (sec: number) => (chatLine.handedOver ? 1 - smoothstep(clamp01((sec - windDisperseSec) / chatLine.fadeSec)) : 0);

/** 台词气泡这一帧弹到哪（库/界面/女仆气泡.tsx 的 弹出：0 = 不画，1 = 原大）：第15句台词 那一帧起 啵秒 里一级级弹到原大，之后一直是 1（2-重逢 里不收，收在 2-合照）。
 *  起那一帧已经走了一帧 */
export const linePop = (frame: number) => (frame < events.speechBubbleIn.frame ? 0 : clamp01(((frame - events.speechBubbleIn.frame) / fps + oneFrameSec) / lineBubble.popSec));
