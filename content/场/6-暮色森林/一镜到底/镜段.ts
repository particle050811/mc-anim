// 一镜到底各处的镜段：起飞接 6-1-3、近景绕圈、巨人侧视、远景刹停—停住—追、降落；按时间顺序排进 `camSpans`。
import { sample, type Key } from '../../../../engine/anim/anim.ts';
import * as P613 from '../6-1-3/编排.ts';
import * as hydraChoreo from '../6-1-6/编排.ts';
import * as chainPierceChoreo from '../6-1-7/编排.ts';
import * as route from './路线.ts';
import {
  type Vec, add, sub, mul, dot, len, norm, clamp01, s5, rad, slerp,
  type Framing, riderAt, broomFrame, camPosOf, posToFraming, project,
  type LegacyParams, legacyCruise, pullInDist, type LegacyKey, type Keys, convertKeys, cruiseFraming, clampToBore,
} from './镜头构图.ts';

// ---------- 镜段 ----------
// 一处 boss 一个镜段：起～止（全局帧）里按 `关键`（相对 `锚` 的帧）排 P；位置机位（远景的刹停、停住、追）另给，权 = 1 时位置全按它。
// 关键帧头尾都是巡航，镜段外就是巡航；相邻两处叠在一起时后一处在开头 `渐` 帧里从前一处渐过来（镜头.ts 的 `合成`）
type PosCam = (frame: number) => { C: Vec; weight: number } | null;
type CamSpan = { 名: route.Boss名 | '起飞' | '降落'; 锚: number; Keys: Keys[]; 起: number; 止: number; 核起: number; 核止: number; 位?: PosCam; keepInFrame?: boolean; focus?: () => Vec };
export const fadeFrames = 12;
const frameAt = (T: number) => route.帧(T);
const pierceFrames = route.贯穿帧;
const pierceTimes = route.贯穿时刻;
export const camSpans: CamSpan[] = [];
const addSpan = (span: Omit<CamSpan, '起' | '止' | '核起' | '核止'> & Partial<Pick<CamSpan, '核起' | '核止'>>) => {
  const start = span.锚 + span.Keys[0][0];
  const end = span.锚 + span.Keys[span.Keys.length - 1][0];
  camSpans.push({ ...span, 起: start, 止: end, 核起: span.核起 ?? start, 核止: span.核止 ?? end });
};

// 首帧和 6-1-3 末帧是同一个画面：6-1-3 末帧的镜头偏移、构图换算成 P，开头 24 帧过渡到巡航（12 帧的话骑手一帧放大 10%）
{
  const B613 = add(P613.LAST.broom().pos, [0, 0, 0.2]);
  const C613 = P613.LAST.camera();
  const C0 = add(riderAt(0), sub(C613.pos, B613));
  const fw = norm(sub(C613.tgt, C613.pos));
  const [x, y] = project(C0, fw, C613.lens, riderAt(0));
  const P0: Framing = { ...posToFraming(C0, 0), x, y, 焦: Math.log(C613.lens), 偏: 0 };
  addSpan({ 名: '起飞', 锚: 0, Keys: [[0, P0], [24, cruiseFraming]] });
}

