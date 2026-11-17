// 6-3 下坠：6-3-3 俯冲、6-3-4 城防、6-3-5 举锤、6-3-6 砸穿是同一次下坠，放在一条共用时间线上，各段是其中一个窗口。
// 6-3-1（回边城）、6-3-2（思索，用户 10-10 挪到跃出前）在负的全局秒上（见 镜头/6-3-1/编排.ts、镜头/6-3-2/），起点接 6-2-6 末帧悬停（只读引用其末帧状态，不抄数值）。
// 站起、拔锤、跃出、翻身不上画面（用户 10-19：扫帚上跳下来那段做得烂，不渲了），思索末尾放大里面的李樱、淡到天空，接上已经头朝下俯冲的他（6-3-2/转场.ts）。
// 跃出照旧按物理算（起跳点、轨迹、撞击时刻都从它来），只是发生在思索界面盖着的时候：全局秒 0 的物理时间是 `刻`.俯冲起，不是 0。
// 这里的段是旧段号的窗口（编排、声音按它分），成片的段界（拼成哪几个 Composition）见 ../6-2至6-3段界/段表.ts。
//
// 三层时间：
// - 全局秒 T：T = 0 是 6-3-3 首帧（= 6-3-2 末帧，思索转场开始淡出那一刻）；6-3-1、6-3-2 在 T < 0。
//   节拍原来按 1/24 秒一格数帧调的，换成秒以后除不尽的写成 n / 24；段界落在输出帧（1/60 秒）上。
// - 物理时间 w（秒）：人、扫帚、碎块全按它走。跃出到翻成头朝下是重力加空气阻力；翻完被推着下冲（见 `鼓风机`）。
//   T < 0 是 0 往前倒推的负数（两人还坐在扫帚上）；T = 0 跳到 `刻`.俯冲起，这一跳藏在不透明的思索界面后面。
//   用户 10-05：下坠是有人用鼓风机加速，不按重力算，选「翻身后约 1 秒冲到 300～400 米/秒，几秒内砸地」，卫兵转身举镜那段慢放像子弹时间。
// - 时钟（画面 1 秒对应多少物理秒）：除了城墙上的子弹时间都是原速（用户 10-19：「为什么要放慢 原速度不行啊」）。
//   子弹时间（用户 10-05 要的）：听见回头 0.3 → 看见金光、举镜 0.24 → 镜中 0.1，关键帧之间 smoothstep。
// 两条线并行（用户 10-19 定）：6-3-3 俯冲切城墙那一刻起，城墙上（6-3-4）和李樱（6-3-5、6-3-6）是同一段剧情时间的两边。
//   6-3-4 演完（望远镜里看见他抡着锤、发金光）硬切回李樱，物理时间退回切城墙那一刻，6-3-5 原速一直拍到砸地，「ロードローラーだッ！」整句在 6-3-5 里。
//   所以 物理时间 在 6-3-4 → 6-3-5 处往回跳，两边各自单调；6-3-5 首帧不和 6-3-4 末帧共用。
import { exception } from '@engine/core/例外.ts';
import { segmentSpanSec as ponderSpanSec } from '../6-3-2/台词.ts';
import { smoothstep01 } from '@engine/core/数学.ts';
import { segFps } from '@engine/段/段定义.ts';
import { start, tick, liYingTerminalSpeed, blower, yawVec } from './基准.ts';
import { LY_LEAP_HIP, strikeDepth, landingSpot, impactMaceHead } from './编排/李樱姿势.ts';
import { groundZ } from './编排/地面.ts';
import { solveFall, at } from './下落物理.ts';

// 起点、动作时刻、鼓风机推力这些纯数据在 基准.ts（编排/李樱姿势.ts 也要用，放这里会成环），这里转出去
export { start, tick, thinkPullUp, liYingTerminalSpeed, blower, yawVec } from './基准.ts';

