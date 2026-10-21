// 真实飞行：让扫帚沿规划航线飞得像有人在驾驶，而不是贴着数学曲线滑。主世界 6-2-5、6-2-6 和暮色一镜到底共用。
// 给出每一帧相对理想航线的偏移和姿态扰动，调用方叠上去。口径「看得出不是直线、但不晕」：镜头不横滚、地平线水平，
// 扫帚内倾总共不超过 18°（飞行路径.ts 的 `maxBankDeg`）。参数和出处见 真实飞行/参数.ts，随机场见 真实飞行/湍流.ts，弹簧见 真实飞行/弹簧.ts。
//
// 模型：侧向 `横`（正 = 右）、竖直 `竖`（正 = 上）两个平移通道，在航线局部坐标里量，各是二阶追踪系统（驾驶员 + 扫帚）：
//   ÿ + 2ζω·ẏ + ω²·y = G(t)·[ 2ζω·V·ψd(s) + k·V·g(s + 风速·t) ]
//   - ψd(s)：航向漂移，沿路程 s 的低频有色噪声（谱形 1/(1 + L·p)²），再去掉 `漂移高通` 米以上的超长波；
//   - g：Dryden 阵风（MIL-F-8785C 低空），冻结湍流随平均风平移，k 为气动导纳；G(t) = 锚点前后渐弱 × 调用方的 `inputGain`(s)。
//   「纯追踪 + 航向一阶滞后」线性化：ω² = V/(L·τ)、2ζω = 1/τ，前视距离 L 随速度变（同 ArduPilot L1）。ζ 取 0.55～0.65（比 L1 的 0.707 小），让修正带点过冲，像人手驾驶。
// 机体颠簸：同一阵风场过二阶机体模态，滤出俯仰、横滚、朝向、升沉；幅度按「参考速度下均方根 = 给定值」标定（谱形照物理、幅度按画面定）。
// 转弯内倾：由扰动航向角速度算，口径同 `内倾`（tanh 软限幅），不按协调转弯 atan(a/g)（1000 米/秒下会压到 79°，就是嫌晕的翻滚）。
//   与航线自己的转弯合成用 `combineBank`(F, 路线角速度)；再加颠簸横滚用 `combineRoll`(内倾值, 颠簸.横滚)。
// 镜头：视线航向、俯仰用临界阻尼弹簧（ω 2.5）跟扫帚的扰动角，只跟扰动不跟航线转弯（否则暮色 260 米急弯会甩出画面）；
//   不对镜头位置加弹簧（镜头离扫帚只有 18 米，位置一滞后扫帚就出画）；颠簸只加在画出来的扫帚上、不加在镜头上，
//   所以镜头摆位要用不含颠簸的位置和朝向。视线按「航线朝向」定的加 `镜头.航向`；本来就跟着扰动后扫帚走的（暮色 镜头.ts）加 `镜头.相对航向`/`相对俯仰`，否则扰动算两遍。
//
// 约束和做法：
// - 确定性纯函数：调用 `realFlight`() 时按 `种子` 一次积分完（RK4，步长 1/480 秒，物理时间），之后按帧查表、Hermite 插值。Remotion 乱序出帧，不能逐帧累积。调用方在模块顶层调一次。
// - 锚点 { 帧, 止帧?, 前, 后 }（全局帧；前后渐变帧数默认 48）：帧～止帧之间扰动恒为 0（`at`() 精确返回 0，不经插值），前后用 smootherstep 渐变（偏移及一、二阶导在锚点处为 0）；
//   输入在锚点前 前×1.5 帧就开始渐弱，状态在锚点区间清零。起帧总是从静止开始；止帧不自动归零，要接下一段就给锚点。
//   低速段（约 500 米/秒以下）要放进锚点：航向扰动 = atan(横速 / V)，V 低时同样横速航向大好几倍。
// - 物理时间：一镜到底有子弹时间（画面时钟变慢、物理速度不变），扰动按物理时间走，传 `frameToTime` = 路线.ts 的 `physTime`，默认 F/24。
// - 里程口径不变：库只给相对航线的偏移，沿航线里程 s(F) 仍用调用方的；不要拿偏移后的几何重算里程（会绕回来）。
//   航线曲率 κ 处横向偏移 y 让路程按 (1 − κy) 伸缩，所以暮色急弯要把 `inputGain` 压下去。
// - 地形净空由调用方保证：在「偏移后的水平航线」上重做地形跟随，再叠竖直扰动。`vertFloor`(s)（米，一般为负）是软下限：
//   竖 = 下限 + 软度·ln(1 + e^((竖原 − 下限)/软度))，永不低于下限、处处光滑；下限接近 0 时竖直偏移整体抬高约 软度·ln2。台阶函数的下限库会先沿里程取前后 ±1 公里最大值再抹平，只会更严。
//   偏移要先调一次才有，所以分两遍：先不带下限调一次，拿 `按里程`().横 重做地形跟随，再 `withVertFloor`(下限)。下限为正时锚点里扰动必须是 0，航线本身要调用方自己抬。
//
// 接口：const 扰 = `realFlight`({ 种子, 起帧, 止帧, 里程: (t秒) => 米, 帧到时间?, 锚点?, 竖直下限?, 输入增益?, 参数? });
//   扰.at(F)：横、竖（米）、横速、竖速、横加速、竖加速；航向（度，正 = 左）、俯仰（正 = 抬头）；角速度（度/秒）；内倾（度，正 = 右压，只算扰动那份）；
//     颠簸 { 俯仰, 横滚, 朝向, 竖 }（只加到画出来的扫帚）；镜头 { 航向, 俯仰 }；权重（锚点窗口，0 = 锚点上）；速度；s。
//   扰.按里程(s) → { 横, 竖 }；扰.合成内倾(F, 路线角速度)：只在「朝向按原航线算、另加 扰.航向」时用，朝向已由偏移后航线切线算出时直接 `内倾`(总角速度)；
//   `combineRoll`；扰.带竖直下限(下限)；`springTable`(输入, T0, T1, 频率, 阻尼)：通用确定性弹簧。
// 接入范例：主世界 见 src/镜头/6-2-5/编排.ts（两遍调用：先 扰0 取横向重做地形跟随，再 扰0.带竖直下限；镜头视线换成「路线朝向 + 扰.镜头.航向」），
//   暮色一镜到底 见 src/镜头/一镜到底/路线.ts（切线由偏移后位置差分，已含扰动，不要再加 扰.航向；R.扫帚(f) 供镜头.ts 用，要不含颠簸）。诊断 见 工具/一镜到底/诊断.ts。
import { bankAngle, maxBankDeg } from './飞行路径.ts';
import { defaultParams, deepMerge, type BumpMode, type 真实飞行参数, type 部分 } from './真实飞行/参数.ts';
import { drydenField, lowAltTurbulence, modeVariance } from './真实飞行/湍流.ts';
import { hermite, integStepSec, springTable } from './真实飞行/弹簧.ts';

