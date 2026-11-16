// 一镜到底各处的镜段：起飞接 6-1-3、近景绕圈、巨人侧视、远景刹停—停住—追、降落；按时间顺序排进 `camSpans`。
import { sample, type Key } from '@engine/anim/anim.ts';
import * as P613 from '../6-1-3/编排.ts';
import * as hydraChoreo from '../6-1-6/编排.ts';
import * as chainPierceChoreo from '../6-1-7/编排.ts';
import * as route from './路线.ts';
import {
  type Vec, add, sub, mul, dot, len, norm, slerp,
  type Framing, riderAt, broomFrame, camPosOf, posToFraming, project,
  type LegacyParams, legacyCruise, pullInDist, type LegacyKey, type Keys, convertKeys, cruiseFraming, clampToBore,
} from './镜头构图.ts';
import { clamp01, smootherstep01, rad } from '@engine/core/数学.ts';

// ---------- 镜段 ----------
// 一处 boss 一个镜段：起～止（画面秒）里按 `Keys`（相对 `锚` 的秒）排 P；位置机位（远景的刹停、停住、追）另给，权 = 1 时位置全按它。
// 关键帧头尾都是巡航，镜段外就是巡航；相邻两处叠在一起时后一处在开头 `fadeSec` 秒里从前一处渐过来（镜头.ts 的 `合成`）。
// 下面注释里的「帧」是原来的 1/24 秒一格，代码写成 n / 24 秒
type PosCam = (g: number) => { C: Vec; weight: number } | null;
type CamSpan = { name: route.BossName | '起飞' | '降落'; 锚: number; Keys: Keys[]; start: number; end: number; coreStart: number; coreEnd: number; 位?: PosCam; keepInFrame?: boolean; focus?: () => Vec };
export const fadeSec = 0.5;
const secAt = (T: number) => route.secAt(T);
const pierceSecs = route.pierceSecs;
const pierceTimes = route.pierceTimes;
export const camSpans: CamSpan[] = [];
const addSpan = (span: Omit<CamSpan, 'start' | 'end' | 'coreStart' | 'coreEnd'> & Partial<Pick<CamSpan, 'coreStart' | 'coreEnd'>>) => {
  const start = span.锚 + span.Keys[0][0];
  const end = span.锚 + span.Keys[span.Keys.length - 1][0];
  camSpans.push({ ...span, start: start, end: end, coreStart: span.coreStart ?? start, coreEnd: span.coreEnd ?? end });
};

// 首帧和 6-1-3 末帧是同一个画面：6-1-3 末帧的镜头偏移、构图换算成 P，开头 1 秒过渡到巡航（0.5 秒的话骑手一格放大 10%）
{
  const B613 = add(P613.LAST.broom().pos, [0, 0, 0.2]);
  const C613 = P613.LAST.camera();
  const C0 = add(riderAt(0), sub(C613.pos, B613));
  const fw = norm(sub(C613.tgt, C613.pos));
  const [x, y] = project(C0, fw, C613.lens, riderAt(0));
  const P0: Framing = { ...posToFraming(C0, 0), x, y, 焦: Math.log(C613.lens), 偏: 0 };
  addSpan({ name: '起飞', 锚: 0, Keys: [[0, P0], [1, cruiseFraming]] });
}

