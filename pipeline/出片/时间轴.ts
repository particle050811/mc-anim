// 成片时间轴（docs/时间轴.md，格式 v1）：一部片里各段、镜头、场时间线事件、每一截声音落在成片第几秒。纯函数，只认 作品源.ts 给的数据。
// 用户 11-19 要 image-flow 播放器像剪映那样看时间轴、下面是音频轴（只放声音对象，不放音频）；anim impact 拿它当快照比两份代码。
// 段起止和 出片/拼成片.ts 接的一样（engine/段/出帧.ts 的 filmStartFrameTable：段长按帧取整、首尾相接）；声音就是各段 段.ts 的 cue（场声音已由 windowSeg 切进各段），
// 被截断（cutAtSegEnd）和接续用 段框架/声音接缝.ts 的同一个判断。
import { emptySoundTable, type SoundTable } from '../../engine/段/声音助手.ts';
import { sceneSoundSlice, definitelyDisjoint } from '../../engine/段/场声音.ts';
import { cueGain, segFrameCount, type AssetCue, type LineCue, type SegmentDef } from '../../engine/段/段定义.ts';
import { segPlayPlan } from '../../engine/段/放法.ts';
import { endGain, seamSegOf, seamStatus } from '../段框架/声音接缝.ts';
import type { SourceSeg, WorkSource } from './作品源.ts';

export const timelineFormat = 'mc-anim-timeline';
export const timelineVersion = 1;
/** 成片 mp4 旁边的时间轴文件名：去掉扩展名 + .时间轴.json */
export const timelineFileName = (video: string) => `${video.replace(/\.[^./\\]+$/, '')}.时间轴.json`;

export type TimelineSegment = { key: string; serial: string | null; startSec: number; durSec: number; startFrame: number; frameCount: number };
export type TimelineShot = { name: string; startSec: number; startFrame: number; segment: string };
export type TimelineMarker = { name: string; sec: number; segment: string };
export type AudioKind = '配乐' | '音效' | '台词';
export type TimelineAudio = {
  id: string;
  segment: string;
  kind: AudioKind;
  name: string;
  asset: string;
  startSec: number;
  durSec: number;
  inSec: number;
  rate: number;
  loop: boolean;
  gainDb: number | null;
  endGainDb: number | null;
  fadeOutSec: number | null;
  /** 跨段的同一个声音：场声音是 场声音:<名>；段里自己写、下一段从段头接着放的（声音接缝认得出的）是 接续:<头一截的 id>；不跨段的 null */
  group: string | null;
  fileDurSec: number | null;
  /** 放到段尾、文件没放完、下一段也没接（声音接缝检查判的那种；写了 cutReason 的照样是 true，原因在 cutReason） */
  cutAtSegEnd: boolean;
  cutReason: string | null;
};
export type TimelineBody = { segments: TimelineSegment[]; shots: TimelineShot[]; markers: TimelineMarker[]; audio: TimelineAudio[] };
export type FilmTimeline = {
  format: typeof timelineFormat;
  version: typeof timelineVersion;
  work: string;
  film: string;
  video: string;
  fps: number;
  frameCount: number;
  durationSec: number;
  code: { commit: string; dirty: boolean } | null;
  stale: boolean;
} & TimelineBody;

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const toDb = (g: number) => (g > 0 ? Math.round(20 * Math.log10(g) * 1e3) / 1e3 : null);
export const audioKind = (asset: string, line: boolean): AudioKind => (line ? '台词' : asset.startsWith('配乐/') ? '配乐' : '音效');

/** 段里哪几条 cue 是场声音切进来的：按场时间线的 声音 名单和段的声音表重切一遍，对上起秒、长秒的就是（不往 cue 上加字段：engine 进段指纹，加了全片过期）。
 *  声音表里缺这件的（不该有），退回只按名、资产认 */
