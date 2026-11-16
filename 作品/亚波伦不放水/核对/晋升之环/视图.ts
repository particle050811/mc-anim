// 晋升之环核对的视图表（纯数据，段.ts 也读）：一秒一个视图，第 i 个在第 60i 帧。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），
// 人站在原点附近、面朝南（yaw 180），正面机位在南边。
import type { V3 } from '@engine/model/parts.tsx';
import type { CandidateName, RingVariant } from '../../特效/晋升之环形.ts';

export const aspect = { width: 1280, height: 720 } as const;

type CameraRig = { 眼: V3; 看: V3; fov: number };
export type View = CameraRig & {
  name: string;
  note?: string;
  bottomBackground: '灰' | '暗红';
  /** 环转到第几秒的样子 */
  ringSec: number;
  pictureMode:
    | { type: '并排' }
    /** 单个环立在半空，近看 */
    | { type: '单看'; variant: CandidateName }
    /** 款 不给：亚波伦画包里的眼形大光环，史蒂夫不戴 */
    | { type: '戴'; who: '亚波伦' | '史蒂夫' | '两人'; variant?: RingVariant; act?: '站立' | '悬停'; lift?: number };
};

/** 并排：四个环的中心（格）和一个环像素几格 */
export const sideBySide = { variants: ['原版', '甲', '乙', '丙'] as readonly RingVariant[], x: [-4.8, -1.9, 1.6, 4.9], height: 1.6, cellsPerPixel: 1 / 12 } as const;
/** 单看：环心高、一个环像素几格 */
export const singleView = { height: 1.6, cellsPerPixel: 1 / 12 } as const;
/** 两人同框时各站哪（x） */
export const twoPeoplePos = { yaBoLun: -1.6, steve: 1.6 } as const;

const sideBySideFrontRig: CameraRig = { 眼: [0, -14, 1.6], 看: [0, 0, 1.6], fov: 30 };
const singleViewFrontRig: CameraRig = { 眼: [0, -4.4, 1.6], 看: [0, 0, 1.6], fov: 30 };
const singleDiagSide: CameraRig = { 眼: [-2.6, -3.2, 2.3], 看: [0, 0, 1.6], fov: 30 };
// 特写：环的右上那一段（对角的方座、正上的宝石都在里面），离 1.3 格
const closeup: CameraRig = { 眼: [0.3, -1.35, 2.2], 看: [0.36, 0, 2.18], fov: 30 };
const front: CameraRig = { 眼: [0, -7, 1.8], 看: [0, 0, 1.5], fov: 30 };
const diagSide: CameraRig = { 眼: [-4.4, -5.5, 2.2], 看: [0, 0, 1.5], fov: 30 };
const backView: CameraRig = { 眼: [0, 7, 1.8], 看: [0, 0, 1.5], fov: 30 };
// 中景：人（约 2 格高）占画面高的 1/3
const midShot: CameraRig = { 眼: [0, -11.2, 1.6], 看: [0, 0, 1.6], fov: 30 };

const candidates: readonly CandidateName[] = ['甲', '乙', '丙'];
const ringSec = 1.2;

export const views: readonly View[] = [
  { name: '并排-灰底-正面', note: '左起：原版贴片（游戏里那张 16×16 的片，加色）、甲、乙、丙；同一个比例', ...sideBySideFrontRig, bottomBackground: '灰', ringSec: ringSec, pictureMode: { type: '并排' } },
  { name: '并排-暗红底-正面', ...sideBySideFrontRig, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '并排' } },
  ...candidates.flatMap((variant): View[] => [
    { name: `${variant}-单看-暗红底`, ...singleViewFrontRig, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '单看', variant } },
    { name: `${variant}-单看-灰底斜侧`, note: '看厚度和侧面', ...singleDiagSide, bottomBackground: '灰', ringSec: ringSec, pictureMode: { type: '单看', variant } },
    { name: `${variant}-特写`, note: '环的上沿偏右一段，离 1.3 格：看纹样、材质、光', ...closeup, bottomBackground: '暗红', ringSec: 0, pictureMode: { type: '单看', variant } },
  ]),
  ...candidates.flatMap((variant): View[] => [
    { name: `${variant}-亚波伦-正面`, ...front, bottomBackground: '灰', ringSec: ringSec, pictureMode: { type: '戴', who: '亚波伦', variant } },
    { name: `${variant}-亚波伦-斜侧`, ...diagSide, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '戴', who: '亚波伦', variant } },
    { name: `${variant}-亚波伦-背面`, ...backView, bottomBackground: '灰', ringSec: ringSec, pictureMode: { type: '戴', who: '亚波伦', variant } },
    { name: `${variant}-亚波伦-飞行`, note: 'fly：上身往她右边倒；环挂在 aaabody 上，不跟头倒', ...diagSide, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '戴', who: '亚波伦', variant, act: '悬停', lift: 1.5 } },
  ]),
  ...candidates.flatMap((variant): View[] => [
    { name: `${variant}-史蒂夫-正面`, ...front, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '戴', who: '史蒂夫', variant } },
    { name: `${variant}-史蒂夫-斜侧`, ...diagSide, bottomBackground: '灰', ringSec: ringSec, pictureMode: { type: '戴', who: '史蒂夫', variant } },
  ]),
  { name: '原版贴片-史蒂夫-正面', note: '照游戏：头顶上方 4 像素、往后 5 像素，上沿朝前倾 45 度，加色', ...front, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '戴', who: '史蒂夫', variant: '原版' } },
  { name: '原版贴片-史蒂夫-斜侧', ...diagSide, bottomBackground: '灰', ringSec: ringSec, pictureMode: { type: '戴', who: '史蒂夫', variant: '原版' } },
  { name: '原版贴片-亚波伦-正面', note: '按头的大小比（7/8）缩着照游戏的位置摆：片插在帽檐里', ...front, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '戴', who: '亚波伦', variant: '原版' } },
  { name: '原版贴片-亚波伦-斜侧', ...diagSide, bottomBackground: '灰', ringSec: ringSec, pictureMode: { type: '戴', who: '亚波伦', variant: '原版' } },
  { name: '眼形大光环-亚波伦-正面', note: '现在的：YSM 包自带的眼形大光环（ysmGlowbone24）', ...front, bottomBackground: '灰', ringSec: ringSec, pictureMode: { type: '戴', who: '亚波伦' } },
  { name: '眼形大光环-亚波伦-斜侧', ...diagSide, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '戴', who: '亚波伦' } },
  ...candidates.map((variant): View => ({ name: `${variant}-中景`, note: '人占画面高约 1/3：左亚波伦（悬停），右史蒂夫', ...midShot, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '戴', who: '两人', variant, act: '悬停' } })),
  { name: '原版贴片-中景', note: '对照：两人都戴原版贴片', ...midShot, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '戴', who: '两人', variant: '原版', act: '悬停' } },
  { name: '眼形大光环-中景', note: '对照：现在的眼形大光环，史蒂夫不戴', ...midShot, bottomBackground: '暗红', ringSec: ringSec, pictureMode: { type: '戴', who: '两人', act: '悬停' } },
];
