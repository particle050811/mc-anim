// cue 助手：段.ts 里写声音只写一次 放(资产, 秒, 目标) / 说(台词, 秒)，时长、峰值从本段的 声音表.生成.ts 取（anim cues 生成），不手填。纯模块。
// 声音表 是按段生成的：一段只依赖自己用到的那几个声音的数，加一个音效不让别的段过期（不像一张全作品的大表）。
// 生成时 anim 先在「收集」模式下执行 段.ts：表里还没有的资产不报错，记下来、先给占位 cue，量完写进表再正常执行一遍（pipeline/段框架/生成.ts）。
import type { LineCue, AssetCue, PerCellGain } from './段定义.ts';
import { applyEnvelopes, checkEnvelope, type GainEnvelope } from './音量包络.ts';

/** 一个音频文件的数（资产锁里有就取锁里的，没有就 anim cues 现量）：时长秒、采样峰值 dBFS、积分响度 LUFS */
export type AudioInfo = { duration: number; peakDb?: number; loudness?: number };
/** 一句台词：配音资产 id、配音文件里第几秒开口（作品的 台词.toml）、文件时长秒；
 *  上段开口秒：这句是清单里上一段说过来的（本段只有 接上段 的 cue），它的开口落在本段第几秒（负数），anim cues 照上一段推 */
export type LineTiming = { voice: string; mouthOpen: number; duration: number; 上段开口秒?: number };
/** 声音表里的一件：数，加上量的是哪份字节（锁里 sha256 的前 12 位）。同一个 id 换了字节（重配的配音、换过的音效）sha 就对不上，
 *  anim check 报、anim cues 重量；不记 sha 的话核对只看 id，换了字节也查不出来 */
export type TableAudioInfo = AudioInfo & { sha?: string };
export type SoundTable = { asset: Readonly<Record<string, TableAudioInfo>>; lines: Readonly<Record<string, LineTiming>> };

export const emptySoundTable: SoundTable = { asset: {}, lines: {} };

// 收集模式的开关：anim cues 执行 段.ts 前在 globalThis 上放一个 Set，助手把要过的 id 记进去。用 Symbol.for，esbuild 各打一份也认得同一个
const collectKey = Symbol.for('mc-anim.段框架.收集声音');
type WithCollect = { [collectKey]?: Set<string> };
export const startCollect = (): Set<string> => ((globalThis as WithCollect)[collectKey] = new Set());
export const endCollect = () => delete (globalThis as WithCollect)[collectKey];
const activeCollector = () => (globalThis as WithCollect)[collectKey];

export class MissingSoundError extends Error {}

export type PlayOptions = {
  /** 目标采样峰值 dBFS：增益 = 10^((目标 − 文件峰值) / 20)。只写一个数时就是它 */
  peakDb?: number;
  /** 目标积分响度 LUFS：增益 = 10^((目标 − 文件响度) / 20)。锁里、表里要有 响度 */
  loudness?: number;
  /** 直接给增益（常数或逐格增益），不按峰值、响度算 */
  增益?: number | PerCellGain;
  name?: string;
  长秒?: number;
  入点秒?: number;
  速率?: number;
  循环?: true;
  fadeOutSec?: number;
  /** 随时间变的音量乘子（音量包络.ts）：点的秒是段内秒，乘在峰值、响度、增益算出的倍数上（等功率淡入淡出这类） */
  gainEnvelope?: GainEnvelope;
  档?: string;
  /** 放到段尾、文件没放完、下一段也不接着放时，写明为什么故意截（anim check 的声音接缝检查要它） */
  cutReason?: string;
};

/** 6 位小数（段定义.ts：增益是 6 位小数） */
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
export const dbToGain = (dB: number) => round6(10 ** (dB / 20));

/** 资产 id 最后一节当默认的名（剪映片段名） */
const defaultName = (id: string) => id.slice(id.lastIndexOf('/') + 1);

/**
 * 绑到一段上的助手：段长（秒）决定默认长秒（放到文件完、截到段尾），表给时长和峰值。
 * 放 的第三个参数：一个数 = 目标峰值 dBFS；对象见 放选项；不给 = 增益 1。
 */
