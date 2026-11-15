// 场声音：写在场时间线上、跨段放的音效或配乐（上段起、下段接着放，cue 只写一次）。纯模块。
// 定义场时间线({ 声音: [...] }) 把起止解成场时间线的秒；窗口段 按自己的窗口取落在里面的那一截，各段的 cue 首尾相接起来和一口气放完一样
// （同 作品/把回忆拼好给你/声音/跨段音效.ts 的 段里那截，那是老写法的手工版）。
import { segFps, type AssetCue, type PerCellGain } from './段定义.ts';
import type { AudioInfo } from './声音助手.ts';

/** 场声音的放法（时刻用场时间线的事件名或时刻，见 窗口段.ts 的 定义场时间线） */
export type SceneSoundOptions = {
  资产: string;
  /** 片段名；同一条场时间线里不能重名（窗口段 的 不放场声音 按名挑）。默认取 id 最后一截 */
  名?: string;
  /** 目标采样峰值 dBFS、目标积分响度 LUFS、直接给的增益倍数：三选一，都不给 = 原样（同 声音助手.ts 的 放） */
  峰值?: number;
  响度?: number;
  增益?: number;
  /** 文件从第几秒放起 */
  入点秒?: number;
  速率?: number;
  /** 循环：放完从文件头接着放，要给 止 */
  循环?: true;
  /** 整个声音最后几秒线性淡到 0（落在哪段就由哪段的那截带上） */
  fadeOutSec?: number;
  档?: string;
};

/** 解出来的场声音：起秒、止秒是场时间线的秒（止秒不给 = 放到文件完） */
export type ResolvedSceneSound = SceneSoundOptions & { 名: string; startSec: number; endSec?: number };

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** 不量文件就能断定和窗口 [起秒, 止秒) 不沾边（起在窗口后，或给了止秒且止在窗口前）：这种不查声音表，免得每段的表里都记上全场的声音 */
export const definitelyDisjoint = (sceneSound: ResolvedSceneSound, span: { startSec: number; endSec: number }) => sceneSound.startSec >= span.endSec || (sceneSound.endSec !== undefined && sceneSound.endSec <= span.startSec);

/** 场声音在场时间线上止在第几秒：给了止秒取止秒（不循环的还不超过文件完），没给就放到文件完 */
export const sceneSoundTailSec = (sceneSound: ResolvedSceneSound, audioFile: AudioInfo) => {
  const inSec = sceneSound.入点秒 ?? 0;
  const rate = sceneSound.速率 ?? 1;
  if (sceneSound.循环) return sceneSound.endSec!;
  const remainSec = audioFile.时长 - inSec;
  if (!(remainSec > 0)) throw new Error(`场声音「${sceneSound.名}」：入点秒 ${inSec} 已经到了文件尾（${audioFile.时长} 秒）`);
  const playEndSec = sceneSound.startSec + remainSec / rate;
  return sceneSound.endSec === undefined ? playEndSec : Math.min(sceneSound.endSec, playEndSec);
};

/** 场时间线第 T 秒上文件放到第几秒（不循环的不取模；测试和文档用这个当「一口气放完」的标准答案） */
export const sceneSoundPosition = (sceneSound: ResolvedSceneSound, audioFile: AudioInfo, T: number) => {
  const sec = (sceneSound.入点秒 ?? 0) + (T - sceneSound.startSec) * (sceneSound.速率 ?? 1);
  return sceneSound.循环 ? sec % audioFile.时长 : sec;
};

const baseGain = (sceneSound: ResolvedSceneSound, audioFile: AudioInfo): number => {
  const givenCount = [sceneSound.增益, sceneSound.峰值, sceneSound.响度].filter((x) => x !== undefined).length;
  if (givenCount > 1) throw new Error(`场声音「${sceneSound.名}」：峰值、响度、增益只能给一个`);
  if (sceneSound.峰值 !== undefined) {
    if (audioFile.峰值 === undefined) throw new Error(`场声音「${sceneSound.名}」：${sceneSound.资产} 量不出峰值（静音？），直接给 增益`);
    return round6(10 ** ((sceneSound.峰值 - audioFile.峰值) / 20));
  }
  if (sceneSound.响度 !== undefined) {
    if (audioFile.响度 === undefined) throw new Error(`场声音「${sceneSound.名}」：${sceneSound.资产} 没有响度数，按峰值给或直接给 增益`);
    return round6(10 ** ((sceneSound.响度 - audioFile.响度) / 20));
  }
  return sceneSound.增益 ?? 1;
};

/**
 * 这个场声音落在窗口 [起秒, 止秒)（场时间线的秒）里的那几条 cue，秒是段内秒；不沾边给 []。
 * 不循环的一截一条：入点秒 = 原入点 + 已经放过的秒 × 速率，任一时刻的文件位置和一口气放完一样。
 * 循环的：Remotion 的 loop 只绕 [入点, 文件尾]，所以从文件中间接上时拆两条：先放到文件尾，再从文件头起循环。
 * 淡出按整个声音的尾算：尾在本截里就用 淡出秒，尾在后面的段里就写逐格增益（每秒 段格 个值）。
 */
export const sceneSoundSlice = (sceneSound: ResolvedSceneSound, span: { startSec: number; endSec: number }, audioFile: AudioInfo): AssetCue[] => {
  const endSec = sceneSoundTailSec(sceneSound, audioFile);
  const a = Math.max(sceneSound.startSec, span.startSec);
  const b = Math.min(endSec, span.endSec);
  if (b - a <= 1e-9) return [];
  const g = baseGain(sceneSound, audioFile);
  const rate = sceneSound.速率 ?? 1;
  const gainAt = (x: number, y: number): { 增益?: number | PerCellGain; fadeOutSec?: number } => {
    const fadeOutSec = sceneSound.fadeOutSec;
    if (fadeOutSec && y > endSec - fadeOutSec) {
      if (Math.abs(y - endSec) < 1e-9 && endSec - fadeOutSec >= x - 1e-9) return { ...(g !== 1 ? { 增益: g } : {}), fadeOutSec: fadeOutSec };
      const n = Math.floor((y - x) * segFps + 1e-6) + 1;
      return { 增益: { 每秒: segFps, 值: Array.from({ length: n }, (_, i) => round6(g * Math.max(0, Math.min(1, (endSec - (x + i / segFps)) / fadeOutSec)))) } };
    }
    return g !== 1 ? { 增益: g } : {};
  };
  const cue = (x: number, y: number, inSec: number, loop: boolean): AssetCue => ({
    秒: x - span.startSec,
    资产: sceneSound.资产,
    名: sceneSound.名,
    长秒: y - x,
    ...(sceneSound.档 !== undefined ? { 档: sceneSound.档 } : {}),
    ...(inSec > 1e-9 ? { 入点秒: inSec } : {}),
    ...(rate !== 1 ? { 速率: rate } : {}),
    ...(loop ? { 循环: true as const } : {}),
    ...gainAt(x, y),
  });
  const startPos = sceneSoundPosition(sceneSound, audioFile, a);
  if (!sceneSound.循环) return [cue(a, b, startPos, false)];
  // 循环：刚好在文件头（或差不到一个采样）就一条到底
  if (startPos < 1e-6 || audioFile.时长 - startPos < 1e-6) return [cue(a, b, 0, true)];
  const m = Math.min(a + (audioFile.时长 - startPos) / rate, b);
  return b - m > 1e-9 ? [cue(a, m, startPos, false), cue(m, b, 0, true)] : [cue(a, m, startPos, false)];
};
