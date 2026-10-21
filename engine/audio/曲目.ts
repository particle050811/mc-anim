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
  文件: string; // 音频文件相对 src/ 的路径（剪辑包照它合成配乐，见 src/音效/音效清单.ts）
  节拍声: string; // 和音频等长的节拍声音轨地址（工具/配乐分析.py 生成）
  fileOffsetSec: number; // 音频文件里的时间 = 歌曲时间 + 文件偏移。分析和播放用的是同一个文件时为 0
  分析: AnalysisData;
  段落: readonly { 起: MusicPos; 止: MusicPos; 名: string; 说明?: string; 无人声?: boolean }[]; // 前奏、副歌、主歌这一级
  事件: readonly { 位: MusicPos; 名: string }[]; // drop、抽底、低频回来这类听得出的变化
  歌词: readonly { 位: MusicPos; 文: string }[]; // 每句开头几个词（whisper 识别，可能有误），只用来认位置
};

export const posToSec = (song: Song, pos: MusicPos): number => {
  if (typeof pos === 'number') return pos;
  const grid = song.分析.网格;
  return grid.首个强拍 + ((pos[0] - 1) * grid.每小节拍数 + (pos[1] - 1)) * grid.拍长;
};

export type BeatInfo = {
  beatIndex: number; // 从第 1 小节第 1 拍数起的第几拍（0 起，之前是负数）
  bar: number;
  beat: number; // 1 ~ 每小节拍数
  beatFrac: number; // 这一拍走了多少（0 ~ 1）
  sinceBeatSec: number; // 秒
};

export const beatAt = (song: Song, t: number): BeatInfo => {
  const grid = song.分析.网格;
  const x = (t - grid.首个强拍) / grid.拍长;
  const k = Math.floor(x + 1e-9);
  const beatsPerBar = grid.每小节拍数;
  return { beatIndex: k, bar: Math.floor(k / beatsPerBar) + 1, beat: (((k % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1, beatFrac: x - k, sinceBeatSec: (x - k) * grid.拍长 };
};

// [t0, t1] 里的每一拍
export const beatsInRange = (song: Song, t0: number, t1: number) => {
  const grid = song.分析.网格;
  const out: { t: number; bar: number; beat: number }[] = [];
  for (let k = Math.ceil((t0 - grid.首个强拍) / grid.拍长); ; k++) {
    const t = grid.首个强拍 + k * grid.拍长;
    if (t > t1) break;
    const beatsPerBar = grid.每小节拍数;
    out.push({ t, bar: Math.floor(k / beatsPerBar) + 1, beat: (((k % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1 });
  }
  return out;
};

// [14, 1] → '14.1'，[14, 2.5] → '14.2½'；秒数在第一个强拍之前写"开头"
export const posLabel = (song: Song, pos: MusicPos): string => {
  if (typeof pos !== 'number') {
    const beatInt = Math.floor(pos[1]);
    const beatRemainder = pos[1] - beatInt;
    return `${pos[0]}.${beatInt}${beatRemainder === 0 ? '' : beatRemainder === 0.5 ? '½' : `+${beatRemainder.toFixed(2)}`}`;
  }
  if (pos < song.分析.网格.首个强拍) return '开头';
  const beatInfo = beatAt(song, pos);
  return `${beatInfo.bar}.${beatInfo.beat}`;
};

// 当前所在的段落 / 歌词：起点 <= t 的最后一条（段落还要 t < 止）
export const currentPart = (song: Song, t: number) => song.段落.find((s) => posToSec(song, s.起) <= t && t < posToSec(song, s.止)) ?? null;

export const currentLyric = (song: Song, t: number) => {
  let cur: (typeof song.歌词)[number] | null = null;
  for (const lyric of song.歌词) if (posToSec(song, lyric.位) <= t) cur = lyric;
  // 下一句开始前一直显示；进了没有人声的段落就不显示
  return currentPart(song, t)?.无人声 ? null : cur;
};

export const timeLabel = (t: number) => {
  const clampedSec = Math.max(0, t);
  const minutes = Math.floor(clampedSec / 60);
  return `${minutes}:${(clampedSec - minutes * 60).toFixed(2).padStart(5, '0')}`;
};
