// 正片歌词艺术字（界面/符文歌词.tsx）的数据：每句的字、拼音、进场帧、逐字解码帧。纯模块（段.ts 也能 import），不许 import react、three、remotion。
// 每个字先写成它的拼音（不带声调）的银河字母：银河字母本来就是拉丁字母换了字形（原版 font/alt.json 把 a～z 映到 ascii_sga.png），
// 唱到这个字时「读音落成字」解码成中文（10-22 提的方案，用户 10-24 原话「我记得你提出用魔法符文拼成的字 我觉得很合理 你怎么这里不用？」）。
// 拼音是 pypinyin 0.55 按整句取的、Agent 逐个核过多音字（都 dou、乐 le、着 zhe、为 wei、差 cha、刹 cha、了 le）。
import { 歌曲帧, fps } from '../分镜.ts';
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

/**
 * 正片第 序 句：入 = 开口（有前导音取前导，同 分镜.ts 的「开口」，也是 界面/歌词.tsx 那版的入帧），解 = 配乐/逐字.ts 的秒 × fps。
 * 起帧 = 这一段在歌上的起帧（分镜.ts 段窗口的 起帧），减掉就是段内帧；核对段不减。
 */
export const 正片歌词行 = (序: number, 起帧 = 0): 符文歌词行 => {
  const s = 句们.find((x) => x.序 === 序);
  if (!s) throw new Error(`配乐/网格.ts 里没有第 ${序} 句`);
  const 音 = 拼音[序];
  const 时 = 逐字[序];
  if (!音 || !时) throw new Error(`第 ${序} 句没有拼音或逐字时刻`);
  return { 词: s.词, 拼音: 音, 入: 歌曲帧(s.前导 ?? s.起) - 起帧, 解: 时.map((t) => t * fps - 起帧) };
};
