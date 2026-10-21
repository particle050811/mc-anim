// 6-3-8、6-3-10 的台词、时刻、段表。编排秒 t：0 = 6-3-8 首帧，原速；切坑以后剧情另加 `skipSec`（见 `storySec`）。
// 段表、台词落点、声音用成片帧（全局，6-3-8 首帧 = 0），跳下城墙那一截跳切，成片帧换 t 用 `frameToSec`。
import { 撞击时刻, 撞击段内帧, 段帧数 as 段帧数6 } from '../../6-3-下坠/时间线.ts';
import { ticksToSurface } from './落水.ts';
import { chaseSpeed } from '../../../古城4x/布局/强者.ts';
import { RAMP_SEC } from '../../../../角色/跑步.ts';

export const FPS = 24;

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
  // 直接跳下镜头和落水镜头不就好了」）。两人起跳竖直速度 0.42，同 编排/二人.ts。两个切点取整到帧，机位按它换镜不差半帧
  const onFrame = (s: number) => Math.round(s * FPS) / FPS;
  const jumpCut = onFrame(huangTakeoff + 0.33);
  const splashShot = onFrame(liuTakeoff + ticksToSurface(0.42) / 20 - 0.08);
  const cutToPit = huangTakeoff + 3.18; // 刘心忠上路后 0.18 秒、黄叛在池沿上；卫兵都已落水（落水时刻用 工具/追兵/时刻.ts 核对）
  // 坑口（精英 30、卫兵 20 米/秒）：切过去时刘心忠离起跳点 15 米，0.3 秒全速、`RAMP_SEC` 刹住起跳（见 编排/二人.ts）；黄叛出池晚 0.3 秒、路多 1.7 米，晚 0.35 秒起跳。
  // 卫兵慢、出池又晚，切过去时跑在最前的也在黄叛身后 5 米上下，第一个到坑口就在黄叛起跳后 1.1 秒；之后陆续围上来（卫兵到的先后见 编排/卫兵.ts），到最后一个蹲下看井留 1.85 秒
  const liuEntersShaft = cutToPit + 0.6; // 刘心忠在坑沿起跳（跳进竖井）
  const huangEntersShaft = liuEntersShaft + 0.35;
  const guardsArrive = huangEntersShaft + 1.1;
  const seg10End = guardsArrive + 1.85;
  return { 绕: orbitSpan, 黄开口: huangSpeaks, 快追: chaseCue, 黄完: huangDone, 出发: setOff, 刘起跳: liuTakeoff, 黄起跳: huangTakeoff, 跳切: jumpCut, 落水镜: splashShot, 切坑: cutToPit, 刘入井: liuEntersShaft, 黄入井: huangEntersShaft, 卫兵到: guardsArrive, 段10末: seg10End };
})();
// 切到坑口时剧情时间往后跳多少秒：切坑那一刻刘心忠刚从池沿跳到环城路上、已跑出 2.9 米，沿路往西到城门大街、再往南到坑沿约 102 米，路上按精英跑速；
// 镜头切过去时他离起跳点还剩 0.3 秒全速 + `RAMP_SEC` 刹到起跳的 9.6 米/秒（编排/二人.ts 的 `pitApproach`），剩下的路跳过不演
export const skipSec = (() => {
  const v = chaseSpeed.精英;
  return Math.round(((102 - 2.9 - (0.3 * v + (RAMP_SEC / 2) * (v + 9.6))) / v) * 10) / 10;
})();
// 剧情时间（秒）：碎块按它走
export const storySec = (t: number) => (t < cues.切坑 ? t : t + skipSec);
// 6-3-8 首帧在 6-3-6 砸地以后多少秒：6-3-6 末帧往后 0.125 秒（硬切），从 时间线.ts 的段表算
export const afterImpact = (段帧数6('6-3-6') - 1 - 撞击段内帧) / 24 + 0.125;
export const fallTime = (t: number) => 撞击时刻() + afterImpact + storySec(t);

// ---------- 跳切 ----------
// 成片帧 H（全局）在 `jumpCutFrame` 以前就是编排帧；从它起跳过 `fallSkipFrames` 帧（同一段里硬切，同 6-4-1 的跳切）
const toFrame = (s: number) => Math.round(s * FPS);
export const jumpCutFrame = toFrame(cues.跳切);
export const fallSkipFrames = toFrame(cues.落水镜) - jumpCutFrame;
export const frameToSec = (H: number) => (H < jumpCutFrame ? H : H + fallSkipFrames) / FPS;
// 编排帧 → 成片帧；落在跳掉那截里的返回 undefined
export const cutFrameOf = (F: number) => (F < jumpCutFrame ? F : F >= jumpCutFrame + fallSkipFrames ? F - fallSkipFrames : undefined);

// ---------- 段表（成片帧，含两头） ----------
// 6-3-8 从城墙演到切坑前一帧（中间跳下镜 → 落水镜硬切），6-3-10 从切坑那一帧起是坑口（硬切，两段不共用帧）
export type SegmentName = '6-3-8' | '6-3-10';
export const cutToPitFrame = toFrame(cues.切坑) - fallSkipFrames;
export const segmentTable: Record<SegmentName, { 起: number; 止: number; 名: string }> = {
  '6-3-8': { 起: 0, 止: cutToPitFrame - 1, 名: '二人登场' },
  '6-3-10': { 起: cutToPitFrame, 止: toFrame(cues.段10末) - fallSkipFrames, 名: '追进竖井' },
};
export const segmentFrames = (segment: SegmentName) => segmentTable[segment].止 - segmentTable[segment].起 + 1;
export const lastFrame = segmentTable['6-3-10'].止;
export const lastSec = frameToSec(lastFrame);

// 台词落点（段内帧，开口那一帧；字幕组和 声音.tsx 都从这里取）。台词轨的帧 = 开口（第一个有声的时刻）
export const lineStartFrame = { huangPanReappears: toFrame(cues.黄开口) - segmentTable['6-3-8'].起 };
export const lineCuesBySegment: Record<SegmentName, { id: string; 帧: number }[]> = {
  '6-3-8': [{ id: lineIds.huangPanReappears, 帧: lineStartFrame.huangPanReappears }],
  '6-3-10': [],
};

// 段内帧 → 编排秒 t
export const toSec = (segment: SegmentName, f: number) => frameToSec(segmentTable[segment].起 + f);
