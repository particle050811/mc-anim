// 平顺航迹：一镜到底（镜头/一镜到底/路线.ts）和各段穿刺线（九头蛇、雪怪首领的俯冲剖面）共用的轨迹构件。
// 做法是「路径-速度分解」：曲率连续（G2）的几何 + jerk 受限的速度，照过山车 FVD 的思路。游戏里没有惯性，飞行方向就是视角，
// 所以直接在时间上规定视角怎么转（航向、俯仰的角速度）、速度怎么变，再积分出位置（用户 10-07 定）：
// - 转动（航向、俯仰）：梯形角速度，两头按角加速度上限线性加减，中间匀速转；
// - 速度：梯形加速度的 S 曲线（jerk 恒定），加速度连续；
// - 位置 = ∫ v·(cosγ sinψ, cosγ cosψ, sinγ) dt，位置到加速度都连续，jerk 有界。
// 单位：时间秒、角度度（转动的率是度/秒）、长度米；方位 0 = 北、顺时针为正。
// 剖面（按距离排的竖直剖面）给穿刺线用：穿刺线上速度恒定，时间上的俯仰角速度上限就是路程上的曲率上限（κ = q / v）。

// ---------- 转动：梯形角速度 ----------
// Δ：总共转多少度（带符号）；率：角速度上限（度/秒）；加：角加速度上限（度/秒²）。
// 转得够多：加速 τ = 率/加 → 匀速 → 减速 τ；转得少（|Δ| < 率²/加）：三角形，峰值 √(|Δ|·加)，角加速度照样不超上限。
export type Rotation = { angle: number; duration: number; peakRate: number; angleAt: (t: number) => number; rateAt: (t: number) => number };
export const trapezoidTurn = (Δ: number, maxRate: number, maxAccel: number): Rotation => {
  const sg = Math.sign(Δ);
  const absDelta = Math.abs(Δ);
  if (absDelta < 1e-9) return { angle: 0, duration: 0, peakRate: 0, angleAt: () => 0, rateAt: () => 0 };
  const reachesMax = absDelta >= (maxRate * maxRate) / maxAccel;
  const peakRate = reachesMax ? maxRate : Math.sqrt(absDelta * maxAccel);
  const τ = peakRate / maxAccel;
  const holdSec = reachesMax ? absDelta / maxRate - τ : 0;
  const totalSec = 2 * τ + holdSec;
  const angleAt = (t: number) => {
    if (t <= 0) return 0;
    if (t >= totalSec) return Δ;
    if (t < τ) return (sg * maxAccel * t * t) / 2;
    if (t < τ + holdSec) return sg * ((peakRate * τ) / 2 + peakRate * (t - τ));
    const remainSec = totalSec - t;
    return sg * (absDelta - (maxAccel * remainSec * remainSec) / 2);
  };
  const rateAt = (t: number) => {
    if (t <= 0 || t >= totalSec) return 0;
    if (t < τ) return sg * maxAccel * t;
    if (t < τ + holdSec) return sg * peakRate;
    return sg * maxAccel * (totalSec - t);
  };
  return { angle: Δ, duration: totalSec, peakRate: peakRate, angleAt, rateAt };
};

