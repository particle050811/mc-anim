// 分镜的时间工具：全片「画面对歌」的时间轴和写法（fps、拍、小节、句、时刻、解事件、排段），不带具体事件。
// 事件和段窗口按串拆在本目录（用户 11-06 定按句拆，改一句只过期那几段；原来 10-22 定的单独一个文件不再当约束）：一串一个文件，接 到别的串的事件就只引那一份。
// 纯模块（段.ts 会 import），不许 import react、three、remotion。
// 时间轴就是整首歌：歌曲帧 0 = 原声 0 秒，歌曲帧 = Math.round(秒 × fps)，帧号只在这里由秒数取整一次；网格和句的起止从 配乐/网格.ts 来。
// 段的 场窗口、原声 cue 的入点和帧数、段里要卡的事件都从分镜取，段和画面里不写帧号字面量；段内帧 = 歌曲帧 − 段的起帧。
// 同一串里的段窗口首尾相接、各段原声 cue 的入点都由这里推，成片按样本接起来就和整条歌逐样本一致（48 kHz、60 fps 一帧正好 800 个样本）。
// 段、场、特效只引这里和用得到的那几串，不引汇总的 ../分镜.ts（那份只给测试用）。
import * as timeline from '@engine/段/时间线.ts';
import { parseSongGrid, type SongMoment } from '@engine/段/歌网格.ts';
import { sentences, beatGrid, type Sentence } from '../配乐/网格.ts';

/** 一秒几帧：用户 11-02 定从 24 换成 60（粉丝嫌不够流畅）。分寸一律按秒，帧号由秒 × fps 现算，换 fps 不改快慢和时长 */
export const fps = 60;
/** 24 fps 时 n 帧是几秒（n ÷ 24）：11-02 以前按帧调的时长（「闪白 5 帧」）照这个换成秒，秒数一点不变 */
export const legacyFrameSec = (n: number) => n / 24;
/** 一帧几秒：「起那一帧已经走了一帧」「提前一帧」这类按帧的分寸用它。原来写 旧帧(1)，60 fps 下等于先跳 2.5 帧（用户 11-03「统统改成 60 帧」） */
export const oneFrameSec = 1 / fps;

/** 画幅 16:9，不做竖版（用户 10-22 定）：页面 1280×720，成片渲染时 scale 2 出 2560×1440 */
export const aspect = { 宽: 1280, 高: 720 } as const;

export const toSongFrame = (sec: number) => Math.round(sec * fps);
/** 第 n 拍的秒数 */
export const beatAt = (n: number) => beatGrid.firstBeat + beatGrid.拍长 * n;
export const lineAt = (lineIndex: number): Sentence => {
  const s = sentences.find((x) => x.序 === lineIndex);
  if (!s) throw new Error(`配乐/网格.ts 里没有第 ${lineIndex} 句`);
  return s;
};

/** 歌上的一个时刻。秒：直接给秒数；拍、小节：网格上的拍、第 k 小节的下拍（奇数小节是乐句下拍，偶数小节是断拍回落）；
 *  句：第几句的 前导、起、止，开口 = 第一个出声的地方（有前导音取前导，没有取起）；
 *  接：表里另一个事件再往后几秒（负数往前） */
export type Moment =
  | { 秒: number }
  | { beat: number }
  | { measure: number }
  | { 句: number; 点: '前导' | '起' | '止' | '开口' }
  | { after: string; addSec: number };

export type EventDef = { 在: Moment; 依据: string };

// 段里要卡的事件，各串按时间排。「暂定」「演绎」的是 Agent 排的，用户没看过；原版的寿命按 20 刻一秒换成秒
// 依据和核查记录里写的「n 帧」都是 11-02 以前 24 fps 的帧（n/24 秒），换 60 fps 时没改字
// 正片（章 2）的时刻照三稿逐句画面（预览/1024-0233-正片三版三稿-歌词与画面/00-说明.md）。三稿写的秒数是句起的写成句，落在网格拍上（差不到 0.01 秒）的写成拍。
// 第 8 句：开口 = 句，25.67 = 第 60 拍 … 28.23 = 第 66 拍。第 13 句分屏：41.87 = 第 98 拍 … 44.42 = 第 104 拍。第 15 句：48.61 = 句起，49.96 = 第 117 拍

export type SongEvent = { 秒: number; 帧: number; 依据: string };