// ---------- 近景（巫妖、冰雪女王，放慢）：贴近、钻墙洞、绕扫帚转一整圈、钻出去 ----------
// 关键帧照 `nearOrbit`（用户 10-02 要转完整一圈、侧面离远一点看到大部分房间），
// 圈：[相对贯穿的帧, 角, 径, 高, 前瞻, 低]，第一个点是正后方、最后一个点转满 360° 回到正后方
type OrbitPt = [number, number, number, number, number, number];
const nearKeys = (impactFrame: number, pierceFrame: number, resumeFrame: number, orbit: OrbitPt[]): LegacyKey[] => {
  const [orbitStart, , radius0] = orbit[0];
  const [orbitEnd, , radius1] = orbit[orbit.length - 1];
  return [
    [impactFrame - pierceFrame - 70, { ...legacyCruise }],
    [impactFrame - pierceFrame - 40, { back: 10, height: 3.2, lookAhead: 45, low: 1.5, focalLength: 20 }],
    [impactFrame - pierceFrame - 12, { back: 4.6, height: 1.4, lookAhead: 14, low: 0.3, focalLength: 20 }],
    [impactFrame - pierceFrame, { back: 3.6, height: 1.05, side: 0, lookAhead: 9, low: 0, focalLength: 19 }],
    [orbitStart - 8, { back: radius0, height: 1.25, side: 0, lookAhead: 7, orbit: 0, angle: 0, radius: radius0 }],
    ...orbit.map(([frame, angle, radius, height, lookAhead, drop], i): LegacyKey => [frame, { orbit: 1, angle: angle, radius, height: height, lookAhead: lookAhead, low: drop, focalLength: i === 0 || i === orbit.length - 1 ? 19 : 17 }]),
    [orbitEnd + 1, { orbit: 0, back: radius1, side: 0, angle: 0 }],
    [resumeFrame - pierceFrame + 14, { back: 3.4, height: 1.0, side: 0, lookAhead: 10, low: 0.2, focalLength: 19 }],
    [resumeFrame - pierceFrame + 34, { back: 11, height: 3.5, side: 0, lookAhead: 40, low: 5, focalLength: 20 }],
    [resumeFrame - pierceFrame + 70, { ...legacyCruise }],
  ];
};
const lichOrbit: OrbitPt[] = [
  [-52, 0, 2.2, 1.3, 6.5, 0],
  [-44, 25, 1.9, 1.5, 5, 0.1],
  [-36, 70, 2.4, 1.8, 3.5, 0.3],
  [-26, 100, 3.3, 2.0, 3, 0.4],
  [-14, 125, 3.4, 2.0, 2.5, 0.4],
  [-2, 150, 3.4, 1.9, 1.6, 0.4],
  [8, 205, 3.5, 1.9, 0.8, 0.3],
  [16, 270, 3.4, 1.7, 1.2, 0.3],
  [28, 360, 3.4, 1.0, 8, 0],
];
const queenOrbit: OrbitPt[] = [
  [-32, 15, 2.4, 1.3, 6, 0],
  [-24, 60, 1.3, 1.1, 2.2, 0.1],
  [-16, 95, 3.2, 1.9, 3.2, 0.3],
  [-1, 125, 3.8, 2.0, 1.8, 0.4],
  [8, 195, 4.2, 2.4, 0.8, 0.5],
  [16, 270, 3.8, 1.8, 1.2, 0.3],
  [28, 360, 3.4, 1.0, 8, 0],
];
const addNearSpan = (bossName: '巫妖' | '冰雪女王', orbit: OrbitPt[], slowIdx: number) => {
  const impactFrame = frameAt(pierceTimes[bossName] + route.撞时刻[bossName]!);
  const resumeFrame = frameAt(route.放慢表[slowIdx].止);
  const legacyKeys = nearKeys(impactFrame, pierceFrames[bossName], resumeFrame, orbit);
  addSpan({ 名: bossName, 锚: pierceFrames[bossName], Keys: convertKeys(legacyKeys), 核起: pierceFrames[bossName] + legacyKeys[0][0] + 30, 核止: resumeFrame + 34 });
};

// ---------- 巨人（近景，放慢，屋外侧视） ----------
// 照 `nearCutaway`（用户 10-02 要穿刺画面侧视、离远一点看到整个房间：24 米、24mm）：
// 撞墙那一刻已经在穿刺线右手边隔着剖面的东墙侧着看，放慢的几秒里跟着扫帚挪到两个巨人中间，恢复后和扫帚并排飞出去再绕回后方。
// 不拉近；视线往小屋偏（`偏`）的时候骑手不出画（保画内）
const addGiantSpan = () => {
  const impactFrame = frameAt(pierceTimes.巨人 + route.撞时刻.巨人!);
  const resumeFrame = frameAt(route.放慢表[2].止);
  const anchor = pierceFrames.巨人;
  const legacyKeys: LegacyKey[] = [
    [impactFrame - anchor - 80, { ...legacyCruise }],
    [impactFrame - anchor - 50, { back: 11, height: 4, side: 2, lookAhead: 40, low: 4, focalLength: 20 }],
    [impactFrame - anchor - 20, { back: 0, height: 5, side: 17, lookAhead: 8, low: 1, focalLength: 22, lookBoss: 0.5 }],
    [impactFrame - anchor, { back: -6.7, height: 5, side: 24, lookAhead: 3, low: 0, focalLength: 24, lookBoss: 0.6 }],
    [impactFrame - anchor + 10, { back: -6.1, side: 24 }],
    [0, { back: -2.9, side: 24, lookBoss: 0.55 }],
    [resumeFrame - anchor - 8, { back: 3.3, side: 24, lookBoss: 0.4 }],
    [resumeFrame - anchor, { back: 3.9, side: 24, lookBoss: 0.25 }],
    [resumeFrame - anchor + 6, { back: 3.9, height: 5, side: 24, lookAhead: 6, lookBoss: 0 }],
    [resumeFrame - anchor + 20, { back: 7, height: 4.5, side: 18, lookAhead: 15, low: 2, focalLength: 20 }],
    [resumeFrame - anchor + 36, { back: 16, height: 6, side: 4, lookAhead: 50, low: 15, focalLength: 19 }],
    [resumeFrame - anchor + 56, { ...legacyCruise }],
  ];
  addSpan({ 名: '巨人', 锚: anchor, Keys: convertKeys(legacyKeys, (i) => i === 0 || i === legacyKeys.length - 1), keepInFrame: true, focus: () => route.穿刺表.巨人.矛尖(0), 核起: impactFrame - 50, 核止: resumeFrame + 36 });
};

