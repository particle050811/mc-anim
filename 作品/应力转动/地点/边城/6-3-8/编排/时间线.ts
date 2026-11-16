// 6-3-8、6-3-10 的台词、时刻、段表。编排秒 t：0 = 6-3-8 首帧，原速；切坑以后剧情另加 `skipSec`（见 `storySec`）。
// 段表、台词落点、声音用成片秒 u（全局，6-3-8 首帧 = 0），跳下城墙那一截跳切，成片秒换 t 用 `filmToChoreoSec`。
import { impactTime, impactSegSec, segSpan } from '../../6-3-下坠/时间线.ts';
import { ticksToSurface } from './落水.ts';
import { chaseSpeed } from '../../../古城4x/布局/强者.ts';
import { RAMP_SEC } from '@库/角色/跑步.ts';
import { segFps } from '@engine/段/段定义.ts';

// ---------- 台词 ----------
// 只剩黄叛一句「上次抢劫我们城市的家伙又来了，我们快追！」（用户 10-12 删了别的台词，id 沿用 6-3-8-黄叛-又出现了）。
// 黄叛台词长 = 从开口到说完（配音实测：文件开口 0.03 秒、有声到 3.05 秒），出发、跳下城墙、切坑都跟着它挪
export const lineIds = { huangPanReappears: '6-3-8-黄叛-又出现了' } as const;
export const huangLineSec = 3.02;
// 「我们快追！」在句子里从开口后第几秒说出（配音逗号停顿 2.00～2.54 秒，减掉开口 0.03）
export const chaseCueOffset = 2.51;

// ---------- 时刻（秒，6-3-8 首帧 = 0；原速） ----------
// 6-3-8：开头卫兵身后看坑，卫兵各自放镜、低头（0.45～1.6 秒）；1.5～3.1 秒镜头绕到两人正面；3.25 秒黄叛开口，
// 说到「我们快追」转身挥手；说完一齐出发，两人和卫兵先后从走道内沿跳进墙脚的落水池（掉 28 米原版要 1.45～1.75 秒），
// 跳下镜演到两人都离开走道，硬切落水镜（见下面「跳切」）；刘心忠刚从池沿跳到路上时切到路口的坑（6-3-10）。
// 6-3-10：两人冲过来先后跳进竖井，卫兵随后跑到、在坑口围住停下。
export const cues = (() => {
  const orbitSpan = [1.5, 3.1] as const;
  const huangSpeaks = 3.25;
  const chaseCue = huangSpeaks + chaseCueOffset;
  const huangDone = huangSpeaks + huangLineSec;
  const setOff = huangDone - 0.35; // 卫兵听到「快追」就动，说完前一点已经跑起来
  const liuTakeoff = huangDone - 0.1;
  const huangTakeoff = huangDone + 0.2;
  // 跳下镜演到黄叛跳到最高点（两人都离开了走道），落水镜从刘心忠落水前 0.08 秒起：掉 28 米那一截不演（用户 10-19：「没有必要看从 28 米掉下来的一镜到底的镜头
  // 直接跳下镜头和落水镜头不就好了」）。两人起跳竖直速度 0.42，同 编排/二人.ts。两个切点对到 1/60 秒的输出帧上，机位按它换镜不差半帧（用户 11-15 定：对到 60 帧上，允许差 1/120 秒）
  const onOutputFrame = (s: number) => Math.round(s * segFps) / segFps;
  const jumpCut = onOutputFrame(huangTakeoff + 0.33);
  const splashShot = onOutputFrame(liuTakeoff + ticksToSurface(0.42) / 20 - 0.08);
  const cutToPit = huangTakeoff + 3.18; // 刘心忠上路后 0.18 秒、黄叛在池沿上；卫兵都已落水（落水时刻用 工具/追兵/时刻.ts 核对）
  // 坑口（精英 30、卫兵 20 米/秒）：切过去时刘心忠离起跳点 15 米，0.3 秒全速、`RAMP_SEC` 刹住起跳（见 编排/二人.ts）；黄叛出池晚 0.3 秒、路多 1.7 米，晚 0.35 秒起跳。
  // 卫兵慢、出池又晚，切过去时跑在最前的也在黄叛身后 5 米上下，第一个到坑口就在黄叛起跳后 1.1 秒；之后陆续围上来（卫兵到的先后见 编排/卫兵.ts），到最后一个蹲下看井留 1.85 秒
  const liuEntersShaft = cutToPit + 0.6; // 刘心忠在坑沿起跳（跳进竖井）
  const huangEntersShaft = liuEntersShaft + 0.35;
  const guardsArrive = huangEntersShaft + 1.1;
  const seg10End = guardsArrive + 1.85;
  return { orbit: orbitSpan, huangSpeaks: huangSpeaks, chaseCue: chaseCue, huangDone: huangDone, setOff: setOff, liuTakeoff: liuTakeoff, huangTakeoff: huangTakeoff, jumpCut: jumpCut, splashShot: splashShot, cutToPit: cutToPit, liuEntersShaft: liuEntersShaft, huangEntersShaft: huangEntersShaft, guardsArrive: guardsArrive, seg10End: seg10End };
})();
// 切到坑口时剧情时间往后跳多少秒：切坑那一刻刘心忠刚从池沿跳到环城路上、已跑出 2.9 米，沿路往西到城门大街、再往南到坑沿约 102 米，路上按精英跑速；
// 镜头切过去时他离起跳点还剩 0.3 秒全速 + `RAMP_SEC` 刹到起跳的 9.6 米/秒（编排/二人.ts 的 `pitApproach`），剩下的路跳过不演
export const skipSec = (() => {
  const v = chaseSpeed.elite;
  return Math.round(((102 - 2.9 - (0.3 * v + (RAMP_SEC / 2) * (v + 9.6))) / v) * 10) / 10;
})();
// 剧情时间（秒）：碎块按它走
export const storySec = (t: number) => (t < cues.cutToPit ? t : t + skipSec);
// 6-3-8 首帧在 6-3-6 砸地以后多少秒：6-3-6 末帧往后 0.125 秒（硬切），从 时间线.ts 的段表算
export const afterImpact = segSpan('6-3-6') - impactSegSec + 0.125;
export const fallTime = (t: number) => impactTime() + afterImpact + storySec(t);