// ---------- 速度：梯形加速度的 S 曲线 ----------
// v0（起点速度）、a0（起点加速度，接上一段用；和变速同向或 0）→ v1，终点加速度 0。A：加速度上限，J：jerk 上限（都取正）。
// 三截：jerk ±J 把加速度从 a0 推到峰值 ap → 峰值保持 → jerk ∓J 收到 0。变得少时峰值够不到 A（没有中间那截）。
export type SpeedRamp = { duration: number; speedAt: (t: number) => number; accelAt: (t: number) => number; distAt: (t: number) => number; dist: number };
export const sCurveRamp = (v0: number, a0: number, v1: number, maxAccel: number, maxJerk: number): SpeedRamp => {
  const sg = v1 >= v0 ? 1 : -1;
  const dv = Math.abs(v1 - v0);
  const b0 = Math.max(0, a0 * sg); // 起点加速度（变速方向上）
  let ap: number;
  let t2: number;
  if (dv < 1e-9 && b0 < 1e-9) return { duration: 0, speedAt: () => v0, accelAt: () => 0, distAt: (t) => v0 * Math.max(0, t), dist: 0 };
  let J1 = maxJerk;
  let J3 = maxJerk;
  if ((2 * maxAccel * maxAccel - b0 * b0) / (2 * maxJerk) <= dv) {
    ap = maxAccel;
    t2 = (dv - (2 * maxAccel * maxAccel - b0 * b0) / (2 * maxJerk)) / maxAccel;
  } else {
    ap = Math.sqrt((2 * maxJerk * dv + b0 * b0) / 2);
    t2 = 0;
    if (ap < b0) {
      // 起点加速度太大，直接收到 0 也会冲过 v1：收得更猛一点（只在接上一段时可能出现）
      ap = b0;
      J3 = (b0 * b0) / (2 * Math.max(dv, 1e-9));
    }
  }
  const t1 = (ap - b0) / J1;
  const t3 = ap / J3;
  const totalSec = t1 + t2 + t3;
  const accelAt = (t: number) => {
    if (t <= 0) return sg * b0;
    if (t < t1) return sg * (b0 + J1 * t);
    if (t < t1 + t2) return sg * ap;
    if (t < totalSec) return sg * J3 * (totalSec - t);
    return 0;
  };
  // v、距：分段解析积分
  const v1a = b0 * t1 + (J1 * t1 * t1) / 2;
  const v2a = v1a + ap * t2;
  const vRel = (t: number) => {
    if (t <= 0) return 0;
    if (t < t1) return b0 * t + (J1 * t * t) / 2;
    if (t < t1 + t2) return v1a + ap * (t - t1);
    if (t < totalSec) {
      const phaseSec = t - t1 - t2;
      return v2a + ap * phaseSec - (J3 * phaseSec * phaseSec) / 2;
    }
    return dv;
  };
  const x1 = (b0 * t1 * t1) / 2 + (J1 * t1 ** 3) / 6;
  const x2 = x1 + v1a * t2 + (ap * t2 * t2) / 2;
  const xRel = (t: number) => {
    if (t <= 0) return 0;
    if (t < t1) return (b0 * t * t) / 2 + (J1 * t ** 3) / 6;
    if (t < t1 + t2) {
      const phaseSec = t - t1;
      return x1 + v1a * phaseSec + (ap * phaseSec * phaseSec) / 2;
    }
    const phaseSec = Math.min(t, totalSec) - t1 - t2;
    const x = x2 + v2a * phaseSec + (ap * phaseSec * phaseSec) / 2 - (J3 * phaseSec ** 3) / 6;
    return t <= totalSec ? x : x + dv * (t - totalSec);
  };
  const speedAt = (t: number) => v0 + sg * vRel(t);
  const distAt = (t: number) => v0 * Math.max(0, t) + sg * xRel(t);
  return { duration: totalSec, speedAt, accelAt, distAt, dist: distAt(totalSec) };
};