export const sceneSoundCues = (seg: SourceSeg, timeline: WorkSource['timelines'][string] | undefined): Map<AssetCue, string> => {
  const out = new Map<AssetCue, string>();
  const window = seg.def.sceneWindow;
  if (!window || !timeline?.sound?.length) return out;
  const cues = (seg.def.sound ?? []).filter((c): c is AssetCue => !c.lines);
  for (const x of timeline.sound) {
    if (definitelyDisjoint(x, window)) continue;
    const group = `场声音:${x.name}`;
    const info = seg.soundTable?.asset[x.asset];
    if (!info) {
      for (const c of cues) if (c.asset === x.asset && c.name === x.name) out.set(c, group);
      continue;
    }
    for (const s of sceneSoundSlice(x, window, info)) {
      const hit = cues.find((c) => !out.has(c) && c.asset === s.asset && c.name === s.name && Math.abs(c.sec - s.sec) < 1e-6 && Math.abs(c.长秒 - s.长秒) < 1e-6);
      if (hit) out.set(hit, group);
    }
  }
  return out;
};

/** 段里台词 cue 实际怎么放（engine/段/放法.ts 的 segPlayPlan，和母版一样）；按 cue 顺序对回去，放不出声的（长 0）给 null */
const linePlays = (def: SegmentDef, table: SoundTable | null) => {
  const lineCues = (def.sound ?? []).filter((c): c is LineCue => c.lines !== undefined);
  if (!lineCues.length) return new Map<LineCue, ReturnType<typeof segPlayPlan>[number]>();
  // 台词怎么放只看台词 cue（接上段、截到同一句的下一截），只留台词算出来的和整段算的一样
  const items = segPlayPlan({ sec: def.sec, sound: lineCues }, table ?? emptySoundTable, { lineGain: 1 });
  const out = new Map<LineCue, (typeof items)[number]>();
  let k = 0;
  for (const c of lineCues) if (items[k]?.name === c.lines) out.set(c, items[k++]!);
  return out;
};

/**
 * 算一部片的时间轴。keys：片里的段（清单里连续的一串，按清单顺序）；fps：成片帧率。
 * 段缝的判断按整部作品的成片顺序（和 anim check 一样）：片尾那段的声音下一段接没接，看的是清单里真正的下一段。
 */