// ---------- 跳切 ----------
// 成片秒 u 在 `cues.jumpCut` 以前就是编排秒；从它起接上 `cues.splashShot`，跳过 `fallSkipSec` 秒（同一段里硬切，同 6-4-1 的跳切）
export const fallSkipSec = cues.splashShot - cues.jumpCut;
export const filmToChoreoSec = (u: number) => (u < cues.jumpCut ? u : cues.splashShot + (u - cues.jumpCut));

// ---------- 段表（成片秒） ----------
// 6-3-8 从城墙演到切坑以前（中间跳下镜 → 落水镜硬切），6-3-10 从切坑那一刻起是坑口（硬切）。
// 6-3-10 的起止是切坑、演完那两刻对到最近的输出帧（原来取整到 1/24 秒的格，用户 11-16 定不留 1/24 秒的格；6-追进竖井 段.ts 的声音按它排）
const onOutputFrame = (s: number) => Math.round(s * segFps) / segFps;
export type SegmentName = '6-3-8' | '6-3-10';
const pitShotStart = onOutputFrame(cues.cutToPit);
const pitShotEnd = onOutputFrame(cues.seg10End);
export const segmentTable: Record<SegmentName, { start: number; name: string }> = {
  '6-3-8': { start: 0, name: '二人登场' },
  '6-3-10': { start: pitShotStart - fallSkipSec, name: '追进竖井' },
};
// 6-3-10 末帧（7-收场 接它）的编排秒
export const lastSec = pitShotEnd;

// 台词落点（段内秒，开口那一刻；字幕组和 声音.tsx 都从这里取）。台词轨的落点 = 开口（第一个有声的时刻）
export const lineStartSec = { huangPanReappears: cues.huangSpeaks };
// 点头（`withTalkNod`）用的句子：帧 写段内秒，每秒给 1
export const lineCuesBySegment: Record<SegmentName, { id: string; frame: number }[]> = {
  '6-3-8': [{ id: lineIds.huangPanReappears, frame: lineStartSec.huangPanReappears }],
  '6-3-10': [],
};

// 段内秒 → 编排秒 t
export const toSec = (segment: SegmentName, sec: number) => (segment === '6-3-10' ? pitShotStart + sec : filmToChoreoSec(segmentTable[segment].start + sec));
