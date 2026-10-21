// 通用确定性弹簧（RK4 打表、Hermite 插值）：真实飞行的镜头跟随用，别的镜头也直接拿 `springTable`。
export const integStepSec = 1 / 480; // 秒（物理时间）

// 输入 u(t)，x'' = ω²(u − x) − 2ζω·x'，从 x = u(T0)、x' = 0 起步，RK4、步长 1/480；返回按 t 查的 { 值, 速 }
export const springTable = (input: (t: number) => number, T0: number, T1: number, angularFreq: number, damping = 1) => {
  const step = integStepSec;
  const steps = Math.max(1, Math.ceil((T1 - T0) / step));
  const posTable = new Float64Array(steps + 1);
  const Vv = new Float64Array(steps + 1);
  const ω = angularFreq;
  let x = input(T0);
  let vel = 0;
  posTable[0] = x;
  for (let k = 0; k < steps; k++) {
    const t = T0 + k * step;
    const accel = (xx: number, vv: number, tt: number) => ω * ω * (input(tt) - xx) - 2 * damping * ω * vv;
    const k1x = vel, k1v = accel(x, vel, t);
    const k2x = vel + (step / 2) * k1v, k2v = accel(x + (step / 2) * k1x, vel + (step / 2) * k1v, t + step / 2);
    const k3x = vel + (step / 2) * k2v, k3v = accel(x + (step / 2) * k2x, vel + (step / 2) * k2v, t + step / 2);
    const k4x = vel + step * k3v, k4v = accel(x + step * k3x, vel + step * k3v, t + step);
    x += (step / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    vel += (step / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    posTable[k + 1] = x;
    Vv[k + 1] = vel;
  }
  return (t: number) => {
    const gridPos = Math.min(Math.max((t - T0) / step, 0), steps);
    const i = Math.min(Math.floor(gridPos), steps - 1);
    const frac = gridPos - i;
    return { value: hermite(posTable[i], Vv[i] * step, posTable[i + 1], Vv[i + 1] * step, frac), vel: Vv[i] + (Vv[i + 1] - Vv[i]) * frac };
  };
};

export const hermite = (p0: number, m0: number, p1: number, m1: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
};