// ---------- 远景（九头蛇、暮初恶魂、雪怪首领，原速）：跟着扎下去 → 刹停 → 停住看 boss 炸开 → 追上去 ----------
// 刹停：镜头照跟拍的位置走，只是它自己的时钟 τ 在 `刹帧` 帧里匀着慢到停（τ′ 从 1 按五次缓动降到 0）——速度连续地降到 0，不冲过头、不往回拉（另排一条曲线会顿两顿）。
// 停在哪：τ 停在跟拍镜头离 boss `停距` 米（沿路线）的那一刻。
// 停住 `远景停留` 秒（路线.ts，用户 10-08 要穿透后迅速跟进）以后追：方向从停住时的方向按五次缓动转到跟拍的方向，
// ln 距离按五次曲线从停住时（连同变化率）收到跟拍距离，最快每帧收 `追收`（骑手每帧放大 22%），
// 末端三次方地慢下来（用户 10-08 嫌追上时像撞墙），一路只收不放。
// 视线：停住时大半对着 boss（偏 0.8），追的那一截偏到 0、构图换回巡航
const brakeFrames = 16;
const chaseMaxShrink = 0.2;
type FarParams = {
  名: '九头蛇' | '暮初恶魂' | '雪怪首领';
  stopDist: number;
  俯冲: number | null; // 压机头那一帧（相对贯穿帧），平着撞进去的给 null
  preDive: Partial<LegacyParams>; // 压机头前 12 帧贴过去的机位
  preBrake: Partial<Framing>; // 刹停前跟拍机位的位置（扎下去时镜头往上抬一点、退一点，停住时在高处）
  holdLook: number;
  lookTurnFrames: number; // 放开以后几帧里视线从 boss 转到扫帚（雪怪首领要在镜头冲过雪怪那一点以前转完）
  lift?: number; // 追的那一截往上拱多少（度）：九头蛇钻穿土丘以后骑手在土丘背后，从停住的地方往骑手追，连线穿过土丘
  inTunnel?: boolean; // 雪怪首领：追的那一截沿路线在洞道里走（见 雪怪洞道）
};
// 五次曲线：从 (x0, v0, a0) 在 T 帧里到 (0, 0, 0)
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
// 追多久：收得最快的那一帧不超过 追收，也不收过头（离骑手比跟拍距离近）；取满足的最短的
const chaseDuration = (x0: number, v0: number, a0: number) => {
  for (let dur = 6; dur <= 120; dur += 0.5) {
    const x = quintic(x0, v0, a0, dur);
    let ok = true;
    for (let t = 0; t <= dur && ok; t += 0.25) {
      const rate = (x(t + 0.125) - x(t - 0.125)) / 0.25;
      if (rate < -chaseMaxShrink || x(t) < -1e-3) ok = false;
    }
    if (ok) return dur;
  }
  throw new Error('一镜到底镜头：追不上（120 帧以内收不到跟拍距离）');
};
export const chaseSpans: { name: string; start: number; end: number }[] = [];
// 雪怪首领洞道：贯穿以后扫帚钻进东口外的隧道（6-1-7/编排.ts 的 `雪怪隧道`），镜头停在大厅西半边、追的时候只能沿路线走（隧道四米多宽）。
// 镜头路程 `s镜` 按 ln 排（同上面的五次曲线，收到 `拉近距`）；高度在大厅里抬到路线以上 `厅高`（从炸开的白烟上面过去），进隧道前降回 `洞高`。出了隧道 `渐` 帧换回跟拍
const hallHeight = 4;
const tunnelHeight = 1.2;
const addFarSpan = (opts: FarParams) => {
  const anchor = pierceFrames[opts.名];
  const sp = route.标记路程(`${opts.名}.贯穿`);
  const hold = Math.round(route.远景停留[opts.名]! * 24);
  const diveFrame = opts.俯冲 ?? -22;
  const follow: Partial<LegacyParams> = { back: 16, height: 6, lookAhead: 0, low: 0, focalLength: 22, lookBoss: 0.5 };
  const legacyKeys: LegacyKey[] = [
    [-80, { ...legacyCruise }],
    [diveFrame - 12, { back: 14, height: 4.5, lookAhead: 60, low: 6, focalLength: 20, ...opts.preDive }],
    ...(opts.俯冲 === null ? [] : [[diveFrame, { lookAhead: 40, low: 12 }] as LegacyKey]),
    [diveFrame + 8, follow],
  ];
  const keys = convertKeys(legacyKeys);
  // 刹停前：位置往 `刹前` 挪；视线多往 boss 偏（0.5 → 刹停时 0.7 → 停住 0.9）：骑手几帧里从 6.6 米飞到四五十米外往下扎，
  // 视线照着骑手摆会跟着甩（一帧四五度）；停着的镜头看停着的 boss，视线稳，骑手往 boss 扎过去，两样都在画面里
  const preBrake = { ...keys[keys.length - 1][1], 偏: 0.7, ...opts.preBrake };
  // 跟拍镜头离 boss 停距 米的那一刻 τ停（沿路线）；刹停从 τ停 − 刹帧/2 开始
  const followCam = (P: Framing, τ: number) => clampToBore(camPosOf(P, τ), τ, P.方);
  const distToBoss = (τ: number) => sp - (route.扫帚(τ).s + dot(sub(followCam(preBrake, τ), riderAt(τ)), broomFrame(τ).flatFwd));
  let lo = anchor - 60;
  let hi = anchor;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (distToBoss(mid) > opts.stopDist) lo = mid;
    else hi = mid;
  }
  const stopTau = (lo + hi) / 2;
  const brakeStart = stopTau - brakeFrames / 2;
  if (brakeStart - anchor < diveFrame + 8 + 2) throw new Error(`一镜到底镜头 ${opts.名}：停距 ${opts.stopDist} 太远，刹停要在扎下去以前开始`);
  keys.push([brakeStart - anchor, preBrake]);
  // 停住、追的那几帧只排视线和焦距（位置在 位 里）
  const holdFraming: Framing = { ...preBrake, x: 0, y: 0, 焦: Math.log(22), 偏: 0.9 };
  keys.push([0, holdFraming], [hold, { ...holdFraming, 偏: opts.holdLook }]);
  const τ = (Fg: number) => {
    if (Fg <= brakeStart) return Fg;
    const progress = Math.min(1, (Fg - brakeStart) / brakeFrames);
    // ∫(1 − s5) du：τ′ 从 1 按五次缓动降到 0
    const integral = progress - (progress ** 4 * (progress * (progress * 1 - 3) + 2.5)) ;
    return brakeStart + brakeFrames * integral;
  };
  // 检查：∫0^1 (1 − s5) = 1/2，τ 停在 刹起 + 刹帧/2 = τ停
  const stopPos = followCam(preBrake, stopTau);
  const releaseFrame = anchor + hold;
  let posCam: PosCam;
  let chaseEnd: number;
  if (!opts.inTunnel) {
    // 追：方向从停住时（从骑手看镜头）转到跟拍的方向，ln 距离按五次曲线收
    const lnD = (Fg: number) => Math.log(len(sub(stopPos, riderAt(Fg))));
    const x1 = cruiseFraming.距;
    const step = 0.5;
    const x0 = lnD(releaseFrame) - x1;
    const v0 = (lnD(releaseFrame + step) - lnD(releaseFrame - step)) / (2 * step);
    const a0 = (lnD(releaseFrame + step) - 2 * lnD(releaseFrame) + lnD(releaseFrame - step)) / (step * step);
    const dur = chaseDuration(x0, v0, a0);
    const x = quintic(x0, v0, a0, dur);
    chaseEnd = releaseFrame + dur;
    posCam = (Fg) => {
      if (Fg < brakeStart || Fg > chaseEnd) return null;
      if (Fg <= releaseFrame) return { C: Fg < brakeStart + brakeFrames ? followCam(preBrake, τ(Fg)) : stopPos, weight: 1 };
      const rider = riderAt(Fg);
      const dirStop = norm(sub(stopPos, rider));
      const dirFollow = norm(sub(camPosOf(cruiseFraming, Fg), rider));
      let dir = slerp(dirStop, dirFollow, s5((Fg - releaseFrame) / dur));
      if (opts.lift) {
        // 往上拱：方向往竖直方向转 抬·64u³(1 − u)³（两头的速度、加速度都是 0，接得上停住和跟拍）
        const progress = clamp01((Fg - releaseFrame) / dur);
        const φ = rad(opts.lift) * 64 * progress ** 3 * (1 - progress) ** 3;
        const up = norm(sub([0, 0, 1], mul(dir, dir[2])));
        dir = norm(add(mul(dir, Math.cos(φ)), mul(up, Math.sin(φ))));
      }
      return { C: add(rider, mul(dir, Math.exp(x1 + x(Fg - releaseFrame)))), weight: 1 };
    };
  } else {
    // 雪怪首领：沿路线追（路程差按 ln 收）。停点投到路线上的路程、相对路线的高度和侧移
    const stopDist = route.扫帚(stopTau).s + dot(sub(stopPos, riderAt(stopTau)), broomFrame(stopTau).flatFwd);
    const stopRoutePt = route.位置(stopDist);
    const rightAt = (dist: number) => {
      const t = route.切线(dist);
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
      const routePt = route.位置(dist);
      return add(add(routePt, mul(rightAt(dist), sample(sideKeys, dist))), [0, 0, sample(heightKeys, dist)]);
    };
    const lnGap = (Fg: number) => Math.log(Math.max(1e-3, route.扫帚(Fg).s - stopDist));
    const x1 = Math.log(pullInDist);
    const step = 0.5;
    const x0 = lnGap(releaseFrame) - x1;
    const v0 = (lnGap(releaseFrame + step) - lnGap(releaseFrame - step)) / (2 * step);
    const a0 = (lnGap(releaseFrame + step) - 2 * lnGap(releaseFrame) + lnGap(releaseFrame - step)) / (step * step);
    const dur = chaseDuration(x0, v0, a0);
    const x = quintic(x0, v0, a0, dur);
    const camDist = (Fg: number) => (Fg <= releaseFrame ? stopDist : route.扫帚(Fg).s - Math.exp(x1 + x(Fg - releaseFrame)));
    // 出了隧道（镜头过隧道口 5 米）、又追上了，渐 帧换回跟拍
    const exitDist = yetiDist(chainPierceChoreo.yetiTunnels.exitGround) + 5;
    let exitFrame = releaseFrame;
    while (camDist(exitFrame) < exitDist || exitFrame < releaseFrame + dur) exitFrame += 0.25;
    chaseEnd = exitFrame + fadeFrames;
    posCam = (Fg) => {
      if (Fg < brakeStart || Fg > chaseEnd) return null;
      if (Fg <= releaseFrame) return { C: Fg < brakeStart + brakeFrames ? followCam(preBrake, τ(Fg)) : stopPos, weight: 1 };
      return { C: tunnelTrack(camDist(Fg)), weight: 1 - s5((Fg - exitFrame) / fadeFrames) };
    };
  }
  chaseSpans.push({ name: opts.名, start: releaseFrame, end: chaseEnd });
  // 视线从 boss 转到扫帚：`转看` 帧，但要在镜头追过去、boss 和骑手分开到 45° 以前转完（不然 boss 跑到镜头侧面、身后时视线还偏着它）
  const boss = route.穿刺表[opts.名].矛尖(0);
  let lookDone = releaseFrame + opts.lookTurnFrames;
  for (let Fg = releaseFrame; Fg < releaseFrame + opts.lookTurnFrames; Fg += 0.5) {
    const camPos = posCam(Fg)!.C;
    if (dot(norm(sub(boss, camPos)), norm(sub(riderAt(Fg), camPos))) < Math.cos(rad(45))) {
      lookDone = Math.max(releaseFrame + 2, Fg - 1);
      break;
    }
  }
  keys.push([Math.min(lookDone, chaseEnd - 6) - anchor, { ...holdFraming, 偏: 0 }]);
  // 追完以后 20 帧把构图（视线、焦距）换回巡航（焦距一帧变 2.4%）
  keys.push([chaseEnd - anchor - 4, { ...cruiseFraming, x: 0, y: 0, 焦: Math.log(22), 偏: 0 }], [chaseEnd - anchor + 20, cruiseFraming]);
  addSpan({ 名: opts.名, 锚: anchor, Keys: keys, 位: posCam, focus: () => route.穿刺表[opts.名].矛尖(0), 核起: anchor + diveFrame - 12, 核止: chaseEnd });
};

