// 2-03 慢放里绕她转 180 度的那一镜的机位（段内片秒 → 机位），画面.tsx 用，编排-开盘.test.ts 查她不出画、不被血条压、机位不入地。
// 用户 11-11 看八版：「我不是说要镜头环绕吗？这个你压根儿没有环绕，我要环绕 180 度诶」。八版的机位方位 = 她面朝的方向 + 偏角，跟着她转身走，
// 世界里转了约 132 度，可相对她只差 10 度，看着就是没绕。这里改成在世界坐标里绕：方位只看时间、不看她朝哪，背景整个扫过去。
// 他从她脚底下穿过去那一下一甩身（编排-开盘.ts 的 转身，约 0.35 片秒）转过去对着他，这一甩里机位方位不动；甩完镜头从她右后方起、逆时针经她右侧、正面绕到她左前方，
// 世界里 180 度，相对她也是 180 度（从右后到左前），缓起缓停。终点在她左手那一侧，接 2-04（他右前方，同在两人连线她左手这边）不跳轴。
// 方位、半径、高低、焦距都是 Agent 取的，用户没看过。
import type { Cam } from '@engine/core/机位.ts';
import { lerp, smoothstep01 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { beats } from '../../场/1-台地/开盘时刻.ts';
import { toWorldSec } from '../../场/1-台地/开盘拍.ts';
import { yaBoLunPos, yaBoLunFacing, actStart, actEnd, localGroundHeight, altarPoint } from '../../场/1-台地/编排-开盘.ts';

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
  起: beats.liftStart,
  止: 3.6,
  orbit: [1.45, 3.45] as const,
  endRelDeg: 60,
  azimuthDeg: 180,
  radiusList: [4.4, 5.0] as const,
  高: [0.2, -1.9, -1.3] as const,
  lensMm: [18, 24] as const,
};

/** 绕完时（她刹在祭坛上空、朝着他）机位的世界方位（度，x 东为 0、逆时针）；绕之前的方位 = 它 − 方位 */
const endAzimuth = orbitBeat.endRelDeg + yaBoLunFacing(actEnd) + 90;
/** 这一刻机位的世界方位（度） */
export const orbitAzimuth = (s: number) => endAzimuth - orbitBeat.azimuthDeg + orbitBeat.azimuthDeg * smoothstep01((s - orbitBeat.orbit[0]) / (orbitBeat.orbit[1] - orbitBeat.orbit[0]));
/** 这一刻机位在她面朝方向往她左手边偏几度（−180～180）：给测试看相对她转了多少 */
export const orbitRel = (s: number) => ((((orbitAzimuth(s) - yaBoLunFacing(clock(s)) - 90 + 180) % 360) + 360) % 360) - 180;

export const orbitRig = (s: number): Cam => {
  const t = clock(s);
  const orbitCenter = yaBoLunChest(t);
  const angle = (orbitAzimuth(s) * Math.PI) / 180;
  // 开头齐胸、拍得到他从她脚底下冲过去；她往上蹿起来以后机位落到她下方
  const dropT = smoothstep01((s - orbitBeat.起) / 0.45);
  const easedT = smoothstep01((s - orbitBeat.orbit[0]) / (orbitBeat.orbit[1] - orbitBeat.orbit[0]));
  const height = lerp(lerp(orbitBeat.高[0], orbitBeat.高[1], dropT), orbitBeat.高[2], easedT);
  const radius = lerp(orbitBeat.radiusList[0], orbitBeat.radiusList[1], smoothstep01((s - orbitBeat.起) / 0.8));
  const pos: V3 = [orbitCenter[0] + Math.cos(angle) * radius, orbitCenter[1] + Math.sin(angle) * radius, orbitCenter[2] + height];
  // 机位不低于脚下的地 + 0.8 格
  const groundZ = altarPoint[2] + localGroundHeight(pos[0] - altarPoint[0], pos[1] - altarPoint[1]) + 0.8;
  if (pos[2] < groundZ) pos[2] = groundZ;
  // 取景一直对着她胸口上面一点（头顶的晋升之环不碰血条）：她往上蹿得快（0.2 片秒升 4 格），取景往他那边压一点她就顶到血条底下（八版 10.6～10.9 秒）
  return { pos, tgt: [orbitCenter[0], orbitCenter[1], orbitCenter[2] + 0.35], lens: lerp(orbitBeat.lensMm[0], orbitBeat.lensMm[1], easedT) };
};
