// 6-4-3 幽匿感测体、振动、尖啸体（挥刀和「叮」引出的振动链），以及古城网格要藏掉的方块。
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { archery } from '../../../../../world/地点/古城4x/布局.ts';
import * as geom from '../几何.ts';
import { gameToScene, storySecAt } from './公用.ts';
import { DEBRIS_HIDE } from './碎块.ts';
// 照原版 1.20.1 推（VibrationSystem、SculkSensorBlock、SculkShriekerBlockEntity，见 模型/特效/振动粒子.tsx 等）：
// - 声源：拔刀挑起的破空声（斩击实体位置）、箭被挑飞的「叮」（弹开点）。游戏里这两下其实都不发振动，是原文「拔刀剑的破空声与箭矢的掉落声」的对应。
// - 感测体：离声源 8 格内、中间没有羊毛挡着就收，振动粒子飞 floor(距离) 刻，到了才激活（触须抖 30 刻 + 冷却 10 刻）；在路上或已激活/冷却的不收新的。
//   古城4x 里 8 格内只有 #210 西北那一个（离挥刀点 6.3 米，飞 6 刻；工具/古城4x布局/核对.py 核过），6 刻后的「叮」到时它还在路上，不收。
// - 尖啸体：感测体激活时 8 格内的尖啸体收（飞 floor(距离) 刻、一次收一个）。警告（WardenSpawnTracker）不在冷却就尖啸（levelEvent 3007，10 个声波环），随即冷却 10 秒。
//   东边紧挨着的尖啸体 1 刻收到并叫；西边 6.3 米那个 6 刻后收到，已在冷却，不叫。
// - 尖啸后 90 刻的回应（黑暗效果、监守者叫声）落在这一场之后，不演。
type Vibration = { from: V3; to: V3; t: number };
const blockCenter = ([x, y, z]: V3): V3 => gameToScene(x + 0.5, y + 0.5, z + 0.5);
const blockBottomCenter = ([x, y, z]: V3): V3 => gameToScene(x + 0.5, y, z + 0.5);
// 离挥刀点 8 格内的感测体（游戏坐标）
export const sensors: V3[] = [archery.感测体 as V3];
// 离那个感测体 8 格以内的尖啸体
const shriekers: V3[] = [archery.尖啸体 as V3, archery.尖啸体西 as V3];
const tickSec = 1 / 20;
const flightTicks = (a: V3, b: V3) => Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
export const soundChain = (() => {
  const soundSources = [
    { t: geom.挥刀, p: geom.斩击位置 },
    { t: geom.弹开, p: geom.弹开点 },
  ];
  const vibrations: Vibration[] = [];
  const activateSecs: number[] = sensors.map(() => Infinity);
  sensors.forEach((sensor, i) => {
    let busyUntil = -Infinity; // 振动在路上 + 激活 30 刻 + 冷却 10 刻
    for (const src of soundSources) {
      const to = blockCenter(sensor);
      if (Math.hypot(to[0] - src.p[0], to[1] - src.p[1], to[2] - src.p[2]) > 8 || src.t < busyUntil) continue;
      const arriveSec = src.t + flightTicks(src.p, to) * tickSec;
      vibrations.push({ from: src.p, to, t: src.t });
      if (activateSecs[i] === Infinity) activateSecs[i] = arriveSec;
      busyUntil = arriveSec + 40 * tickSec;
    }
  });
  // 感测体激活 → 尖啸体：每个尖啸体按到达先后收，第一个收到的叫，之后警告在冷却里
  const clicks = sensors.map((b, i) => ({ t: activateSecs[i], p: blockCenter(b) })).filter((e) => e.t < Infinity);
  let shriek: { p: V3; t: number } | null = null;
  const received: { i: number; t: number }[] = [];
  shriekers.forEach((shrieker, i) => {
    const to = blockCenter(shrieker);
    const cand = clicks
      .filter((e) => Math.hypot(to[0] - e.p[0], to[1] - e.p[1], to[2] - e.p[2]) <= 8)
      .sort((a, c) => a.t - c.t || Math.hypot(to[0] - a.p[0], to[1] - a.p[1], to[2] - a.p[2]) - Math.hypot(to[0] - c.p[0], to[1] - c.p[1], to[2] - c.p[2]));
    if (!cand.length) return;
    const firstClick = cand[0];
    vibrations.push({ from: firstClick.p, to, t: firstClick.t });
    received.push({ i, t: firstClick.t + flightTicks(firstClick.p, to) * tickSec });
  });
  received.sort((a, c) => a.t - c.t);
  if (received.length) shriek = { p: blockBottomCenter(shriekers[received[0].i]), t: received[0].t };
  return { vibrations: vibrations, activateSecs: activateSecs, shriek: shriek };
})();
export const vibrations = soundChain.vibrations;
export const sensorStates = (globalFrame: number) => {
  const t = storySecAt(globalFrame);
  return sensors.map((b, i) => ({ p: blockBottomCenter(b), sec: t, secSinceActive: t - soundChain.activateSecs[i] }));
};
// 网格里画死的感测体（触须是不动的第一帧）藏掉换成会抖的：底座侧面在格子边上（面中心离地 0.25 格），顶面和触须在格子里；
// 两个盒子分开藏，免得把邻格朝这格的面（离地 0.5 格）也藏掉
const SENSOR_HIDE: number[][] = sensors.flatMap(([x, y, z]) => {
  const lo = gameToScene(x, y, z + 1);
  const hi = gameToScene(x + 1, y + 1, z);
  return [
    [lo[0] - 0.005, lo[1] - 0.005, lo[2] + 0.1, hi[0] + 0.005, hi[1] + 0.005, lo[2] + 0.4],
    [lo[0] + 0.01, lo[1] + 0.01, lo[2] + 0.4, hi[0] - 0.01, hi[1] - 0.01, hi[2] - 0.001],
  ];
});
// 古城网格要藏掉的：击穿的方块 + 感测体（同一个数组对象，BlockMesh 按引用判断是否重建）
export const HIDE: number[][] = [...DEBRIS_HIDE, ...SENSOR_HIDE];