// ---------- 近景（巫妖、冰雪女王，放慢）：贴近、钻墙洞、绕扫帚转一整圈、钻出去 ----------
// 关键帧照 `nearOrbit`（用户 10-02 要转完整一圈、侧面离远一点看到大部分房间），
// 圈：[相对贯穿的秒, 角, 径, 高, 前瞻, 低]，第一个点是正后方、最后一个点转满 360° 回到正后方
type OrbitPt = [number, number, number, number, number, number];
const nearKeys = (impactT: number, pierceT: number, resumeT: number, orbit: OrbitPt[]): LegacyKey[] => {
  const [orbitStart, , radius0] = orbit[0];
  const [orbitEnd, , radius1] = orbit[orbit.length - 1];
  return [
    [impactT - pierceT - 70 / 24, { ...legacyCruise }],
    [impactT - pierceT - 40 / 24, { back: 10, height: 3.2, lookAhead: 45, low: 1.5, focalLength: 20 }],
    [impactT - pierceT - 0.5, { back: 4.6, height: 1.4, lookAhead: 14, low: 0.3, focalLength: 20 }],
    [impactT - pierceT, { back: 3.6, height: 1.05, side: 0, lookAhead: 9, low: 0, focalLength: 19 }],
    [orbitStart - 8 / 24, { back: radius0, height: 1.25, side: 0, lookAhead: 7, orbit: 0, angle: 0, radius: radius0 }],
    ...orbit.map(([t, angle, radius, height, lookAhead, drop], i): LegacyKey => [t, { orbit: 1, angle: angle, radius, height: height, lookAhead: lookAhead, low: drop, focalLength: i === 0 || i === orbit.length - 1 ? 19 : 17 }]),
    [orbitEnd + 1 / 24, { orbit: 0, back: radius1, side: 0, angle: 0 }],
    [resumeT - pierceT + 14 / 24, { back: 3.4, height: 1.0, side: 0, lookAhead: 10, low: 0.2, focalLength: 19 }],
    [resumeT - pierceT + 34 / 24, { back: 11, height: 3.5, side: 0, lookAhead: 40, low: 5, focalLength: 20 }],
    [resumeT - pierceT + 70 / 24, { ...legacyCruise }],
  ];
};
const lichOrbit: OrbitPt[] = [
  [-52 / 24, 0, 2.2, 1.3, 6.5, 0],
  [-44 / 24, 25, 1.9, 1.5, 5, 0.1],
  [-36 / 24, 70, 2.4, 1.8, 3.5, 0.3],
  [-26 / 24, 100, 3.3, 2.0, 3, 0.4],
  [-14 / 24, 125, 3.4, 2.0, 2.5, 0.4],
  [-2 / 24, 150, 3.4, 1.9, 1.6, 0.4],
  [8 / 24, 205, 3.5, 1.9, 0.8, 0.3],
  [16 / 24, 270, 3.4, 1.7, 1.2, 0.3],
  [28 / 24, 360, 3.4, 1.0, 8, 0],
];
const queenOrbit: OrbitPt[] = [
  [-32 / 24, 15, 2.4, 1.3, 6, 0],
  [-24 / 24, 60, 1.3, 1.1, 2.2, 0.1],
  [-16 / 24, 95, 3.2, 1.9, 3.2, 0.3],
  [-1 / 24, 125, 3.8, 2.0, 1.8, 0.4],
  [8 / 24, 195, 4.2, 2.4, 0.8, 0.5],
  [16 / 24, 270, 3.8, 1.8, 1.2, 0.3],
  [28 / 24, 360, 3.4, 1.0, 8, 0],
];
const addNearSpan = (bossName: '巫妖' | '冰雪女王', orbit: OrbitPt[], slowIdx: number) => {
  const impactT = secAt(pierceTimes[bossName] + route.impactTime[bossName]!);
  const resumeT = secAt(route.slowMoTable[slowIdx].end);
  const legacyKeys = nearKeys(impactT, pierceSecs[bossName], resumeT, orbit);
  addSpan({ name: bossName, 锚: pierceSecs[bossName], Keys: convertKeys(legacyKeys), coreStart: pierceSecs[bossName] + legacyKeys[0][0] + 1.25, coreEnd: resumeT + 34 / 24 });
};