export const computeTimeline = (src: WorkSource, keys: readonly string[], fps: number): TimelineBody => {
  const all = src.segments;
  const index = keys.map((k) => {
    const i = all.findIndex((s) => s.key === k);
    if (i < 0) throw new Error(`段 ${k} 不在 ${src.work} 现在的清单里（清单里有：${all.map((s) => s.key).join('、')}）`);
    return i;
  });
  if (!index.length) throw new Error('时间轴至少要一段');
  if (index.some((x, j) => j > 0 && x !== index[j - 1]! + 1)) throw new Error(`段 ${keys.join('、')} 在清单里不挨着，接不成一部片`);
  const startFrames: number[] = [];
  all.reduce((at, s, i) => ((startFrames[i] = at), at + segFrameCount(s.def, fps)), 0);
  const base = startFrames[index[0]!]!;
  const seamSegs = all.map((s) => seamSegOf(s.key, s.def));
  const segments: TimelineSegment[] = index.map((i) => {
    const s = all[i]!;
    const startFrame = startFrames[i]! - base;
    const frameCount = segFrameCount(s.def, fps);
    return { key: s.key, serial: s.serial, startSec: r6(startFrame / fps), durSec: r6(frameCount / fps), startFrame, frameCount };
  });
  const filmFrames = segments.reduce((a, s) => a + s.frameCount, 0);

  // 声音：接续的 group 往后传（下一段的那条 cue 对象 → group）
  const audio: TimelineAudio[] = [];
  const inherited = new Map<AssetCue, string>();
  const lastLinePiece = new Map<string, TimelineAudio>();
  for (const i of index) {
    const s = all[i]!;
    const segStart = (startFrames[i]! - base) / fps;
    const scene = sceneSoundCues(s, src.timelines[s.def.scene]);
    const lines = linePlays(s.def, s.soundTable);
    (s.def.sound ?? []).forEach((c, k) => {
      const id = `${s.key}/${k}`;
      if (c.lines !== undefined) {
        const play = lines.get(c);
        if (!play) return;
        const t = s.soundTable?.lines[c.lines];
        const entry: TimelineAudio = {
          id, segment: s.key, kind: '台词', name: c.lines, asset: c.lines, startSec: r6(segStart + play.startSec), durSec: r6(play.durSec), inSec: r6(play.入点秒), rate: 1, loop: false,
          gainDb: 0, endGainDb: 0, fadeOutSec: null, group: null, fileDurSec: t ? r6(t.duration) : null, cutAtSegEnd: false, cutReason: null,
        };
        // 接上段的后半截和前半截连成一组
        const prev = c.接上段 ? lastLinePiece.get(c.lines) : undefined;
        if (prev) entry.group = prev.group ??= `接续:${prev.id}`;
        lastLinePiece.set(c.lines, entry);
        audio.push(entry);
        return;
      }
      const status = seamStatus(seamSegs[i]!, seamSegs[i + 1], c, src.measure);
      let group = scene.get(c) ?? inherited.get(c) ?? null;
      if (status.state === 'continued') {
        group ??= `接续:${id}`;
        inherited.set(status.cont, group);
      }
      const info = src.measure(c.asset) ?? s.soundTable?.asset[c.asset];
      audio.push({
        id, segment: s.key, kind: audioKind(c.asset, false), name: c.name, asset: c.asset, startSec: r6(segStart + c.sec), durSec: r6(c.长秒), inSec: r6(c.入点秒 ?? 0), rate: c.速率 ?? 1, loop: Boolean(c.循环),
        gainDb: toDb(cueGain(c, 0)), endGainDb: toDb(endGain(c)), fadeOutSec: c.fadeOutSec ?? null, group, fileDurSec: info ? r6(info.duration) : null,
        cutAtSegEnd: status.state === 'cut', cutReason: c.cutReason ?? null,
      });
    });
  }

  // 事件：场时间线上落在段窗口 [起, 止] 里的，换成成片秒；段缝上的同一个事件只记一次
  const markers: TimelineMarker[] = [];
  for (const [j, i] of index.entries()) {
    const s = all[i]!;
    const window = s.def.sceneWindow;
    const events = src.timelines[s.def.scene]?.events;
    if (!window || !events) continue;
    for (const [name, e] of Object.entries(events)) {
      if (e.sec < window.startSec - 1e-9 || e.sec > window.endSec + 1e-9) continue;
      const sec = r6(segments[j]!.startSec + e.sec - window.startSec);
      if (!markers.some((m) => m.name === name && Math.abs(m.sec - sec) < 1e-6)) markers.push({ name, sec, segment: s.key });
    }
  }
  markers.sort((a, b) => a.sec - b.sec);

  // 镜头：动作体检的切镜（整部作品的帧）换成本片的帧；片从镜头中间起的，第 0 帧补上当时那一镜
  const shots: TimelineShot[] = [];
  const motion = src.motion;
  const fullFrames = all.reduce((a, s) => a + segFrameCount(s.def, fps), 0);
  if (motion && Math.round((motion.frames / motion.fps) * fps) === fullFrames) {
    const segAt = (f: number) => segments.find((x) => f >= x.startFrame && f < x.startFrame + x.frameCount)!.key;
    for (const [n, cut] of motion.cuts.entries()) {
      const f = Math.round((cut.frame / motion.fps) * fps) - base;
      const nextF = n + 1 < motion.cuts.length ? Math.round((motion.cuts[n + 1]!.frame / motion.fps) * fps) - base : Infinity;
      if (f >= filmFrames || nextF <= 0) continue;
      const startFrame = Math.max(0, f);
      shots.push({ name: cut.shot, startFrame, startSec: r6(startFrame / fps), segment: segAt(startFrame) });
    }
  }
  return { segments, shots, markers, audio };
};

export const timelineDoc = (o: { work: string; film: string; video: string; fps: number; code: FilmTimeline['code']; stale: boolean; body: TimelineBody }): FilmTimeline => {
  const frameCount = o.body.segments.reduce((a, s) => a + s.frameCount, 0);
  return { format: timelineFormat, version: timelineVersion, work: o.work, film: o.film, video: o.video, fps: o.fps, frameCount, durationSec: r6(frameCount / o.fps), code: o.code, stale: o.stale, ...o.body };
};
