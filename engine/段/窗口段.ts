// 新段的工厂：场时间线 + 窗口段。纯模块（段.ts、场的 时间线.ts 用）。
// 段 = 场时间线上 [起, 止) 这一截（docs/架构.md「新章节一律用场窗口」）。段.ts 里不写段键、段长、画幅：段键只在目录名（和清单里），
// 段长由窗口推，画幅取时间线的（不给就是 默认段格式）。声音 cue 用 声音助手.ts 的 放、说 写一次，画面那头 <段声音> 照表放（段画面.tsx）。
// 跨段的音效、配乐写在场时间线的 声音 里（场声音.ts），每个窗口段自动带上落在自己窗口里的那一截。
// 时间一律是秒（决策 0015）。窗口的起止对齐到 1/段格 秒，段首尾相接、段长落在格上；事件、cue 的秒不对齐。
import { defineSeg, segFps, type SegmentDef, type SoundCue, type OverlayDef } from './段定义.ts';
import { definitelyDisjoint, sceneSoundSlice, type SceneSoundOptions, type ResolvedSceneSound } from './场声音.ts';
import { makeSoundHelper, type SoundHelper, type SoundTable } from './声音助手.ts';
import { resolveEvents, resolveMoment, type EventDef, type Moment, type ResolvedEvent } from './时间线.ts';

/** 页面 1280×720（成片渲染 scale 2 出 2K，见 段定义.ts 文件头） */
export const defaultSegFormat = { 宽: 1280, 高: 720 } as const;

/** 时刻里直接写 帧 的按 段格（60 帧一秒）算 */
const axisAt = <Ext>(resolveTime?: (t: Ext) => number) => ({ fps: segFps, ...(resolveTime ? { resolveTime } : {}) });
/** 秒对齐到段格 */
const snapSec = (sec: number) => Math.round(sec * segFps) / segFps;

export type SceneTimeline<K extends string = string, Ext = never> = {
  场: string;
  宽: number;
  高: number;
  /** 事件在场时间线上的秒 */
  事件: Readonly<Record<K, ResolvedEvent>>;
  /** 原始定义（接、扩展时刻在段里再解时要用） */
  eventDefs: Readonly<Record<K, EventDef<Ext>>>;
  resolveTime?: (t: Ext) => number;
  /** 场时间线总长（秒），给了就查窗口不超出 */
  时长?: number;
  /** 跨段的场声音（起止已解成场时间线的秒）：本时间线上的每个窗口段自动放落在自己窗口里的那一截 */
  声音?: readonly ResolvedSceneSound[];
};

/** 场时间线上的一个跨段声音：在 = 文件头（或入点秒那一处）落在哪一刻；止 不给就放到文件完，循环的要给 */
export type SceneSoundDef<K extends string, Ext> = SceneSoundOptions & { 在: Endpoint<K, Ext>; 止?: Endpoint<K, Ext> | { 长秒: number } };

const isDurSec = (x: unknown): x is { 长秒: number } => typeof x === 'object' && x !== null && '长秒' in x;

/** 一条场时间线：场键、事件表；画幅不给就用 默认段格式。扩展时刻（如 歌网格.ts 的拍、句）给 解析 */
export const defineSceneTimeline = <const K extends string, Ext = never>(d: {
  场: string;
  事件: Readonly<Record<K, EventDef<Ext>>>;
  aspect?: { 宽: number; 高: number };
  resolveTime?: (t: Ext) => number;
  时长?: number;
  声音?: readonly SceneSoundDef<NoInfer<K>, Ext>[];
}): SceneTimeline<K, Ext> => {
  const axis = axisAt(d.resolveTime);
  const events = resolveEvents(d.事件, axis);
  const secAt = (e: Endpoint<K, Ext>): number => (typeof e === 'string' ? eventSecAt({ 场: d.场, 事件: events }, e as K) : resolveMoment(e, d.事件, axis));
  const names = new Set<string>();
  const sounds = (d.声音 ?? []).map((x): ResolvedSceneSound => {
    const { 在: at, 止: end, ...options } = x;
    const soundName = x.名 ?? x.资产.slice(x.资产.lastIndexOf('/') + 1);
    if (names.has(soundName)) throw new Error(`场 ${d.场} 的场声音重名「${soundName}」：给 名 区分`);
    names.add(soundName);
    const startSec = secAt(at);
    const endSec = end === undefined ? undefined : isDurSec(end) ? startSec + end.长秒 : secAt(end);
    if (startSec < 0) throw new Error(`场声音「${soundName}」起在第 ${startSec} 秒，场时间线从 0 起`);
    if (endSec !== undefined && !(endSec > startSec)) throw new Error(`场声音「${soundName}」[${startSec}, ${endSec}) 是空的或反了`);
    if (x.循环 && endSec === undefined) throw new Error(`场声音「${soundName}」循环，要给 止`);
    if (x.fadeOutSec !== undefined && !(x.fadeOutSec > 0)) throw new Error(`场声音「${soundName}」：淡出秒要是正数`);
    return { ...options, 名: soundName, startSec, ...(endSec !== undefined ? { endSec } : {}) };
  });
  return {
    场: d.场,
    宽: d.aspect?.宽 ?? defaultSegFormat.宽,
    高: d.aspect?.高 ?? defaultSegFormat.高,
    事件: events,
    eventDefs: d.事件,
    resolveTime: d.resolveTime,
    时长: d.时长,
    声音: sounds,
  };
};