// ---------- 巨人（近景，放慢，屋外侧视） ----------
// 照 `nearCutaway`（用户 10-02 要穿刺画面侧视、离远一点看到整个房间：24 米、24mm）：
// 撞墙那一刻已经在穿刺线右手边隔着剖面的东墙侧着看，放慢的几秒里跟着扫帚挪到两个巨人中间，恢复后和扫帚并排飞出去再绕回后方。
// 不拉近；视线往小屋偏（`偏`）的时候骑手不出画（保画内）
const addGiantSpan = () => {
  const impactT = secAt(pierceTimes.巨人 + route.impactTime.巨人!);
  const resumeT = secAt(route.slowMoTable[2].end);
  const anchor = pierceSecs.巨人;
  const legacyKeys: LegacyKey[] = [
    [impactT - anchor - 80 / 24, { ...legacyCruise }],
    [impactT - anchor - 50 / 24, { back: 11, height: 4, side: 2, lookAhead: 40, low: 4, focalLength: 20 }],
    [impactT - anchor - 20 / 24, { back: 0, height: 5, side: 17, lookAhead: 8, low: 1, focalLength: 22, lookBoss: 0.5 }],
    [impactT - anchor, { back: -6.7, height: 5, side: 24, lookAhead: 3, low: 0, focalLength: 24, lookBoss: 0.6 }],
    [impactT - anchor + 10 / 24, { back: -6.1, side: 24 }],
    [0, { back: -2.9, side: 24, lookBoss: 0.55 }],
    [resumeT - anchor - 8 / 24, { back: 3.3, side: 24, lookBoss: 0.4 }],
    [resumeT - anchor, { back: 3.9, side: 24, lookBoss: 0.25 }],
    [resumeT - anchor + 0.25, { back: 3.9, height: 5, side: 24, lookAhead: 6, lookBoss: 0 }],
    [resumeT - anchor + 20 / 24, { back: 7, height: 4.5, side: 18, lookAhead: 15, low: 2, focalLength: 20 }],
    [resumeT - anchor + 1.5, { back: 16, height: 6, side: 4, lookAhead: 50, low: 15, focalLength: 19 }],
    [resumeT - anchor + 56 / 24, { ...legacyCruise }],
  ];
  addSpan({ name: '巨人', 锚: anchor, Keys: convertKeys(legacyKeys, (i) => i === 0 || i === legacyKeys.length - 1), keepInFrame: true, focus: () => route.pierceTable.巨人.tip(0), coreStart: impactT - 50 / 24, coreEnd: resumeT + 1.5 });
};

