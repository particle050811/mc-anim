// 声音接缝：按成片顺序走一遍各段的音效、配乐 cue，查段缝上声音被一刀切掉、或下一段接着放却接不齐（文件位置跳了、音量跳了）。纯模块。
// 起因：放() 默认「放到文件完、截到段尾」，下一段不会接着放；前一段改短了，切点就挪到声音还很响的地方，没人发现（用户 11-19 听出亚波伦 8～9 秒雷声断了，
// 说「总是顾头不顾尾」，要像单元测试那样查）。场时间线上的跨段声音（场声音.ts）照理接得上，这里也一并核成片里真的接上了。
// 已有的、用户看过听过的问题记在作品的 声音接缝基线.tsv 里放行（元规则 1：看过的实现为准），新冒出来的才报错。
import { segFps, segDurSec, isPerCell, type AssetCue, type SegmentDef } from '../../engine/段/段定义.ts';
import { cueGainAt, envelopeTableAt } from '../../engine/段/音量包络.ts';
import type { AudioInfo } from '../../engine/段/声音助手.ts';

export type SeamSeg = { key: string; durSec: number; cues: readonly AssetCue[] };
/** 成片顺序里的一段（老段没有 cue 也要占位，免得把隔着老段的两段当成相邻）；声音接缝检查和成片时间轴都用这个取法 */
export const seamSegOf = (key: string, def: Pick<SegmentDef, 'sec' | 'sound'>): SeamSeg => ({ key, durSec: segDurSec(def), cues: (def.sound ?? []).filter((x): x is AssetCue => !x.lines) });
/** 一处问题：基线键（段键、名、哪种，不带秒数，改了时刻也认得出是同一处）和给人看的话 */
export type SeamIssue = { baselineKey: string; text: string };

/** 段尾差半帧以内算放到了段尾 */
const atEndTolerance = 0.5 / segFps;
/** 文件还剩这么多以上才算被截掉（文件尾的零头、编码补的几毫秒不算） */
const minCutSec = 0.1;
/** 接上段时文件位置差多少算跳了：2 毫秒 ≈ 半个 AAC 帧，耳朵听不出 */
const maxJumpSec = 0.002;
/** 认接续时文件位置差多少以内算同一条（名字改了也认，比如「尖啸」接到下一段叫「尖啸（接 6-4-4）」） */
const sameTrackSec = 0.05;
/** 接上段时增益差多少分贝算跳了 */
const maxGainJumpDb = 1;

const fmt = (x: number) => x.toFixed(2);
const dbOf = (g: number) => 20 * Math.log10(g);

/** cue 放到末尾时文件放到第几秒（循环的取模） */
const fileEndSec = (c: AssetCue, info: AudioInfo) => {
  const pos = (c.入点秒 ?? 0) + c.长秒 * (c.速率 ?? 1);
  return c.循环 ? pos % info.duration : pos;
};

/** 末尾增益（逐格的取最后一格；带淡出的到末尾是 0；乘上包络表在末尾的倍数） */
export const endGain = (c: AssetCue) => (isPerCell(c.增益) ? c.增益.value[c.增益.value.length - 1]! * (c.envelope ? envelopeTableAt(c.envelope, c.长秒) : 1) : cueGainAt(c, c.长秒));

/** 一条 cue 在段缝上的状况：没放到段尾、量不到时长、放到段尾但文件放完或已静音（都不用管）；被截掉（下一段不接）；下一段从段头接着放（cont 是接上的那条） */
export type SeamStatus =
  | { state: 'free' }
  | { state: 'cut'; fileSec: number; leftSec: number }
  | { state: 'continued'; fileSec: number; cont: AssetCue };

/**
 * 一条 cue 在段缝上算不算被截掉、由下一段哪条接着放。fileSec：放到段尾时文件放到第几秒；leftSec：文件还剩几秒（循环的是 Infinity）。
 * 声音接缝检查和成片时间轴（出片/时间轴.ts 的 cutAtSegEnd、接续的 group）都用这一个判断。
 */
