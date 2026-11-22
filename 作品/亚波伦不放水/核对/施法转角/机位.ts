// 核对-施法转角 每一秒演到哪、机位在哪：画面.tsx 照它摆人、摆镜头，地形视图.ts 拿机位给加载计划。
// 不放进 选角.ts：段.ts 引 选角.ts，pipeline 直接读段.ts，编排那一串会引到 .tsx
import { actDur, beats, toWorldSec } from '../../场/1-台地/开盘拍.ts';
import { orbitRig, releaseRig } from '../../场/1-台地/绕拍.ts';
import { actStart, perform } from '../../场/1-台地/编排-开盘.ts';
import { secAt, perform as releasePerformance } from '../../场/1-台地/编排-齐放.ts';
import { reviewCamera, turnSample } from './选角.ts';

export const castTurnShot = (sec: number) => {
  const { beforePeakSec, orbitOffsetDeg } = turnSample(sec);
  const clipSec = actDur - beforePeakSec;
  const worldSec = beforePeakSec === 0 ? beats.endSec : toWorldSec(clipSec);
  const atPeak = beforePeakSec === 0;
  const time = atPeak ? secAt(0) : actStart + worldSec;
  const performance = atPeak ? releasePerformance : perform;
  const actor = performance.在(time).props;
  const { rig, measuredDeg } = reviewCamera(atPeak ? releaseRig(0) : orbitRig(clipSec), actor.pose.loc, orbitOffsetDeg);
  return { beforePeakSec, worldSec, atPeak, time, performance, actor, rig, measuredDeg };
};
