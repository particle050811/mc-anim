// 一首配乐的数据格式，和按节拍网格换算时间的工具。
// 换曲子或换版本时只换数据（音频文件、分析结果、段落、歌词，见 Wasted.ts），这里和组件都不用动。
// 时间一律是"歌曲时间"：从这首歌的音频开头算起的秒数。

// 位置：直接写秒，或写 [小节, 拍]。小节、拍都从 1 数；拍可以带小数，[14, 2.5] 是第 14 小节第 2 拍的后半拍
export type MusicPos = number | readonly [number, number];

// 工具/配乐分析.py 生成的 <曲名>.分析.json
export type AnalysisData = {
  audio: string;
  duration: number;
  grid: { firstDownbeat: number; beatSec: number; beatsPerBar: number; BPM: number };
  fit: { onsetCount: number; residualRmsMs: number; windowResidualMs: number[][]; note: string };
  // 全频：每格最大振幅（线性 0~255）；低频：150 Hz 以下的能量（0 = 比最响处低 48 dB）
  waveform: { perSec: number; fullBand: number[]; lowBand: number[]; note: string };
  generated: string;
};

export type Song = {
  displayName: string;
  version: string; // 给人看的版本说明
  audio: string; // import 进来的音频文件地址
  file: string; // 音频的资产 id，只记进配乐清单（剪辑包照它找配乐），不用来加载
  clickTrack: string; // 和音频等长的节拍声音轨地址（工具/配乐分析.py 生成）
  fileOffsetSec: number; // 音频文件里的时间 = 歌曲时间 + 文件偏移。分析和播放用的是同一个文件时为 0
  analysis: AnalysisData;
  段落: readonly { start: MusicPos; end: MusicPos; name: string; note?: string; noVocal?: boolean }[]; // 前奏、副歌、主歌这一级
  events: readonly { 位: MusicPos; name: string }[]; // drop、抽底、低频回来这类听得出的变化
  lyrics: readonly { 位: MusicPos; 文: string }[]; // 每句开头几个词（whisper 识别，可能有误），只用来认位置
};

export const posToSec = (song: Song, pos: MusicPos): number => {
  if (typeof pos === 'number') return pos;
  const grid = song.analysis.grid;
  return grid.firstDownbeat + ((pos[0] - 1) * grid.beatsPerBar + (pos[1] - 1)) * grid.beatSec;
};
// 当前所在的段落：起点 <= t < 止 的那条
