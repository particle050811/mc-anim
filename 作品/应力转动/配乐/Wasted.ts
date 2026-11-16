// 第六章飞行配乐：Wasted 的 Nightcore remix（Huken x Murkish，SoundCloud 上 huken 上传，3:00），不是 Juice WRLD 原版。
// 参照视频 BV1hbwvzME4E 用的是这个文件 2.246～122.5 秒那一截（没剪过）。
//
// 数据来源（2026-10-01 本地分析）：
// - 网格、波形、节拍声：工具/配乐分析.py 生成的 Wasted.分析.json、Wasted.节拍声.wav（npm run 分析:Wasted）
// - 段落和事件：看那个脚本 --表 打出来的逐拍频段能量（低频进出、响度、踩镲有无）标的
// - 歌词：whisper-cli（large-v3-turbo）按 4 小节一块识别，时间吸附到拍；只留每句开头几个词，用来认位置，识别有误
// 换版本：换下面三个 import，重跑分析脚本，再按新的逐拍表和歌词核对段落、事件、歌词的小节号。组件不用改。
// 待迁移（私有资产）：配乐私有，M5 配乐改走 cue（缺了换静音）后不再打进包
import audioUrl from 'asset:配乐/Wasted';
import clickTrackUrl from 'asset:配乐/Wasted-节拍声';
import analysis from './Wasted.分析.json';
import type { Song } from '@engine/audio/曲目.ts';

const chorusLyrics = (bar: number) =>
  [
    { 位: [bar, 1], 文: 'GTA love…' },
    { 位: [bar + 1, 1], 文: "I'm on these drugs…" },
    { 位: [bar + 2, 1], 文: 'Get her off my mind…' },
    { 位: [bar + 3, 1], 文: "I've reached all my time…" },
  ] as const;

export const Wasted: Song = {
  displayName: 'Wasted',
  version: 'Huken x Murkish Nightcore（huken 上传，3:00）',
  audio: audioUrl,
  file: '配乐/Wasted',
  clickTrack: clickTrackUrl,
  fileOffsetSec: 0,
  analysis: analysis,
  段落: [
    { start: 0, end: [5, 1], name: '前奏', note: '没有鼓和低频，越来越响；4.4 低频往上一扬', noVocal: true },
    { start: [5, 1], end: [13, 1], name: '副歌一', note: '5.1 drop，全编制；12.4 抽掉一拍低频' },
    { start: [13, 1], end: [21, 1], name: '主歌一', note: 'Juice WRLD 的词；19.4～20.4 低频抽空，21.1 砸回来' },
    { start: [21, 1], end: [25, 1], name: '间奏', note: '全编制，没有人声', noVocal: true },
    { start: [25, 1], end: [29, 1], name: '副歌二', note: '只唱四句' },
    { start: [29, 1], end: [33, 1], name: 'breakdown', note: 'Lil Uzi Vert 的主歌开头；低频全部抽走，响度掉 8 dB' },
    { start: [33, 1], end: [39, 1], name: '主歌二', note: 'Lil Uzi Vert 的词；33.1 低频砸回来' },
    { start: [39, 1], end: [46, 1], name: '主歌二快嘴段', note: '语速翻倍；44.1 低频变薄，44.4～45.4 抽空' },
    { start: [46, 1], end: [49, 1], name: '尾段', note: '低频回来，没有踩镲，没有人声', noVocal: true },
    { start: [49, 1], end: [53, 1], name: '副歌三', note: '参照视频之后的部分' },
    { start: [53, 1], end: [61, 1], name: '主歌三', note: 'Juice WRLD 的词；53～56 低频偏弱' },
    { start: [61, 1], end: [65, 1], name: '副歌四' },
    { start: [65, 1], end: [69, 1], name: '尾奏', note: '没有人声', noVocal: true },
    { start: [69, 1], end: 180.2388, name: '结尾', note: '最后一击，然后衰减到无声', noVocal: true },
  ],
  events: [
    { 位: [4, 4], name: '低频上扬' },
    { 位: [5, 1], name: 'drop' },
    { 位: [12, 4], name: '抽一拍' },
    { 位: [13, 1], name: '主歌一' },
    { 位: [19, 4], name: '抽底' },
    { 位: [21, 1], name: '低频砸回来' },
    { 位: [25, 1], name: '副歌二' },
    { 位: [29, 1], name: 'breakdown' },
    { 位: [32, 4], name: '低频上扬' },
    { 位: [33, 1], name: '低频砸回来' },
    { 位: [39, 1], name: '快嘴' },
    { 位: [44, 1], name: '低频变薄' },
    { 位: [44, 4], name: '抽底' },
    { 位: [46, 1], name: '低频回来' },
    { 位: [49, 1], name: '踩镲回来' },
    { 位: [52, 4], name: '抽底' },
    { 位: [56, 4], name: '抽一拍' },
    { 位: [57, 1], name: '全编制' },
    { 位: [60, 4], name: '抽一拍' },
    { 位: [69, 1], name: '最后一击' },
  ],
  lyrics: [
    ...chorusLyrics(5),
    ...chorusLyrics(9),
    { 位: [13, 1], 文: "Damn, why she's so…" },
    { 位: [14, 1], 文: 'She Medusa with…' },
    { 位: [15, 1], 文: 'She been lacing…' },
    { 位: [16, 1], 文: 'Cause every time…' },
    { 位: [17, 1], 文: 'Hold up, let me…' },
    { 位: [18, 1], 文: "I know I'm sorry…" },
    { 位: [19, 1], 文: 'Look into my eyes…' },
    { 位: [20, 1], 文: 'Chasing like a…' },
    ...chorusLyrics(25),
    { 位: [29, 1], 文: 'She knew…' },
    { 位: [30, 1], 文: "I'm a doctor but…" },
    { 位: [31, 1], 文: 'She told me that…' },
    { 位: [32, 1], 文: 'She be talking…' },
    { 位: [33, 1], 文: "I'm a rockstar…" },
    { 位: [34, 1], 文: 'Hate it, but…' },
    { 位: [35, 1], 文: "I'm a bad, but…" },
    { 位: [36, 1], 文: "Take it, that's…" },
    { 位: [37, 1], 文: "That's a…" },
    { 位: [38, 1], 文: "I'm a fire with me…" },
    { 位: [39, 1], 文: 'I got a knock…' },
    { 位: [40, 1], 文: 'That was just out…' },
    { 位: [40, 3], 文: 'Boy I could…' },
    { 位: [41, 1], 文: '…get up on my top' },
    { 位: [41, 3], 文: 'Cause dress in my head…' },
    { 位: [42, 1], 文: "I ain't from…" },
    { 位: [42, 3], 文: 'Who did that…' },
    { 位: [43, 1], 文: 'Thank you, who can…' },
    { 位: [43, 3], 文: 'Frogs on my trainers…' },
    { 位: [44, 1], 文: 'In the middle…' },
    ...chorusLyrics(49),
    { 位: [53, 1], 文: 'My eyes closed…' },
    { 位: [54, 1], 文: "She don't know…" },
    { 位: [55, 1], 文: "I don't know…" },
    { 位: [55, 4], 文: 'When the devil…' },
    { 位: [56, 2], 文: "I don't know, all…" },
    { 位: [57, 1], 文: 'And watch me…' },
    { 位: [58, 1], 文: "I'm a woman, girl…" },
    { 位: [59, 1], 文: "She ain't see…" },
    { 位: [60, 1], 文: 'When somebody…' },
    ...chorusLyrics(61),
  ],
};
