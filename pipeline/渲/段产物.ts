// 段产物：每段渲出来就是成片的一截（用户 11-05 定「母版 = 成片切片」，11-06 定只留这一条出片路，决策/0014），这里只算它们叫什么、指纹是多少，不碰 Remotion。
//   画面 cache/母版/<作品>/<段键>/<画面指纹前 16 位>.mp4：成片档的输出帧率、分辨率，叠层和这段的字幕画在里面，按成片参数压好（设置.ts 的 渲染参数）；
//   声音 同目录 <声音指纹前 16 位>.wav：原生段（段.ts 写 时钟: '秒'）和画面同一遍出（separateAudioTo），声音指纹 = 画面指纹（docs/决策/0015-原生60帧.md）；
//   没迁的段按编排帧率另出（声音渲染参数，兼容层，迁完删）。
// 渲（渲段.ts）、stale、verify、认指纹、cache gc 的钉都从这里取，指纹才是同一份。字幕要按整部作品排、段的输出窗要看全片位置，所以都要传 全部。
import path from 'node:path';
import { 段输出窗, 全片起帧表, type 输出窗 } from '../../engine/段/出帧.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';
import { 母版目录 } from '../环境/配置.ts';
import { 算全部段指纹, 稳定JSON, type 段指纹, type 指纹项 } from '../指纹/指纹.ts';
import type { 段信息 } from '../清单/清单.ts';
import { 排全片字幕, 段字幕卡 } from '../合成/段字幕.ts';
import { 成片档, 母版宽高, 声音渲染参数, 渲染参数, type 渲染参数表 } from './设置.ts';
import crypto from 'node:crypto';

export const 段画面路径 = (键: string, 指纹: string, 作品?: string) => path.join(母版目录(键, 作品), `${指纹.slice(0, 16)}.mp4`);
export const 段声音路径 = (键: string, 指纹: string, 作品?: string) => path.join(母版目录(键, 作品), `${指纹.slice(0, 16)}.wav`);

export type 段产物 = {
  段: 段信息;
  画面指纹: 段指纹;
  声音指纹: 段指纹;
  画面: string;
  声音: string;
  /** 这段在成片里占的输出帧 */
  输出帧数: number;
  输出起帧: number;
  /** 声音起秒、止秒：wav 第 0 个样本、末尾在全片的第几秒。原生段是输出窗（和画面一样），兼容段是编排窗 */
  声音起秒: number;
  声音止秒: number;
  /** 画面那遍交给 Remotion 的参数（带这段的字幕；原生段带声音） */
  参数: 渲染参数表 & { audioCodec?: 'pcm-16' };
};

/** 原生段：画面和声音同一遍出 */
export const 是原生 = (s: 段信息) => s.段.时钟 === '秒';

/** 这段在输出帧上的窗（按 全部 的清单顺序算全片位置；核对段各自从 0 起），和注册工厂给 Composition 的帧数是同一个算法 */
export const 段输出窗于 = (全部: readonly 段信息[], s: 段信息): 输出窗 => {
  const 起 = 全片起帧表(全部.map((x) => ({ 键: x.键, 帧数: x.段.帧数 }))).get(s.键);
  if (起 === undefined) throw new Error(`${s.键} 不在这部作品的清单里`);
  return 段输出窗(起, s.段.帧数, s.段.fps, 成片档().fps);
};

/** 各段画面那遍的参数（带这段的字幕）；still、bench、逐帧校验、认指纹出帧也用它，和切片一样 */
export const 段画面参数们 = (全部: readonly 段信息[], 段们: readonly 段信息[], 级别: 渲染级别): 渲染参数表[] => {
  const 档 = 成片档();
  const [宽, 高] = 母版宽高(级别);
  const 字幕 = 排全片字幕(全部);
  return 段们.map((s) => {
    const p = 渲染参数(级别, 段字幕卡(s, 字幕, 档.fps, 宽, 高));
    return 是原生(s) ? { ...p, muted: false, audioCodec: 'pcm-16' as const } : p;
  });
};

