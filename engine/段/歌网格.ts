// 跟着一首歌排画面的时间线用的扩展时刻：拍、小节下拍、某一句的前导/起/止/开口。纯模块。
// 从 作品/把回忆拼好给你/分镜/时间.ts 的 resolveMoment 抽出来（那边现在用它，网格、句表给原声的）；歌的网格和句表由作品的分析数据给。

export type BeatGrid = {
  /** 第 0 拍（第一个强拍）在文件里第几秒 */
  firstBeat: number;
  /** 一拍几秒 */
  beatSec: number;
  beatsPerBar: number;
};
/** 一句歌词：起是首字主音开始响的时刻；句首前有独立短音的记作 前导 */
export type SongSentence = { 序: number; leadIn?: number; 起: number; 止: number };

export type SongMoment = { beat: number } | { measure: number } | { 句: number; points: '前导' | '起' | '止' | '开口' };

/** 给 时间线.ts 的 解析：歌时刻 → 秒。开口 = 第一个出声的地方（有前导取前导，没有取起） */
export const parseSongGrid = (grid: BeatGrid, songSentences: readonly SongSentence[] = []) => {
  const beatTime = (n: number) => grid.firstBeat + grid.beatSec * n;
  return (t: SongMoment): number => {
    if ('beat' in t) return beatTime(t.beat);
    if ('measure' in t) return beatTime(grid.beatsPerBar * t.measure);
    const s = songSentences.find((x) => x.序 === t.句);
    if (!s) throw new Error(`句表里没有第 ${t.句} 句`);
    if (t.points === '前导' && s.leadIn === undefined) throw new Error(`第 ${t.句} 句没有前导音`);
    return t.points === '开口' ? (s.leadIn ?? s.起) : t.points === '前导' ? s.leadIn! : s[t.points];
  };
};