/** 这首歌的时间轴：拍、小节、句换成秒用 engine/段/歌网格.ts，解时刻、排段用 engine/段/时间线.ts */
const songAxis: timeline.TimeAxis<SongMoment> = { fps, resolveTime: parseSongGrid(beatGrid, sentences) };

/** 时刻 → 秒；接 按名字去 表 里找（可以接在后面才写的事件上，接成环就报错） */
export const resolveMoment = (t: Moment, eventTable: Readonly<Record<string, EventDef>>, visited: readonly string[] = []): number => timeline.resolveMoment(t, eventTable, songAxis, visited);

/** 解出 表 里每个事件；接 到 表 外的事件去 查表 里找（查表 = 本串的加上引来的那几串的） */
export const resolveEvents = <K extends string>(eventTable: Readonly<Record<K, EventDef>>, lookupTable: Readonly<Record<string, EventDef>> = eventTable): Record<K, SongEvent> => {
  const r = {} as Record<K, SongEvent>;
  for (const eventName of Object.keys(eventTable) as K[]) {
    const sec = resolveMoment(eventTable[eventName].在, lookupTable, [eventName]);
    r[eventName] = { 秒: sec, 帧: toSongFrame(sec), 依据: eventTable[eventName].依据 };
  }
  return r;
};

/** 每个事件在这一段里的段内帧（不在这段里的也照算，会是负数或不小于帧数） */
export const segmentFrames = <K extends string>(startFrame: number, events: Readonly<Record<K, SongEvent>>): Record<K, number> => {
  const r = {} as Record<K, number>;
  for (const eventName of Object.keys(events) as K[]) r[eventName] = events[eventName].帧 - startFrame;
  return r;
};

// ---------- 段窗口 ----------

/** 段窗口的止：歌上的一个时刻、按画面长度给帧数（歌只是接着往下放），或 放完 = 原声最后一个整帧 */
export type WindowEnd = Moment | { 帧数: number } | '放完';
/** 串里第一段要写 起；后面的段不写就接上一段的止，写了就要正好等于上一段的止 */
export type SegmentWindowDef = { 键: string; 起?: Moment; 止: WindowEnd; 依据: string };
/** 一串：同一首歌上连着放的几段（歌在串里不切开） */
export type SeriesDef = { 名: string; 时长: number; segments: readonly SegmentWindowDef[] };
export type SegmentWindow = { 键: string; sequenceName: string; 起帧: number; 止帧: number; 帧数: number; 依据: string };

/** 推出一串里每段的窗口（歌曲帧 [起帧, 止帧)），并查首尾相接、不重叠、不超出原声；接 去 表 里找 */
export const arrangeSegs = (sequence: SeriesDef, eventTable: Readonly<Record<string, EventDef>> = {}): SegmentWindow[] =>
  timeline
    .arrangeSegs({ 名: sequence.名, 时长: sequence.时长, segments: sequence.segments.map(({ 键: segKey, ...d }) => ({ 名: segKey, ...d })) }, eventTable, songAxis)
    .map((w) => ({ 键: w.名, sequenceName: w.sequenceName, 起帧: w.起帧, 止帧: w.止帧, 帧数: w.帧数, 依据: w.依据 }));

/** 段.ts 用：段长（秒，和本作品的帧数）、场窗口（秒）、起帧（歌曲帧，画面里换算用），和原声 cue 的 秒、长秒、入点秒（cue 的 资产、名、增益由段补上）。
 *  段.ts 只认秒（engine/段/段定义.ts）；本作品 60 帧一格，正好是段长对齐的格，换成秒不丢东西 */
export const windowClock = (w: SegmentWindow) => ({
  帧数: w.帧数,
  起帧: w.起帧,
  秒: w.帧数 / fps,
  sceneWindow: { startSec: w.起帧 / fps, endSec: w.止帧 / fps },
  origTrack: { 秒: 0, 长秒: w.帧数 / fps, 入点秒: w.起帧 / fps },
});

/** 一串的按段键查法：只查这一串，别的串的段键报错（各串文件导出的 段窗口、段时钟） */
export const chainLookup = (windows: readonly SegmentWindow[]) => {
  const segmentWindow = (segKey: string): SegmentWindow => {
    const w = windows.find((x) => x.键 === segKey);
    if (!w) throw new Error(`分镜串「${windows[0]?.sequenceName}」里没有段 ${segKey} 的窗口`);
    return w;
  };
  return { segmentWindow, segClock: (segKey: string) => windowClock(segmentWindow(segKey)) };
};
