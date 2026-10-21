// 真实飞行的随机输入：Dryden 低空湍流尺度、确定性随机数、沿里程打表的有色噪声场（阵风、航向漂移），和标定颠簸幅度用的模态方差。
// Dryden 低空（MIL-F-8785C，离地 1000 英尺以下）：长度尺度（米）和强度（米/秒）。高于 1000 英尺按 1000 英尺算（这里只用在低空巡航）
export const lowAltTurbulence = (heightAgl: number, W20: number) => {
  const heightM = Math.min(Math.max(heightAgl, 3), 304.8);
  const hf = heightM / 0.3048;
  const altFactor = 0.177 + 0.000823 * hf;
  const σw = 0.1 * W20;
  return { Lw: heightM, Lv: heightM / altFactor ** 1.2, σw, σv: σw / altFactor ** 0.4 };
};

// ---------- 确定性随机 ----------
const uniformRng = (seed: number) => {
  let state = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const gaussianRng = (seed: number) => {
  const uniform = uniformRng(seed);
  return () => Math.sqrt(-2 * Math.log(Math.max(1e-300, uniform()))) * Math.cos(2 * Math.PI * uniform());
};

// 空间有色噪声，驱动是单位强度白噪声，沿 s 打表 [s0, s1]，前面多跑 6L 让滤波器进入平稳，表外夹到两端。两种谱形：
// - 阵风：Dryden 谱形 (1 + √3·L·p)/(1 + L·p)²，增益 σ·√L 时输出方差正好 σ²；高频 Ω⁻² 衰减，导数是毛的，正是湍流该有的；
// - 漂移：1/(1 + L·p)²，增益 2σ·√L；高频 Ω⁻⁴ 衰减，值和导数都光滑。用毛的谱做航向漂移会像手抖。
//   高通 > 0 时减去一个零相位一阶低通：驾驶员盯着远处，航向偏差不会一偏十几公里不管，否则横向偏移被长波带得很远。
export const drydenField = (seed: number, σ: number, lengthScale: number, s0In: number, s1In: number, smooth = false, highpass = 0) => {
  const s0 = s0In - 3 * highpass;
  const s1 = s1In + 3 * highpass;
  const ds = Math.min(lengthScale / 20, 5);
  const sampleCount = Math.ceil((s1 - s0) / ds) + 2;
  const pre = Math.ceil((6 * lengthScale) / ds);
  const gauss = gaussianRng(seed);
  const out = new Float64Array(sampleCount);
  const gain = (smooth ? 2 : 1) * σ * Math.sqrt(lengthScale);
  const L2 = lengthScale * lengthScale;
  const r3L = smooth ? 0 : Math.sqrt(3) * lengthScale;
  let x1 = 0;
  let x2 = 0;
  for (let i = -pre; i < sampleCount; i++) {
    if (i >= 0) out[i] = gain * (x1 + r3L * x2);
    const whiteNoise = gauss() / Math.sqrt(ds);
    const f2 = (a: number, b: number) => (whiteNoise - a - 2 * lengthScale * b) / L2;
    const k1a = x2, k1b = f2(x1, x2);
    const k2a = x2 + (ds / 2) * k1b, k2b = f2(x1 + (ds / 2) * k1a, x2 + (ds / 2) * k1b);
    const k3a = x2 + (ds / 2) * k2b, k3b = f2(x1 + (ds / 2) * k2a, x2 + (ds / 2) * k2b);
    const k4a = x2 + ds * k3b, k4b = f2(x1 + ds * k3a, x2 + ds * k3b);
    x1 += (ds / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
    x2 += (ds / 6) * (k1b + 2 * k2b + 2 * k3b + k4b);
  }
  if (highpass > 0) {
    const alpha = ds / highpass;
    const lp = Float64Array.from(out);
    for (let i = 1; i < sampleCount; i++) lp[i] = lp[i - 1] + alpha * (lp[i] - lp[i - 1]);
    for (let i = sampleCount - 2; i >= 0; i--) lp[i] = lp[i + 1] + alpha * (lp[i] - lp[i + 1]);
    for (let i = 0; i < sampleCount; i++) out[i] -= lp[i];
  }
  return (dist: number) => {
    const x = Math.min(Math.max((dist - s0) / ds, 0), sampleCount - 1.000001);
    const i = Math.floor(x);
    return out[i] + (out[i + 1] - out[i]) * (x - i);
  };
};

// 颠簸幅度标定：单位强度 Dryden 时间谱（冻结湍流）经二阶模态后的方差，对 ω 数值积分（和种子无关）
export const modeVariance = (lengthScale: number, speed: number, freqHz: number, ζ: number) => {
  const ωb = 2 * Math.PI * freqHz;
  let sum = 0;
  const steps = 6000;
  const lo = Math.log(1e-3);
  const hi = Math.log(1e4);
  for (let i = 0; i < steps; i++) {
    const ω = Math.exp(lo + ((i + 0.5) / steps) * (hi - lo));
    const Ω = ω / speed;
    const Φ = (lengthScale / Math.PI) * (1 + 3 * lengthScale * lengthScale * Ω * Ω) / (1 + lengthScale * lengthScale * Ω * Ω) ** 2 / speed; // 单边，单位方差
    const H2 = ωb ** 4 / ((ωb * ωb - ω * ω) ** 2 + (2 * ζ * ωb * ω) ** 2);
    sum += Φ * H2 * ω * ((hi - lo) / steps);
  }
  return sum;
};
