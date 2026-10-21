// 6-4-7至9 贪功钻出Warden：6-4-7 贪功末尾挪到二人身后的机位不切，就是 6-4-8 钻出（一个镜头），6-4-9 第一镜又从 6-4-8 末帧机位接着推，
// 一个镜头不拆进两段（用户 10-18 定），三截合成一段。各截的戏、机位照旧在 ../6-4-7/、../6-4-8/、../6-4-9/（编排按各自的段内帧）。
// 6-4-8 第 0 帧 = 6-4-7 末帧（契约 衔接.六四八首），6-4-9 第 0 帧 = 6-4-8 末帧（6-4-9/编排.ts 的 `frame648`），合进来都从它们的第 1 帧起，不重复那一帧。
import * as K647 from '../6-4-7/编排.ts';
import * as K648 from '../../../../world/地点/古城4x/6-4-8/编排.ts';
import * as K649 from '../../../../world/地点/古城4x/6-4-9/编排.ts';

export const FPS = K647.FPS;
// 每截：在合成段里占几帧、从它自己的第几帧起
export const parts = [
  { id: '6-4-7', frameCount: K647.frameCount, firstFrame: 0 },
  { id: '6-4-8', frameCount: K648.END - 1, firstFrame: 1 },
  { id: '6-4-9', frameCount: K649.END - 1, firstFrame: 1 },
] as const;
export type PartId = (typeof parts)[number]['id'];
export const partStartFrame: Record<PartId, number> = (() => {
  const out = {} as Record<PartId, number>;
  let frameAcc = 0;
  for (const part of parts) {
    out[part.id] = frameAcc;
    frameAcc += part.frameCount;
  }
  return out;
})();
export const frameCount = parts.reduce((n, p) => n + p.frameCount, 0);
// 某一截的段内帧 → 合成段的帧（可带小数、可越出这一截）
export const toMergedFrame = (id: PartId, partFrame: number) => partStartFrame[id] + partFrame - parts.find((p) => p.id === id)!.firstFrame;
// 合成段的帧 → 落在哪一截、那一截的段内帧
export const partAt = (frame: number): { id: PartId; f: number } => {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (frame >= partStartFrame[part.id] || i === 0) return { id: part.id, f: frame - partStartFrame[part.id] + part.firstFrame };
  }
  throw new Error('unreachable');
};
