// 一首配乐的数据格式，和按节拍网格换算时间的工具。
// 换曲子或换版本时只换数据（音频文件、分析结果、段落、歌词，见 Wasted.ts），这里和组件都不用动。
// 时间一律是"歌曲时间"：从这首歌的音频开头算起的秒数。

// 位置：直接写秒，或写 [小节, 拍]。小节、拍都从 1 数；拍可以带小数，[14, 2.5] 是第 14 小节第 2 拍的后半拍
export type MusicPos = number | readonly [number, number];

// 工具/配乐分析.py 生成的 <曲名>.分析.json
export type AnalysisData = {
  音频: string;
  时长: number;
  网格: { 首个强拍: number; 拍长: number; 每小节拍数: number; BPM: number };
  拟合: { 起音数: number; 残差均方根毫秒: number; 分窗残差毫秒: number[][]; 说明: string };
  // 全频：每格最大振幅（线性 0~255）；低频：150 Hz 以下的能量（0 = 比最响处低 48 dB）
  波形: { 每秒: number; 全频: number[]; 低频: number[]; 说明: string };
  生成: string;
};

export type Song = {
  名称: string;
  版本: string; // 给人看的版本说明
  音频: string; // import 进来的音频文件地址
  文件: string; // 音频的资产 id，只记进配乐清单（剪辑包照它找配乐），不用来加载
  clickTrack: string; // 和音频等长的节拍声音轨地址（工具/配乐分析.py 生成）
  fileOffsetSec: number; // 音频文件里的时间 = 歌曲时间 + 文件偏移。分析和播放用的是同一个文件时为 0
  analysis: AnalysisData;
  段落: readonly { 起: MusicPos; 止: MusicPos; 名: string; 说明?: string; noVocal?: boolean }[]; // 前奏、副歌、主歌这一级
  事件: readonly { 位: MusicPos; 名: string }[]; // drop、抽底、低频回来这类听得出的变化
  lyrics: readonly { 位: MusicPos; 文: string }[]; // 每句开头几个词（whisper 识别，可能有误），只用来认位置
};

export const posToSec = (song: Song, pos: MusicPos): number => {
  if (typeof pos === 'number') return pos;
  const grid = song.analysis.网格;
  return grid.首个强拍 + ((pos[0] - 1) * grid.每小节拍数 + (pos[1] - 1)) * grid.拍长;
};
// 当前所在的段落：起点 <= t < 止 的那条
