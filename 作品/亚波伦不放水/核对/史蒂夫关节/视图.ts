// 史蒂夫关节核对的视图表（纯数据，段.ts 也读）。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），人都面朝南（yaw 180），右手（拿剑的）在西边（−x）。
// 视图一个接一个排在时间上，各占 1 秒，都是静的（取哪一帧都一样）：前一半摆角度看绑骨，后一半「连拍」看动作——
// 一个动作按时间切成几格，从左到右排成一排（人往右走、往右跳），不用渲整段也能看出顺不顺。
import type { V3 } from '@engine/model/parts.tsx';
import type { SteveEquip } from '../../角色/史蒂夫装备.tsx';
import type { SteveState } from '../../角色/史蒂夫反应.ts';
import type { MoveName } from '../../角色/剑招.ts';
import { defineWalk } from '../../角色/史蒂夫走位.ts';

export const aspect = { width: 1280, height: 720 } as const;

/** 摆姿势的人：肘、膝直接给角度（度），大腿自动抬到脚底在髋正下方、脚贴地；上臂照拿东西的原版站姿 */
export type PosedPerson = { 位: V3; elbow: number; knee: number; equipment?: SteveEquip; hurt?: number; /** 两条大腿一前一后各摆多少度（不给 = 并着，抬到脚底在髋正下方） */ stride?: number };
/** 做反应的人：角色/史蒂夫反应.ts 的状态 */
export type PerformedPerson = { state: SteveState; equipment?: SteveEquip };
export type Person = PosedPerson | PerformedPerson;

export type View = {
  name: string;
  length: number;
  眼: V3;
  看: V3;
  fov: number;
  people: (τ: number) => Person[];
  note?: string;
};

const unarmored: SteveEquip = { armor: [], 剑: false, hasRing: false };
const angles = [0, 30, 60, 90, 120] as const;
/** 一排五个人：从北到南（正侧机位里从左到右）肘、膝 0、30、60、90、120 度 */
const figureRow = (equipment?: SteveEquip, hurt?: number) => (): Person[] => angles.map((angle, i) => ({ 位: [0, 3.6 - 1.8 * i, 0] as V3, elbow: angle, knee: angle, equipment, hurt }));
const singlePerson = (angle: number, equipment?: SteveEquip, hurt?: number) => (): Person[] => [{ 位: [0, 0, 0], elbow: angle, knee: angle, equipment, hurt }];

const rowDirectSide = { 眼: [-17, 0, 1.2] as V3, 看: [0, 0, 1.0] as V3, fov: 30 };
const rowRightFront = { 眼: [-9, -11, 3.2] as V3, 看: [0, 0, 0.9] as V3, fov: 30 };
const rowLeftBackTop = { 眼: [9, 11, 5.5] as V3, 看: [0, 0, 0.8] as V3, fov: 30 };
const rowLeftSide = { 眼: [17, 0, 1.2] as V3, 看: [0, 0, 1.0] as V3, fov: 30 };
const nearRightSide = { 眼: [-4.6, -0.6, 1.0] as V3, 看: [0, -0.2, 0.85] as V3, fov: 30 };
const nearRightFront = { 眼: [-3.2, -3.6, 1.6] as V3, 看: [0, -0.3, 0.85] as V3, fov: 30 };
const nearLeftBackTop = { 眼: [2.6, 3.2, 2.8] as V3, 看: [0, 0, 0.8] as V3, fov: 30 };
const nearRightBackLow = { 眼: [-3.0, 3.4, 0.5] as V3, 看: [0, 0, 0.8] as V3, fov: 30 };

// —— 连拍 ——
const burstSide = (n: number, cellDistance = 1.5) => ({ 眼: [-(n * cellDistance * 1.12 + 2), 0, 1.3] as V3, 看: [0, 0, 1.1] as V3, fov: 30 });
const burstDiag = (n: number, cellDistance = 1.5) => ({ 眼: [-(n * cellDistance * 0.75), -(n * cellDistance * 0.8), 3.4] as V3, 看: [0, 0, 0.9] as V3, fov: 30 });
/** 从头顶往下看（略偏南，免得正朝下时镜头的上方向不定）：横斩的剑扫过哪、停在哪一眼看得出 */
const burstTop = (n: number, cellDistance = 1.5) => ({ 眼: [0, -0.6, n * cellDistance * 1.9] as V3, 看: [0, 0, 0.9] as V3, fov: 30 });
/** 第 i 格站在哪（从北到南排，侧机位里从左到右） */
const gridPos = (i: number, n: number, cellDistance = 1.5, height = 0): V3 => [0, ((n - 1) / 2 - i) * cellDistance, height];
type CellPose = (i: number, u: number) => Partial<SteveState> & { height?: number };
const burst = (n: number, cellPose: CellPose, equipment?: SteveEquip) => (): Person[] =>
  Array.from({ length: n }, (_, i) => {
    const { height: height, ...poseState } = cellPose(i, n > 1 ? i / (n - 1) : 0);
    const pos = gridPos(i, n, 1.5, height);
    return { state: { 位置: pos, facing: 180, sec: 0, 看: [0, pos[1] - 4, 1.6], ...poseState }, equipment };
  });