// 一程的速度：起点 (v0, a0) 加到 巡航，再在 T 时刻正好减到 v1。放不下（T 太短）时峰值压低，两条 S 曲线首尾相接。
// A降、J降：末尾那条减速另给上限（降落用，不给就同 A、J）。
// 返回 v(t)、峰值、两截的时长；峰值压到 max(v0, v1) 还放不下时 够 = false（时间太短，调用方再加长 T）
export type LegSpeed = { speedAt: (t: number) => number; accelAt: (t: number) => number; peak: number; upTime: number; down: number; fits: boolean };
export const legSpeed = (v0: number, a0: number, cruiseSpeed: number, v1: number, totalSec: number, maxAccel: number, maxJerk: number, decelMaxAccel = maxAccel, decelMaxJerk = maxJerk): LegSpeed => {
  const planRamps = (vp: number) => ({ up: sCurveRamp(v0, a0, vp, maxAccel, maxJerk), dn: sCurveRamp(vp, 0, v1, decelMaxAccel, decelMaxJerk) });
  let vp = cruiseSpeed;
  let { up, dn } = planRamps(vp);
  let fits = true;
  if (up.duration + dn.duration > totalSec) {
    let lo = Math.max(v0, v1);
    let hi = cruiseSpeed;
    const r0 = planRamps(lo);
    if (r0.up.duration + r0.dn.duration > totalSec) {
      fits = false;
      vp = lo;
      ({ up, dn } = r0);
    } else {
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const ramps = planRamps(mid);
        if (ramps.up.duration + ramps.dn.duration > totalSec) hi = mid;
        else lo = mid;
      }
      vp = lo;
      ({ up, dn } = planRamps(vp));
    }
  }
  const decelStartSec = totalSec - dn.duration;
  const speedAt = (t: number) => (t < up.duration ? up.speedAt(t) : t < decelStartSec ? vp : dn.speedAt(t - decelStartSec));
  const accelAt = (t: number) => (t < up.duration ? up.accelAt(t) : t < decelStartSec ? 0 : dn.accelAt(t - decelStartSec));
  return { speedAt, accelAt, peak: vp, upTime: up.duration, down: dn.duration, fits: fits };
};