// ---------- 段表（全局秒） ----------
// 各段的长只在 `段长` 里写（止 − 起，秒），起止由 `buildSegmentTable` 累加（用户 10-13：段长不要耦合）。
// 段表的 止 是这一段末帧：段界那一帧归上一段（`boundaryFrameSec`，拼段时按它截）。
// 连着拍的两段共用段界（下一段起 = 上一段止）；`unsharedSegs` 里的段是硬切、物理时间往回跳，起点接在上一段末帧后面，不共用。
// 锚点：全局秒 0 = 6-3-3 首帧，6-3-1、6-3-2 往负的倒排。段内节点写成「本段起点 + 偏移」或「本段止 − 偏移」，不写绝对全局秒。
export type SegmentName = '6-3-1' | '6-3-2' | '6-3-3' | '6-3-4' | '6-3-5' | '6-3-6';
export const boundaryFrameSec = 1 / segFps;
// 6-3-4 城防各拍的长（秒，按顺序，第一拍从段首起，最后一拍到 6-3-5 硬切；含义见 `城防`）。分拍依据用户 10-13：先瞭望、听到回头、看到金光再举镜。
// 瞭望原速，太长的话卫兵举镜时他已经砸地了。回头、见光两拍按卫兵的反应（编排/卫兵.ts 的 `REACT`）一起缩（用户 10-20：反应太慢，「整个镜头都要对应缩短」）。
// 举镜：一排人在物理时间 0.3 秒里先后举好，全举好再停一下就切镜中
export const cityDefenseBeats = { lookout: 1, turnBack: 23 / 24, seeLight: 5 / 6, raiseScope: 1.25, inScope: 1.25 };
export const segSpanSec: Record<SegmentName, number> = {
  // 6-3-1 在负的全局秒上（用户 10-02 要在悬停处预留确认古城在边城的对话）；11 秒：两句台词按正常语速各留足加 0.5 秒（镜头/6-3-1/编排.ts 的 `cues631`）
  '6-3-1': 11,
  // 思索：界面盖住画面，李樱配音；时长由台词定，止是转场淡出天空的那一刻（镜头/6-3-2/台词.ts）
  '6-3-2': ponderSpanSec,
  // 原速：从思索里放大的李樱淡到真的天空，跟着他往下冲，到切城墙为止。用户 10-20 嫌思索过后下落太短，加长 1 秒，多出来的那段路由扫帚拉高补上（`思索拉高`）；
  // 切城墙那一刻（`刻`.俯冲起 + 41 / 24 ≈ 3.958 秒）≈ 6-3-5 首帧的物理时间（两边从同一刻起演）
  '6-3-3': 5 / 3,
  // 首帧硬切到城墙，止是镜中最后一帧，硬切 6-3-5：各拍加起来（5.2917 秒）不是整帧，6-3-5 首帧落在过了它的头一帧（原来落在 1/24 秒的格上，用户 11-16 定不留）
  '6-3-4': Math.ceil(Object.values(cityDefenseBeats).reduce((a, b) => a + b, 0) * segFps - 1e-9) / segFps - boundaryFrameSec,
  // 原速，从切城墙那一刻拍到砸地前（首帧物理时间 = 撞击时刻 − (本段长 + 撞击段内秒) ≈ 切城墙那一刻），装得下整句台词（../6-3-下坠/声音.tsx 的 `RoadRoller`）
  '6-3-5': 3.25 - boundaryFrameSec,
  // 竖井用古城4x 的（用户 10-13 嫌坑浅）：岩层 141 米、入井速度 140，落地半蹲缓冲、起身、扫一眼（../6-3-6/落地.ts）。
  // 撞击时刻、首帧、段内 `撞击段内秒` 砸地不动；6-3-6 → 6-3-8 硬切（6-3-8 的 `afterImpact` 按这里的段长算）
  '6-3-6': 4.5,
};
const segmentNames: SegmentName[] = ['6-3-1', '6-3-2', '6-3-3', '6-3-4', '6-3-5', '6-3-6'];
const unsharedSegs: SegmentName[] = ['6-3-4', '6-3-5'];
const segmentTitles: Record<SegmentName, string> = { '6-3-1': '又回到边城', '6-3-2': '思索', '6-3-3': '俯冲', '6-3-4': '城防', '6-3-5': '举锤', '6-3-6': '砸穿' };
const anchorSegment: SegmentName = '6-3-3'; // 这一段的起点是全局秒 0
const buildSegmentTable = () => {
  const t = {} as Record<SegmentName, { start: number; end: number; name: string; refVideo: boolean }>;
  const anchorIdx = segmentNames.indexOf(anchorSegment);
  let cursorSec = 0;
  for (let i = anchorIdx; i < segmentNames.length; i++) {
    const seg = segmentNames[i];
    if (i > anchorIdx && unsharedSegs.includes(seg)) cursorSec += boundaryFrameSec;
    t[seg] = { start: cursorSec, end: cursorSec + segSpanSec[seg], name: segmentTitles[seg], refVideo: true };
    cursorSec = t[seg].end;
  }
  cursorSec = 0;
  for (let i = anchorIdx - 1; i >= 0; i--) {
    const seg = segmentNames[i];
    t[seg] = { start: cursorSec - segSpanSec[seg], end: cursorSec, name: segmentTitles[seg], refVideo: true };
    cursorSec = t[seg].start;
  }
  // 对象按段的先后排（Object.keys 的顺序给同步表、台词落点用）
  return Object.fromEntries(segmentNames.map((s) => [s, t[s]])) as typeof t;
};
export const segTable = buildSegmentTable();
export const segSpan = (seg: SegmentName) => segTable[seg].end - segTable[seg].start;
// 一段在拼段里放多长（秒）：段长加上段界那一帧
export const segPlaySec = (seg: SegmentName) => segSpan(seg) + boundaryFrameSec;
export const impactSegSec = 0.125; // 6-3-6 段内 0.125 秒锤头砸到地面（剪的时候按它对齐）
// 6-3-4 的节点（全局秒，= 段首 + 前面各拍之和，见 `城防拍长`）。各拍之间硬切（用户 10-13），世界和物理时间连续，只换机位：
// 切墙（段首）：北城墙中远景，卫兵值守——瞭望；察觉：4 号先回头，其余陆续跟着；回看：身后高处，镜头抬到天上——看见金光；
// 举镜：城里一侧仰看一排人陆续举望远镜（中景，不给单人特写）；镜中：切进望远镜（原版镜筒遮罩），里面是抡着锤、发着金光的李樱，段末硬切 6-3-5。
// 卫兵动作按物理时间排（编排/卫兵.ts），回头、见光、举镜各拍的长照那些时刻在各拍时钟下算出
const cityDefenseMarks = () => {
  const beatLen = cityDefenseBeats;
  let cursorSec = segTable['6-3-4'].start;
  const cutToWall = cursorSec;
  const notice = (cursorSec += beatLen.lookout);
  const glanceBack = (cursorSec += beatLen.turnBack);
  const raiseScope = (cursorSec += beatLen.seeLight);
  const inScope = (cursorSec += beatLen.raiseScope);
  return { cutToWall: cutToWall, notice: notice, rewatch: glanceBack, raiseScope: raiseScope, inScope: inScope };
};
export const cityDefense = cityDefenseMarks();

