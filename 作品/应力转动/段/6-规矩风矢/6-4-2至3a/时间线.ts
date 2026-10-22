// 6-4-2至3a 规矩风矢：6-4-2 规矩的镜头 3（他东南高处慢慢落到箱子南边）不切，接着就是 6-4-3a 风矢的 A1（同一机位接着推），一个镜头不拆进两段（用户 10-18 定），合成一段。
// 前半截照 ../6-4-2/（编排、画面、声音），后半截是 6-4-3 时间线上的 6-4-3a 窗口。两截不共用帧：6-4-2 末帧是 6-4-3a 首帧的前一刻（契约 古城4x布局.ts 的 六四二末帧）。
import * as K642 from '../6-4-2/编排.ts';
import { 段帧数 } from '../../../场/6-古城/6-4-3/时间线.ts';

export const parts = [
  { id: '6-4-2', frameCount: K642.END },
  { id: '6-4-3a', frameCount: 段帧数('6-4-3a') },
] as const;
export type PartId = (typeof parts)[number]['id'];
export const partStartFrame: Record<PartId, number> = { '6-4-2': 0, '6-4-3a': K642.END };
export const frameCount = parts.reduce((n, p) => n + p.frameCount, 0);