// 九头蛇：从巡航高度平着接进来、压下机头扎下去，扎的时候镜头往上抬、退一点（`刹前`），停在九头蛇前 48 米的高处；
// 暮初恶魂：平着横穿塔顶，停在它前 46 米；雪怪首领：跟着从西口隧道钻进大厅（洞道里镜头夹在孔道里），停在大厅西半边离雪怪 25 米处
// （大厅只有 ±35 米，西口隧道出口在 a −36），看着扫帚贯穿、钻进东口隧道，再沿路线追进去
const farList: FarParams[] = [
  {
    名: '九头蛇',
    stopDist: 48,
    俯冲: frameAt(pierceTimes.九头蛇 + hydraChoreo.T_DIVE) - pierceFrames.九头蛇,
    preDive: {},
    preBrake: { 距: Math.log(10), 仰: 35 },
    holdLook: 0.5,
    lookTurnFrames: 20,
    // 不拱的话第 363 帧镜头穿过土丘（石头和洞里的萤石，工具/一镜到底/离块.ts 量的）
    lift: 15,
  },
  { 名: '暮初恶魂', stopDist: 46, 俯冲: null, preDive: {}, preBrake: { 距: Math.log(8), 仰: 30 }, holdLook: 0.6, lookTurnFrames: 20 },
  {
    名: '雪怪首领',
    stopDist: 25,
    俯冲: frameAt(pierceTimes.雪怪首领 + chainPierceChoreo.YETI_T_DIVE) - pierceFrames.雪怪首领,
    preDive: { back: 12, height: 1.6 },
    preBrake: {},
    holdLook: 1,
    lookTurnFrames: 4,
    inTunnel: true,
  },
];