// ---------- 竖直剖面：按水平距离排的俯仰（速度恒定的穿刺线用） ----------
// 从一个起点（a 水平距离、z 高度、γ 俯仰角）出发，按步骤往前（或往后）积分：
//   { 到角: γ } —— 俯仰转到 γ（梯形：曲率上限 κ = q/v、曲率变化上限 q̇/v²，这里直接给路程上的 曲率、曲率变化率）；
//   { 直: L } —— 保持当前俯仰飞 L 米（沿路程）；
// 积出的是路程 s 上的 a(s)、z(s)、γ(s)，再按 a 查。往后积（方向 −1）用来从贯穿点往回排俯冲。
export type ProfileStep = { toAngle: number; 曲率?: number; curvatureRate?: number } | { 直: number };
export type ProfileLimits = { 曲率: number; curvatureRate: number }; // 曲率：1/米（俯仰每米最多转几弧度）；变率：1/米²
// 穿刺线（扫帚 320 米/秒贴 boss 飞的那一截）的俯仰上限：角速度 2°/帧（用户 10-08：h = R(1 − cos γ)、R = v / ω，半径 382 米），角加速度 2°/帧²（一帧转满）；竖直加速度 0.47 米/帧²，在 0.5 以内。
// 用全程的 0.3°/帧²（一镜到底/路线.ts 的 `limits`）会让拉平的底变成贯穿点前后各六七十米的平底，矛尖钻进地里。验收.ts 在穿刺线上按这一组验
export const pierceLimits = { pitchRate: 2, pitchAccel: 2 }; // °/帧、°/帧²
export const pierceProfileLimits = (V: number): ProfileLimits => ({
  曲率: (pierceLimits.pitchRate * 24 * Math.PI) / 180 / V,
  curvatureRate: (pierceLimits.pitchAccel * 576 * Math.PI) / 180 / (V * V),
});
export type ProfilePoint = { s: number; a: number; z: number; γ: number };
const profileStepLen = 0.25;
export const integrateProfile = (start: { a: number; z: number; γ: number }, steps: ProfileStep[], limits: ProfileLimits, direction: 1 | -1 = 1): ProfilePoint[] => {
  const out: ProfilePoint[] = [{ s: 0, ...start }];
  let { a: along, z, γ } = start;
  let arcLen = 0;
  const advance = (dγ: (dist: number) => number, length: number) => {
    // dγ(u)：这一步走了 u 米时俯仰比步首多了多少（弧度，按前进方向的口径）
    const stepCount = Math.max(1, Math.ceil(length / profileStepLen));
    const stepLen = length / stepCount;
    const γ0 = γ;
    for (let i = 1; i <= stepCount; i++) {
      const midPitch = γ0 + dγ((i - 0.5) * stepLen);
      along += direction * Math.cos(midPitch) * stepLen;
      z += direction * Math.sin(midPitch) * stepLen;
      arcLen += stepLen;
      out.push({ s: arcLen, a: along, z, γ: γ0 + dγ(i * stepLen) });
    }
    γ = γ0 + dγ(length);
  };
  for (const step of steps) {
    if ('直' in step) {
      advance(() => 0, step.直);
      continue;
    }
    // 俯仰转动：在路程上就是曲率的梯形（往后积时转动方向反过来：从终点往回看，俯仰是倒着变的）
    const k = step.曲率 ?? limits.曲率;
    const kk = step.curvatureRate ?? limits.curvatureRate;
    const Δ = step.toAngle - γ;
    const turn = trapezoidTurn(Δ, k, kk); // 把「度/秒」当成「弧度/米」用：数学一样
    if (turn.duration > 0) advance((u) => turn.angleAt(u), turn.duration);
  }
  return out;
};
// 剖面点按 a 排好以后的查表：z(a)、γ(a)（a 单调）
export const profileLookup = (points: ProfilePoint[]) => {
  const ps = [...points].sort((p, q) => p.a - q.a);
  const locate = (along: number) => {
    let lo = 0;
    let hi = ps.length - 1;
    if (along <= ps[0].a) return { i: 0, k: 0 };
    if (along >= ps[hi].a) return { i: hi - 1, k: 1 };
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ps[mid].a <= along) lo = mid;
      else hi = mid;
    }
    return { i: lo, k: (along - ps[lo].a) / Math.max(1e-12, ps[lo + 1].a - ps[lo].a) };
  };
  return {
    z: (along: number) => {
      const { i, k } = locate(along);
      // 两头之外按端点的坡度外推（穿刺线两头都是直的）
      if (along < ps[0].a) return ps[0].z + Math.tan(ps[0].γ) * (along - ps[0].a);
      if (along > ps[ps.length - 1].a) {
        const last = ps[ps.length - 1];
        return last.z + Math.tan(last.γ) * (along - last.a);
      }
      return ps[i].z + (ps[i + 1].z - ps[i].z) * k;
    },
    γ: (along: number) => {
      if (along <= ps[0].a) return ps[0].γ;
      if (along >= ps[ps.length - 1].a) return ps[ps.length - 1].γ;
      const { i, k } = locate(along);
      return ps[i].γ + (ps[i + 1].γ - ps[i].γ) * k;
    },
    起: ps[0],
    止: ps[ps.length - 1],
  };
};
// 二分：f 在 [lo, hi] 两头异号时找零点
const bisectRoot = (fn: (x: number) => number, lo: number, hi: number) => {
  const flo = fn(lo);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(fn(mid)) === Math.sign(flo)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
// 从 起 往前（或往后）按 [转到 γ → 保持 → 转到 γ末] 落到高度 z目标：解保持段多长（二分）。
// 保持 0 还落过头时把 γ 往 起.γ 那边收（三角形），返回实际用的 γ（弧度）和保持多长。用来排「从巡航高度俯冲到贯穿点」这类剖面
export const descendTo = (start: { a: number; z: number; γ: number }, γ: number, endPitch: number, targetZ: number, limits: ProfileLimits, direction: 1 | -1 = 1) => {
  const miss = (pitch: number, holdLen: number) => {
    const profile = integrateProfile(start, [{ toAngle: pitch }, { 直: holdLen }, { toAngle: endPitch }], limits, direction);
    return profile[profile.length - 1].z - targetZ;
  };
  if (Math.sign(miss(γ, 0)) !== Math.sign(miss(start.γ, 0))) return { γ: bisectRoot((g) => miss(g, 0), start.γ, γ), 直: 0 };
  let hi = 100;
  while (Math.sign(miss(γ, hi)) === Math.sign(miss(γ, 0)) && hi < 1e5) hi *= 2;
  return { γ, 直: bisectRoot((L) => miss(γ, L), 0, hi) };
};
