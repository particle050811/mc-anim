// 歌词艺术字核对的视图表（纯数据，段.ts 也读）：一帧一个视图。符文拼字在三个阶段（飞来中、落定闪、拼齐）× 三种底（亮天空、门口、夜）上的样子，
// 五个关键词各两到五个时刻，分屏两句、第 15 句放底部的样子。歌词的帧是歌曲帧（段内帧 = 歌曲帧，核对不减起帧）；
// 每个视图都画全片 15 句（和段一样），这一帧前后句的进出场、退场和成片一样。
// 飞来中：句中间那个字第一块落定前 2 帧（左半句已经拼好，中间几个字的符文正在飞）；落定闪：同一个字第一块落定那一帧；拼齐：最后一个字拼齐后 1 帧。
// 这里写的「n 帧」都是 24 fps 时的，用 后 换成现在的帧数。
import { fps, legacyFrameSec } from '../../分镜/时间.ts';
import { events as lyricEvents } from '../../分镜/歌词.ts';
import { events as mainCutLine15Events } from '../../分镜/正片第15句.ts';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { runeLyricDefault, decodeTimeSpans } from '../../界面/符文排版.ts';

const mainCutEvents = { ...lyricEvents, ...mainCutLine15Events };

export type BottomBackdrop = '亮天空' | '门口' | '夜' | '对视' | '分屏' | '归隐';
export type LyricStage = '飞来中' | '落定闪' | '拼齐';

export type View = {
  名: string;
  bottomBackdrop: BottomBackdrop;
  /** 歌词画哪一帧（歌曲帧）；分屏、归隐的底也画这一帧 */
  帧: number;
};

/** 每种底配哪一句：亮天空第 1 句（白天最亮的天，两行），门口第 8 句（哈气那个机位，15 个字断两行、错落），夜第 9 句（门口之夜，第 10 句留给烟花） */
const bottomLine: Record<'亮天空' | '门口' | '夜', number> = { 亮天空: 1, 门口: 8, 夜: 9 };

const timeSpans = (sentenceIndex: number) => decodeTimeSpans(mainCutLyricLine(sentenceIndex), runeLyricDefault);
/** 24 fps 时 n 帧 → 现在几帧（取整） */
const frameOffset = (n: number) => Math.round(legacyFrameSec(n) * fps);

const stageFrame = (sentenceIndex: number, stage: LyricStage): number => {
  const segments = timeSpans(sentenceIndex);
  const midSeg = segments[Math.floor(segments.length / 2)]!;
  if (stage === '飞来中') return Math.floor(midSeg.起) - frameOffset(2);
  if (stage === '落定闪') return Math.ceil(midSeg.起);
  return Math.ceil(Math.max(...segments.map((d) => d.end))) + frameOffset(1);
};

/** 关键词拼齐那一帧（词里最后一个字的最后一块落定） */
const alignedFrame = (sentenceIndex: number) => {
  const wordEffect = mainCutLyricLine(sentenceIndex).wordEffect!;
  return Math.ceil(Math.max(...timeSpans(sentenceIndex).slice(wordEffect.从, wordEffect.到 + 1).map((d) => d.end)));
};

const phases: readonly LyricStage[] = ['飞来中', '落定闪', '拼齐'];
const shatterFrame = mainCutEvents.第11句碎裂.帧;

export const views: readonly View[] = [
  ...(['亮天空', '门口', '夜'] as const).flatMap((bottomBackdrop) => phases.map((stage): View => ({ 名: `${bottomBackdrop}-${stage}`, bottomBackdrop, 帧: stageFrame(bottomLine[bottomBackdrop], stage) }))),
  // 光明（第 3 句，祭坛那句的白天）：拼齐那一帧两档、之后留一档
  { 名: '光明-一亮', bottomBackdrop: '亮天空', 帧: alignedFrame(3) },
  { 名: '光明-留光', bottomBackdrop: '亮天空', 帧: alignedFrame(3) + frameOffset(6) },
  // 烟花（第 10 句）：炸开后 2 帧、7 帧
  { 名: '烟花-炸开', bottomBackdrop: '夜', 帧: alignedFrame(10) + frameOffset(2) },
  { 名: '烟花-散开', bottomBackdrop: '夜', 帧: alignedFrame(10) + frameOffset(7) },
  // 刹那（第 11 句）：「刹」冻住、「那」还在拼；整词冻住那一闪；裂开（第11句碎裂 那一帧）；往下掉；掉出字行（整句开始退）
  { 名: '刹那-刹冻住', bottomBackdrop: '夜', 帧: Math.ceil(timeSpans(11)[6]!.end) + frameOffset(3) },
  { 名: '刹那-冻住', bottomBackdrop: '夜', 帧: alignedFrame(11) },
  { 名: '刹那-裂开', bottomBackdrop: '夜', 帧: shatterFrame },
  { 名: '刹那-掉落', bottomBackdrop: '夜', 帧: shatterFrame + frameOffset(4) },
  { 名: '刹那-掉出', bottomBackdrop: '夜', 帧: shatterFrame + frameOffset(6) },
  // 时差（第 13 句，分屏）：本体拼齐、残影还在飞；残影也落定；本体退了、残影还在
  { 名: '时差-残影在飞', bottomBackdrop: '分屏', 帧: alignedFrame(13) + frameOffset(2) },
  { 名: '时差-残影落定', bottomBackdrop: '分屏', 帧: alignedFrame(13) + frameOffset(7) },
  { 名: '时差-残影晚退', bottomBackdrop: '分屏', 帧: mainCutLyricLine(14).入 - frameOffset(1) },
  // 放下（第 14 句，归隐的分屏）：刚飘起来、快退场（拼齐后 10 帧左右就合屏退场）
  { 名: '放下-飘落', bottomBackdrop: '归隐', 帧: alignedFrame(14) + frameOffset(3) },
  { 名: '放下-落远', bottomBackdrop: '归隐', 帧: alignedFrame(14) + frameOffset(8) },
  // 第 15 句放底部（对视这一帧上面是她的脸和气泡），49.96 那一帧
  { 名: '对视-第15句底部', bottomBackdrop: '对视', 帧: mainCutEvents.第15句对视.帧 },
];
