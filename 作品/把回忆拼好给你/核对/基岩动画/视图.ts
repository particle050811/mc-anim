// 基岩动画核对的视图表（纯数据，段.ts 也读）：一帧一个视图。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），
// 魔法酒狐站在原点、面朝南（yaw 180）坐着；左右两半画布用同一个视图。
import type { V3 } from '@engine/model/parts.tsx';

/** 控制器：这一帧左右换成两种控制器（控制器示例.ts），不是手抄版对播放器版 */
export type View = { name: string; 眼: V3; 看: V3; fov: number; sec: number; note?: string; useController?: true };

const fullBody = { 眼: [0, -3.4, 1.0] as V3, 看: [0, 0, 0.42] as V3, fov: 30 };
const face = { 眼: [0, -2.4, 0.66] as V3, 看: [0, 0, 0.6] as V3, fov: 20 };
const fromBehind = { 眼: [0, 3.4, 1.3] as V3, 看: [0, 0, 0.35] as V3, fov: 32 };
// 控制器视图有站着的，机位比坐着的 全身 拉远拉高
const standFullBody = { 眼: [0, -4.8, 1.3] as V3, 看: [0, 0, 0.7] as V3, fov: 30 };

export const views: readonly View[] = [
  { name: '全身-0秒', ...fullBody, sec: 0 },
  { name: '全身-2.6秒', ...fullBody, sec: 2.6, note: '法杖三个环转到一半' },
  { name: '脸-0.125秒', ...face, sec: 0.125, note: '眨眼曲线冲过头：手抄版夹成全闭，原版眼皮 scale 是 −0.125（翻过来）' },
  { name: '身后-1秒', ...fromBehind, sec: 1 },
  { name: '身后-2秒', ...fromBehind, sec: 2 },
  { name: '控制器-0.9秒', ...standFullBody, sec: 0.9, useController: true, note: '还在坐（第 1 秒换站）' },
  { name: '控制器-1.25秒', ...standFullBody, sec: 1.25, useController: true, note: '过渡一半：左边插向 idle 第 0 刻（idle 不动 Root，Root 直接回原位，所以离地），右边坐和站各一半' },
  { name: '控制器-2秒', ...standFullBody, sec: 2, useController: true, note: '过渡完：左边 idle 播到 0.5 秒，右边播到 1 秒' },
];
