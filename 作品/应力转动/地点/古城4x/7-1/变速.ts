// 变速的打斗段（7-1-3、7-1-7、7-3-3 的 编排.ts）共用的变速：段内秒 → 场时刻 t（见 时间线.ts）。戏还是 戏.ts 那条时间轴，只换画面上怎么放。
// 时钟 = 画面 1 秒对应多少场秒，时钟点之间按 smoothstep 过渡（标「对数」的按对数，同 6-4-3/时间线.ts）；`stops`（打中的场时刻）在那一刻把世界定住（打击停顿，`HIT_STOP_SEC`，见 默认.ts）。
// 场时刻表每 1/24 秒（段内秒）记一个样（samplesPerSec），样与样之间线性插值；改样密度会挪动画面。
// 打中的那一刻按真时刻插两个点（定住的起止），不挪到样上（用户 11-16 定：1/24 秒格的取整一处不留）。
import { HIT_STOP_SEC } from '../../../默认.ts';
import { smoothstep01 } from '@engine/core/数学.ts';

export type ClockPoint = [t: number, clock: number, logScale?: boolean];
export const buildSpeedRamp = (startT: number, endT: number, points: ClockPoint[], stops: number[] = []) => {
  const samplesPerSec = 24;
  const hitStopSec = HIT_STOP_SEC;
  const clock = (t: number) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [t0, c0] = points[i - 1];
      const [t1, c1, logBlend] = points[i];
      if (t <= t1) {
        const k = smoothstep01((t - t0) / (t1 - t0));
        return logBlend ? c0 * Math.pow(c1 / c0, k) : c0 + (c1 - c0) * k;
      }
    }
    return points[points.length - 1][1];
  };
  // 折线的点：段内秒 secs[i] 时场时刻是 ts[i]。按细步积分（一样分 SUB 步，中点法）；定住以后从下一个细步格接着积
  const SUB = 32;
  const step = 1 / samplesPerSec / SUB;
  const secs = [0];
  const ts = [startT];
  {
    let sec = 0;
    let k = 0;
    let t = startT;
    const pending = [...stops].sort((a, b) => a - b);
    while (t < endT) {
      const nextSec = (k + 1) * step;
      const dt = nextSec - sec;
      const next = t + clock(t + (clock(t) * dt) / 2) * dt;
      if (pending.length && t < pending[0] && next >= pending[0]) {
        const hitSec = sec + (dt * (pending[0] - t)) / (next - t);
        t = pending.shift()!;
        secs.push(hitSec, hitSec + hitStopSec);
        ts.push(t, t);
        sec = hitSec + hitStopSec;
        k = Math.floor(sec / step + 1e-9);
        continue;
      }
      sec = nextSec;
      k++;
      t = next;
      if (k % SUB === 0 || t >= endT) {
        secs.push(sec);
        ts.push(Math.min(t, endT));
      }
    }
  }
  const n = secs.length;
  // 段内秒 → 场时刻；过了最后一个点按最后两点的斜率外推
  const storyTime = (sec: number) => {
    let lo = 0;
    let hi = n - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (secs[mid] <= sec) lo = mid;
      else hi = mid - 1;
    }
    const i = lo;
    return ts[i] + ((ts[i + 1] - ts[i]) * (sec - secs[i])) / (secs[i + 1] - secs[i]);
  };
  // 场时刻 → 段内秒（第一次到这一刻；定住的那一刻取定住的起点）
  const secAt = (t: number) => {
    const i = ts.findIndex((x) => x >= t);
    if (i === 0) return 0;
    const j = i < 0 ? n - 1 : i;
    return secs[j - 1] + ((secs[j] - secs[j - 1]) * (t - ts[j - 1])) / (ts[j] - ts[j - 1]);
  };
  // 段长（整帧）：末帧是场时刻到 endT 的那一帧
  const frameCount = Math.floor(secAt(endT) * 60 + 1e-9) + 1;
  return { storyTime, secAt, clock, frameCount };
};
export type SpeedRamp = ReturnType<typeof buildSpeedRamp>;
