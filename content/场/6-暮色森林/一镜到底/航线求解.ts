// 航线求解：一镜到底每一程的求解。
// 单独成一个模块，是为了让「求解代码」的指纹只看这里和它 import 的两个库（平顺航迹、杜宾路径）：求解缓存（lib/求解缓存.ts）按这个指纹分层，改模型、音效、别的镜头都不会让缓存失效。
// 路线.ts 的输入表（限值、骨架半径们）从参数传进来，作为每程输入层的一部分进缓存键；巡航层（`params.层`）要查地形，由 路线.ts 传进来，地形单独一层（见 路线.ts 的 `terrainKey`）。
import { solveDubins, type DubinsPose } from '../../../../engine/flight/杜宾路径.ts';
import { trapezoidTurn, legSpeed, type Rotation } from '../../../../engine/flight/平顺航迹.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';

// ====================== 一程 ======================
// 端态：位置、航向（方位，度）、俯仰（度）、速度、加速度（沿速度方向）
export type EndState = { p: V3; ψ: number; γ: number; v: number; a: number };
export type LegParams = { name: string; cruiseSpeed: number; turnRate: number; finalStraight: number; 层: (track: (dist: number) => number[], trackLen: number) => number; landDecelA?: number; landDecelJ?: number; levelFlight?: boolean; maxSlopeDeg?: number };
// 一程的解（采样）：每 采样步 秒一个点
export type LegSolution = {
  名: string;
  T: number;
  t: Float64Array; x: Float64Array; y: Float64Array; z: Float64Array; v: Float64Array; ψ: Float64Array; γ: Float64Array; ω: Float64Array;
  弯: { 起: number; 角: number; 时长: number; 峰率: number }[];
  竖: { 型: '两截' | '一截' | '平'; 层: number; 爬: number; 降: number; 平飞秒: number };
  峰速: number;
  够: boolean;
};
type VerticalPlan = { γ: (t: number) => number; kind: '两截' | '一截' | '平'; climb: number; descent: number; levelFlightSec: number; error?: string };
const integStep = 1 / 960;
const sampleStep = 1 / 480;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const angleDiff = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180; // a → b 转多少（正 = 右转）