export { defaultParams, type BumpMode, type ChannelParams, type 真实飞行参数 } from './真实飞行/参数.ts';
export { lowAltTurbulence } from './真实飞行/湍流.ts';
export { integStepSec, springTable } from './真实飞行/弹簧.ts';

// 扫帚的总横滚 = 内倾（已被 `内倾`() 软限幅在 18° 内）+ 颠簸横滚。直接相加在急弯会超（暮色 260 米半径下内倾已贴 18°）。
// 颠簸按剩下的余量缩 (1 − |内倾|/18)：只要 |颠簸| ≤ 18，总量就不超 18°；平飞时原样，处处光滑。
export const combineRoll = (bankDeg: number, bumpRoll: number) => {
  const clampedBank = Math.max(-maxBankDeg, Math.min(maxBankDeg, bankDeg));
  return clampedBank + bumpRoll * (1 - Math.abs(clampedBank) / maxBankDeg);
};

const smootherstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (6 * t - 15) + 10);
};

// ---------- 主体 ----------
export type Anchor = {
  帧: number; // 全局帧：从这一帧起扰动为 0
  止帧?: number; // 到这一帧（含）为止都是 0；不给就是单个点
  前?: number; // 之前渐变多少帧（默认 48）；0 = 不渐变（只在起帧上有意义）
  后?: number; // 之后渐变多少帧（默认 48）
};
export type RealFlightOptions = {
  种子: number;
  起帧: number; // 全局帧，含
  止帧: number; // 全局帧，含
  distAt: (t: number) => number; // 物理时间（秒）→ 沿航线的里程（米），单调不减
  frameToTime?: (frame: number) => number; // 全局帧 → 物理时间（秒），默认 F/fps
  fps?: number; // 默认 24：锚点的渐变帧数按它换成物理秒
  锚点?: Anchor[];
  vertFloor?: (dist: number) => number; // 里程 → 竖直偏移的下限（米，一般为负）
  inputGain?: (dist: number) => number; // 里程 → 0～1，乘到漂移和阵风上（急弯里压掉）
  参数?: 部分<真实飞行参数>;
};
export type DisturbFrame = {
  横: number; 竖: number; latVel: number; vertVel: number; latAccel: number; vertAccel: number;
  航向: number; 俯仰: number; 角速度: number; 内倾: number;
  颠簸: { 俯仰: number; 横滚: number; 朝向: number; 竖: number };
  镜头: { 航向: number; 俯仰: number; 相对航向: number; 相对俯仰: number };
  权重: number; 速度: number; s: number;
};