// ---------- 降落：最后 4 秒慢慢贴近，停稳以后绕到右前方 ----------
const addLandingSpan = () => {
  const legacyKeys: LegacyKey[] = [
    [-130, { ...legacyCruise }],
    [-70, { back: 14, height: 6, side: 1.5, lookAhead: 40, low: 10, focalLength: 20 }],
    [-20, { back: 9, height: 3.5, side: 3, lookAhead: 0, low: 0, focalLength: 22 }],
    [10, { back: 4, height: 3, side: 6.5, lookAhead: 0, low: -0.3, focalLength: 24 }],
    [40, { back: -3, height: 2.6, side: 7.5, lookAhead: 0, low: -0.4, focalLength: 26 }],
  ];
  const Keys = convertKeys(legacyKeys);
  addSpan({ 名: '降落', 锚: route.F_LAND, Keys: [...Keys, [route.总帧数 - route.F_LAND, Keys[Keys.length - 1][1]]], 核起: route.F_LAND - 70, 核止: route.总帧数 - 1 });
};

// 按时间顺序排：先后决定谁盖谁（镜头.ts 的合成）
addNearSpan('巫妖', lichOrbit, 0);
addFarSpan(farList[0]);
addFarSpan(farList[1]);
addFarSpan(farList[2]);
addNearSpan('冰雪女王', queenOrbit, 1);
addGiantSpan();
addLandingSpan();
// 各处的镜头窗口（全局帧）：起～止 是关键帧头尾（外面是巡航），核起～核止 是不能切的那一截（段表.ts 按它挑段切点）
export const camWindows = camSpans.filter((s) => s.名 !== '起飞').map((s) => ({ name: s.名, start: s.起, end: s.止, coreStart: s.核起, coreEnd: s.核止 }));
