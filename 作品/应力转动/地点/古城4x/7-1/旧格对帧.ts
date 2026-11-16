// 旧编排 1/24 秒一格时取整到格上的时刻（用户看过的画面是这一版）挪到 60 帧的帧上。用户 11-15 定：允许 1/120 秒的误差。
// 取离旧那一格最近的帧：偶数格本来就在帧上，不动；奇数格正好在两帧中间，往没取整的设计时刻那边挪 1/120 秒。
// 第 7 章各场共用（7-1 的切镜、7-2、7-3、7-4-3、7-又一只）；7-1 的段界没用它，原因见 时间线.ts。别的章换成秒时用得上，可以挪进 engine/段/时间.tsx。

/** 旧格号 → 帧号（1/60 秒一帧）。design 是取整前的时刻（秒）；它本来就在这一格上（没取整过）时原样返回，可能是半帧 */
export const seenCellToFrame = (cell: number, design: number): number => {
  const frame = cell * 2.5;
  if (Number.isInteger(frame) || design * 24 === cell) return frame;
  return design * 60 < frame ? Math.floor(frame) : Math.ceil(frame);
};

/** 旧编排四舍五入到格上的时刻 → 挪到帧上（秒） */
export const seenSecToFrameSec = (design: number): number => seenCellToFrame(Math.round(design * 24), design) / 60;