/** 一个动作出两个视图：不穿甲的（姿势看得清）在前，穿全套的（看盔甲跟不跟、穿不穿帮）在后 */
const twoVersions = (name: string, cameraRig: (n: number) => Pick<View, '眼' | '看' | 'fov'>, n: number, cellPose: CellPose, note?: string): View[] => [
  { name: `${name}-不穿甲`, length: 1, ...cameraRig(n), people: burst(n, cellPose, unarmored), note: note },
  { name: name, length: 1, ...cameraRig(n), people: burst(n, cellPose), note: note },
];
/** 一圈摆腿（两步）切 n 格；摆 = 相位 ÷ 0.6662 */
const cycle = (stride: number, walkDir: number, overrides: Partial<SteveState> = {}) => (_i: number, u: number) => ({ 走: { swing: (u * Math.PI * 2 * 7) / 8 / 0.6662, stride, walkDir }, ...overrides });

// 照第 2 幕编排的那一跳（场/1-台地/编排-开盘.ts）另写的一条直线轨迹：助跑越来越快 → 0.75 秒起跳（竖直 8.15 格/秒、重力 24.6）→ 1.0 秒点挥剑 →
// 1.25 秒落在高一格的地方刹住 → 1.6 秒往后跳下来 → 2.05 秒落地、倒退着走开。往南（−y）是前
const jumpHeight = (τ: number, v0: number) => v0 * τ - 12.3 * τ * τ;
const jumpChopPos = (s: number): V3 => {
  if (s < 0) return [0, 3.2, 0];
  if (s < 0.75) return [0, 3.2 - 3.2 * (s / 0.75) ** 2.2, 0];
  if (s < 1.25) return [0, -3.6 * (s - 0.75), jumpHeight(s - 0.75, 8.15)];
  if (s < 1.6) {
    const τ = Math.min(0.2, s - 1.25);
    return [0, -1.8 - 3.6 * (τ - (τ * τ) / 0.4), 1];
  }
  if (s < 2.05) return [0, -2.16 + 3.7 * (s - 1.6), 1 + jumpHeight(s - 1.6, 3.31)];
  return [0, -0.495 + 3.7 * (s - 2.05), 0];
};
const jumpChopWalk = defineWalk({ 位: jumpChopPos, 看: () => [0, -40, 3], start: -1, initFacing: 180 });
const jumpChopCell = (start: number, end: number) => (_i: number, u: number) => {
  const s = start + (end - start) * u;
  const { 走: walk, 跳: leap, 位置: position } = jumpChopWalk.在(s);
  return { 走: walk, 跳: leap, height: position[2], sec: s, swingSec: s >= 1 ? s - 1 : undefined };
};

/** 一招切 10 格：前 3 格蓄力 1/3、2/3、满，后 7 格点击后 0、1/3 斩、2/3 斩、斩完、停完、收一半、收完（角色/剑招.ts 的拍子） */
const moveTimes = [0, 0.027, 0.053, 0.08, 0.43, 0.6, 0.78];
const moveCell = (move: MoveName, height = 0) => (i: number) =>
  i < 3 ? { move, chargeMove: move, charge: (i + 1) / 3, height: height } : { move, chargeMove: move, swingSec: moveTimes[i - 3]!, height: height };

