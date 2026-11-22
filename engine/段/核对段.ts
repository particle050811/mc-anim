// 核对段的纯数据部分（段.ts、视图.ts 用；画面的共用件在 核对画面.tsx）。纯模块：pipeline 读 段.ts 时会走到这里。
// 核对段一般是「一秒一个视图」：段长 = 视图数，画面用 useCheckView 取当前视图；视图长短不一的用 sequenceViews。
import { defineSeg, type SegmentDef } from './段定义.ts';

/** 核对段默认的页面尺寸（同正片段） */
export const checkAspect = { width: 1280, height: 720 } as const;

export type Vec3 = readonly [number, number, number];
/** 一个机位：眼、看的点（场景坐标，Z 朝上）、竖直视角（度）；up 不给是 three 的 +Y（场景的 +Z） */
export type CheckShot = { eye: Vec3; target: Vec3; fov: number; up?: Vec3 };

/** 核对段的 段.ts：场是 核对、默认 1280×720、不用地形 */
export const checkSeg = (o: { sec: number; aspect?: { width: number; height: number }; terrain?: readonly string[] }): SegmentDef => {
  const { width, height } = o.aspect ?? checkAspect;
  return defineSeg({ scene: '核对', sec: o.sec, width, height, terrain: o.terrain ?? [] });
};

/** 一秒一个视图：第 sec 秒的视图（过了最后一个停在最后一个）；画面的 useCheckView 和加载计划都走这里。取整同 时间.tsx 的 useViewIndex */
export const checkViewAt = <V,>(views: readonly V[], sec: number): V => views[Math.min(views.length - 1, Math.max(0, Math.floor(sec + 1e-9)))]!;

/** 视图一个接一个排在时间上，各占 length 秒：总长，和第 sec 秒落在哪个视图、是它的第几秒（过了段尾停在最后一个视图的末尾） */
export const sequenceViews = <V extends { length: number }>(views: readonly V[]) => ({
  totalSec: views.reduce((sum, v) => sum + v.length, 0),
  at: (sec: number): { v: V; τ: number } => {
    let startSec = 0;
    for (const v of views) {
      if (sec < startSec + v.length - 1e-9) return { v, τ: Math.max(0, sec - startSec) };
      startSec += v.length;
    }
    const lastView = views[views.length - 1]!;
    return { v: lastView, τ: lastView.length };
  },
});
