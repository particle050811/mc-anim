// 分镜汇总：只给测试和核查用（各串的段窗口首尾相接、事件按时间排，pipeline 的等值测试）。
// 分镜按句拆在 分镜/ 目录（用户 11-06 定按句拆，改一句只过期那几段）：时间工具在 分镜/时间.ts，一串一个文件。
// 段、场、特效、核对这些要渲的代码不许引这份（引了改哪一句都让全片过期），只引 分镜/时间.ts 和用得到的那几串；分镜.test.ts 守着。
import { segmentFrames, windowClock, type SegmentWindow as SegmentWindowType, type SongEvent } from './分镜/时间.ts';
import * as lyrics from './分镜/歌词.ts';
import * as validationSeries from './分镜/验证片.ts';
import * as openingScene from './分镜/正片开场.ts';
import * as sentence2 from './分镜/正片第2句.ts';
import * as sentence3 from './分镜/正片第3句.ts';
import * as sentence4 from './分镜/正片第4句.ts';
import * as sentence5 from './分镜/正片第5句.ts';
import * as sentences6to7 from './分镜/正片第6到7句.ts';
import * as sentence8 from './分镜/正片第8句.ts';
import * as sentences9to11 from './分镜/正片第9至11句.ts';
import * as sentence12 from './分镜/正片第12句.ts';
import * as sentences13to14 from './分镜/正片第13至14句.ts';
import * as sentence15 from './分镜/正片第15句.ts';
import * as sentence15Tail from './分镜/正片15尾.ts';
import * as outro from './分镜/正片片尾.ts';

export * from './分镜/时间.ts';
export const { validationCut } = validationSeries;
export const { mainCutOpeningScene } = openingScene;
export const { mainCutSentences2 } = sentence2;
export const { mainCutSentences3 } = sentence3;
export const { mainCutSentences4 } = sentence4;
export const { mainCutSentences5 } = sentence5;
export const { mainCutSentences6to7 } = sentences6to7;
export const { mainCutSentence8 } = sentence8;
export const { mainCutSentences9to11 } = sentences9to11;
export const { mainCutSentences12 } = sentence12;
export const { mainCutSentences13to14 } = sentences13to14;
export const { mainCutLine15: mainCutSentence15 } = sentence15;
export const { mainCutLine15Tail } = sentence15Tail;
export const { mainCutOutro } = outro;

export const seriesList: readonly (readonly SegmentWindowType[])[] = [validationCut, mainCutOpeningScene, mainCutSentences2, mainCutSentences3, mainCutSentences4, mainCutSentences5, mainCutSentences6to7, mainCutSentence8, mainCutSentences9to11, mainCutSentence15, mainCutLine15Tail, mainCutOutro, mainCutSentences12, mainCutSentences13to14];

/** 验证片的事件 */
export const events = validationSeries.events;
export type EventName = keyof typeof events;

const seriesMainCutEvents = [lyrics, openingScene, sentence2, sentence3, sentence4, sentence5, sentences6to7, sentence8, sentences9to11, sentence12, sentences13to14, sentence15, sentence15Tail, outro].map((m) => m.events);
const mergedEvents = { ...lyrics.events, ...openingScene.events, ...sentence2.events, ...sentence3.events, ...sentence4.events, ...sentence5.events, ...sentences6to7.events, ...sentence8.events, ...sentences9to11.events, ...sentence12.events, ...sentences13to14.events, ...sentence15.events, ...sentence15Tail.events, ...outro.events };
export type MainCutEventName = keyof typeof mergedEvents;
/** 全部正片事件，按歌上的秒排（同一刻的照上面各串的先后，歌词.ts 那几个在前） */
export const mainCutEvents: Readonly<Record<MainCutEventName, SongEvent>> = Object.fromEntries(Object.entries(mergedEvents).sort(([, a], [, b]) => a.秒 - b.秒)) as Record<MainCutEventName, SongEvent>;
/** 各串文件自己的事件表（测试查每份都按时间排、名字不重） */
export const mainCutEventsBySeries: readonly Readonly<Record<string, SongEvent>>[] = seriesMainCutEvents;

export type SegmentWindow = SegmentWindowType;
export const SegmentWindow = (segKey: string): SegmentWindowType => {
  const w = seriesList.flat().find((x) => x.键 === segKey);
  if (!w) throw new Error(`分镜里没有段 ${segKey} 的窗口`);
  return w;
};
export const segClock = (segKey: string) => windowClock(SegmentWindow(segKey));
/** 每个正片事件在这一段里的段内帧（全部正片事件；段代码用各串文件的 段内事件帧 或 段内帧） */
export const segMainCutEventFrames = (segKey: string): Record<MainCutEventName, number> => segmentFrames(SegmentWindow(segKey).起帧, mainCutEvents);
/** 每个验证片事件在这一段里的段内帧 */
export const segEventFrames = (segKey: string): Record<EventName, number> => segmentFrames(SegmentWindow(segKey).起帧, events);