// ---------- 远景（九头蛇、暮初恶魂、雪怪首领，原速）：跟着扎下去 → 刹停 → 停住看 boss 炸开 → 追上去 ----------
// 刹停：镜头照跟拍的位置走，只是它自己的时钟 τ 在 `brakeSec` 秒里匀着慢到停（τ′ 从 1 按五次缓动降到 0）——速度连续地降到 0，不冲过头、不往回拉（另排一条曲线会顿两顿）。
// 停在哪：τ 停在跟拍镜头离 boss `停距` 米（沿路线）的那一刻。
// 停住 `远景停留` 秒（路线.ts，用户 10-08 要穿透后迅速跟进）以后追：方向从停住时的方向按五次缓动转到跟拍的方向，
// ln 距离按五次曲线从停住时（连同变化率）收到跟拍距离，最快每格收 0.2（`chaseMaxShrink`，骑手每格放大 22%），
// 末端三次方地慢下来（用户 10-08 嫌追上时像撞墙），一路只收不放。
// 视线：停住时大半对着 boss（偏 0.8），追的那一截偏到 0、构图换回巡航
const brakeSec = 16 / 24;
const chaseMaxShrink = 0.2 * 24; // ln 距离每秒最多收这么多（每格 0.2）
type FarParams = {
  name: '九头蛇' | '暮初恶魂' | '雪怪首领';
  stopDist: number;
  dive: number | null; // 压机头那一刻（相对贯穿，秒），平着撞进去的给 null
  preDive: Partial<LegacyParams>; // 压机头前 0.5 秒贴过去的机位
  preBrake: Partial<Framing>; // 刹停前跟拍机位的位置（扎下去时镜头往上抬一点、退一点，停住时在高处）
  holdLook: number;
  lookTurnSec: number; // 放开以后几秒里视线从 boss 转到扫帚（雪怪首领要在镜头冲过雪怪那一点以前转完）
  lift?: number; // 追的那一截往上拱多少（度）：九头蛇钻穿土丘以后骑手在土丘背后，从停住的地方往骑手追，连线穿过土丘
  inTunnel?: boolean; // 雪怪首领：追的那一截沿路线在洞道里走（见 雪怪洞道）
};
// 五次曲线：从 (x0, v0, a0) 在 dur 秒里到 (0, 0, 0)
const quintic = (x0: number, v0: number, a0: number, dur: number) => {
  const c3 = (-20 * x0 - 12 * v0 * dur - 3 * a0 * dur * dur) / (2 * dur ** 3);
  const c4 = (30 * x0 + 16 * v0 * dur + 3 * a0 * dur * dur) / (2 * dur ** 4);
  const c5 = (-12 * x0 - 6 * v0 * dur - a0 * dur * dur) / (2 * dur ** 5);
  const x = (t: number) => {
    const clampedT = Math.min(dur, Math.max(0, t));
    return x0 + v0 * clampedT + (a0 / 2) * clampedT * clampedT + c3 * clampedT ** 3 + c4 * clampedT ** 4 + c5 * clampedT ** 5;
  };
  return x;
};
// 追多久：收得最快的那一刻不超过 chaseMaxShrink，也不收过头（离骑手比跟拍距离近）；取满足的最短的。
// 时长在 1/4～5 秒里按 1/48 秒挑，每 1/96 秒查一次
const chaseDuration = (x0: number, v0: number, a0: number) => {
  for (let durSteps = 12; durSteps <= 240; durSteps++) {
    const dur = durSteps / 48;
    const x = quintic(x0, v0, a0, dur);
    let ok = true;
    for (let i = 0; i <= 2 * durSteps && ok; i++) {
      const t = i / 96;
      const rate = (x(t + 1 / 192) - x(t - 1 / 192)) * 96;
      if (rate < -chaseMaxShrink || x(t) < -1e-3) ok = false;
    }
    if (ok) return dur;
  }
  throw new Error('一镜到底镜头：追不上（5 秒以内收不到跟拍距离）');
};
export const chaseSpans: { name: string; start: number; end: number }[] = [];
// 雪怪首领洞道：贯穿以后扫帚钻进东口外的隧道（6-1-7/编排.ts 的 `雪怪隧道`），镜头停在大厅西半边、追的时候只能沿路线走（隧道四米多宽）。
// 镜头路程 `camDist` 按 ln 排（同上面的五次曲线，收到 `pullInDist`）；高度在大厅里抬到路线以上 `hallHeight`（从炸开的白烟上面过去），进隧道前降回 `tunnelHeight`。出了隧道 `fadeSec` 秒换回跟拍
const hallHeight = 4;
const tunnelHeight = 1.2;
const addFarSpan = (opts: FarParams) => {
  const anchor = pierceSecs[opts.name];
  const sp = route.markDist(`${opts.name}.贯穿`);
  const hold = route.farHold[opts.name]!;
  const diveT = opts.dive ?? -22 / 24;
  const follow: Partial<LegacyParams> = { back: 16, height: 6, lookAhead: 0, low: 0, focalLength: 22, lookBoss: 0.5 };
  const legacyKeys: LegacyKey[] = [
    [-80 / 24, { ...legacyCruise }],
    [diveT - 0.5, { back: 14, height: 4.5, lookAhead: 60, low: 6, focalLength: 20, ...opts.preDive }],
    ...(opts.dive === null ? [] : [[diveT, { lookAhead: 40, low: 12 }] as LegacyKey]),
    [diveT + 8 / 24, follow],
  ];
  const keys = convertKeys(legacyKeys);
  // 刹停前：位置往 `刹前` 挪；视线多往 boss 偏（0.5 → 刹停时 0.7 → 停住 0.9）：骑手几帧里从 6.6 米飞到四五十米外往下扎，
  // 视线照着骑手摆会跟着甩（一帧四五度）；停着的镜头看停着的 boss，视线稳，骑手往 boss 扎过去，两样都在画面里
  const preBrake = { ...keys[keys.length - 1][1], 偏: 0.7, ...opts.preBrake };
  // 跟拍镜头离 boss stopDist 米的那一刻 stopTau（沿路线）；刹停从 stopTau − brakeSec/2 开始
  const followCam = (P: Framing, τ: number) => clampToBore(camPosOf(P, τ), τ, P.方);
  const distToBoss = (τ: number) => sp - (route.broom(τ).s + dot(sub(followCam(preBrake, τ), riderAt(τ)), broomFrame(τ).flatFwd));
  let lo = anchor - 2.5;
  let hi = anchor;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (distToBoss(mid) > opts.stopDist) lo = mid;
    else hi = mid;
  }
  const stopTau = (lo + hi) / 2;
  const brakeStart = stopTau - brakeSec / 2;
  if (brakeStart - anchor < diveT + 8 / 24 + 2 / 24) throw new Error(`一镜到底镜头 ${opts.name}：停距 ${opts.stopDist} 太远，刹停要在扎下去以前开始`);
  keys.push([brakeStart - anchor, preBrake]);
  // 停住、追的那几帧只排视线和焦距（位置在 位 里）
  const holdFraming: Framing = { ...preBrake, x: 0, y: 0, 焦: Math.log(22), 偏: 0.9 };
  keys.push([0, holdFraming], [hold, { ...holdFraming, 偏: opts.holdLook }]);
  const τ = (g: number) => {
    if (g <= brakeStart) return g;
    const progress = Math.min(1, (g - brakeStart) / brakeSec);
    // ∫(1 − s5) du：τ′ 从 1 按五次缓动降到 0
    const integral = progress - (progress ** 4 * (progress * (progress * 1 - 3) + 2.5)) ;
    return brakeStart + brakeSec * integral;
  };
  // 检查：∫0^1 (1 − s5) = 1/2，τ 停在 brakeStart + brakeSec/2 = stopTau
  const stopPos = followCam(preBrake, stopTau);
  const releaseT = anchor + hold;
  let posCam: PosCam;
  let chaseEnd: number;
  if (!opts.inTunnel) {
    // 追：方向从停住时（从骑手看镜头）转到跟拍的方向，ln 距离按五次曲线收
    const lnD = (g: number) => Math.log(len(sub(stopPos, riderAt(g))));
    const x1 = cruiseFraming.dist;
    const step = 0.5 / 24;
    const x0 = lnD(releaseT) - x1;
    const v0 = (lnD(releaseT + step) - lnD(releaseT - step)) / (2 * step);
    const a0 = (lnD(releaseT + step) - 2 * lnD(releaseT) + lnD(releaseT - step)) / (step * step);
    const dur = chaseDuration(x0, v0, a0);
    const x = quintic(x0, v0, a0, dur);
    chaseEnd = releaseT + dur;
    posCam = (g) => {
      if (g < brakeStart || g > chaseEnd) return null;
      if (g <= releaseT) return { C: g < brakeStart + brakeSec ? followCam(preBrake, τ(g)) : stopPos, weight: 1 };
      const rider = riderAt(g);
      const dirStop = norm(sub(stopPos, rider));
      const dirFollow = norm(sub(camPosOf(cruiseFraming, g), rider));
      let dir = slerp(dirStop, dirFollow, smootherstep01((g - releaseT) / dur));
      if (opts.lift) {
        // 往上拱：方向往竖直方向转 抬·64u³(1 − u)³（两头的速度、加速度都是 0，接得上停住和跟拍）
        const progress = clamp01((g - releaseT) / dur);
        const φ = rad(opts.lift) * 64 * progress ** 3 * (1 - progress) ** 3;
        const up = norm(sub([0, 0, 1], mul(dir, dir[2])));
        dir = norm(add(mul(dir, Math.cos(φ)), mul(up, Math.sin(φ))));
      }
      return { C: add(rider, mul(dir, Math.exp(x1 + x(g - releaseT)))), weight: 1 };
    };
  } else {
    // 雪怪首领：沿路线追（路程差按 ln 收）。停点投到路线上的路程、相对路线的高度和侧移
    const stopDist = route.broom(stopTau).s + dot(sub(stopPos, riderAt(stopTau)), broomFrame(stopTau).flatFwd);
    const stopRoutePt = route.positionAt(stopDist);
    const rightAt = (dist: number) => {
      const t = route.tangentAt(dist);
      const horizLen = Math.hypot(t[0], t[1]) || 1;
      return [t[1] / horizLen, -t[0] / horizLen, 0];
    };
    const side0 = dot(sub(stopPos, stopRoutePt), rightAt(stopDist));
    const height0 = stopPos[2] - stopRoutePt[2];
    // 洞道上的几个路程（相对贯穿点）：大厅里抬高、进东口隧道前降回、出隧道
    const yetiDist = (a: number) => sp + chainPierceChoreo.yetiTimeAt(a) * chainPierceChoreo.speed;
    const heightKeys: Key[] = [
      [stopDist, height0],
      [yetiDist(-5), hallHeight],
      [yetiDist(18), hallHeight],
      [yetiDist(chainPierceChoreo.yetiTunnels.exitCave - 3), tunnelHeight],
    ];
    const sideKeys: Key[] = [
      [stopDist, side0],
      [yetiDist(-5), 0],
    ];
    const tunnelTrack = (dist: number) => {
      const routePt = route.positionAt(dist);
      return add(add(routePt, mul(rightAt(dist), sample(sideKeys, dist))), [0, 0, sample(heightKeys, dist)]);
    };
    const lnGap = (g: number) => Math.log(Math.max(1e-3, route.broom(g).s - stopDist));
    const x1 = Math.log(pullInDist);
    const step = 0.5 / 24;
    const x0 = lnGap(releaseT) - x1;
    const v0 = (lnGap(releaseT + step) - lnGap(releaseT - step)) / (2 * step);
    const a0 = (lnGap(releaseT + step) - 2 * lnGap(releaseT) + lnGap(releaseT - step)) / (step * step);
    const dur = chaseDuration(x0, v0, a0);
    const x = quintic(x0, v0, a0, dur);
    const camDist = (g: number) => (g <= releaseT ? stopDist : route.broom(g).s - Math.exp(x1 + x(g - releaseT)));
    // 出了隧道（镜头过隧道口 5 米）、又追上了，fadeSec 秒换回跟拍；每 1/96 秒查一次
    const exitDist = yetiDist(chainPierceChoreo.yetiTunnels.exitGround) + 5;
    let exitSteps = 0;
    while (camDist(releaseT + exitSteps / 96) < exitDist || exitSteps / 96 < dur) exitSteps++;
    const exitT = releaseT + exitSteps / 96;
    chaseEnd = exitT + fadeSec;
    posCam = (g) => {
      if (g < brakeStart || g > chaseEnd) return null;
      if (g <= releaseT) return { C: g < brakeStart + brakeSec ? followCam(preBrake, τ(g)) : stopPos, weight: 1 };
      return { C: tunnelTrack(camDist(g)), weight: 1 - smootherstep01((g - exitT) / fadeSec) };
    };
  }
  chaseSpans.push({ name: opts.name, start: releaseT, end: chaseEnd });
  // 视线从 boss 转到扫帚：`lookTurnSec` 秒，但要在镜头追过去、boss 和骑手分开到 45° 以前转完（不然 boss 跑到镜头侧面、身后时视线还偏着它）；每 1/48 秒查一次
  const boss = route.pierceTable[opts.name].tip(0);
  let lookDone = releaseT + opts.lookTurnSec;
  for (let i = 0; i / 48 < opts.lookTurnSec; i++) {
    const g = releaseT + i / 48;
    const camPos = posCam(g)!.C;
    if (dot(norm(sub(boss, camPos)), norm(sub(riderAt(g), camPos))) < Math.cos(rad(45))) {
      lookDone = Math.max(releaseT + 2 / 24, g - 1 / 24);
      break;
    }
  }
  keys.push([Math.min(lookDone, chaseEnd - 0.25) - anchor, { ...holdFraming, 偏: 0 }]);
  // 追完以后 20/24 秒把构图（视线、焦距）换回巡航（焦距一格变 2.4%）
  keys.push([chaseEnd - anchor - 4 / 24, { ...cruiseFraming, x: 0, y: 0, 焦: Math.log(22), 偏: 0 }], [chaseEnd - anchor + 20 / 24, cruiseFraming]);
  addSpan({ name: opts.name, 锚: anchor, Keys: keys, 位: posCam, focus: () => route.pierceTable[opts.name].tip(0), coreStart: anchor + diveT - 0.5, coreEnd: chaseEnd });
};