export const views: readonly View[] = [
  { name: '角度排-正侧', length: 1, ...rowDirectSide, people: figureRow(), note: '从左到右肘、膝 0、30、60、90、120 度；从他右手边看' },
  { name: '角度排-右前斜', length: 1, ...rowRightFront, people: figureRow() },
  { name: '角度排-左后斜上', length: 1, ...rowLeftBackTop, people: figureRow(), note: '从背后高处看膝弯的内侧、肘的外侧' },
  { name: '角度排-左侧', length: 1, ...rowLeftSide, people: figureRow(), note: '从他左手边看（左手空着）' },
  { name: '角度排-不穿甲-正侧', length: 1, ...rowDirectSide, people: figureRow(unarmored), note: '只有皮肤和外层（袖子、裤子）' },
  { name: '角度排-不穿甲-右前斜', length: 1, ...rowRightFront, people: figureRow(unarmored) },
  { name: '近看-90度-右侧', length: 1, ...nearRightSide, people: singlePerson(90) },
  { name: '近看-90度-右前斜', length: 1, ...nearRightFront, people: singlePerson(90) },
  { name: '近看-120度-左后斜上', length: 1, ...nearLeftBackTop, people: singlePerson(120) },
  { name: '近看-120度-右后低处', length: 1, ...nearRightBackLow, people: singlePerson(120) },
  { name: '近看-不穿甲-120度-右前斜', length: 1, ...nearRightFront, people: singlePerson(120, unarmored) },
  { name: '近看-受伤-90度', length: 1, ...nearRightFront, people: singlePerson(90, undefined, 1), note: '受伤变红：只红皮肤（连弯出来的弧面），盔甲、剑不红' },
  { name: '迈开腿-看腿内侧', length: 1, 眼: [-9, 0, 0.8], 看: [0, 0, 0.7], fov: 30, people: () => [0, 30, 70].map((knee, i) => ({ 位: [0, 2 - 2 * i, 0] as V3, elbow: 0, knee, stride: 35 })), note: '膝 0、30、70 度，两腿前后各摆 35 度：远的那条腿内侧露出来的裤子是盔甲网格本来就不包内侧' },
  ...twoVersions('连拍-跑-侧', burstSide, 8, cycle(0.72, 1), '步幅 0.72（第 2 幕助跑的速度），一圈摆腿切 8 格，往右跑'),
  ...twoVersions('连拍-跑-右前斜', burstDiag, 8, cycle(0.72, 1)),
  ...twoVersions('连拍-全速跑-侧', burstSide, 8, cycle(1, 1), '步幅 1（原版疾跑）'),
  ...twoVersions('连拍-倒退-侧', burstSide, 8, cycle(0.72, -1), '脸朝右、往左退'),
  ...twoVersions('连拍-慢走-空手-侧', burstSide, 8, cycle(0.3, 1, { rightHand: '空' }), '步幅 0.3，空手'),
  ...twoVersions('连拍-跳劈-侧', burstSide, 12, jumpChopCell(0.45, 1.55), '幕内 0.45～1.55 秒每 0.1 秒一格：蓄力、起跳（0.75）、空中挥剑（1.0）、落在高一格处（1.25）'),
  ...twoVersions('连拍-跳劈-右前斜', burstDiag, 12, jumpChopCell(0.45, 1.55)),
  ...twoVersions('连拍-后跳-侧', burstSide, 12, jumpChopCell(1.4, 2.5), '幕内 1.4～2.5 秒每 0.1 秒一格：往后跳下来（1.6 起跳、2.05 落地）、倒退'),
  ...(['下劈', '横斩', '上撩', '跳劈'] as const).flatMap((move) => [
    ...twoVersions(`连拍-${move}-侧`, burstSide, 10, moveCell(move, move === '跳劈' ? 1 : 0), '前 3 格蓄力，后 7 格点击后 0、0.027、0.053、0.08（斩完）、0.43（停完）、0.6、0.78 秒（收完）'),
    ...twoVersions(`连拍-${move}-右前斜`, burstDiag, 10, moveCell(move, move === '跳劈' ? 1 : 0)),
  ]),
  ...twoVersions('连拍-横斩-俯', burstTop, 10, moveCell('横斩'), '从头顶往下看（人面朝南 = 画面下方）：剑在斩完、停住时指向哪'),
  ...twoVersions('连拍-挣扎-侧', burstSide, 8, (_i, u) => ({ sec: 0.3 + 0.7 * u, struggle: 1 }), '0.1 秒一格'),
  ...twoVersions('连拍-挣扎-右前斜', burstDiag, 8, (_i, u) => ({ sec: 0.3 + 0.7 * u, struggle: 1 })),
  ...twoVersions('连拍-挨打-侧', burstSide, 7, (_i, u) => ({ hitReactSec: 0.3 * u }), '0.05 秒一格：后仰、腿软、空手往后甩'),
  ...twoVersions('连拍-站着-右前斜', burstDiag, 3, (i) => ({ rightHand: (['剑', '空', '弓'] as const)[i], leftHand: i === 2 ? '图腾' : '空' }), '拿剑、空手、拿弓和图腾'),
];

/** 第 秒 秒落在哪个视图、是它的第几秒 */
export const viewAt = (sec: number): { v: View; τ: number } => {
  let startSec = 0;
  for (const v of views) {
    if (sec < startSec + v.length - 1e-9) return { v, τ: Math.max(0, sec - startSec) };
    startSec += v.length;
  }
  const lastView = views[views.length - 1]!;
  return { v: lastView, τ: lastView.length };
};
export const totalSec = views.reduce((sum, v) => sum + v.length, 0);
