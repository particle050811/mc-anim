// 关键帧插值。段的插值方式挂在段起点的关键帧上：smooth（默认）= 三次 Hermite，端点和极值点切线为 0，不冲过关键帧；linear 用于匀速冲刺；const 用于刀刃这类出现/消失的开关；
// back = 段尾冲过终值再退回（冲过量约这段变化量的 12%，起点速度接前一段、终点停稳）：甩刀、转身这类带惯性的动作收尾用。
// smooth 永远不冲过头会停得像被钉住（动作调研结论），要惯性的段落显式写 back，默认行为不变。
export type Interp = 'smooth' | 'linear' | 'const' | 'back';
export type Key = [frame: number, value: number, interp?: Interp];
export type VKey = [frame: number, value: number[], interp?: Interp];

export const sample = (keys: Key[], frame: number): number => {
  if (frame <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (frame >= last[0]) return last[1];
  let i = 0;
  while (frame > keys[i + 1][0]) i++;
  const [f0, v0, kind = 'smooth'] = keys[i];
  const [f1, v1] = keys[i + 1];
  const t = (frame - f0) / (f1 - f0);
  if (kind === 'const') return v0;
  if (kind === 'linear') return v0 + (v1 - v0) * t;
  const tangent = (j: number) => {
    if (j === 0 || j === keys.length - 1) return 0;
    const [fa, va] = keys[j - 1];
    const [fb, vb] = keys[j];
    const [fc, vc] = keys[j + 1];
    const d0 = (vb - va) / (fb - fa);
    const d1 = (vc - vb) / (fc - fb);
    if (d0 * d1 <= 0) return 0;
    const secant = (vc - va) / (fc - fa);
    return Math.sign(secant) * Math.min(Math.abs(secant), 3 * Math.abs(d0), 3 * Math.abs(d1));
  };
  const span = f1 - f0;
  const m0 = tangent(i) * span;
  const t2 = t * t;
  const t3 = t2 * t;
  // back：起点切线照 smooth（接得上前一段的速度），终点切线为 0（停稳），再叠一个 t³(1−t)² 的鼓包，
  // 在段内 3/4 处冲过终值约 12%，到段尾正好退回终值、速度为 0
  if (kind === 'back') return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1 + 10.5 * (v1 - v0) * t3 * (1 - t) * (1 - t);
  const m1 = tangent(i + 1) * span;
  return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * m1;
};

// 按通道错开采样：同一套关键帧，某个部位晚 延迟 帧（负数 = 提前）再走，map 是采样前的时间重映射（如 `holdTime`）。用于「髋先动、胸、臂、刀依次跟上」：各部位同帧起停看着像木偶
export const sampleLag = (keys: Key[], f: number, lagFrames = 0, map: (frame: number) => number = (x) => x): number => sample(keys, map(f - lagFrames));

// 时间停顿（通用时间重映射）：在 at 处停住 len 帧，之后整体顺延 len 帧；可给多处，按 at 从小到大，at 是停住前的时间。返回 输出时间 → 原时间。例：停顿([98, 12]) 把 98～110 都停在 98，110 以后 = f − 12。
// 用处：关键帧按短动作调好、要在中间拉长一段，或打击停顿（`HIT_STOP_FRAMES`，在 作品/应力转动/默认.ts）
export const holdTime = (...holds: [at: number, len: number][]) => (frame: number): number => {
  let shift = 0;
  for (const [at, len] of [...holds].sort((a, b) => a[0] - b[0])) {
    if (frame < at + shift) return frame - shift;
    if (frame < at + shift + len) return at;
    shift += len;
  }
  return frame - shift;
};

export const sampleV = (keys: VKey[], f: number): number[] =>
  keys[0][1].map((_, c) => sample(keys.map(([k, values, i]) => [k, values[c], i] as Key), f));

// 分段 smoothstep：每段首尾都停稳，适合表演参数（幅度、抬头、张嘴）的过渡
export const track = (pts: [number, number][], frame: number): number => {
  if (frame <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [f0, v0] = pts[i];
    const [f1, v1] = pts[i + 1];
    if (frame <= f1) {
      let t = (frame - f0) / (f1 - f0);
      t = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * t;
    }
  }
  return pts[pts.length - 1][1];
};

export const rad = (deg: number) => (deg * Math.PI) / 180;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
