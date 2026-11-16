// 太阳、月亮按游戏时间走：侧剖面里天球的那一圈画成画面上的一段圆弧（东在右、西在左，正午在弧顶），纯函数（段.ts 也能读）。
// 时间照原版 1.20.1：刻 = 一天里的游戏刻（0 日出 6:00、6000 正午、12000 日落、18000 午夜，一天 24000 刻，可以超过 24000 往后数天）。
// 天球角照 DimensionType.timeOfDay：d = frac(刻/24000 − 0.25)，角 = (2d + (0.5 − cos(dπ)/2)) / 3，0 是太阳在头顶；月亮在对面。
// 月相照 DimensionType.moonPhase：(刻 / 24000 取整) % 8，贴图 moon_phases 4 列 2 行；天亮程度照 ClientLevel.getSkyColor 里的 cos(角·2π)·2 + 0.5，夹 0～1（天色按它乘）。

export const ticksPerDay = 24000;

const frac = (x: number) => x - Math.floor(x);

/** 天球角（0～1，0 = 太阳在头顶、0.5 = 太阳在脚下） */
export const skySphereAngle = (tick: number) => {
  const d = frac(tick / ticksPerDay - 0.25);
  return (d * 2 + (0.5 - Math.cos(d * Math.PI) / 2)) / 3;
};

/** 天亮程度（0 夜、1 白天），原版天色、天光按它乘 */
export const skyBrightness = (tick: number) => Math.min(1, Math.max(0, Math.cos(skySphereAngle(tick) * Math.PI * 2) * 2 + 0.5));

export const moonPhase = (tick: number) => ((Math.floor(tick / ticksPerDay) % 8) + 8) % 8;

/** 弧：心 = 圆心 [x, z]（格，一般放在地面线上、取景中线），半径（格）；横半径不给 = 半径（给了就是椭圆，窄画面里压扁） */
export type SkyArc = { 心: readonly [number, number]; radius: number; radiusX?: number };

/** 太阳、月亮中心在画面平面里的位置 [x, z]（格）；高 = 中心离弧心的高度比（−1～1），小于 0 就在地平线下 */
export const celestialPosition = (tick: number, arc: SkyArc) => {
  const a = skySphereAngle(tick) * Math.PI * 2;
  const [cx, cz] = arc.心;
  const r = arc.radius;
  const rx = arc.radiusX ?? r;
  return {
    sun: { x: cx - Math.sin(a) * rx, z: cz + Math.cos(a) * r, height: Math.cos(a) },
    moon: { x: cx + Math.sin(a) * rx, z: cz - Math.cos(a) * r, height: -Math.cos(a), phase: moonPhase(tick) },
  };
};
