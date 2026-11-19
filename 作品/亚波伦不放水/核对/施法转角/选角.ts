import type { Cam } from '@engine/core/机位.ts';
import { deg, rad, smoothstep } from '@engine/core/数学.ts';
import { projectToScreen } from '../../界面/指杖机位.ts';

export const playbackLeadSec = 1.5;
export const scanStartSec = 2;
export const replayStartSec = 7.5;
export const reviewDuration = replayStartSec + 2;

export const turnSample = (sec: number) => {
  if (sec >= replayStartSec) {
    const localSec = sec - replayStartSec;
    return { beforePeakSec: Math.max(0, playbackLeadSec - localSec), orbitOffsetDeg: -30 * smoothstep(0, playbackLeadSec - 0.12, localSec) };
  }
  const scanSec = sec - scanStartSec;
  const orbitOffsetDeg = [0.45, 2, 3.55].reduce((sum, start) => sum - 10 * smoothstep(start, start + 1.05, scanSec), 0);
  return { beforePeakSec: Math.max(0, playbackLeadSec - sec), orbitOffsetDeg };
};

export const reviewCamera = (base: Cam, pivot: Cam['pos'], offsetDeg: number): { rig: Cam; measuredDeg: number } => {
  if (offsetDeg === 0) return { rig: base, measuredDeg: 0 };
  const east = base.pos[0] - pivot[0], north = base.pos[1] - pivot[1];
  const angle = -rad(offsetDeg);
  const pos: Cam['pos'] = [pivot[0] + east * Math.cos(angle) - north * Math.sin(angle), pivot[1] + east * Math.sin(angle) + north * Math.cos(angle), base.pos[2]];
  const nextEast = pos[0] - pivot[0], nextNorth = pos[1] - pivot[1];
  const measuredDeg = deg(Math.atan2(north * nextEast - east * nextNorth, east * nextEast + north * nextNorth));
  return { rig: { ...base, pos }, measuredDeg };
};

export const chestToDiscPx = (rig: Cam, foot: Cam['pos'], center: Cam['pos'], { width, height }: { width: number; height: number }) => {
  const chest = projectToScreen(rig, width / height, [foot[0], foot[1], foot[2] + 1.1]);
  const disc = projectToScreen(rig, width / height, center);
  return Math.hypot((disc.x - chest.x) * width, (disc.y - chest.y) * height);
};