// ---------- 时钟 ----------
// 关键点 [全局秒, 倍率]，相邻两点平滑过渡，只管 6-3-4 末帧以前（6-3-5、6-3-6 原速，从撞击时刻倒推，见 `物理时间`）
export const bulletTime = exception('不放慢', { guard: 0.3, raiseScope: 0.24, telescope: 0.1 }, { segment: '6-城墙瞭望', cause: '用户 10-05 要慢放才看得清，10-19 去慢放时单留这段' });
const CLOCK: [number, number][] = [
  [segTable['6-3-1'].start, 1],
  // 听见、回头：子弹时间 0.3；看见金光时再慢一点，举镜也按这个慢放
  [cityDefense.notice - 1 / 3, 1],
  [cityDefense.notice + 1 / 6, bulletTime.guard],
  [cityDefense.rewatch, bulletTime.guard],
  [(cityDefense.rewatch + cityDefense.raiseScope) / 2, bulletTime.raiseScope],
  [cityDefense.inScope - boundaryFrameSec, bulletTime.raiseScope], // 切进望远镜前的最后一帧还是举镜的慢放
  // 切进望远镜：镜中追着他
  [cityDefense.inScope, bulletTime.telescope],
  [segTable['6-3-4'].end, bulletTime.telescope],
];
const clockAt = (globalSec: number) => {
  for (let i = 1; i < CLOCK.length; i++) {
    const [t0, r0] = CLOCK[i - 1];
    const [t1, r1] = CLOCK[i];
    if (globalSec <= t1) return r0 + (r1 - r0) * smoothstep01((globalSec - t0) / (t1 - t0));
  }
  return CLOCK[CLOCK.length - 1][1];
};
// 积分表：每 1/192 秒一格，从 T = 0（物理时间 `刻`.俯冲起）到 6-3-5 首帧（6-3-4 末帧往后半帧也要算）
const clockSamplesPerSec = 192;
const T5 = segTable['6-3-5'].start;
let W_TAB: number[] | null = null;
const wTab = () => {
  if (W_TAB) return W_TAB;
  W_TAB = [tick.diveStart];
  const steps = Math.round(T5 * clockSamplesPerSec);
  for (let i = 1; i <= steps; i++) W_TAB.push(W_TAB[i - 1] + clockAt((i - 0.5) / clockSamplesPerSec) / clockSamplesPerSec);
  return W_TAB;
};

