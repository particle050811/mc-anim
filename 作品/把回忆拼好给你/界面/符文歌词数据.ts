// 正片歌词艺术字（界面/符文歌词.tsx）的数据：每句的字、拼音、进场帧、逐字拼齐帧，带上 歌词排版表.ts 的排法和关键词。纯模块（段.ts 也能 import），不许 import react、three、remotion。
// 送笔画来的符文是这个字拼音（不带声调）的银河字母：银河字母本来就是拉丁字母换了字形（原版 font/alt.json 把 a～z 映到 ascii_sga.png），
// 「读音落成字」是 10-22 提的方案（用户 10-24 原话「我记得你提出用魔法符文拼成的字 我觉得很合理 你怎么这里不用？」），怎么拼见 符文拼字.ts。
// 拼音是 pypinyin 0.55 按整句取的、Agent 逐个核过多音字（都 dou、乐 le、着 zhe、为 wei、差 cha、刹 cha、了 le）。
import { fps, legacyFrameSec } from '../分镜/时间.ts';
import { events as lyricEvents } from '../分镜/歌词.ts';
import { sentences, beatGrid } from '../配乐/网格.ts';
import { perChar } from '../配乐/逐字.ts';
import { keywords, lyricLayoutTable } from './歌词排版表.ts';
import { runeLyricDefault, type WordEffect, type RuneLyricLine } from './符文排版.ts';