// 九头蛇：从巡航高度平着接进来、压下机头扎下去，扎的时候镜头往上抬、退一点（`刹前`），停在九头蛇前 48 米的高处；
// 暮初恶魂：平着横穿塔顶，停在它前 46 米；雪怪首领：跟着从西口隧道钻进大厅（洞道里镜头夹在孔道里），停在大厅西半边离雪怪 25 米处
// （大厅只有 ±35 米，西口隧道出口在 a −36），看着扫帚贯穿、钻进东口隧道，再沿路线追进去
const farList: FarParams[] = [
  {
    name: '九头蛇',
    stopDist: 48,
    dive: secAt(pierceTimes.九头蛇 + hydraChoreo.T_DIVE) - pierceSecs.九头蛇,
    preDive: {},
    preBrake: { dist: Math.log(10), 仰: 35 },
    holdLook: 0.5,
    lookTurnSec: 20 / 24,
    // 不拱的话第 363 帧镜头穿过土丘（石头和洞里的萤石，工具/一镜到底/离块.ts 量的）
    lift: 15,
  },
  { name: '暮初恶魂', stopDist: 46, dive: null, preDive: {}, preBrake: { dist: Math.log(8), 仰: 30 }, holdLook: 0.6, lookTurnSec: 20 / 24 },
  {
    name: '雪怪首领',
    stopDist: 25,
    dive: secAt(pierceTimes.雪怪首领 + chainPierceChoreo.YETI_T_DIVE) - pierceSecs.雪怪首领,
    preDive: { back: 12, height: 1.6 },
    preBrake: {},
    holdLook: 1,
    lookTurnSec: 4 / 24,
    inTunnel: true,
  },
];

