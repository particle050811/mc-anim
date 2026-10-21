// 一镜到底的镜头：一直跟着扫帚，不切镜头（用户 10-02），画面不横滚、地平线水平。
// 每一帧只有一组构图参数 P（见 镜头构图.ts 的 `Framing`），所有机位都写成 P、在 P 里插值和过渡，再由同一个函数从 P 算出镜头（见 `placeCam`）：
// - 位置：从骑手看镜头在哪个方向、离多远——ln 距离、方位（相对扫帚航向，0 = 正后方，往左为正，锁在航向上，用户 10-07 要视角同步转）、仰角（相对扫帚的俯仰）；
// - 构图：骑手在画面上的位置（x 横向 −0.5～0.5 画宽、y 纵向按画宽归一，同 工具/一镜到底/验收.ts）、ln 焦距、视线往 boss 偏多少；
// - 人在画面上放大多少看的是 ln 距离的变化，所以距离按 ln 插值、追的时候按 ln 距离排速度（见 镜段.ts 的远景）。
// 镜头自己的路（远景刹停、停住看 boss 炸开、追上去；雪怪首领在洞道里沿路线追）写成「位置机位」，换算回 P 再和别的机位接（见 镜段.ts 的远景）。
// 各处 boss 一个镜段（见 镜段.ts），按时间一层层盖、两头渐变（见 `合成`）；关键帧值照审过的机位换算（见 镜头构图.ts 的 `fromLegacy`）。
// 被方块挡住往骑手身上收（`收表`），首帧接 6-1-3 末帧。
import { camSpans, fadeFrames } from './镜段.ts';
import {
  type Vec, add, sub, mul, dot, len, norm, lerp, ss, s5, rad, slerp,
  mixFraming, riderAt, camPosOf, posToFraming, solveView, cruiseFraming, sampleKeys, clampToBore,
} from './镜头构图.ts';
import * as route from './路线.ts';
import pullInData from 'asset:数据/镜头/一镜到底/收表';

export { chaseSpans, camWindows } from './镜段.ts';

export type Cam = { pos: number[]; tgt: number[]; lens: number };

// ---------- 合成：每一帧的 P 和位置 ----------
// 镜段按时间一层层盖：窗口里 P = 前面几层合成的 P 和这一段的 P 按权混（权在窗口头尾 `渐` 帧里五次缓动渐变）。位置机位（远景）按它的权盖在 P 的位置部分上
const composite = (Fg: number) => {
  let framing = { ...cruiseFraming };
  let focus: Vec | null = null;
  let keepInFrame = false;
  let ownPos = 0; // 位置有多少是自己走的机位给的（这一份不夹孔道）
  for (const span of camSpans) {
    if (Fg < span.起 || Fg > span.止) continue;
    // 起飞从第 0 帧起不渐入、降落一直到最后一帧不渐出。渐入（出）用第一个（最后一个）关键帧间隔那么长：
    // 叠在一起的时候两边的关键帧都在动，12 帧换过去焦距一帧变 4%
    const fadeIn = Math.max(fadeFrames, span.Keys[1][0] - span.Keys[0][0]);
    const fadeOut = Math.max(fadeFrames, span.Keys[span.Keys.length - 1][0] - span.Keys[span.Keys.length - 2][0]);
    const segWeight = Math.min(span.名 === '起飞' ? 1 : s5((Fg - span.起) / fadeIn), span.名 === '降落' ? 1 : s5((span.止 - Fg) / fadeOut));
    let spanFraming = sampleKeys(span.Keys, Fg, span.锚);
    const posCamRes = span.位?.(Fg);
    const posWeight = posCamRes ? posCamRes.weight : 0;
    if (posCamRes && posWeight > 0) spanFraming = mixFraming(spanFraming, { ...spanFraming, ...posToFraming(posCamRes.C, Fg) }, posWeight);
    framing = mixFraming(framing, spanFraming, segWeight);
    ownPos = lerp(ownPos, posWeight, segWeight);
    if (span.focus && spanFraming.偏 > 0 && segWeight > 0.5) focus = span.focus();
    if (span.keepInFrame) keepInFrame = true;
  }
  return { P: framing, focus: focus, keepInFrame: keepInFrame, ownPos: ownPos };
};