export const pinyin: Readonly<Record<number, readonly string[]>> = {
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
 * 进场：这一句最早从哪一帧起有符文起飞（上一句这时已经让开）。原来是整句符文先亮出来的时刻（五家评审 10-24 折中的提前量，Agent 定），数照旧。
 * 两句之间（上一句末字起唱到这一句首字起唱）按 0.43 : 0.57 分给这一句的提前和上一句的停留，提前至少 0.3 秒；
 * 但上一句末字起唱后至少 最短留秒 才进（24 fps 时 4 帧：末字起唱前 1 帧拼完、退场 3 帧，中间整句完整地亮 2 帧）。第 1 句前面没有句，提前 0.6 秒
 */
export const entryParams = { 比: 0.43, minLeadSec: 0.3, firstLineLeadSec: 0.6, minHoldSec: legacyFrameSec(4) } as const;

/**
 * 两处让给聊天栏（用户 10-24「文字一时只走一路」）：第 14、15 句之间（核查 10-24：「Steve加入了游戏」和底部的第 15 句同一帧出），
 * 第 14 句在你上线（分镜 第15句加入游戏）那一帧退完、第 15 句等聊天行淡完（分镜 第15句歌词进）才进场；
 * 第 12 句等切出「Steve退出了游戏」那一镜（分镜 第12句歌词进）才进场。
 * 那时头几个字已经唱过，不一下全亮（那样就是素字），第一个字进场后 首字秒 拼齐，往后每个字至少隔 追字秒，追上逐字时刻以后照唱的来（Agent 暂定：
 * 追字秒 比唱的快一倍多，同时在飞的符文不过 7 枚）。24 fps 时 7、5 帧
 */
export const yieldToChat = { firstCharSec: legacyFrameSec(7), chaseSec: legacyFrameSec(5) } as const;

/** 进场晚于唱的句：解 往后推到 入 + 首字秒 起、每字隔 追字秒，追上了就照原来的 */
const chaseTimes = (charTimes: readonly number[], enterFrame: number): number[] => {
  const r: number[] = [];
  charTimes.forEach((t, j) => r.push(Math.max(t, j === 0 ? enterFrame + yieldToChat.firstCharSec * fps : r[j - 1]! + yieldToChat.chaseSec * fps)));
  return r;
};

/** 第 序 句的关键词效果（帧是段内帧）：刹那 在第 11 句世界碎掉那一拍裂开，时差 的残影晚半拍 */
const keywordEffect = (lineIndex: number, word: string, startFrame: number): WordEffect | undefined => {
  const k = keywords[lineIndex];
  if (!k) return undefined;
  const fromIndex = [...word].findIndex((_, i) => [...word].slice(i, i + [...k.word].length).join('') === k.word);
  if (fromIndex < 0) throw new Error(`第 ${lineIndex} 句「${word}」里没有关键词「${k.word}」`);
  const endIndex = fromIndex + [...k.word].length - 1;
  if (k.effect === '刹那') return { effect: k.effect, 从: fromIndex, 到: endIndex, shatterFrame: lyricEvents.第11句碎裂.帧 - startFrame };
  if (k.effect === '时差') return { effect: k.effect, 从: fromIndex, 到: endIndex, halfBeat: (beatGrid.拍长 / 2) * fps };
  return { effect: k.effect, 从: fromIndex, 到: endIndex };
};

/** 照 进场 推的入帧（不管让聊天）：上一句的末字到这一句的首字 */
const normalEnter = (lineIndex: number) => {
  const firstCharFrame = perChar[lineIndex]![0]! * fps;
  const prevLineTimes = perChar[lineIndex - 1];
  if (!prevLineTimes) return Math.round(firstCharFrame - entryParams.firstLineLeadSec * fps);
  const lastFrame = prevLineTimes[prevLineTimes.length - 1]! * fps;
  return Math.max(Math.round(firstCharFrame - Math.max(entryParams.minLeadSec * fps, entryParams.比 * (firstCharFrame - lastFrame))), Math.ceil(lastFrame + entryParams.minHoldSec * fps));
};

/**
 * 正片第 序 句：入 照 进场 推（上一句的末字到这一句的首字），解 = 配乐/逐字.ts 的秒 × fps，带上 歌词排版表.ts 的排法和关键词效果；第 12、14、15 句照 让聊天。
 * 起帧 = 这一段在歌上的起帧（分镜 段窗口的 起帧），减掉就是段内帧；核对段不减。
 */
export const mainCutLyricLine = (lineIndex: number, startFrame = 0): RuneLyricLine => {
  const s = sentences.find((x) => x.序 === lineIndex);
  if (!s) throw new Error(`配乐/网格.ts 里没有第 ${lineIndex} 句`);
  const syllables = pinyin[lineIndex];
  const timeSpan = perChar[lineIndex];
  if (!syllables || !timeSpan) throw new Error(`第 ${lineIndex} 句没有拼音或逐字时刻`);
  let enterFrame = normalEnter(lineIndex);
  let charTimes = timeSpan.map((t) => t * fps);
  const yieldEnterFrame = lineIndex === 12 ? lyricEvents.第12句歌词进.帧 : lineIndex === 15 ? lyricEvents.第15句歌词进.帧 : undefined;
  if (yieldEnterFrame !== undefined) {
    enterFrame = yieldEnterFrame;
    charTimes = chaseTimes(charTimes, enterFrame);
  }
  // 第 14 句在你上线那一帧退完；第 11 句在第 12 句原来的进场时刻退完（世界碎掉、「Steve退出了游戏」出来那一下），不跟着它晚进拖着；
  // 第 12 句在她左边（歌词排版表），镜头一往右横移她就往左滑过来，横移起那一帧退完
  const exitDone = lineIndex === 14 ? lyricEvents.第15句加入游戏.帧 : lineIndex === 12 ? lyricEvents.横移起.帧 : lineIndex === 11 ? normalEnter(12) : undefined;
  const fadeOutFrame = exitDone === undefined ? undefined : exitDone - runeLyricDefault.exitSec * fps;
  const wordEffect = keywordEffect(lineIndex, s.text, startFrame);
  return {
    text: s.text,
    pinyin: syllables,
    入: enterFrame - startFrame,
    charTimes: charTimes.map((t) => t - startFrame),
    ...(fadeOutFrame !== undefined ? { 收: fadeOutFrame - startFrame } : {}),
    序: lineIndex,
    版: lyricLayoutTable[lineIndex] ?? {},
    ...(wordEffect ? { wordEffect: wordEffect } : {}),
  };
};
