// 变速的打斗段（7-1-3、7-1-7、7-3-3 的 编排.ts）共用的变速：段内帧 → 场时刻 t（见 时间线.ts）。戏还是 戏.ts 那条时间轴，只换画面上怎么放。
// 时钟 = 画面 1 秒对应多少场秒，时钟点之间按 smoothstep 过渡（标「对数」的按对数，同 6-4-3/时间线.ts）；`stops`（打中的场时刻）在那一刻把世界定住（打击停顿，帧数用 lib/anim.ts 的默认 `HIT_STOP_FRAMES`）。
// 返回的接口同 音效/慢放.ts 的 时间线，声音用 scheduleToScreen 排。
import { HIT_STOP_FRAMES } from '../../../默认.ts';
import { ss } from './戏/公用.ts';
import * as timeline from './时间线.ts';

export type 时钟点 = [t: number, 时钟: number, 对数?: boolean];
export const 建变速 = (startT: number, endT: number, points: 时钟点[], stops: number[] = []) => {
  const FPS = timeline.FPS;
  const clock = (t: number) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [t0, c0] = points[i - 1];
      const [t1, c1, logBlend] = points[i];
      if (t <= t1) {
        const k = ss((t - t0) / (t1 - t0));
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
        const dt = 1 / FPS / SUB;
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
  const totalFrames = SCENE_T.length;
  const sceneT = (frame: number) => {
    const i = Math.min(Math.max(Math.floor(frame), 0), totalFrames - 2);
    return SCENE_T[i] + (SCENE_T[i + 1] - SCENE_T[i]) * (frame - i);
  };
  const frameAt = (t: number) => {
    const i = SCENE_T.findIndex((x) => x >= t);
    return i < 0 ? totalFrames - 1 : i;
  };
  const frameFractional = (t: number) => {
    const i = frameAt(t);
    if (i <= 0) return 0;
    const t0 = SCENE_T[i - 1];
    const t1 = SCENE_T[i];
    return i - 1 + (t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1);
  };
  return { FPS, 总帧数: totalFrames, 剧情时间: sceneT, 帧: frameAt, 帧小数: frameFractional, 时钟: clock };
};
export type 变速 = ReturnType<typeof 建变速>;