// ---------- 降落：最后 4 秒慢慢贴近，停稳以后绕到右前方 ----------
const addLandingSpan = () => {
  const legacyKeys: LegacyKey[] = [
    [-130 / 24, { ...legacyCruise }],
    [-70 / 24, { back: 14, height: 6, side: 1.5, lookAhead: 40, low: 10, focalLength: 20 }],
    [-20 / 24, { back: 9, height: 3.5, side: 3, lookAhead: 0, low: 0, focalLength: 22 }],
    [10 / 24, { back: 4, height: 3, side: 6.5, lookAhead: 0, low: -0.3, focalLength: 24 }],
    [40 / 24, { back: -3, height: 2.6, side: 7.5, lookAhead: 0, low: -0.4, focalLength: 26 }],
  ];
  const Keys = convertKeys(legacyKeys);
  addSpan({ name: '降落', 锚: route.G_LAND, Keys: [...Keys, [route.totalLength - route.G_LAND, Keys[Keys.length - 1][1]]], coreStart: route.G_LAND - 70 / 24, coreEnd: route.totalLength });
};

// 按时间顺序排：先后决定谁盖谁（镜头.ts 的合成）
addNearSpan('巫妖', lichOrbit, 0);
addFarSpan(farList[0]);
addFarSpan(farList[1]);
addFarSpan(farList[2]);
addNearSpan('冰雪女王', queenOrbit, 1);
addGiantSpan();
addLandingSpan();
