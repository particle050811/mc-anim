// 娜迦：贪吃蛇式爬行路线、被斩断后两截的速度、抬头盯李樱、受伤变红、逐节自毁，以及断口处的战利品箱。
import { type Key, sample, track } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { GAME_NAGA, type GameNagaPose } from '@库/角色/娜迦实机.tsx';
import { HURT_OVERLAY } from '@engine/model/贴图方盒.tsx';
import { END, HOLD, warp } from './时间轴.ts';
import { makeTrail, trailOn } from './折线.ts';
import { CUT_X, DASH_Y, liying } from './李樱.ts';
import { onTick } from '../../时刻.ts';

const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

// ---------- 娜迦（游戏实机尺寸，见 模型/角色/娜迦实机.tsx）----------
// 头 2 格见方、离地 1 格；身体 12 节各 2 格见方，节距 2 格；没有下颌，扑击时换冲撞贴图。
// 像贪吃蛇爬（用户 10-01）：每节走头走过的路，和游戏里一致。
const NAGA_HEAD = GAME_NAGA.headSize;
const NSEG = GAME_NAGA.maxSegments;
const SEG = GAME_NAGA.segmentSize;
const HEAD_GAP = 2.05; // 头中心到第一节中心
const segBack = (i: number) => HEAD_GAP + i * GAME_NAGA.segmentSpacing;
// 头爬过的路线（折线，拐角倒圆）。庭院中心 x -6～8、y -9～5 是平地；北边是一圈下沉一格的环形浅槽围着高台；西边 x -18～-7 水池，东南是树篱；南边隔树篱还有片空地，x -9～-4 有豁口相通。
// 从南边空地穿豁口进来，往东拐到 x -1 再往北，横过冲刺线（y -0.8）；f117 冲刺线正好落在第 2、3 节之间（脖子），断成两截：前半截往北窜进浅槽，后半截停原地。
// 断开后头往北而不往东：往东会钻进镜头 2b 近景树篱糊成一团，读不出断开。
const TRAIL_PTS: [number, number, number][] = [
  // [x, y, 拐角倒圆半径]
  [-14, -18.5, 0],
  [-6.5, -18.5, 2],
  [-6.5, -7.5, 1.6],
  [-1, -7.5, 2],
  [-1, 7, 1.9],
  [-5, 7, 1.4],
  [-5, 16, 0],
];
const TRAIL = makeTrail(TRAIL_PTS);
const trailAt = (d: number) => trailOn(TRAIL, d);

const S_CROSS = (() => {
  let best = 0;
  for (let dist = 0; dist < TRAIL.len; dist += 0.01) {
    const [x, y] = trailAt(dist);
    if (Math.abs(x - CUT_X) < 0.05 && Math.abs(y - DASH_Y) < Math.abs(trailAt(best)[1] - DASH_Y)) best = dist;
  }
  return best;
})();
// 地面高度：环形浅槽里低一格；跨槽边时按身子前后两点平均，一节一节地下去、上来
const groundAt = (x: number, y: number) => {
  const inRing = x > -6.5 && x < 5.5 && y > 5.5 && y < 17.5 && !(x > -3.5 && x < 2.5 && y > 8.5 && y < 14.5);
  return inRing ? -1 : 0;
};
const groundOn = (dist: number) => {
  let z = 0;
  for (const offset of [-0.7, 0, 0.7]) {
    const [x, y] = trailAt(dist + offset);
    z += groundAt(x, y) / 3;
  }
  return z;
};