// 限值：见 路线.ts 的输入表
export type 限值型 = { 视角转速: number; angAccel: number; pitchRate: number; vertNormalAccel: number; tangAccel: number; tangJerk: number; maxSlopeDeg: number };
export const makeSolver = (limits: 限值型, skeletonRadii: number[]) => {
  // 竖直：俯仰的转动排程。γ(t)（度）由 起点俯仰 + 几个梯形转动叠出来；
  // 两截：穿出来先转到 ±最陡 爬（降）到巡航层、放平，进下一处前再转到 ±最陡 降（爬）到穿刺线的高度、接上穿刺线的俯仰；
  // 一截（两截叠在一起放不下，或程短、两头都比巡航层高）：整程一个 γm，起点转过去、终点转回来，中间匀着爬
  const planVertical = (speedFn: (t: number) => number, duration: number, vmax: number, z0: number, γ0: number, z1: number, γ1: number, cruiseZ: number, preferSingle: boolean, singleMaxSlope: number): VerticalPlan => {
    const maxPitchRate = Math.min(limits.pitchRate, deg(limits.vertNormalAccel / vmax));
    const α = limits.angAccel;
    const turnBy = (Δ: number) => trapezoidTurn(Δ, maxPitchRate, α);
    // 按 γ(t) 积高度（t0 → t1，辛普森）
    const integrateRise = (γ: (t: number) => number, t0: number, t1: number) => {
      if (t1 <= t0) return 0;
      const steps = 2 * Math.max(1, Math.ceil((t1 - t0) / (integStep * 8)));
      const stepT = (t1 - t0) / steps;
      const climbRate = (t: number) => speedFn(t) * Math.sin(rad(γ(t)));
      let z = climbRate(t0) + climbRate(t1);
      for (let i = 1; i < steps; i++) z += (i % 2 ? 4 : 2) * climbRate(t0 + i * stepT);
      return (z * stepT) / 3;
    };
    // 一串：从 t0 起，俯仰 g0 → g → （保持 h）→ g2
    const chain = (t0: number, g0: number, holdPitch: number, holdSec: number, g2: number) => {
      const m1 = turnBy(holdPitch - g0);
      const m2 = turnBy(g2 - holdPitch);
      const dur = m1.duration + holdSec + m2.duration;
      return { D: dur, γ: (t: number) => g0 + m1.angleAt(t - t0) + m2.angleAt(t - t0 - m1.duration - holdSec) };
    };
    // 二分：找 x ∈ [lo, hi] 使 f(x) = 0（f 单调）
    const bisect = (fn: (x: number) => number, lo: number, hi: number) => {
      const flo = fn(lo);
      for (let i = 0; i < 34; i++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(fn(mid)) === Math.sign(flo)) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const slopeLim = singleMaxSlope;
    // 爬（降）一截：从 t0、俯仰 g0 起，转到 g、保持、转到 g2，高度变 dz。先按 ±最陡 解保持多长，保持 0 还过头就把 g 往回收
    const solveStretch = (t0: number, g0: number, g2: number, dz: number) => {
      const riseOf = (holdPitch: number, holdSec: number) => {
        const seq = chain(t0, g0, holdPitch, holdSec, g2);
        return integrateRise(seq.γ, t0, t0 + seq.D);
      };
      const sg = dz >= 0 ? 1 : -1;
      if ((riseOf(sg * slopeLim, 0) - dz) * sg > 0) {
        const pitch = bisect((x) => riseOf(x, 0) - dz, -slopeLim, slopeLim);
        return { g: pitch, h: 0 };
      }
      const holdSec = bisect((x) => riseOf(sg * slopeLim, x) - dz, 0, duration);
      return { g: sg * slopeLim, h: holdSec };
    };
    if (!preferSingle) {
      const climb = solveStretch(0, γ0, 0, cruiseZ - z0);
      const c1 = chain(0, γ0, climb.g, climb.h, 0);
      // 降：倒着排（从终点往回），先按开始时刻 0 解出时长，再挪到 T − 时长
      const descent = (() => {
        const dz = z1 - cruiseZ;
        const riseOf = (holdPitch: number, holdSec: number) => {
          const seq = chain(0, 0, holdPitch, holdSec, γ1);
          // 降这一截按终点对齐：在 [T − D, T] 上积
          const dur = seq.D;
          return integrateRise((t) => seq.γ(t - (duration - dur)), duration - dur, duration);
        };
        const sg = dz >= 0 ? 1 : -1;
        if ((riseOf(sg * slopeLim, 0) - dz) * sg > 0) return { g: bisect((x) => riseOf(x, 0) - dz, -slopeLim, slopeLim), h: 0 };
        return { g: sg * slopeLim, h: bisect((x) => riseOf(sg * slopeLim, x) - dz, 0, duration) };
      })();
      const c2 = chain(0, 0, descent.g, descent.h, γ1);
      const t2 = duration - c2.D;
      // 中间平飞至少半秒，不然就是两截挤在一起（一上一下），改一截
      if (c1.D + 0.5 <= t2) {
        return {
          γ: (t) => (t <= c1.D ? c1.γ(t) : t < t2 ? 0 : c2.γ(t - t2)),
          kind: '两截',
          climb: climb.g,
          descent: descent.g,
          levelFlightSec: t2 - c1.D,
        };
      }
    }
    // 一截：γ0 → γm（保持到终点前）→ γ1，转动贴着两头，保持段填满中间
    const riseOf = (holdPitch: number) => {
      const m1 = turnBy(holdPitch - γ0);
      const m2 = turnBy(γ1 - holdPitch);
      const holdSec = duration - m1.duration - m2.duration;
      if (holdSec < 0) return NaN;
      const seq = chain(0, γ0, holdPitch, holdSec, γ1);
      return integrateRise(seq.γ, 0, duration);
    };
    const dz = z1 - z0;
    const lim = singleMaxSlope;
    // 能转到的最大 γm（转过去、转回来正好占满 T）：再大保持段就是负的
    const feasible = (g: number) => turnBy(g - γ0).duration + turnBy(γ1 - g).duration <= duration;
    const pitchBound = (sg: number) => {
      let lo = (γ0 + γ1) / 2;
      let hi = sg * lim;
      if (feasible(hi)) return hi;
      for (let i = 0; i < 34; i++) {
        const mid = (lo + hi) / 2;
        if (feasible(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const gLo = pitchBound(-1);
    const gHi = pitchBound(1);
    const riseErr = (g: number) => riseOf(g) - dz;
    if (riseErr(gLo) > 0 || riseErr(gHi) < 0)
      throw new Error(`竖直排不下：要变 ${dz.toFixed(1)} 米，${duration.toFixed(2)} 秒里俯仰最多到 ${gLo.toFixed(1)}～${gHi.toFixed(1)}°（上限 ±${lim}°、俯仰角速度 ${maxPitchRate.toFixed(1)}°/秒）只能变 ${(riseErr(gLo) + dz).toFixed(1)}～${(riseErr(gHi) + dz).toFixed(1)} 米`);
    const pitch = bisect(riseErr, gLo, gHi);
    const m1 = turnBy(pitch - γ0);
    const m2 = turnBy(γ1 - pitch);
    const seq = chain(0, γ0, pitch, duration - m1.duration - m2.duration, γ1);
    return { γ: seq.γ, kind: Math.abs(pitch) < 1e-6 && Math.abs(γ0) < 1e-6 && Math.abs(γ1) < 1e-6 ? '平' : '一截', climb: pitch, descent: pitch, levelFlightSec: 0 };
  };

  // 积一程：给出口弯转多少（θ1）、整程多久（T），积出位置；采样=true 时把整程按 采样步 存下来
  const integrateLeg = (start: EndState, end: EndState, params: LegParams, Δψ: number, θ1: number, duration: number, vertCache: Map<number, VerticalPlan & { speedProfile: ReturnType<typeof legSpeed> }>, cruiseZ: number, keepSamples = false) => {
    let vert = vertCache.get(duration);
    if (!vert) {
      // 末尾减速另给上限的（降落）：减速那一截按 降A、降J
      const speedProfile = legSpeed(start.v, start.a, params.cruiseSpeed, end.v, duration, limits.tangAccel, limits.tangJerk, params.landDecelA, params.landDecelJ);
      // 两头都比巡航层高、程又短（极光宫殿 → 云中小屋，都在 170 多米）：中间不降回巡航层，一截平着过去——先俯冲六七十米再爬回来是没来由的大坑
      const single = params.levelFlight ?? (start.p[2] > cruiseZ && end.p[2] > cruiseZ && Math.hypot(end.p[0] - start.p[0], end.p[1] - start.p[1]) < 2500);
      // 竖直排不下的 T 先按平飞积水平位置（牛顿法迭代途中会路过这样的 T，水平位置只差 cos γ），记下原因；解出来以后 选 再按它淘汰
      let plan: VerticalPlan;
      try {
        plan = planVertical(speedProfile.speedAt, duration, Math.max(speedProfile.peak, start.v, end.v), start.p[2], start.γ, end.p[2], end.γ, cruiseZ, single, params.maxSlopeDeg ?? limits.maxSlopeDeg);
      } catch (err) {
        plan = { γ: () => 0, kind: '平', climb: 0, descent: 0, levelFlightSec: 0, error: String(err) };
      }
      vert = { ...plan, speedProfile: speedProfile };
      vertCache.set(duration, vert);
    }
    const speedFn = vert.speedProfile.speedAt;
    // 末直：最后 末直 米直飞，第二个弯在那之前拐完——把米折成秒（从终点往回积速度）
    let finalStraightSec = 0;
    if (params.finalStraight > 0) {
      let dist = 0;
      const step = 1 / 480;
      while (dist < params.finalStraight && finalStraightSec < duration) {
        dist += speedFn(duration - finalStraightSec - step / 2) * step;
        finalStraightSec += step;
      }
    }
    const turnRate = params.turnRate;
    const m1: Rotation = trapezoidTurn(θ1, turnRate, limits.angAccel);
    const m2: Rotation = trapezoidTurn(Δψ - θ1, turnRate, limits.angAccel);
    const t2s = duration - finalStraightSec - m2.duration;
    const ψ = (t: number) => start.ψ + m1.angleAt(t) + m2.angleAt(t - t2s);
    const ω = (t: number) => m1.rateAt(t) + m2.rateAt(t - t2s);
    const steps = Math.max(2, Math.ceil(duration / integStep));
    const stepT = duration / steps;
    let [x, y, z] = start.p;
    const sampleEvery = Math.max(1, Math.round(sampleStep / stepT));
    const samples: number[][] = [];
    if (keepSamples) samples.push([0, x, y, z, speedFn(0), ψ(0), vert.γ(0), ω(0)]);
    for (let i = 0; i < steps; i++) {
      const tm = (i + 0.5) * stepT;
      const pitchRad = rad(vert.γ(tm));
      const headingRad = rad(ψ(tm));
      const stepDist = speedFn(tm) * stepT;
      x += stepDist * Math.cos(pitchRad) * Math.sin(headingRad);
      y += stepDist * Math.cos(pitchRad) * Math.cos(headingRad);
      z += stepDist * Math.sin(pitchRad);
      if (keepSamples && ((i + 1) % sampleEvery === 0 || i === steps - 1)) {
        const t = (i + 1) * stepT;
        samples.push([t, x, y, z, speedFn(t), ψ(t), vert.γ(t), ω(t)]);
      }
    }
    return { end: [x, y, z] as V3, samples: samples, m1, m2, t2s, vert: vert };
  };

  // 牛顿法：给定总转角 Δψ（= 两个弯加起来）和初值，解出口弯 θ1、整程时长 T，使终点的水平位置落到下一处穿刺线的前端
  const newtonSolve = (start: EndState, end: EndState, params: LegParams, Δψ: number, θ1: number, duration: number, cruiseZ: number) => {
    const vertCache = new Map();
    const residual = (exitTurn: number, dur: number) => {
      const leg = integrateLeg(start, end, params, Δψ, exitTurn, dur, vertCache, cruiseZ);
      return [leg.end[0] - end.p[0], leg.end[1] - end.p[1]];
    };
    for (let it = 0; it < 60; it++) {
      const resid = residual(θ1, duration);
      if (Math.hypot(resid[0], resid[1]) < 0.003) return { θ1, T: duration };
      const da = 0.01;
      const dT = 0.002;
      const ea = residual(θ1 + da, duration);
      const eT = residual(θ1, duration + dT);
      const jacobian = [
        [(ea[0] - resid[0]) / da, (eT[0] - resid[0]) / dT],
        [(ea[1] - resid[1]) / da, (eT[1] - resid[1]) / dT],
      ];
      const det = jacobian[0][0] * jacobian[1][1] - jacobian[0][1] * jacobian[1][0];
      if (Math.abs(det) < 1e-12) return null;
      const dθ = (jacobian[1][1] * resid[0] - jacobian[0][1] * resid[1]) / det;
      const dTT = (-jacobian[1][0] * resid[0] + jacobian[0][0] * resid[1]) / det;
      const k = Math.min(1, 10 / Math.max(1e-9, Math.abs(dθ)), 0.3 / Math.max(1e-9, Math.abs(dTT)));
      θ1 -= dθ * k;
      duration = Math.max(0.3, duration - dTT * k);
    }
    return null;
  };
  // 解一程：几组初值（总转角取最短的那个方向和杜宾骨架给的那个方向；出口弯从 0、全部、一半、骨架给的起），都试，取两个弯转得最少的那个解
  // （视角匀速转以后，1000 米/秒的弯半径近 1 公里，比杜宾骨架的 260 米大得多：只照骨架给的初值，牛顿法常收敛到绕一整圈的解）。
  // 巡航层按解出来的轨迹重取一次再解
  const solveLeg = (start: EndState, end: EndState, params: LegParams): LegSolution => {
    let lastError = '';
    const shortestTurn = angleDiff(start.ψ, end.ψ);
    const initGuesses: { Δψ: number; θ1: number }[] = [];
    const hh = rad(end.ψ);
    for (const radius of skeletonRadii) {
      try {
        const dubins = solveDubins([start.p[0], start.p[1], start.ψ] as DubinsPose, [end.p[0] - Math.sin(hh) * params.finalStraight, end.p[1] - Math.cos(hh) * params.finalStraight, end.ψ], radius);
        const arcAngle = (k: number) => (dubins.moves[k] === 'S' ? 0 : deg(dubins.lengths[k] / radius) * (dubins.moves[k] === 'L' ? -1 : 1));
        initGuesses.push({ Δψ: arcAngle(0) + arcAngle(1) + arcAngle(2), θ1: arcAngle(0) + (dubins.moves[1] === 'S' ? 0 : arcAngle(1) / 2) });
      } catch {
        // 这个半径没有杜宾路径
      }
    }
    for (const Δψ of [shortestTurn, shortestTurn - 360 * Math.sign(shortestTurn || 1)]) for (const k of [0, 1, 0.5, -0.3, 1.3]) initGuesses.push({ Δψ, θ1: Δψ * k });
    // 时长初值：直线距离按巡航速度折
    const straightDist = Math.hypot(end.p[0] - start.p[0], end.p[1] - start.p[1]);
    const initDuration = (() => {
      let dur = straightDist / params.cruiseSpeed;
      for (let k = 0; k < 30; k++) {
        const sp = legSpeed(start.v, start.a, params.cruiseSpeed, end.v, dur, limits.tangAccel, limits.tangJerk, params.landDecelA, params.landDecelJ);
        let dist = 0;
        for (let t = 0; t < dur; t += 1 / 240) dist += sp.speedAt(t + 1 / 480) / 240;
        dur *= straightDist / dist;
      }
      return dur;
    })();
    // 巡航层第一遍按起止连线取
    const straightTrack = (l: number) => [start.p[0] + ((end.p[0] - start.p[0]) * l) / straightDist, start.p[1] + ((end.p[1] - start.p[1]) * l) / straightDist];
    // 一组巡航层下试遍初值，取两个弯转得最少的合法解：出口弯拐完才开始拐进口弯（时间上不叠；叠在一起就不是「拐、直飞、拐」了，会把进口弯排到这一程开始以前），每个弯不超过一圈
    const pickBest = (cruiseZ: number) => {
      let best: { θ1: number; T: number; Δψ: number; totalTurn: number } | null = null;
      const tried = new Set<string>();
      for (const guess of initGuesses) {
        const key = `${guess.Δψ.toFixed(1)}/${guess.θ1.toFixed(1)}`;
        if (tried.has(key)) continue;
        tried.add(key);
        let sol: { θ1: number; T: number } | null = null;
        try {
          sol = newtonSolve(start, end, params, guess.Δψ, guess.θ1, initDuration, cruiseZ);
        } catch (err) {
          lastError = String(err);
        }
        if (!sol) continue;
        const turn2 = guess.Δψ - sol.θ1;
        if (Math.abs(sol.θ1) > 360 || Math.abs(turn2) > 360) continue;
        const leg = integrateLeg(start, end, params, guess.Δψ, sol.θ1, sol.T, new Map(), cruiseZ);
        if (leg.vert.error) {
          lastError = leg.vert.error;
          continue;
        }
        if (leg.t2s < leg.m1.duration - 1e-6 && Math.abs(sol.θ1) >= 0.05 && Math.abs(turn2) >= 0.05) continue;
        if (leg.t2s < -1e-6 && Math.abs(turn2) >= 0.05) continue;
        const totalTurn = Math.abs(sol.θ1) + Math.abs(turn2);
        if (!best || totalTurn < best.totalTurn - 0.01) best = { ...sol, Δψ: guess.Δψ, totalTurn: totalTurn };
        if (Math.abs(totalTurn - Math.abs(shortestTurn)) < 0.5) break;
      }
      if (!best) throw new Error(`一镜到底 ${params.name}：这一程解不出（${lastError || '牛顿法不收敛，或者解出来的两个弯叠在一起'}）。查输入表：程太短、弯太大、要爬太高`);
      return best;
    };
    let cruiseZ = params.层(straightTrack, straightDist);
    let best = pickBest(cruiseZ);
    // 第二遍：按解出来的轨迹重取巡航层，再选一次
    {
      const r0 = integrateLeg(start, end, params, best.Δψ, best.θ1, best.T, new Map(), cruiseZ, true);
      const xy = r0.samples.map((q) => [q[1], q[2]]);
      const cumDist = [0];
      for (let i = 1; i < xy.length; i++) cumDist.push(cumDist[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
      let j = 0;
      const track = (dist: number) => {
        while (j > 0 && cumDist[j] > dist) j--;
        while (j < cumDist.length - 1 && cumDist[j + 1] < dist) j++;
        return xy[j];
      };
      const H2 = params.层(track, cumDist[cumDist.length - 1]);
      if (Math.abs(H2 - cruiseZ) >= 0.5) {
        cruiseZ = H2;
        best = pickBest(cruiseZ);
      }
    }
    const finalLeg = integrateLeg(start, end, params, best.Δψ, best.θ1, best.T, new Map(), cruiseZ, true);
    const col = (k: number) => Float64Array.from(finalLeg.samples, (q) => q[k]);
    const turns = [
      { 起: 0, 角: finalLeg.m1.angle, 时长: finalLeg.m1.duration, 峰率: finalLeg.m1.peakRate },
      { 起: finalLeg.t2s, 角: finalLeg.m2.angle, 时长: finalLeg.m2.duration, 峰率: finalLeg.m2.peakRate },
    ].filter((w) => Math.abs(w.角) >= 0.05);
    return {
      名: params.name,
      T: best.T,
      t: col(0), x: col(1), y: col(2), z: col(3), v: col(4), ψ: col(5), γ: col(6), ω: col(7),
      弯: turns,
      竖: { 型: finalLeg.vert.kind, 层: cruiseZ, 爬: finalLeg.vert.climb, 降: finalLeg.vert.descent, 平飞秒: finalLeg.vert.levelFlightSec },
      峰速: finalLeg.vert.speedProfile.peak,
      够: finalLeg.vert.speedProfile.fits,
    };
  };
  return { 解程: solveLeg };
};
