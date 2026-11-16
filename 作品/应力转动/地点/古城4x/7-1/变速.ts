// 变速的打斗段（7-1-3、7-1-7、7-3-3 的 编排.ts）共用的变速：段内秒 → 场时刻 t（见 时间线.ts）。戏还是 戏.ts 那条时间轴，只换画面上怎么放。
// 时钟 = 画面 1 秒对应多少场秒，时钟点之间按 smoothstep 过渡（标「对数」的按对数，同 6-4-3/时间线.ts）；`stops`（打中的场时刻）在那一刻把世界定住（打击停顿，按旧编排的格数 `HIT_STOP_FRAMES`，见 默认.ts）。
// 场时刻表照旧编排每 1/24 秒记一个样（samplesPerSec），样与样之间线性插值；改样密度会挪动画面。
import { HIT_STOP_FRAMES } from '../../../默认.ts';
import { smoothstep01 } from '@engine/core/数学.ts';

export type ClockPoint = [t: number, clock: number, 对数?: boolean];
export const buildSpeedRamp = (startT: number, endT: number, points: ClockPoint[], stops: number[] = []) => {
  const samplesPerSec = 24;
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
  const SUB = 32;
  const SCENE_T: number[] = (() => {
    const out = [startT];
    let t = startT;
    const pending = [...stops].sort((a, b) => a - b);
    while (t < endT) {
      for (let k = 0; k < SUB; k++) {
        const dt = 1 / samplesPerSec / SUB;
        const next = t + clock(t + (clock(t) * dt) / 2) * dt;
        if (pending.length && t < pending[0] && next >= pending[0]) {
          t = pending[0];
          for (let n = 0; n < HIT_STOP_FRAMES; n++) out.push(t);
          pending.shift();
          break;
        }
        t = next;
      }
      out.push(Math.min(t, endT));
    }
    return out;
  })();
  const sampleCount = SCENE_T.length;
  // 段内秒 → 场时刻；过了最后一个样按最后两样的斜率外推
  const storyTime = (sec: number) => {
    const x = sec * samplesPerSec;
    const i = Math.min(Math.max(Math.floor(x), 0), sampleCount - 2);
    return SCENE_T[i] + (SCENE_T[i + 1] - SCENE_T[i]) * (x - i);
  };
  return { storyTime, clock };
};
export type SpeedRamp = ReturnType<typeof buildSpeedRamp>;