// ---------- 李樱的下落 ----------
// 起跳 → 瞄准 → 撞击在 下落物理.ts 的 `solveFall` 里，这里求一次，下面和各编排都用这一份
export const fall = solveFall({
  hip: LY_LEAP_HIP,
  forward: yawVec(start.broom.facing).fwd,
  leapSec: tick.leap,
  terminalSpeed: liYingTerminalSpeed,
  blower,
  groundZ,
  strikeDepth,
  landing: landingSpot,
  maceHeadAt: impactMaceHead,
});
export const liYingFall = (w: number) => at(fall.table, w);
export const impactTime = () => fall.impactTime;

// 负的全局秒（6-3-1、6-3-2）：从 0 往回积分，每 1/192 秒一格，`W_NEG`[i] 是 T = -i/192 的物理时间（负的；T = 0 本身是 `刻`.俯冲起，见文件头）
let W_NEG: number[] | null = null;
const wNeg = () => {
  if (W_NEG) return W_NEG;
  const stepCount = Math.ceil(-segTable['6-3-1'].start * clockSamplesPerSec - 1e-9);
  W_NEG = [0];
  for (let i = 1; i <= stepCount; i++) W_NEG.push(W_NEG[i - 1] - clockAt(-(i - 0.5) / clockSamplesPerSec) / clockSamplesPerSec);
  return W_NEG;
};

// ---------- 全局秒 → 物理时间 ----------
// 6-3-5 起（T ≥ `T5`）是并行的另一边：原速，按撞击时刻倒推（6-3-6 段内 `撞击段内秒` 砸地）；0 ≤ T < `T5` 积分时钟；T < 0 扫帚上，见 `wNeg`
export const physicalTime = (globalSec: number): number => {
  if (globalSec >= T5) return impactTime() + (globalSec - segTable['6-3-6'].start - impactSegSec);
  if (globalSec < 0) {
    const negTable = wNeg();
    const x = -globalSec * clockSamplesPerSec;
    if (x >= negTable.length - 1) return negTable[negTable.length - 1] - (x - (negTable.length - 1)) / clockSamplesPerSec; // 6-3-1 之前（用不到）：原速外推
    const i = Math.floor(x);
    return negTable[i] + (negTable[i + 1] - negTable[i]) * (x - i);
  }
  const physTimes = wTab();
  const x = globalSec * clockSamplesPerSec;
  const i = Math.min(Math.floor(x), physTimes.length - 2);
  return physTimes[i] + (physTimes[i + 1] - physTimes[i]) * (x - i);
};
export const clampedClock = (T: number) => (T >= T5 ? 1 : clockAt(T));
// 物理时间 → 全局秒：两边各自单调。`城墙这边` = true 只在 6-3-4 末帧以前找（城墙上、俯冲、更早），否则物理时间在城墙结束以后的落在 6-3-5 起那边。
// 0 ～ `刻`.俯冲起 之间（跃出、翻身，没上画面）都落在 T = 0
export const wallEndPhysicalTime = () => physicalTime(segTable['6-3-4'].end + boundaryFrameSec / 2);
export const globalSec = (physSec: number, onWallSide = physSec <= wallEndPhysicalTime()): number => {
  if (!onWallSide) return T5 + (physSec - physicalTime(T5));
  let lo = segTable['6-3-1'].start - 2;
  let hi = segTable['6-3-4'].end + boundaryFrameSec / 2;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (physicalTime(mid) < physSec) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
export const segStartPhysicalTime = (seg: SegmentName) => physicalTime(segTable[seg].start);
// 全局秒属于哪一段（段首算这一段）
export const segAt = (globalSec: number): SegmentName => {
  const order: SegmentName[] = ['6-3-6', '6-3-5', '6-3-4', '6-3-3', '6-3-2', '6-3-1'];
  return order.find((s) => globalSec >= segTable[s].start) ?? '6-3-1';
};
