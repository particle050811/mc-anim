// cue 助手：段.ts 里写声音只写一次 放(资产, 帧, 目标) / 说(台词, 帧)，时长、峰值从本段的 声音表.生成.ts 取（anim cues 生成），不手填。纯模块。
// 声音表 是按段生成的：一段只依赖自己用到的那几个声音的数，加一个音效不让别的段过期（不像一张全作品的大表）。
// 生成时 anim 先在「收集」模式下执行 段.ts：表里还没有的资产不报错，记下来、先给占位 cue，量完写进表再正常执行一遍（pipeline/段框架/生成.ts）。
import type { 台词cue, 资产cue } from './段定义.ts';

/** 一个音频文件的数（资产锁里有就取锁里的，没有就 anim cues 现量）：时长秒、采样峰值 dBFS、积分响度 LUFS */
export type 音频数 = { 时长: number; 峰值?: number; 响度?: number };
/** 一句台词：配音资产 id、配音文件里第几秒开口（作品的 台词.toml）、文件时长秒；
 *  上段开口帧：这句是清单里上一段说过来的（本段只有 接上段 的 cue），它的开口落在本段第几帧（负数），anim cues 照上一段推 */
export type 台词数 = { 配音: string; 开口: number; 时长: number; 上段开口帧?: number };
export type 声音表 = { 资产: Readonly<Record<string, 音频数>>; 台词: Readonly<Record<string, 台词数>> };

export const 空声音表: 声音表 = { 资产: {}, 台词: {} };

// 收集模式的开关：anim cues 执行 段.ts 前在 globalThis 上放一个 Set，助手把表里缺的 id 记进去。用 Symbol.for，esbuild 各打一份也认得同一个
const 收集键 = Symbol.for('mc-anim.段框架.收集声音');
type 带收集 = { [收集键]?: Set<string> };
export const 开始收集 = (): Set<string> => ((globalThis as 带收集)[收集键] = new Set());
export const 结束收集 = () => delete (globalThis as 带收集)[收集键];
const 收集中 = () => (globalThis as 带收集)[收集键];

export class 缺声音数 extends Error {}

export type 放选项 = {
  /** 目标采样峰值 dBFS：增益 = 10^((目标 − 文件峰值) / 20)。只写一个数时就是它 */
  峰值?: number;
  /** 目标积分响度 LUFS：增益 = 10^((目标 − 文件响度) / 20)。锁里、表里要有 响度 */
  响度?: number;
  /** 直接给增益（常数或逐帧数组），不按峰值、响度算 */
  增益?: number | readonly number[];
  名?: string;
  帧数?: number;
  入点秒?: number;
  速率?: number;
  循环?: true;
  淡出?: number;
  档?: string;
};

/** 6 位小数（段定义.ts：增益是 6 位小数） */
const 六位 = (x: number) => Math.round(x * 1e6) / 1e6;
export const dB增益 = (dB: number) => 六位(10 ** (dB / 20));

/** 资产 id 最后一节当默认的名（剪映片段名） */
const 默认名 = (id: string) => id.slice(id.lastIndexOf('/') + 1);

/**
 * 绑到一段上的助手：fps、段帧数决定默认帧数（放到文件完、截到段尾），表给时长和峰值。
 * 放 的第三个参数：一个数 = 目标峰值 dBFS；对象见 放选项；不给 = 增益 1。
 */
export const 做声音助手 = (o: { fps: number; 帧数: number; 表?: 声音表; 段名?: string }) => {
  const 表 = o.表 ?? 空声音表;
  const 出处 = o.段名 ? `${o.段名} 的` : '本段';
  const 数 = (id: string): 音频数 | undefined => {
    const x = 表.资产[id];
    if (x) return x;
    const 收 = 收集中();
    if (收) {
      收.add(id);
      return undefined;
    }
    throw new 缺声音数(`${出处}声音表里没有「${id}」的时长、峰值：跑 anim cues（段.ts 加了声音要重新生成 声音表.生成.ts、地址表.生成.ts）`);
  };

  const 放 = (资产: string, 帧: number, 目标?: number | 放选项): 资产cue => {
    const s: 放选项 = typeof 目标 === 'number' ? { 峰值: 目标 } : (目标 ?? {});
    const 名 = s.名 ?? 默认名(资产);
    if (!Number.isInteger(帧)) throw new Error(`放「${名}」：帧要是整数（${帧}）`);
    const 文件 = 数(资产);
    // 收集模式下表里还没有：给个一帧的占位，段.ts 照样执行完，好把整段用到的 id 一次收齐
    if (!文件) return { 帧, 资产, 名, 帧数: 1 };
    const 速率 = s.速率 ?? 1;
    const 入点秒 = s.入点秒 ?? 0;
    const 到段尾 = o.帧数 - 帧;
    let 帧数 = s.帧数;
    if (帧数 === undefined) {
      if (s.循环) 帧数 = 到段尾;
      else {
        const 剩秒 = 文件.时长 - 入点秒;
        if (!(剩秒 > 0)) throw new Error(`放「${名}」：入点秒 ${入点秒} 已经到了文件尾（${文件.时长} 秒）`);
        帧数 = Math.min(Math.ceil((剩秒 * o.fps) / 速率 - 1e-6), 到段尾);
      }
    }
    let 增益: number | readonly number[] | undefined = s.增益;
    const 给了 = [s.增益 !== undefined, s.峰值 !== undefined, s.响度 !== undefined].filter(Boolean).length;
    if (给了 > 1) throw new Error(`放「${名}」：峰值、响度、增益只能给一个`);
    if (s.峰值 !== undefined) {
      if (文件.峰值 === undefined) throw new Error(`放「${名}」：${资产} 量不出峰值（静音？），直接给 增益`);
      增益 = dB增益(s.峰值 - 文件.峰值);
    }
    if (s.响度 !== undefined) {
      if (文件.响度 === undefined) throw new Error(`放「${名}」：${资产} 没有响度数，按峰值给或直接给 增益`);
      增益 = dB增益(s.响度 - 文件.响度);
    }
    return {
      帧,
      资产,
      名,
      帧数,
      ...(s.档 !== undefined ? { 档: s.档 } : {}),
      ...(s.入点秒 !== undefined ? { 入点秒: s.入点秒 } : {}),
      ...(s.速率 !== undefined ? { 速率: s.速率 } : {}),
      ...(s.循环 ? { 循环: true as const } : {}),
      ...(增益 !== undefined && 增益 !== 1 ? { 增益 } : {}),
      ...(s.淡出 !== undefined ? { 淡出: s.淡出 } : {}),
    };
  };

  /** 台词：帧是开口落在段内第几帧（可带小数）；配音文件头 = 帧 − 开口秒 × fps，数在作品的 台词.toml */
  const 说 = (台词: string, 帧: number, s: { 帧数?: number } = {}): 台词cue => ({ 帧, 台词, ...(s.帧数 !== undefined ? { 帧数: s.帧数 } : {}) });
  /** 一句话的后半截（前面本段或上一段已经开口）：从本段第 帧 帧（整帧）接着放 */
  const 接着说 = (台词: string, 帧: number, s: { 帧数?: number } = {}): 台词cue => ({ 帧, 台词, 接上段: true, ...(s.帧数 !== undefined ? { 帧数: s.帧数 } : {}) });

  return { 放, 说, 接着说 };
};

export type 声音助手 = ReturnType<typeof 做声音助手>;
