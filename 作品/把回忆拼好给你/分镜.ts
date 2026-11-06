// 分镜汇总：只给测试和核查用（各串的段窗口首尾相接、事件按时间排，pipeline 的等值测试）。
// 分镜按句拆在 分镜/ 目录（用户 11-06 定按句拆，改一句只过期那几段）：时间工具在 分镜/时间.ts，一串一个文件。
// 段、场、特效、核对这些要渲的代码不许引这份（引了改哪一句都让全片过期），只引 分镜/时间.ts 和用得到的那几串；分镜.test.ts 守着。
import { 段内帧, 窗口时钟, type 段窗口 as 段窗口型, type 歌上事件 } from './分镜/时间.ts';
import * as 歌词 from './分镜/歌词.ts';
import * as 验证片串 from './分镜/验证片.ts';
import * as 开场 from './分镜/正片开场.ts';
import * as 第2句 from './分镜/正片第2句.ts';
import * as 第3句 from './分镜/正片第3句.ts';
import * as 第4句 from './分镜/正片第4句.ts';
import * as 第5句 from './分镜/正片第5句.ts';
import * as 第6到7句 from './分镜/正片第6到7句.ts';
import * as 第8句 from './分镜/正片第8句.ts';
import * as 第9至11句 from './分镜/正片第9至11句.ts';
import * as 第12句 from './分镜/正片第12句.ts';
import * as 第13至14句 from './分镜/正片第13至14句.ts';
import * as 第15句 from './分镜/正片第15句.ts';
import * as 十五尾 from './分镜/正片15尾.ts';
import * as 片尾 from './分镜/正片片尾.ts';

export * from './分镜/时间.ts';
export const { 验证片 } = 验证片串;
export const { 正片开场 } = 开场;
export const { 正片第2句 } = 第2句;
export const { 正片第3句 } = 第3句;
export const { 正片第4句 } = 第4句;
export const { 正片第5句 } = 第5句;
export const { 正片第6到7句 } = 第6到7句;
export const { 正片第8句 } = 第8句;
export const { 正片第9至11句 } = 第9至11句;
export const { 正片第12句 } = 第12句;
export const { 正片第13至14句 } = 第13至14句;
export const { 正片第15句 } = 第15句;
export const { 正片15尾 } = 十五尾;
export const { 正片片尾 } = 片尾;

export const 串们: readonly (readonly 段窗口型[])[] = [验证片, 正片开场, 正片第2句, 正片第3句, 正片第4句, 正片第5句, 正片第6到7句, 正片第8句, 正片第9至11句, 正片第15句, 正片15尾, 正片片尾, 正片第12句, 正片第13至14句];

/** 验证片的事件 */
export const 事件 = 验证片串.事件;
export type 事件名 = keyof typeof 事件;

const 各串正片事件 = [歌词, 开场, 第2句, 第3句, 第4句, 第5句, 第6到7句, 第8句, 第9至11句, 第12句, 第13至14句, 第15句, 十五尾, 片尾].map((m) => m.事件);
const 合 = { ...歌词.事件, ...开场.事件, ...第2句.事件, ...第3句.事件, ...第4句.事件, ...第5句.事件, ...第6到7句.事件, ...第8句.事件, ...第9至11句.事件, ...第12句.事件, ...第13至14句.事件, ...第15句.事件, ...十五尾.事件, ...片尾.事件 };
export type 正片事件名 = keyof typeof 合;
/** 全部正片事件，按歌上的秒排（同一刻的照上面各串的先后，歌词.ts 那几个在前） */
export const 正片事件: Readonly<Record<正片事件名, 歌上事件>> = Object.fromEntries(Object.entries(合).sort(([, a], [, b]) => a.秒 - b.秒)) as Record<正片事件名, 歌上事件>;
/** 各串文件自己的事件表（测试查每份都按时间排、名字不重） */
export const 正片事件分串: readonly Readonly<Record<string, 歌上事件>>[] = 各串正片事件;

export type 段窗口 = 段窗口型;
export const 段窗口 = (键: string): 段窗口型 => {
  const w = 串们.flat().find((x) => x.键 === 键);
  if (!w) throw new Error(`分镜里没有段 ${键} 的窗口`);
  return w;
};
export const 段时钟 = (键: string) => 窗口时钟(段窗口(键));
/** 每个正片事件在这一段里的段内帧（全部正片事件；段代码用各串文件的 段内事件帧 或 段内帧） */
export const 段内正片事件帧 = (键: string): Record<正片事件名, number> => 段内帧(段窗口(键).起帧, 正片事件);
/** 每个验证片事件在这一段里的段内帧 */
export const 段内事件帧 = (键: string): Record<事件名, number> => 段内帧(段窗口(键).起帧, 事件);
