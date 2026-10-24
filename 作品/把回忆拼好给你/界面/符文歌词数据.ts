// 正片歌词艺术字（界面/符文歌词.tsx）的数据：每句的字、拼音、进场帧、逐字解码帧。纯模块（段.ts 也能 import），不许 import react、three、remotion。
// 每个字先写成它的拼音（不带声调）的银河字母：银河字母本来就是拉丁字母换了字形（原版 font/alt.json 把 a～z 映到 ascii_sga.png），
// 唱到这个字时「读音落成字」解码成中文（10-22 提的方案，用户 10-24 原话「我记得你提出用魔法符文拼成的字 我觉得很合理 你怎么这里不用？」）。
// 拼音是 pypinyin 0.55 按整句取的、Agent 逐个核过多音字（都 dou、乐 le、着 zhe、为 wei、差 cha、刹 cha、了 le）。
import { fps } from '../分镜.ts';
import { 句们 } from '../配乐/网格.ts';
import { 逐字 } from '../配乐/逐字.ts';
import type { 符文歌词行 } from './符文排版.ts';

export const 拼音: Readonly<Record<number, readonly string[]>> = {
  1: ['wo', 'men', 'dou', 'shi', 'miao', 'xiao', 'zhen', 'shi', 'cun', 'zai'],
  2: ['qi', 'yuan', 'xiao', 'shi', 'jie', 'li', 'bu', 'zhi', 'you', 'cuo', 'bai'],
  3: ['zhi', 'dao', 'yu', 'jian', 'ni', 'wo', 'yi', 'wei', 'jiu', 'guang', 'ming', 'qi', 'lai'],
  4: ['yan', 'jing', 'li', 'kan', 'dao', 'de', 'dou', 'shi', 'guang', 'mao', 'wu', 'yin', 'de', 'da', 'hai'],
  5: ['you', 'ni', 'zai', 'de', 'ri', 'zi', 'bu', 'ke', 'neng', 'bei', 'qu', 'dai'],
  6: ['zai', 'zui', 'hui', 'an', 'de', 'ri', 'zi', 'ni', 'pei', 'zhe', 'wo', 'fa', 'dai'],
  7: ['ni', 'rang', 'wo', 'xue', 'hui', 'ru', 'he', 'bo', 'kai', 'yin', 'mai'],
  8: ['jiang', 'kuai', 'le', 'quan', 'dou', 'shou', 'ji', 'jiang', 'bu', 'kai', 'xin', 'quan', 'dou', 'tao', 'tai'],
  9: ['ni', 'dui', 'wo', 'shuo', 'de', 'qing', 'hua'],
  10: ['xiang', 'zhuan', 'shun', 'ji', 'shi', 'de', 'yan', 'hua'],
  11: ['zhi', 'ting', 'zai', 'zhan', 'fang', 'yi', 'cha', 'na'],
  12: ['wo', 'que', 'yi', 'wu', 'fa', 'zi', 'ba'],
  13: ['wo', 'men', 'de', 'ai', 'zong', 'you', 'shi', 'cha'],
  14: ['ye', 'wei', 'ni', 'pian', 'zi', 'ji', 'fang', 'xia'],
  15: ['ai', 'zhi', 're', 'de', 'ni', 'que', 'wang', 'le', 'ai', 'zi', 'ji'],
};

/** 拆成两行的句：第一行几个字。字点 7 时 15 个字一行宽 1890 像素，五家评审 10-24 有三家要拆（按词意，第 8 句正好对仗）；14 个字以内不拆 */
export const 分行: Readonly<Record<number, number>> = { 4: 8, 8: 7 };

/**
 * 进场：整句符文在头一个字起唱前多久亮出来（五家评审 10-24 都要先看见一整句符文再逐字解；各家的提前量和句尾停留折中，Agent 定）。
 * 两句之间（上一句末字起唱到这一句首字起唱）按 0.43 : 0.57 分给这一句的提前和上一句的停留，提前至少 0.3 秒；
 * 但上一句末字起唱后至少 最短留 帧才进（末字起唱前 1 帧拼完、退场 3 帧，中间整句完整地亮 2 帧）。第 1 句前面没有句，提前 0.6 秒
 */
export const 进场 = { 比: 0.43, 最短提前秒: 0.3, 首句提前秒: 0.6, 最短留: 4 } as const;

/**
 * 正片第 序 句：入 照 进场 推（上一句的末字到这一句的首字），解 = 配乐/逐字.ts 的秒 × fps，长句带 分行。
 * 起帧 = 这一段在歌上的起帧（分镜.ts 段窗口的 起帧），减掉就是段内帧；核对段不减。
 */
export const 正片歌词行 = (序: number, 起帧 = 0): 符文歌词行 => {
  const s = 句们.find((x) => x.序 === 序);
  if (!s) throw new Error(`配乐/网格.ts 里没有第 ${序} 句`);
  const 音 = 拼音[序];
  const 时 = 逐字[序];
  if (!音 || !时) throw new Error(`第 ${序} 句没有拼音或逐字时刻`);
  const 首 = 时[0]! * fps;
  const 上 = 逐字[序 - 1];
  let 入: number;
  if (!上) 入 = Math.round(首 - 进场.首句提前秒 * fps);
  else {
    const 末 = 上[上.length - 1]! * fps;
    入 = Math.max(Math.round(首 - Math.max(进场.最短提前秒 * fps, 进场.比 * (首 - 末))), Math.ceil(末 + 进场.最短留));
  }
  return { 词: s.词, 拼音: 音, 入: 入 - 起帧, 解: 时.map((t) => t * fps - 起帧), ...(分行[序] ? { 分行: 分行[序] } : {}) };
};
