// 第 1 场暮色森林 6-1-1～6-1-9 的段界。用户 10-18 定：段界放在切镜那一帧，段与段不共用帧，一个镜头不拆进两段。
// 戏还是原来那几个组件演（6-1-1 进入森林、6-1-2 斩娜迦、6-1-3 起飞、一镜到底，帧号都是各自的段内帧；一镜到底是全局帧 F），
// 这里只定每段由哪几截拼成（拼段.tsx）。这几个组件首帧 = 上一个的末帧，从第二个起各截都从第 1 帧拿，整片里每一帧还是原来的时刻（配乐卡点不动）：
// - 6-1-1 | 6-1-2：切到 6-1-2 首帧机位（6-1-1 的 D2）那一帧；D2 和 6-1-2 镜头 1 是同一个静止机位。
// - 6-1-2 | 6-1-3：切到迷宫里的九胡（S3）那一帧；迷宫跟拍一直到 6-1-3 切中景。
// - 6-1-3 | 6-1-4至9：6-1-3 切到低机位（下蹲蓄力）那一帧；这个镜头接着起飞、整条一镜到底，不切，到快到城堡（`F_CUT`）硬切 6-1-9b，所以 6-1-4～6-1-9 是一段。
//   一镜到底段表.ts 的窗口（6-1-4+5 … 6-1-9）只是这一段里按 boss 分的几截，诊断工具用。
import * as K611 from '../6-1-1/编排.ts';
import { S3 } from '../6-1-2/编排.ts';
import { officialFrames, officialFrameOf } from '../6-1-2/动作改进.ts';
import * as K613 from '../6-1-3/编排.ts';
import { F_CUT } from '../6-1-9b/落地编排.ts';

export type 源 = '6-1-1' | '6-1-2' | '6-1-3' | '一镜到底';
// 一截：源组件的 [从, 到) 帧
export type 截 = { 源: 源; 从: number; 到: number };

const enterForestFrames = K611.END - 1;
const cut611 = K611.D2 - 1; // 6-1-1 编排帧 = 段内帧 + 1
const cut612 = officialFrameOf(S3);
const cut613 = K613.beats.sinkStart;

export const segments = [
  { id: '6-1-1', 名: '进入森林', 截们: [{ 源: '6-1-1', 从: 0, 到: cut611 }] },
  { id: '6-1-2', 名: '斩娜迦', 截们: [{ 源: '6-1-1', 从: cut611, 到: enterForestFrames }, { 源: '6-1-2', 从: 1, 到: cut612 }] },
  { id: '6-1-3', 名: '起飞', 截们: [{ 源: '6-1-2', 从: cut612, 到: officialFrames }, { 源: '6-1-3', 从: 1, 到: cut613 }] },
  { id: '6-1-4至9', 名: '一镜到底', 截们: [{ 源: '6-1-3', 从: cut613, 到: K613.FRAMES }, { 源: '一镜到底', 从: 1, 到: F_CUT }] },
] as const satisfies readonly { id: string; 名: string; 截们: readonly 截[] }[];
export type SegmentId = (typeof segments)[number]['id'];

const segmentOf = (id: SegmentId) => segments.find((s) => s.id === id)!;
export const pieceFrames = (pieces: readonly 截[]) => pieces.reduce((n, p) => n + p.到 - p.从, 0);
export const frameCountOf = (id: SegmentId) => pieceFrames(segmentOf(id).截们);
export const compositionId = (id: SegmentId) => `${id}-${segmentOf(id).名}`;

// 源组件第 frame 帧（可带小数）落在哪一段第几帧；不在任何一截里（各源的第 0 帧 = 上一个的末帧、没放的余音）给 null
export const locate = (source: 源, frame: number): { 段: SegmentId; 帧: number } | null => {
  for (const seg of segments) {
    let acc = 0;
    for (const p of seg.截们) {
      if (p.源 === source && frame >= p.从 && frame < p.到) return { 段: seg.id, 帧: acc + frame - p.从 };
      acc += p.到 - p.从;
    }
  }
  return null;
};
