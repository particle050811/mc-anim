// 时间线的通用部分：事件表（每个事件在时间轴上的时刻，可以接在别的事件后面）解成秒和帧，按串排出首尾相接的段窗口。纯模块（段.ts 会 import）。
// 从 作品/把回忆拼好给你/分镜/时间.ts 的 解时刻、解事件、排段 抽出来，那边现在也调这里（时间轴是它的「歌曲帧」、原声的网格）；fps、时长、扩展的时刻都由调用方给。
// 帧 = Math.round(秒 × fps)，帧号只在这里由秒取整一次。

/** 时间轴上的一个时刻。秒、帧：直接给；接：表里另一个事件再往后几秒或几帧（负数往前），可以接在后面才写的事件上 */
export type BaseMoment = { 秒: number } | { 帧: number } | { after: string; addSec?: number; addFrames?: number };
/** 扩展的时刻（如歌网格的 拍、小节、句，见 歌网格.ts）由 解析 换成秒 */
export type Moment<Ext = never> = BaseMoment | Ext;

export type EventDef<Ext = never> = { 在: Moment<Ext>; /** 为什么在这一刻（用户定的写「用户 MM-DD 定」，Agent 暂定的写暂定） */ 依据?: string };
export type ResolvedEvent = { 秒: number; 帧: number; 依据: string };

export type TimeAxis<Ext = never> = {
  fps: number;
  /** 扩展时刻 → 秒；没有扩展的时间线不给 */
  resolveTime?: (t: Ext) => number;
};

const isBasicTime = (t: object): t is BaseMoment => '秒' in t || '帧' in t || 'after' in t;

/** 时刻 → 秒；帧 给的按 帧 ÷ fps */
export const resolveMoment = <Ext = never>(t: Moment<Ext>, eventTable: Readonly<Record<string, EventDef<Ext>>>, axis: TimeAxis<Ext>, visited: readonly string[] = []): number => {
  const o = t as object;
  if (!isBasicTime(o)) {
    if (!axis.resolveTime) throw new Error(`不认识的时刻 ${JSON.stringify(t)}：这条时间线没给 解析（基本时刻只有 秒、帧、接）`);
    return axis.resolveTime(t as Ext);
  }
  if ('秒' in o) return o.秒;
  if ('帧' in o) return o.帧 / axis.fps;
  const linked = eventTable[o.after];
  if (!linked) throw new Error(`接的事件「${o.after}」不在表里`);
  if (visited.includes(o.after)) throw new Error(`事件接成了环：${[...visited, o.after].join(' → ')}`);
  return resolveMoment(linked.在, eventTable, axis, [...visited, o.after]) + (o.addSec ?? 0) + (o.addFrames ?? 0) / axis.fps;
};

/** 时刻 → 帧（取整一次）。直接给 帧 的不经秒绕一圈，免得 帧 ÷ fps × fps 的浮点误差 */
export const momentFrame = <Ext = never>(t: Moment<Ext>, eventTable: Readonly<Record<string, EventDef<Ext>>>, axis: TimeAxis<Ext>): number => {
  const o = t as object;
  if ('帧' in o && isBasicTime(o)) {
    if (!Number.isInteger(o.帧)) throw new Error(`时刻的帧要是整数：${o.帧}`);
    return o.帧;
  }
  return Math.round(resolveMoment(t, eventTable, axis) * axis.fps);
};

/** 整张事件表解成秒和帧 */
export const resolveEvents = <K extends string, Ext = never>(eventTable: Readonly<Record<K, EventDef<Ext>>>, axis: TimeAxis<Ext>): Record<K, ResolvedEvent> => {
  const r = {} as Record<K, ResolvedEvent>;
  for (const eventName of Object.keys(eventTable) as K[]) {
    const at = eventTable[eventName].在;
    const sec = resolveMoment(at, eventTable, axis, [eventName]);
    r[eventName] = { 秒: sec, 帧: momentFrame(at, eventTable, axis), 依据: eventTable[eventName].依据 ?? '' };
  }
  return r;
};

// ---------- 串：同一条时间轴上首尾相接的几段（分镜/时间.ts 的 排段，泛化） ----------

/** 段窗口的止：时刻、按画面长度给帧数，或 放完 = 时间轴最后一个整帧（要给 时长） */
export type WindowEnd<Ext = never> = Moment<Ext> | { 帧数: number } | '放完';
/** 串里第一段要写 起；后面的段不写就接上一段的止，写了就要正好等于上一段的止。名 只用来报错和查找（不必是段键） */
export type SeriesSegDef<Ext = never> = { 名: string; 起?: Moment<Ext>; 止: WindowEnd<Ext>; 依据?: string };
export type SeriesDef<Ext = never> = { 名: string; /** 时间轴总长（秒）：给了就查窗口不超出 */ 时长?: number; segments: readonly SeriesSegDef<Ext>[] };
export type SeriesWindow = { 名: string; sequenceName: string; 起帧: number; 止帧: number; 帧数: number; 依据: string };

/** 推出一串里每段的窗口（时间轴帧 [起帧, 止帧)），并查首尾相接、不重叠、不超出时长 */
export const arrangeSegs = <Ext = never>(sequence: SeriesDef<Ext>, eventTable: Readonly<Record<string, EventDef<Ext>>>, axis: TimeAxis<Ext>): SeriesWindow[] => {
  const r: SeriesWindow[] = [];
  const lastFrame = sequence.时长 === undefined ? Infinity : Math.floor(sequence.时长 * axis.fps + 1e-9);
  for (const d of sequence.segments) {
    const displayName = `串「${sequence.名}」的 ${d.名}`;
    if (r.some((w) => w.名 === d.名)) throw new Error(`${displayName} 出现了两次`);
    const prevSegment = r.at(-1);
    let startFrame: number;
    if (d.起) {
      startFrame = momentFrame(d.起, eventTable, axis);
      if (prevSegment && startFrame !== prevSegment.止帧) throw new Error(`${displayName} 起在第 ${startFrame} 帧，上一段 ${prevSegment.名} 止在第 ${prevSegment.止帧} 帧：${startFrame > prevSegment.止帧 ? '中间空了' : '重叠了'} ${Math.abs(startFrame - prevSegment.止帧)} 帧`);
    } else if (prevSegment) startFrame = prevSegment.止帧;
    else throw new Error(`${displayName} 是串里第一段，要写 起`);
    let endFrame: number;
    if (d.止 === '放完') {
      if (lastFrame === Infinity) throw new Error(`${displayName} 写了 放完，串要给 时长`);
      endFrame = lastFrame;
    } else if (typeof d.止 === 'object' && d.止 !== null && '帧数' in d.止) endFrame = startFrame + d.止.帧数;
    else endFrame = momentFrame(d.止 as Moment<Ext>, eventTable, axis);
    if (!Number.isInteger(endFrame) || endFrame <= startFrame) throw new Error(`${displayName} 的窗口 [${startFrame}, ${endFrame}) 是空的或反了`);
    if (startFrame < 0 || endFrame > lastFrame) throw new Error(`${displayName} 的窗口 [${startFrame}, ${endFrame}) 超出时间轴（0 到第 ${lastFrame} 帧）`);
    r.push({ 名: d.名, sequenceName: sequence.名, 起帧: startFrame, 止帧: endFrame, 帧数: endFrame - startFrame, 依据: d.依据 ?? '' });
  }
  return r;
};