/** 窗口的端点：事件名，或直接给时刻（接 也能接事件名） */
export type Endpoint<K extends string, Ext> = K | Moment<Ext>;

/** 给 声音 回调的：放、说、接着说，和各事件的段内秒、段长 */
export type SegSoundParams<K extends string> = SoundHelper & { 事件: Readonly<Record<K, number>>; 秒: number };

export type WindowSegDef<K extends string = string> = SegmentDef & {
  sceneWindow: { startSec: number; endSec: number };
  /** 各事件在本段里的段内秒（不在本段的也照算，会是负数或不小于段长） */
  eventSec: Readonly<Record<K, number>>;
  /** 标记段框架做的段：画面用 段画面.tsx 的 定义画面，anim cues 给它生成声音表、地址表 */
  framework: '窗口段';
};

/**
 * 场时间线上 [起, 止) 这一截（起止对齐到 1/段格 秒）。止 也可以写 { 长秒 }。
 * 声音：回调里用 放、说 写 cue（时长、峰值取 声音表；声音表 是本段目录里 anim cues 生成的 声音表.生成.ts 的默认导出）。
 */
export const windowSeg = <K extends string, Ext = never>(
  timeline: SceneTimeline<K, Ext>,
  d: {
    起: Endpoint<K, Ext>;
    止: Endpoint<K, Ext> | { 长秒: number };
    soundTable?: SoundTable;
    声音?: (p: SegSoundParams<K>) => readonly SoundCue[];
    地形?: readonly string[];
    continuous?: boolean;
    叠层?: readonly OverlayDef[];
    /** 报错里认段用的名字（可选；不写报错里就说「本段」） */
    名?: string;
    /** 不放场时间线上的跨段声音：true = 全不放，或列出不放的名（插进来的另一个地方的镜头之类） */
    excludeSceneSound?: true | readonly string[];
  },
): WindowSegDef<K> => {
  const axis = axisAt(timeline.resolveTime);
  const secAt = (e: Endpoint<K, Ext>): number => (typeof e === 'string' ? eventSecAt(timeline, e as K) : resolveMoment(e, timeline.eventDefs, axis));
  const startSec = snapSec(secAt(d.起));
  const endSec = snapSec(isDurSec(d.止) ? startSec + d.止.长秒 : secAt(d.止 as Endpoint<K, Ext>));
  const displayName = d.名 ?? '本段';
  if (!(endSec > startSec)) throw new Error(`${displayName}的窗口 [${startSec}, ${endSec}) 秒是空的或反了`);
  if (startSec < 0) throw new Error(`${displayName}的窗口起在第 ${startSec} 秒，场时间线从 0 起`);
  if (timeline.时长 !== undefined && endSec > timeline.时长 + 1e-9) throw new Error(`${displayName}的窗口止在第 ${endSec} 秒，超出场时间线（${timeline.时长} 秒）`);
  const durSec = endSec - startSec;
  const eventSec = Object.fromEntries(Object.entries<ResolvedEvent>(timeline.事件).map(([k, v]) => [k, v.秒 - startSec])) as Record<K, number>;
  const helper = makeSoundHelper({ 秒: durSec, 表: d.soundTable, segmentName: d.名 });
  const ownSounds = d.声音?.({ ...helper, 事件: eventSec, 秒: durSec });
  const span = { startSec, endSec };
  const excludeNames = d.excludeSceneSound;
  const sceneSlice = (timeline.声音 ?? [])
    .filter((x) => excludeNames !== true && !excludeNames?.includes(x.名) && !definitelyDisjoint(x, span))
    .flatMap((x) => {
      const audioFile = helper.数(x.资产);
      // 收集模式下表里还没有：先不出 cue，量完再执行一遍
      return audioFile ? sceneSoundSlice(x, span, audioFile) : [];
    });
  const sounds = ownSounds || sceneSlice.length ? [...(ownSounds ?? []), ...sceneSlice] : undefined;
  const seg = defineSeg({
    场: timeline.场,
    秒: durSec,
    宽: timeline.宽,
    高: timeline.高,
    地形: d.地形 ?? [],
    sceneWindow: span,
    ...(d.continuous ? { continuous: true } : {}),
    ...(sounds ? { 声音: sounds } : {}),
    ...(d.叠层 ? { 叠层: d.叠层 } : {}),
  });
  return { ...seg, sceneWindow: span, eventSec, framework: '窗口段' };
};

const eventSecAt = <K extends string>(timeline: { 场: string; 事件: Readonly<Record<K, ResolvedEvent>> }, eventName: K) => {
  const e = timeline.事件[eventName];
  if (!e) throw new Error(`场 ${timeline.场} 的时间线里没有事件「${eventName}」`);
  return e.秒;
};

/** 是不是段框架做的段（pipeline 按这个决定要不要给它生成声音表、地址表）：窗口段这类工厂做的（写 框架 字段），或 定义段 手写了声音 cue 的 */
export const isFrameworkSeg = (seg: SegmentDef): boolean => typeof (seg as { framework?: unknown }).framework === 'string' || Boolean(seg.声音?.length);