// 视线往 boss 偏的时候骑手不出画：视线离骑手超过 `软起` 以后按 tanh 软压、越往外越贴近 `保画内角`。巨人照 25°（软起 8°）；
// 别处按焦距取画面竖向半角的八成，软起取它的四成
const limitToFrame = (fw: Vec, toRider: Vec, lens: number, isGiant: boolean) => {
  const maxAngle = isGiant ? rad(25) : Math.atan((0.8 * (9 / 32) * 36) / lens);
  const softStart = isGiant ? rad(8) : 0.4 * maxAngle;
  const θ = Math.acos(Math.min(1, Math.max(-1, dot(fw, toRider))));
  if (θ <= softStart) return fw;
  const k = (softStart + (maxAngle - softStart) * Math.tanh((θ - softStart) / (maxAngle - softStart))) / θ;
  return slerp(toRider, fw, k);
};

// 从 P 摆镜头：位置（自己走的机位已经换算进 P，这里按 P 还原，同一个位置）→ 夹在孔道里 → 视线（骑手落在 (x, y)）→ 往 boss 偏
const placeCam = (Fg: number) => {
  const { P: framing, focus: focus, keepInFrame: keepInFrame, ownPos: ownPos } = composite(Fg);
  const C0 = camPosOf(framing, Fg);
  const camPos = ownPos >= 1 ? C0 : add(C0, mul(sub(clampToBore(C0, Fg, framing.方), C0), 1 - ownPos));
  const rider = riderAt(Fg);
  const lens = Math.exp(framing.焦);
  let fw = solveView(camPos, rider, framing.x, framing.y, lens);
  if (focus && framing.偏 > 0) {
    // boss 跑到骑手的另一边（镜头追的时候从 boss 身边冲过去）就不往它偏：从镜头看 boss 和骑手夹角过 90° 起减、过 120° 为 0，不然视线一帧甩回身后
    const toBoss = norm(sub(focus, camPos));
    const cosAngle = dot(toBoss, norm(sub(rider, camPos)));
    fw = slerp(fw, toBoss, Math.min(1, framing.偏) * s5((cosAngle + 0.5) / 0.5));
    fw = limitToFrame(fw, norm(sub(rider, camPos)), lens, keepInFrame);
  }
  return { pos: camPos, fw, lens, B: rider };
};

// ---------- 收：被方块挡住时往骑手身上收 ----------
// 同游戏第三人称镜头碰到方块就往玩家身上收（用户 10-07）：沿「镜头 → 骑手中心」往里收到不被挡为止，骑手在画面上位置不变只是变大；
// 收多少沿时间先取 ±`收宽` 帧里最多的、再三角窗抹平。挡不挡按真方块算（`收表`.json，工具/一镜到底/收表.ts 量好写进来；镜头路线一改要重跑）
const pullInHalfWin = 6;
export const camBeforePullIn = (Fg: number) => {
  const placed = placeCam(Fg);
  return { pos: placed.pos, rider: placed.B, pullInStartDist: 20 };
};
const pullInTable = (() => {
  const frameCount = route.总帧数;
  const raw = new Float64Array(frameCount).fill(1);
  for (const [frame, k] of pullInData.收 as [number, number][]) if (frame < frameCount) raw[frame] = k;
  const lo = raw.map((_, frame) => {
    let minK = 1;
    for (let offset = -pullInHalfWin; offset <= pullInHalfWin; offset++) minK = Math.min(minK, raw[Math.min(frameCount - 1, Math.max(0, frame + offset))]);
    return minK;
  });
  return lo.map((_, frame) => {
    let sum = 0;
    let weightSum = 0;
    for (let offset = -pullInHalfWin; offset <= pullInHalfWin; offset++) {
      const tapWeight = pullInHalfWin + 1 - Math.abs(offset);
      sum += lo[Math.min(frameCount - 1, Math.max(0, frame + offset))] * tapWeight;
      weightSum += tapWeight;
    }
    return sum / weightSum;
  });
})();

// 镜头离树顶近不自动顶高（用户 10-08 要报 warning 不擅自改路线），由 工具/一镜到底/诊断.ts 列出来
export const cameraAt = (Fg: number): Cam => {
  const placed = placeCam(Fg);
  let pos = placed.pos;
  // `收表` 只量了离骑手 20 米以内的帧，抹平的窗口会把收带到旁边的帧上：远景刹停那几帧镜头退到几十米外，再收就把停着的镜头往骑手拽。20～30 米之间渐到不收
  const dist = len(sub(pos, placed.B));
  const k = lerp(1, pullInTable[Math.min(pullInTable.length - 1, Math.max(0, Math.round(Fg)))], 1 - ss((dist - 20) / 10));
  if (k < 1) pos = add(placed.B, mul(sub(pos, placed.B), k));
  return { pos, tgt: add(pos, mul(placed.fw, 10)), lens: placed.lens };
};
