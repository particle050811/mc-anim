// 第 1 场暮色森林 6-1-1～6-1-9 的段界。用户 10-18 定：段界放在切镜那一帧，段与段不共用帧，一个镜头不拆进两段。
// 戏还是原来那几个组件演（6-1-1 进入森林、6-1-2 斩娜迦、6-1-3 起飞、一镜到底，时间都是各自的段内秒；一镜到底是它的画面时间 g），
// 这里只定每段由哪几截拼成（拼段.tsx）。这几个组件首帧 = 上一个的末帧，从第二个起各截都从第 1 格拿，整片里每一帧还是原来的时刻（配乐卡点不动）：
// 截表的数是刻（1/120 秒一刻，`CUT_STEPS_PER_SEC`，../时刻.ts）：切点按真值往上取到刻上（画面在切点以后的第一帧切过去），秒换成整数刻再交给拼段，
// 免得秒乘回去差一点、Sequence 的边界跳一帧。用户 11-16 定不再取到 1/24 秒的格上。
// - 6-1-1 | 6-1-2：切到 6-1-2 首帧机位（6-1-1 的 D2）那一帧；D2 和 6-1-2 镜头 1 是同一个静止机位。
// - 6-1-2 | 6-1-3：切到迷宫里的九胡（S3）那一帧；迷宫跟拍一直到 6-1-3 切中景。
// - 6-1-3 | 6-1-4至9：6-1-3 切到低机位（下蹲蓄力）那一帧；这个镜头接着起飞、整条一镜到底，不切，到快到城堡（`G_CUT`）硬切 6-1-9b，所以 6-1-4～6-1-9 是一段。
//   一镜到底段表.ts 的窗口（6-1-4+5 … 6-1-9）只是这一段里按 boss 分的几截，诊断工具用。
import * as K611 from '../6-1-1/编排.ts';
import { S3 } from '../6-1-2/编排.ts';
import { officialLength, officialSecOf } from '../6-1-2/动作改进.ts';
import * as K613 from '../6-1-3/编排.ts';
import { G_CUT } from '../6-1-9b/落地编排.ts';
import { TICKS_PER_SEC, ticksAtOrAfter } from '../时刻.ts';

export type SegmentSource = '6-1-1' | '6-1-2' | '6-1-3' | '一镜到底';
// 一截：源组件的 [从, 到) 刻
export type Clip = { 源: SegmentSource; 从: number; 到: number };

export const CUT_STEPS_PER_SEC = TICKS_PER_SEC;
const step = ticksAtOrAfter;
// 源组件首帧 = 上一个的末帧（各自编排里差 1/24 秒），从第二个源起都从这一刻拿
const SECOND_SOURCE_FROM = step(1 / 24);
// 6-1-1 编排时间 = 段内秒 + 1/24（END 是编排的格数，段的格数少一格）
const enterForestSteps = step(K611.END - 1 / 24);
const cut611 = step(K611.D2 - 1 / 24);
const cut612 = step(officialSecOf(S3));
const cut613 = step(K613.beats.sinkStart);

export const segments = [
  { id: '6-1-1', 名: '进入森林', cuts: [{ 源: '6-1-1', 从: 0, 到: cut611 }] },
  { id: '6-1-2', 名: '斩娜迦', cuts: [{ 源: '6-1-1', 从: cut611, 到: enterForestSteps }, { 源: '6-1-2', 从: SECOND_SOURCE_FROM, 到: cut612 }] },
  { id: '6-1-3', 名: '起飞', cuts: [{ 源: '6-1-2', 从: cut612, 到: step(officialLength) }, { 源: '6-1-3', 从: SECOND_SOURCE_FROM, 到: cut613 }] },
  { id: '6-1-4至9', 名: '一镜到底', cuts: [{ 源: '6-1-3', 从: cut613, 到: step(K613.LENGTH) }, { 源: '一镜到底', 从: SECOND_SOURCE_FROM, 到: step(G_CUT) }] },
] as const satisfies readonly { id: string; 名: string; cuts: readonly Clip[] }[];
export type SegmentId = (typeof segments)[number]['id'];

const segmentOf = (id: SegmentId) => segments.find((s) => s.id === id)!;
export const pieceFrames = (pieces: readonly Clip[]) => pieces.reduce((n, p) => n + p.到 - p.从, 0);
export const frameCountOf = (id: SegmentId) => pieceFrames(segmentOf(id).cuts);
export const compositionId = (id: SegmentId) => `${id}-${segmentOf(id).名}`;