// 爬行速度（米/秒）：平时 3 格/秒；看见越墙的李樱后加速冲（6 格/秒）。刀斩过那一刻（`CUT_TIME`）就断开（用户 10-01：演成斩了不觉看着像没斩中）：
// 前半截受惊前窜、越爬越慢直到消散，后半截没了头几帧就停。
export const CUT_TIME = 117 / 24;
const V_HEAD: [number, number][] = [[1 / 24, 3], [92 / 24, 3], [100 / 24, 6], [CUT_TIME, 6], [120 / 24, 10.8], [128 / 24, 7.2], [140 / 24, 2.4], [150 / 24, 0.72], [156 / 24, 0]];
const V_TAIL: [number, number][] = [[1 / 24, 3], [92 / 24, 3], [100 / 24, 6], [CUT_TIME, 6], [121 / 24, 0]];
// 爬过的路按 1/24 秒一步积分成表（第 i 项 = 第 i 格那一刻），中间线性插
const CRAWL_SAMPLES_PER_SEC = 24;
const CRAWL_LAST = Math.round(END * CRAWL_SAMPLES_PER_SEC);
const integrate = (keys: [number, number][]) => {
  const out = [0];
  for (let k = 1; k <= CRAWL_LAST; k++) out[k] = out[k - 1] + track(keys, k / CRAWL_SAMPLES_PER_SEC) / CRAWL_SAMPLES_PER_SEC;
  return out;
};
const lerpArr = (values: number[], t: number) => {
  const clamped = Math.min(Math.max(t * CRAWL_SAMPLES_PER_SEC, 1), CRAWL_LAST);
  const i = Math.min(Math.floor(clamped), CRAWL_LAST - 1);
  return values[i] + (values[i + 1] - values[i]) * (clamped - i);
};
const HEAD_RAW = integrate(V_HEAD);
const TAIL_RAW = integrate(V_TAIL);
// 头的弧长位置：对齐到斩断那一刻冲刺线正好在第 1、2 节（从 0 数）中间
const S_HEAD0 = S_CROSS + (segBack(1) + segBack(2)) / 2 - lerpArr(HEAD_RAW, CUT_TIME);
const sHead = (t: number) => S_HEAD0 + lerpArr(HEAD_RAW, t);
const sTail = (t: number) => S_HEAD0 + lerpArr(TAIL_RAW, t);
const CUT_I = 1;
const segS = (i: number, t: number) => (i <= CUT_I ? sHead(t) : sTail(t)) - segBack(i);
const segLoc = (i: number, t: number): V3 => {
  const arcPos = segS(i, t);
  const [x, y] = trailAt(arcPos);
  return [x, y, groundOn(arcPos)];
};

// 抬头盯着越墙的李樱（他在 36 格高的空中），随他俯冲下来慢慢放平
const PITCH: [number, number][] = [[1 / 24, 0], [88 / 24, 0], [94 / 24, -22], [100 / 24, -18], [112 / 24, -12], [118 / 24, -4], [124 / 24, 0]];
// 头转向李樱的程度：发现他之后一直盯着；被斩断后受惊往前窜，头顺着爬的方向，不再看他
const LOOK: [number, number][] = [[1 / 24, 0], [88 / 24, 0], [93 / 24, 1], [CUT_TIME, 1], [127 / 24, 0]]; // 回正用 10 格：审片时 2 帧翻 95°，像瞬间翻面
const charging = (t: number) => t >= 96 / 24 && t < 124 / 24;

// 不做红色断面：方块生物没有血肉，红色断面还容易让视频生成出血液、过不了审核。
// 死亡按游戏方式：身体一节节自毁（消失 + 爆炸粒子），头最后消失（白烟）。游戏里每 12 刻一节要 7 秒多，这里从断口向两端同时、每 4 帧一节。
// 收刀入鞘（f147）下一帧两截炸开：断开是斩的当下，炸开是收刀那一下
export const DIS = 148 / 24;
const DIS_STEP = 4 / 24;
// 受伤变红照原版（用户 10-10；同 6-1-5～6-1-8 的 boss）：整条一起红，红/不红两档。挨刀从 `CUT_TIME` 起红 `HURT_OVERLAY.ticks` 刻；
// 死亡一直红到消失，这里挨刀时前半截还活着，从 `DIS` 起算。
const HURT_END = CUT_TIME + HURT_OVERLAY.ticks / 20;
export const nagaHurt = (t: number) => (t >= CUT_TIME && t < HURT_END) || t >= DIS;
const dissolveStart = (() => {
  const seg: number[] = [];
  // 落到刻上（../../时刻.ts）：哪一帧消失正好落在帧上
  for (let i = 0; i < NSEG; i++) seg[i] = onTick(DIS + DIS_STEP * (i <= CUT_I ? CUT_I - i : i - CUT_I - 1));
  return { seg, head: onTick(DIS + DIS_STEP * (CUT_I + 1)) };
})();
const alive = (t: number, s0: number) => (t < s0 ? 1 : 0);
const since = (t: number, s0: number) => t - s0;

