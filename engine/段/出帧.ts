// 编排帧率和输出帧率（纯数据，pipeline 也 import）：段.ts 的 fps 是编排时钟（帧号、cue、关键帧都按它写），成片按成片档的帧率出。
// 《应力转动》按 24 帧编排、出 60 帧（用户 11-05「改成 60 帧」，同一个时刻的画面不变，只是采样密了）。
// 24 → 60 不是整倍数，段界落在输出帧的哪一格按全片位置算：输出第 g 帧取全片编排时刻 g × 编排fps / 输出fps，
// 段 [起, 起 + 帧数) 占输出帧 [⌈起 × 比⌉, ⌈(起 + 帧数) × 比⌉)。各段首帧离段起点的那点零头就是 相位（编排帧，0 ≤ 相位 < 1），
// 所以同一段放在全片不同位置时相位可能不同。相位不进指纹（清单.ts 的边不跟）：段挪了位置，只有这段的字幕卡（进 inputProps）跟着变时指纹才变。声音还按编排时钟出（秒数不变），画面和声音最多差半个输出帧。

const 容差 = 1e-9;

/** 编排第 帧 帧（可带小数）往后第一个输出帧 */
export const 输出帧号 = (编排帧: number, 编排fps: number, 输出fps: number) => Math.ceil((编排帧 * 输出fps) / 编排fps - 容差);

export type 输出窗 = { 起: number; 帧数: number; 相位: number };

/** 全片编排帧 [起, 起 + 帧数) 的段，在输出帧上占的窗；相位 = 段内第 0 个输出帧对应的段内编排帧 */
export const 段输出窗 = (起: number, 帧数: number, 编排fps: number, 输出fps: number): 输出窗 => {
  if (编排fps === 输出fps) return { 起, 帧数, 相位: 0 };
  const a = 输出帧号(起, 编排fps, 输出fps);
  const b = 输出帧号(起 + 帧数, 编排fps, 输出fps);
  // 相位舍到 1e-9：0.2 这种在浮点里是 0.19999…，舍掉才稳定
  const 相位 = Math.round(((a * 编排fps) / 输出fps - 起) * 1e9) / 1e9;
  return { 起: a, 帧数: b - a, 相位 };
};

/** 清单顺序里各正片段的全片编排起帧（核对段不进成片，各自从 0 起） */
export const 全片起帧表 = (段们: readonly { 键: string; 帧数: number }[]): Map<string, number> => {
  const 表 = new Map<string, number>();
  let at = 0;
  for (const s of 段们) {
    if (s.键.startsWith('核对-')) {
      表.set(s.键, 0);
      continue;
    }
    表.set(s.键, at);
    at += s.帧数;
  }
  return 表;
};