export const realFlight = (opts: RealFlightOptions) => {
  const params = deepMerge(defaultParams, opts.参数);
  const fps = opts.fps ?? 24;
  const F2T = opts.frameToTime ?? ((F: number) => F / fps);
  const step = integStepSec;
  const T0 = F2T(opts.起帧);
  const T1 = F2T(opts.止帧);
  const steps = Math.max(2, Math.ceil((T1 - T0) / step));
  const halfSteps = 2 * steps; // 半步网格

  // 半步网格上的里程、速度
  const Sg = new Float64Array(halfSteps + 1);
  for (let j = 0; j <= halfSteps; j++) Sg[j] = opts.distAt(T0 + (j * step) / 2);
  const Vg = new Float64Array(halfSteps + 1);
  for (let j = 0; j <= halfSteps; j++) {
    const prevIdx = Math.max(0, j - 1);
    const nextIdx = Math.min(halfSteps, j + 1);
    Vg[j] = Math.max(0, (Sg[nextIdx] - Sg[prevIdx]) / (((nextIdx - prevIdx) * step) / 2));
  }

  // 锚点窗口（物理时间）：输出窗口 w、输入窗口 wIn（提前 输入提前 倍开始渐弱）
  const anchorWins = (opts.锚点 ?? []).map((a) => ({
    Ta: F2T(a.帧),
    Tb: F2T(a.止帧 ?? a.帧),
    r1: (a.前 ?? 48) / fps,
    r2: (a.后 ?? 48) / fps,
  }));
  const windowAt = (time: number, k: number) => {
    let weight = 1;
    for (const anchor of anchorWins) {
      if (time < anchor.Ta) weight *= anchor.r1 > 0 ? smootherstep((anchor.Ta - time) / (anchor.r1 * k)) : 1;
      else if (time > anchor.Tb) weight *= anchor.r2 > 0 ? smootherstep((time - anchor.Tb) / (anchor.r2 * k)) : 1;
      else return 0;
    }
    return weight;
  };
  const inAnchor = (T: number) => anchorWins.some((a) => T >= a.Ta && T <= a.Tb);

  // 输入场：漂移按 s，阵风按 s + 风速·t（冻结湍流随平均风平移）
  const tb = lowAltTurbulence(params.阵风.离地, params.阵风.W20);
  const sMin = Sg[0];
  const sMax = Sg[halfSteps];
  const gMin = sMin + params.阵风.风速 * T0;
  const gMax = sMax + params.阵风.风速 * T1;
  const seed = opts.种子 * 7919;
  const latDrift = drydenField(seed + 1, (params.侧向.漂移 * Math.PI) / 180, params.侧向.漂移尺度, sMin, sMax, true, params.侧向.漂移高通);
  const vertDrift = drydenField(seed + 2, (params.竖直.漂移 * Math.PI) / 180, params.竖直.漂移尺度, sMin, sMax, true, params.竖直.漂移高通);
  const latGust = drydenField(seed + 3, tb.σv, tb.Lv, gMin, gMax);
  const vertGust = drydenField(seed + 4, tb.σw, tb.Lw, gMin, gMax);
  const rollGust = drydenField(seed + 5, tb.σw, tb.Lw, gMin, gMax); // 横滚：左右两边的竖直阵风之差，取一个独立的竖直谱场

  // 颠簸幅度标定：参考速度下均方根 = 给定度数
  const Vr = params.颠簸.参考速度;
  const calibrate = (m: BumpMode, L: number) => m.幅度 / Math.sqrt(modeVariance(L, Vr, m.频率, m.阻尼));
  const cP = calibrate(params.颠簸.俯仰, tb.Lw);
  const cR = calibrate(params.颠簸.横滚, tb.Lw);
  const cY = calibrate(params.颠簸.朝向, tb.Lv);
  const cH = calibrate(params.颠簸.升沉, tb.Lw);

  // 半步网格上的输入
  const gainFn = opts.inputGain;
  const inputs = Array.from({ length: 6 }, () => new Float64Array(halfSteps + 1)); // 横驱动、竖驱动（加速度）、俯仰、横滚、朝向（单位方差阵风 × 速度系数）、输入窗
  const ωy = params.侧向.频率, ζy = params.侧向.阻尼, ωz = params.竖直.频率, ζz = params.竖直.阻尼, k = params.阵风.导纳;
  for (let j = 0; j <= halfSteps; j++) {
    const time = T0 + (j * step) / 2;
    const dist = Sg[j];
    const speed = Vg[j];
    const gain = windowAt(time, params.输入提前) * (gainFn ? Math.min(1, Math.max(0, gainFn(dist))) : 1);
    const sg = dist + params.阵风.风速 * time;
    const gv = latGust(sg);
    const gw = vertGust(sg);
    inputs[0][j] = gain * (2 * ζy * ωy * speed * latDrift(dist) + k * speed * gv);
    inputs[1][j] = gain * (2 * ζz * ωz * speed * vertDrift(dist) + k * speed * gw);
    const speedFactor = gain * (Math.hypot(speed, params.阵风.风速) / Vr) ** params.颠簸.速度指数;
    inputs[2][j] = speedFactor * (gw / tb.σw);
    inputs[3][j] = speedFactor * (rollGust(sg) / tb.σw);
    inputs[4][j] = speedFactor * (gv / tb.σv);
    inputs[5][j] = gain;
  }

  // 状态：横 y、y'，竖 z、z'，颠簸俯仰、横滚、朝向、升沉（各两个）
  const ωP = 2 * Math.PI * params.颠簸.俯仰.频率, ζP = params.颠簸.俯仰.阻尼;
  const ωR = 2 * Math.PI * params.颠簸.横滚.频率, ζR = params.颠簸.横滚.阻尼;
  const ωY = 2 * Math.PI * params.颠簸.朝向.频率, ζY = params.颠簸.朝向.阻尼;
  const ωH = 2 * Math.PI * params.颠簸.升沉.频率, ζH = params.颠簸.升沉.阻尼;
  const deriv = (state: Float64Array, j: number, dState: Float64Array) => {
    dState[0] = state[1];
    dState[1] = -2 * ζy * ωy * state[1] - ωy * ωy * state[0] + inputs[0][j];
    dState[2] = state[3];
    dState[3] = -2 * ζz * ωz * state[3] - ωz * ωz * state[2] + inputs[1][j];
    dState[4] = state[5];
    dState[5] = -2 * ζP * ωP * state[5] - ωP * ωP * state[4] + ωP * ωP * cP * inputs[2][j];
    dState[6] = state[7];
    dState[7] = -2 * ζR * ωR * state[7] - ωR * ωR * state[6] + ωR * ωR * cR * inputs[3][j];
    dState[8] = state[9];
    dState[9] = -2 * ζY * ωY * state[9] - ωY * ωY * state[8] + ωY * ωY * cY * inputs[4][j];
    dState[10] = state[11];
    dState[11] = -2 * ζH * ωH * state[11] - ωH * ωH * state[10] + ωH * ωH * cH * inputs[2][j];
  };
  const NS = 12;
  const raw = Array.from({ length: NS }, () => new Float64Array(steps + 1));
  const rawA = [new Float64Array(steps + 1), new Float64Array(steps + 1)]; // y''、z''
  {
    const state = new Float64Array(NS);
    const D1 = new Float64Array(NS), D2 = new Float64Array(NS), D3 = new Float64Array(NS), D4 = new Float64Array(NS);
    const stage = new Float64Array(NS);
    const store = (i: number) => {
      for (let comp = 0; comp < NS; comp++) raw[comp][i] = state[comp];
      deriv(state, 2 * i, D1);
      rawA[0][i] = D1[1];
      rawA[1][i] = D1[3];
    };
    store(0);
    for (let i = 0; i < steps; i++) {
      const j = 2 * i;
      deriv(state, j, D1);
      for (let comp = 0; comp < NS; comp++) stage[comp] = state[comp] + (step / 2) * D1[comp];
      deriv(stage, j + 1, D2);
      for (let comp = 0; comp < NS; comp++) stage[comp] = state[comp] + (step / 2) * D2[comp];
      deriv(stage, j + 1, D3);
      for (let comp = 0; comp < NS; comp++) stage[comp] = state[comp] + step * D3[comp];
      deriv(stage, j + 2, D4);
      for (let comp = 0; comp < NS; comp++) state[comp] += (step / 6) * (D1[comp] + 2 * D2[comp] + 2 * D3[comp] + D4[comp]);
      // 锚点区间里驾驶员正好在线上：状态清零，出来以后从静止开始（输出窗口在这里 w、w'、w'' 都是 0，清零不会造成跳变）
      if (inAnchor(T0 + (i + 1) * step)) state.fill(0);
      store(i + 1);
    }
  }

  // 输出：窗口乘上去（竖直先过软下限），导数用乘积法则；窗口的导数用中心差分（它是解析的光滑函数）
  const tY = new Float64Array(steps + 1), tYv = new Float64Array(steps + 1), tYa = new Float64Array(steps + 1);
  const tZ = new Float64Array(steps + 1), tZv = new Float64Array(steps + 1), tZa = new Float64Array(steps + 1);
  const tW = new Float64Array(steps + 1), tS = new Float64Array(steps + 1), tV = new Float64Array(steps + 1);
  const tB = Array.from({ length: 8 }, () => new Float64Array(steps + 1)); // 俯仰、俯仰速、横滚、横滚速、朝向、朝向速、升沉、升沉速
  // 竖直下限先沿里程抹光滑：调用方给的 `featureTop` 之类是台阶函数，直接求导会在格边一帧跳几十度。
  // 每 5 米一值，先取前后 ±`下限平滑` 米最大值（只会更严）再高斯抹平（截在 ±3σ）。半宽默认 1000 米，太小则软下限顶上去时俯仰一帧跳 2°。
  const floorAt = (() => {
    const floorFn = opts.vertFloor;
    if (!floorFn) return undefined;
    const ds = 5;
    const halfWin = Math.max(1, Math.round(params.下限平滑 / ds));
    const s0 = sMin - 2 * halfWin * ds;
    const count = Math.ceil((sMax - s0) / ds) + 2 * halfWin + 2;
    const raw = Float64Array.from({ length: count }, (_, i) => floorFn(s0 + i * ds));
    const mx = raw.map((_, i) => {
      let maxVal = -Infinity;
      for (let j = Math.max(0, i - halfWin); j <= Math.min(count - 1, i + halfWin); j++) maxVal = Math.max(maxVal, raw[j]);
      return maxVal;
    });
    const σ = halfWin / 3;
    const ker = Array.from({ length: 2 * halfWin + 1 }, (_, k) => Math.exp(-((k - halfWin) ** 2) / (2 * σ * σ)));
    const ksum = ker.reduce((a, b) => a + b, 0);
    const sm = mx.map((_, i) => {
      let acc = 0;
      for (let k = -halfWin; k <= halfWin; k++) acc += mx[Math.min(count - 1, Math.max(0, i + k))] * ker[k + halfWin];
      return acc / ksum;
    });
    return (dist: number) => {
      const x = Math.min(Math.max((dist - s0) / ds, 0), count - 1.000001);
      const i = Math.floor(x);
      return sm[i] + (sm[i + 1] - sm[i]) * (x - i);
    };
  })();
  const soft = params.软度;
  const δ = 1e-3;
  for (let i = 0; i <= steps; i++) {
    const time = T0 + i * step;
    const weight = windowAt(time, 1);
    const w1 = (windowAt(time + δ, 1) - windowAt(time - δ, 1)) / (2 * δ);
    const w2 = (windowAt(time + δ, 1) - 2 * weight + windowAt(time - δ, 1)) / (δ * δ);
    const dist = Sg[2 * i];
    const speed = Vg[2 * i];
    tS[i] = dist;
    tV[i] = speed;
    tW[i] = weight;
    const y = raw[0][i], y1 = raw[1][i], y2 = rawA[0][i];
    tY[i] = weight * y;
    tYv[i] = w1 * y + weight * y1;
    tYa[i] = w2 * y + 2 * w1 * y1 + weight * y2;
    let z = raw[2][i], z1 = raw[3][i], z2 = rawA[1][i];
    if (floorAt) {
      const floor = floorAt(dist);
      const dLds = (floorAt(dist + 5) - floorAt(dist - 5)) / 10; // 表是 5 米一格的折线，差分跨一格才不会在格点上尖
      const d2Lds = (floorAt(dist + 5) - 2 * floor + floorAt(dist - 5)) / 25;
      const accel = (Vg[Math.min(halfSteps, 2 * i + 1)] - Vg[Math.max(0, 2 * i - 1)]) / (step * (Math.min(halfSteps, 2 * i + 1) - Math.max(0, 2 * i - 1)) / 2);
      const L1 = dLds * speed;
      const L2 = d2Lds * speed * speed + dLds * accel;
      const excess = (z - floor) / soft;
      const σ = 1 / (1 + Math.exp(-excess));
      const softZ = floor + (excess > 30 ? z - floor : soft * Math.log1p(Math.exp(excess)));
      const f1 = L1 + σ * (z1 - L1);
      const f2 = L2 + σ * (z2 - L2) + ((σ * (1 - σ)) / soft) * (z1 - L1) ** 2;
      z = softZ;
      z1 = f1;
      z2 = f2;
    }
    tZ[i] = weight * z;
    tZv[i] = w1 * z + weight * z1;
    tZa[i] = w2 * z + 2 * w1 * z1 + weight * z2;
    for (let modeIdx = 0; modeIdx < 4; modeIdx++) {
      tB[2 * modeIdx][i] = weight * raw[4 + 2 * modeIdx][i];
      tB[2 * modeIdx + 1][i] = w1 * raw[4 + 2 * modeIdx][i] + weight * raw[5 + 2 * modeIdx][i];
    }
  }

  // 航向、俯仰扰动（度）：横速、竖速除以 V；V 很小（悬停）时用 5 米/秒兜底，那里偏移本来也是 0
  const deg = 180 / Math.PI;
  const tPsi = new Float64Array(steps + 1), tPsiR = new Float64Array(steps + 1), tTh = new Float64Array(steps + 1), tThR = new Float64Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    const speed = Math.max(5, tV[i]);
    tPsi[i] = -Math.atan2(tYv[i], speed) * deg; // 往右偏（横速 > 0）= 航向往右 = 负
    tTh[i] = Math.atan2(tZv[i], speed) * deg;
  }
  for (let i = 0; i <= steps; i++) {
    const prevIdx = Math.max(0, i - 1), nextIdx = Math.min(steps, i + 1);
    tPsiR[i] = (tPsi[nextIdx] - tPsi[prevIdx]) / ((nextIdx - prevIdx) * step);
    tThR[i] = (tTh[nextIdx] - tTh[prevIdx]) / ((nextIdx - prevIdx) * step);
  }

  // 镜头：弹簧跟随扰动角，结果再乘窗口（锚点上和原镜头逐像素一样）
  const lerpTable = (arr: Float64Array) => (t: number) => {
    const gridPos = Math.min(Math.max((t - T0) / step, 0), steps);
    const i = Math.min(Math.floor(gridPos), steps - 1);
    return arr[i] + (arr[i + 1] - arr[i]) * (gridPos - i);
  };
  const camHeadingSpring = springTable(lerpTable(tPsi), T0, T0 + steps * step, params.镜头.频率, params.镜头.阻尼);
  const camPitchSpring = springTable(lerpTable(tTh), T0, T0 + steps * step, params.镜头.频率, params.镜头.阻尼);
  const tCP = new Float64Array(steps + 1), tCPv = new Float64Array(steps + 1), tCT = new Float64Array(steps + 1), tCTv = new Float64Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    const time = T0 + i * step;
    const weight = tW[i];
    const w1 = (windowAt(time + δ, 1) - windowAt(time - δ, 1)) / (2 * δ);
    const headingSample = camHeadingSpring(time), pitchSample = camPitchSpring(time);
    tCP[i] = weight * headingSample.value;
    tCPv[i] = w1 * headingSample.value + weight * headingSample.vel;
    tCT[i] = weight * pitchSample.value;
    tCTv[i] = w1 * pitchSample.value + weight * pitchSample.vel;
  }

  const sampleAt = (frame: number): DisturbFrame => {
    const time = F2T(frame);
    const gridPos = Math.min(Math.max((time - T0) / step, 0), steps);
    const i = Math.min(Math.floor(gridPos), steps - 1);
    const frac = gridPos - i;
    const hermiteAt = (p: Float64Array, d: Float64Array) => hermite(p[i], d[i] * step, p[i + 1], d[i + 1] * step, frac);
    const Li = (p: Float64Array) => p[i] + (p[i + 1] - p[i]) * frac;
    // 锚点区间精确返回 0：物理时刻不落在格点上时边缘那格插值会漏出 1e-4 残差，首帧要和上一段末帧逐像素一样
    if (inAnchor(time)) {
      return {
        横: 0, 竖: 0, latVel: 0, vertVel: 0, latAccel: 0, vertAccel: 0, 航向: 0, 俯仰: 0, 角速度: 0, 内倾: bankAngle(0),
        颠簸: { 俯仰: 0, 横滚: 0, 朝向: 0, 竖: 0 }, 镜头: { 航向: 0, 俯仰: 0, 相对航向: 0, 相对俯仰: 0 },
        权重: 0, 速度: Li(tV), s: Li(tS),
      };
    }
    const yawRate = Li(tPsiR);
    const heading = hermiteAt(tPsi, tPsiR), pitch = hermiteAt(tTh, tThR);
    const camHeading = hermiteAt(tCP, tCPv), camPitch = hermiteAt(tCT, tCTv);
    return {
      横: hermiteAt(tY, tYv), 竖: hermiteAt(tZ, tZv), latVel: hermiteAt(tYv, tYa), vertVel: hermiteAt(tZv, tZa), latAccel: Li(tYa), vertAccel: Li(tZa),
      航向: heading, 俯仰: pitch, 角速度: yawRate, 内倾: bankAngle(yawRate),
      颠簸: { 俯仰: hermiteAt(tB[0], tB[1]), 横滚: hermiteAt(tB[2], tB[3]), 朝向: hermiteAt(tB[4], tB[5]), 竖: hermiteAt(tB[6], tB[7]) },
      镜头: { 航向: camHeading, 俯仰: camPitch, 相对航向: camHeading - heading, 相对俯仰: camPitch - pitch },
      权重: Li(tW), 速度: Li(tV), s: Li(tS),
    };
  };

  // 按里程查偏移：里程表单调不减，二分找第一处 ≥ s 的步
  const offsetAtDist = (dist: number) => {
    if (dist <= tS[0]) return { 横: tY[0], 竖: tZ[0] };
    if (dist >= tS[steps]) return { 横: tY[steps], 竖: tZ[steps] };
    let lo = 0, hi = steps;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (tS[mid] < dist) lo = mid;
      else hi = mid;
    }
    const frac = (dist - tS[lo]) / Math.max(1e-9, tS[hi] - tS[lo]);
    return { 横: tY[lo] + (tY[hi] - tY[lo]) * frac, 竖: tZ[lo] + (tZ[hi] - tZ[lo]) * frac };
  };

  return {
    at: sampleAt,
    按里程: offsetAtDist,
    combineBank: (F: number, routeYawRate: number) => bankAngle(routeYawRate + sampleAt(F).角速度),
    // 同一组选项换上竖直下限重算（为什么分两遍见文件头）；横向通道和下限无关
    withVertFloor: (f: (dist: number) => number) => realFlight({ ...opts, vertFloor: f }),
    参数: params,
    湍流: tb,
    startSec: T0,
    stepCount: steps,
  };
};
export type RealFlightResult = ReturnType<typeof realFlight>;