export const seamStatus = (seg: SeamSeg, next: SeamSeg | undefined, c: AssetCue, measure: (id: string) => AudioInfo | undefined): SeamStatus => {
  if (c.sec + c.长秒 < seg.durSec - atEndTolerance) return { state: 'free' };
  const info = measure(c.asset);
  if (!info) return { state: 'free' }; // 量不到时长的由 声音表 那条规则报
  const leftSec = c.循环 ? Infinity : info.duration - fileEndSec(c, info);
  if (leftSec < minCutSec || endGain(c) <= 1e-6) return { state: 'free' };
  const fileSec = fileEndSec(c, info);
  const heads = next?.cues.filter((x) => x.asset === c.asset && Math.abs(x.sec) < 1e-6) ?? [];
  const cont = heads.find((x) => x.name === c.name) ?? heads.find((x) => Math.abs((x.入点秒 ?? 0) - fileSec) < sameTrackSec);
  return cont ? { state: 'continued', fileSec, cont } : { state: 'cut', fileSec, leftSec };
};

/**
 * 查段缝。返回问题列表（空 = 都接上了，或被截掉的都写了 cutReason）。
 * - 被截掉：一条 cue 放到段尾、文件没放完、末尾还有声，下一段又没有同一资产的 cue 从段头接着放。要故意截（比如硬切到别处），在 放() 里写 cutReason: '原因'。
 * - 接不齐：下一段同名同资产从段头放，但文件位置对不上前一截的末尾；或两截都是整条一个增益、却差了 1 dB 以上。
 *   逐格增益（按距离衰减的、淡出跨段的）不比音量：切镜换了听的位置，音量本来就该变。
 */
export const checkSoundSeams = (segs: readonly SeamSeg[], measure: (id: string) => AudioInfo | undefined): SeamIssue[] => {
  const issues: SeamIssue[] = [];
  segs.forEach((seg, i) => {
    const next = segs[i + 1];
    for (const c of seg.cues) {
      const status = seamStatus(seg, next, c, measure);
      if (status.state === 'free') continue;
      const want = status.fileSec;
      if (status.state === 'cut') {
        if (c.cutReason) continue;
        const where = next ? `接 ${next.key} 的段缝` : '片尾';
        const left = c.循环 ? '循环没停' : `文件还剩 ${fmt(status.leftSec)} 秒`;
        issues.push({
          baselineKey: `${seg.key}\t${c.name}\t截掉`,
          text: `${seg.key}「${c.name}」（${c.asset}）在${where}被截掉：段内 ${fmt(c.sec)} 秒起放，截在文件第 ${fmt(want)} 秒，${left}、末尾增益 ${fmt(dbOf(endGain(c)))} dB。要接着响就挪到场时间线的 声音，故意截就在 放() 里写 cutReason: '原因'`,
        });
        continue;
      }
      const cont = status.cont;
      const got = cont.入点秒 ?? 0;
      if (Math.abs(got - want) > maxJumpSec)
        issues.push({ baselineKey: `${seg.key}\t${c.name}\t跳位`, text: `${seg.key} → ${next!.key}「${c.name}」接缝跳了：前一截放到文件第 ${want.toFixed(3)} 秒，后一截从第 ${got.toFixed(3)} 秒接（差 ${((got - want) * 1000).toFixed(0)} 毫秒）` });
      if (isPerCell(c.增益) || isPerCell(cont.增益)) continue;
      const jumpDb = dbOf(cueGainAt(cont, 0)) - dbOf(endGain(c));
      if (Math.abs(jumpDb) > maxGainJumpDb) issues.push({ baselineKey: `${seg.key}\t${c.name}\t跳音量`, text: `${seg.key} → ${next!.key}「${c.name}」接缝音量跳了 ${jumpDb > 0 ? '+' : ''}${jumpDb.toFixed(1)} dB` });
    }
  });
  return issues;
};

/** 基线文件（作品根的 声音接缝基线.tsv）：一行一处 段键\t名\t哪种，# 起头的是注释 */
export const seamBaselineFile = '声音接缝基线.tsv';
export const parseSeamBaseline = (text: string) => new Set(text.split('\n').map((x) => x.replace(/\s+$/, '')).filter((x) => x && !x.startsWith('#')));
export const formatSeamBaseline = (issues: readonly SeamIssue[], header: string) => `${header}\n${[...new Set(issues.map((x) => x.baselineKey))].sort().join('\n')}\n`;