export const makeSoundHelper = (o: { sec: number; 表?: SoundTable; segmentName?: string }) => {
  const soundTable = o.表 ?? emptySoundTable;
  const srcLabel = o.segmentName ? `${o.segmentName} 的` : '本段';
  /** 查本段声音表里一件的数。收集模式下要过的 id 全记下（表里有的也记：生成的表要含它们，否则下一轮它不在表里又被当成缺的，表来回翻），缺的给 undefined */
  const audioInfo = (id: string): AudioInfo | undefined => {
    const collector = activeCollector();
    collector?.add(id);
    const x = soundTable.asset[id];
    if (x) return x;
    if (collector) return undefined;
    throw new MissingSoundError(`${srcLabel}声音表里没有「${id}」的时长、峰值：跑 anim cues（段.ts 加了声音要重新生成 声音表.生成.ts、声音地址.生成.ts）`);
  };

  const play = (asset: string, sec: number, targetOrOpts?: number | PlayOptions): AssetCue => {
    const s: PlayOptions = typeof targetOrOpts === 'number' ? { peakDb: targetOrOpts } : (targetOrOpts ?? {});
    const name = s.name ?? defaultName(asset);
    if (!Number.isFinite(sec)) throw new Error(`放「${name}」：秒要是有限数（${sec}）`);
    const audioFile = audioInfo(asset);
    const segRemainSec = o.sec - sec;
    // 收集模式下表里还没有：给个很短的占位，段.ts 照样执行完，好把整段用到的 id 一次收齐
    if (!audioFile) return { sec: sec, asset: asset, name: name, 长秒: Math.min(0.001, Math.max(segRemainSec, 1e-6)) };
    const rate = s.速率 ?? 1;
    const inSec = s.入点秒 ?? 0;
    let durSec = s.长秒;
    if (durSec === undefined) {
      if (s.循环) durSec = segRemainSec;
      else {
        const remainSec = audioFile.duration - inSec;
        if (!(remainSec > 0)) throw new Error(`放「${name}」：入点秒 ${inSec} 已经到了文件尾（${audioFile.duration} 秒）`);
        durSec = Math.min(remainSec / rate, segRemainSec);
      }
    }
    let gain: number | PerCellGain | undefined = s.增益;
    const givenCount = [s.增益 !== undefined, s.peakDb !== undefined, s.loudness !== undefined].filter(Boolean).length;
    if (givenCount > 1) throw new Error(`放「${name}」：峰值、响度、增益只能给一个`);
    if (s.peakDb !== undefined) {
      if (audioFile.peakDb === undefined) throw new Error(`放「${name}」：${asset} 量不出峰值（静音？），直接给 增益`);
      gain = dbToGain(s.peakDb - audioFile.peakDb);
    }
    if (s.loudness !== undefined) {
      if (audioFile.loudness === undefined) throw new Error(`放「${name}」：${asset} 没有响度数，按峰值给或直接给 增益`);
      gain = dbToGain(s.loudness - audioFile.loudness);
    }
    const cue: AssetCue = {
      sec: sec,
      asset: asset,
      name: name,
      长秒: durSec,
      ...(s.档 !== undefined ? { 档: s.档 } : {}),
      ...(s.入点秒 !== undefined ? { 入点秒: s.入点秒 } : {}),
      ...(s.速率 !== undefined ? { 速率: s.速率 } : {}),
      ...(s.循环 ? { 循环: true as const } : {}),
      ...(gain !== undefined && gain !== 1 ? { 增益: gain } : {}),
      ...(s.fadeOutSec !== undefined ? { fadeOutSec: s.fadeOutSec } : {}),
      ...(s.cutReason !== undefined ? { cutReason: s.cutReason } : {}),
    };
    if (!s.gainEnvelope) return cue;
    checkEnvelope(s.gainEnvelope, `放「${name}」`);
    return applyEnvelopes(cue, [s.gainEnvelope], 0);
  };

  /** 台词：秒是开口落在段内第几秒；配音文件头 = 秒 − 开口秒，数在作品的 台词.toml */
  const say = (lineId: string, sec: number, s: { 长秒?: number } = {}): LineCue => ({ sec: sec, lines: lineId, ...(s.长秒 !== undefined ? { 长秒: s.长秒 } : {}) });
  /** 一句话的后半截（前面本段或上一段已经开口）：从本段第 秒 秒接着放 */
  const continueLine = (lineId: string, sec: number, s: { 长秒?: number } = {}): LineCue => ({ sec: sec, lines: lineId, 接上段: true, ...(s.长秒 !== undefined ? { 长秒: s.长秒 } : {}) });

  return { 放: play, 说: say, continueLine, 数: audioInfo };
};

export type SoundHelper = ReturnType<typeof makeSoundHelper>;