// 头相对爬行方向转向李樱的角度（限制 ±100°）：李樱 5 格/帧冲过去，所以取前 10 帧朝向平均；他掠过头后头从前面甩过，每帧最多转 16°，不扭到正后方。
// 表是一格（1/24 秒）一项，限转、平均都按格
const AIM_REL: number[] = (() => {
  const world: number[] = [];
  for (let i = 1; i <= CRAWL_LAST; i++) {
    const [hx, hy] = trailAt(sHead(i / CRAWL_SAMPLES_PER_SEC));
    const [lx, ly] = liying(i / CRAWL_SAMPLES_PER_SEC).pose.loc;
    const angle = (Math.atan2(ly - hy, lx - hx) * 180) / Math.PI;
    world[i] = i === 1 ? angle : world[i - 1] + wrap180(angle - world[i - 1]);
  }
  const out: number[] = [];
  for (let i = 1; i <= CRAWL_LAST; i++) {
    let avg = 0;
    for (let k = 0; k < 10; k++) avg += world[Math.max(1, i - k)] / 10;
    const target = Math.max(-100, Math.min(100, wrap180(avg - trailAt(sHead(i / CRAWL_SAMPLES_PER_SEC))[2])));
    out[i] = i === 1 ? target : out[i - 1] + Math.max(-16, Math.min(16, target - out[i - 1]));
  }
  return out;
})();
// 格之间插值（以前取最近的整格，60 帧输出时按 24 帧跳）；整格上一样
const nagaAim = (t: number) => lerpArr(AIM_REL, t);

export const naga = (t: number) => {
  // 身体节正面（本地 -Y）朝着前进方向：数学角 dir 对应 yaw = dir + 90
  const segs: GameNagaPose['segs'] = Array.from({ length: NSEG }, (_, i) => ({
    loc: segLoc(i, t),
    yaw: trailAt(segS(i, t))[2] + 90,
    scale: alive(t, dissolveStart.seg[i]),
  }));
  const sh = sHead(t);
  const [hx, hy, dir] = trailAt(sh);
  const look = track(LOOK, t);
  const pose: GameNagaPose = {
    hurt: nagaHurt(t),
    segs,
    head: {
      loc: [hx, hy, groundOn(sh)],
      pitch: track(PITCH, t),
      yaw: dir + 90 + 20 * Math.sin(2 * Math.PI * 0.3 * t) * (1 - look) + nagaAim(t) * look,
      state: charging(t) ? 'charging' : 'normal',
      scale: alive(t, dissolveStart.head),
    },
  };
  const bursts = segs.map((_, i) => ({ center: [...segLoc(i, dissolveStart.seg[i]).slice(0, 2), SEG / 2] as V3, sec: since(t, dissolveStart.seg[i]), seed: i + 1 }));
  const [px, py] = trailAt(sHead(dissolveStart.head));
  const poof = { center: [px, py, GAME_NAGA.headBottom + NAGA_HEAD / 2] as V3, sec: since(t, dissolveStart.head) };
  const c0 = segLoc(CUT_I, CUT_TIME);
  const c1 = segLoc(CUT_I + 1, CUT_TIME);
  const debris = { sec: t - CUT_TIME, origin: [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, 1.0] as V3 };
  return { pose, bursts, poof, debris };
};

// 俯拍里刀穿过脖子那帧人被娜迦身子挡住：在脖子顶面沿冲刺线画一道亮白刀痕，两帧淡出
export const neckSlash = (t: number) => (t < 117 / 24 ? 0 : Math.max(0, 1 - (t - 117 / 24) / (3 / 24)));

// 战利品箱落在刀斩过的地方（冲刺线和娜迦爬过的路的交点，就在庭院中心刷怪点旁边），断口附近几节炸完之后弹出
const CHEST_S: Key[] = [[1 / 24, 0], [179 / 24, 0], [185 / 24, 1.15], [189 / 24, 1]];
// 箱子开始冒出来的剧情帧（CHEST_S 按停住 12 帧后的时间取）：暮色 boss 的战利品箱冒出时放 boss_chest.appear（声音.tsx）
export const chestAppearTime = 179 / 24 + HOLD;
export const chest = (t: number) => ({ loc: [CUT_X, DASH_Y, 0] as V3, scale: sample(CHEST_S, warp(t)) });
