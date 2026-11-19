// 2-03 慢放里绕她转 180 度的那一镜的机位（段内片秒 → 机位），画面.tsx 用，编排-开盘.test.ts 查她不出画、不被血条压、机位不入地。
// 用户 11-11 看八版：「我不是说要镜头环绕吗？这个你压根儿没有环绕，我要环绕 180 度诶」。八版的机位方位 = 她面朝的方向 + 偏角，跟着她转身走，
// 世界里转了约 132 度，可相对她只差 10 度，看着就是没绕。这里改成在世界坐标里绕：方位只看时间、不看她朝哪，背景整个扫过去。
// 她转身对准史蒂夫后，镜头在世界坐标中反绕 180 度，从右前方看清她向前送的右肘和右掌。第 4 幕从同一机位开始。
// 方位、半径、高低、焦距都是 Agent 取的；只有收尾方位用户 11-19 看过选角样片定了：比原来逆时针多绕 10 度，让聚晶盘在画面里贴近她（-47 → -37）。
import type { Cam } from '@engine/core/机位.ts';
import { lerp, linearstep, smoothstep01 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { beats } from './开盘时刻.ts';
import { actDur, toWorldSec } from './开盘拍.ts';
import { castStart } from './齐放拍.ts';
import { yaBoLunPos, yaBoLunFacing, perform, actStart, actEnd, localGroundHeight, altarPoint } from './编排-开盘.ts';

/** 段内片秒 → 编排的钟（世界秒） */
const clock = (s: number) => actStart + toWorldSec(s);
const yaBoLunChest = (t: number): V3 => {
  const p = yaBoLunPos(t);
  return [p[0], p[1], p[2] + 1.1];
};

/**
 * 起、止：这一镜的片秒（她往上一拉起，到他站起来那一镜之前）；绕：开始绕、绕完（片秒），缓起缓停；
 * 末相对：绕完时机位在她面朝方向往她左手边偏几度（60 = 左前方）；方位：世界里绕多少度（逆时针为正）；
 * 半径：离她胸口几格；高：机位比她胸口高几格（开头齐胸，她拉起来以后在她下方往上看，背景是她身后的地和坡）；镜头：焦距（毫米）
 */
export const orbitBeat = {
  start: beats.liftStart,
  end: actDur,
  orbit: [1.45, actDur] as const,
  endRelDeg: -37,
  azimuthDeg: 180,
  radiusList: [4.4, 3.75] as const,
  height: [0.2, -1.9, -5.15] as const,
  lensMm: [18, 49] as const,
};

/** 绕完时（她刹在祭坛上空、朝着他）机位的世界方位（度，x 东为 0、逆时针）；绕之前的方位 = 它 − 方位 */
const endAzimuth = orbitBeat.endRelDeg + yaBoLunFacing(actEnd) + 90;
/**
 * 这一刻机位的世界方位（度）：1.37 片秒起绕、绕到这一镜末，只绕一次。角速度 ∝ u(1 − u)⁴（u 是这段里的进度），从 0 加速到 u = 1/5 最快、之后一路慢下来（尾巴留长：定杖时镜头还在反着她的杖绕，编排-开盘.test.ts 查）。
 * 用户 11-19「围着他转圈的时候……明显的两段中间好像没有连续」：原来叠了一段提前量，先甩 130 度、2.3 片秒几乎停住（每秒 4 度）、再绕剩下的 50 度
 */
const orbitFrom = 1.37;
export const orbitAzimuth = (s: number) => {
  const u = linearstep(orbitFrom, orbitBeat.orbit[1], s);
  const done = 1 - (1 - u) ** 5 * (1 + 5 * u); // ∫ u(1 − u)⁴ 归一
  return endAzimuth - orbitBeat.azimuthDeg * (1 - done);
};
/** 这一刻机位在她面朝方向往她左手边偏几度（−180～180）：给测试看相对她转了多少 */
export const orbitRel = (s: number) => ((((orbitAzimuth(s) - yaBoLunFacing(clock(s)) - 90 + 180) % 360) + 360) % 360) - 180;

export const orbitRig = (s: number): Cam => {
  const t = clock(s);
  const orbitCenter = yaBoLunChest(t);
  const angle = (orbitAzimuth(s) * Math.PI) / 180;
  // 开头齐胸、拍得到他从她脚底下冲过去；她往上蹿起来以后机位落到她下方
  const dropT = smoothstep01((s - orbitBeat.start) / 0.45);
  const easedT = smoothstep01((s - orbitBeat.orbit[0]) / (orbitBeat.orbit[1] - orbitBeat.orbit[0]));
  const framing = smoothstep01((s - 2.8) / 0.85);
  const height = lerp(lerp(lerp(orbitBeat.height[0], orbitBeat.height[1], dropT), orbitBeat.height[2], easedT), -5.9, framing);
  const radius = lerp(lerp(orbitBeat.radiusList[0], orbitBeat.radiusList[1], easedT), 6.3, framing);
  const pos: V3 = [orbitCenter[0] + Math.cos(angle) * radius, orbitCenter[1] + Math.sin(angle) * radius, orbitCenter[2] + height];
  // 机位不低于脚下的地 + 0.8 格
  const groundZ = altarPoint[2] + localGroundHeight(pos[0] - altarPoint[0], pos[1] - altarPoint[1]) + 0.8;
  if (pos[2] < groundZ) pos[2] = groundZ;
  // 取景一直对着她胸口上面一点（头顶的晋升之环不碰血条）：她往上蹿得快（0.2 片秒升 4 格），取景往他那边压一点她就顶到血条底下（八版 10.6～10.9 秒）
  const tip = perform.杖(t).tip;
  const followTip = 0.58 * easedT;
  return { pos, tgt: [lerp(orbitCenter[0], tip[0], followTip), lerp(orbitCenter[1], tip[1], followTip), orbitCenter[2] + lerp(0.35, -0.38, easedT) - 0.02 * framing], lens: lerp(lerp(orbitBeat.lensMm[0], orbitBeat.lensMm[1], easedT), 65.5, framing) };
};

const castCamera = orbitRig(actDur);
export const releaseRig = (sec: number): Cam => {
  if (sec <= 0) return castCamera;
  const clear = smoothstep01(sec / castStart);
  const recoil = smoothstep01((sec - castStart) / 0.24);
  return { pos: [castCamera.pos[0], castCamera.pos[1], castCamera.pos[2] + 0.3 * clear], tgt: [castCamera.tgt[0], castCamera.tgt[1], castCamera.tgt[2] + 0.10 * clear], lens: castCamera.lens - 2 * clear - 3.8 * recoil };
};
