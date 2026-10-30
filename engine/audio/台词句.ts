// 一句台词的运行时数据：作品的 台词/<台词 id>.ts 由 anim voice 生成、默认导出这个形状（纯数据，段.ts、编排.ts 也能引）。
// 一句一个模块，段只 import 自己用的那几句：加一句、改一句只让用到它的段过期（一次引全表的旧 台词轨.tsx 一改全过期）。
// 声音另引 asset:<配音>，见 台词句轨.tsx；嘴见 库/角色/句口型.ts。

export type 台词句 = {
  id: string;
  角色: string;
  /** 念的字（交给 TTS、对口型的；字幕的 文本 只在 台词.toml，改字幕不让段过期） */
  念: string;
  /** 配音成品的资产 id；声音由画面 import 'asset:<配音>' 取 */
  配音: string;
  /** 配音成品 sha256 前 12 位：句模块是对着哪版成品做的 */
  成品sha: string;
  /** 成品里第几秒开口（cue 的帧对的是它）、开口到说完几秒、文件几秒（裁静音时算的，放的时候按它算帧数） */
  开口: number;
  有声长: number;
  时长: number;
  /** 成品 wav 头里的秒数（3 位）：口型按它在句尾补静音 */
  文件秒数: number;
  /** 字的起止 [单位, 起秒, 止秒]：对齐器出的或 台词.toml 的 口型手修；手修 = 来自手修 */
  字: readonly (readonly [string, number, number])[];
  手修?: true;
  /** 嘴型关键帧 [文件里的秒, Rhubarb 嘴型 A～F、X]，由 字 按规则算出（py/anim_py/配音/口型.py） */
  嘴: readonly (readonly [number, string])[];
};

/** 段里放一句：帧 = 开口落在段内第几帧（可带小数、可为负：上一段就开口了），同 段.ts 的台词 cue */
export type 台词句cue = { 句: 台词句; 帧: number; 音量?: number };

/** 一句从开口到说完要几帧 */
export const 句帧数 = (句: 台词句, fps = 24) => Math.ceil(句.有声长 * fps);