/** 算各段的画面、声音指纹和输出窗（全部 = 整部作品的段） */
export const 段产物们 = async (全部: readonly 段信息[], 段们: readonly 段信息[], 级别: 渲染级别): Promise<段产物[]> => {
  const 画面参数们 = 段画面参数们(全部, 段们, 级别);
  const 画面指纹们 = await 算全部段指纹(段们.map((s, i) => ({ 段: s, 渲染设置: 画面参数们[i]! })));
  const 兼容 = 段们.filter((s) => !是原生(s));
  const 兼容声音指纹 = await 算全部段指纹(兼容.map((s) => ({ 段: s, 渲染设置: 声音渲染参数() })));
  const 声音指纹们 = 段们.map((s, i) => (是原生(s) ? 画面指纹们[i]! : 兼容声音指纹[兼容.indexOf(s)]!));
  const 起帧 = 全片起帧表(全部.map((x) => ({ 键: x.键, 帧数: x.段.帧数 })));
  const fps = 成片档().fps;
  return 段们.map((s, i) => {
    const 窗 = 段输出窗于(全部, s);
    const 起 = 起帧.get(s.键)!;
    return {
      段: s,
      画面指纹: 画面指纹们[i]!,
      声音指纹: 声音指纹们[i]!,
      画面: 段画面路径(s.键, 画面指纹们[i]!.指纹),
      声音: 段声音路径(s.键, 声音指纹们[i]!.指纹),
      输出帧数: 窗.帧数,
      输出起帧: 窗.起,
      ...(是原生(s) ? { 声音起秒: 窗.起 / fps, 声音止秒: (窗.起 + 窗.帧数) / fps } : { 声音起秒: 起 / s.段.fps, 声音止秒: (起 + s.段.帧数) / s.段.fps }),
      参数: 画面参数们[i]!,
    };
  });
};

/** 指纹记录是不是画面那遍的（声音那遍 codec 是 wav） */
export const 是画面记录 = (h: { 项?: Pick<指纹项, '渲染设置'> }) => h.项?.渲染设置?.codec !== 'wav';

/** 同一档：同一渲染级别、同一输出帧率的画面记录（stale 比差异、认指纹找旧版只在同档里找；字幕变了照样同档，差异里看得到） */
export const 同档 = (a: { 项?: Pick<指纹项, '渲染设置'> }, b: { 项?: Pick<指纹项, '渲染设置'> }) => {
  const 档 = (h: typeof a) => {
    const p = h.项?.渲染设置?.inputProps as { 级别?: unknown; 输出fps?: unknown } | undefined;
    return 稳定JSON([p?.级别 ?? null, p?.输出fps ?? null, h.项?.渲染设置?.scale ?? null]);
  };
  return 是画面记录(a) && 是画面记录(b) && 档(a) === 档(b);
};

/**
 * 画面那遍的指纹记录 → 同一份代码、地形下声音那遍的指纹：两遍只差 渲染设置（指纹.ts 的 算一组指纹），换成声音渲染参数重算。
 * 显卡取画面记录里的（换机器后 gl 不一样也配得上）。认指纹按它找旧画面配的那份 wav。
 * 原生段（画面那遍带声音，muted: false）声音同一遍出，就是画面记录自己的指纹
 */
export const 配对声音指纹 = (画面: Pick<段指纹, '项'>): string => {
  if (画面.项.渲染设置.muted === false) return crypto.createHash('sha256').update(稳定JSON(画面.项)).digest('hex');
  const 声 = { ...声音渲染参数(), gl: 画面.项.渲染设置.gl };
  const { 帧数, fps, 宽, 高 } = 画面.项.渲染设置 as Record<string, unknown>;
  const 项: 指纹项 = { ...画面.项, 渲染设置: { ...声, 帧数, fps, 宽, 高 } };
  return crypto.createHash('sha256').update(稳定JSON(项)).digest('hex');
};
