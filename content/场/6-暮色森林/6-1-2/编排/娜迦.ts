// 娜迦：贪吃蛇式爬行路线、被斩断后两截的速度、抬头盯李樱、受伤变红、逐节自毁，以及断口处的战利品箱。
import { type Key, sample, track } from '../../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { GAME_NAGA, type GameNagaPose } from '../../../../../world/角色/娜迦实机.tsx';
import { HURT_OVERLAY } from '../../../../../engine/model/贴图方盒.tsx';
import { FPS, END, HOLD, warp } from './时间轴.ts';
import { makeTrail, trailOn } from './折线.ts';
import { CUT_X, DASH_Y, liying } from './李樱.ts';

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

// 爬行速度（格/帧）：平时 3 格/秒；看见越墙的李樱后加速冲（6 格/秒）。刀斩过那帧（`CUT_FRAME`）就断开（用户 10-01：演成斩了不觉看着像没斩中）：
// 前半截受惊前窜、越爬越慢直到消散，后半截没了头几帧就停。
export const CUT_FRAME = 117;
const V_HEAD: [number, number][] = [[1, 0.125], [92, 0.125], [100, 0.25], [CUT_FRAME, 0.25], [120, 0.45], [128, 0.3], [140, 0.1], [150, 0.03], [156, 0]];
const V_TAIL: [number, number][] = [[1, 0.125], [92, 0.125], [100, 0.25], [CUT_FRAME, 0.25], [121, 0]];
const integrate = (keys: [number, number][]) => {
  const out = [0];
  for (let frame = 1; frame <= END; frame++) out[frame] = out[frame - 1] + track(keys, frame);
  return out;
};
const at117 = (a: number[]) => a[117];
const HEAD_RAW = integrate(V_HEAD);
const TAIL_RAW = integrate(V_TAIL);
// 头的弧长位置：对齐到 f117 时冲刺线正好在第 1、2 节（从 0 数）中间
const S_HEAD0 = S_CROSS + (segBack(1) + segBack(2)) / 2 - at117(HEAD_RAW);
const lerpArr = (values: number[], frame: number) => {
  const clamped = Math.min(Math.max(frame, 1), END);
  const i = Math.min(Math.floor(clamped), END - 1);
  return values[i] + (values[i + 1] - values[i]) * (clamped - i);
};
const sHead = (f: number) => S_HEAD0 + lerpArr(HEAD_RAW, f);
const sTail = (f: number) => S_HEAD0 + lerpArr(TAIL_RAW, f);
const CUT_I = 1;
const segS = (i: number, f: number) => (i <= CUT_I ? sHead(f) : sTail(f)) - segBack(i);
const segLoc = (i: number, frame: number): V3 => {
  const arcPos = segS(i, frame);
  const [x, y] = trailAt(arcPos);
  return [x, y, groundOn(arcPos)];
};

// 抬头盯着越墙的李樱（他在 36 格高的空中），随他俯冲下来慢慢放平
const PITCH: [number, number][] = [[1, 0], [88, 0], [94, -22], [100, -18], [112, -12], [118, -4], [124, 0]];
// 头转向李樱的程度：发现他之后一直盯着；被斩断后受惊往前窜，头顺着爬的方向，不再看他
const LOOK: [number, number][] = [[1, 0], [88, 0], [93, 1], [CUT_FRAME, 1], [127, 0]]; // 回正用 10 帧：审片时 2 帧翻 95°，像瞬间翻面
const charging = (f: number) => f >= 96 && f < 124;

// 不做红色断面：方块生物没有血肉，红色断面还容易让视频生成出血液、过不了审核。
// 死亡按游戏方式：身体一节节自毁（消失 + 爆炸粒子），头最后消失（白烟）。游戏里每 12 刻一节要 7 秒多，这里从断口向两端同时、每 4 帧一节。
// 收刀入鞘（f147）下一帧两截炸开：断开是斩的当下，炸开是收刀那一下
export const DIS = 148;
const DIS_STEP = 4;
// 受伤变红照原版（用户 10-10；同 6-1-5～6-1-8 的 boss）：整条一起红，红/不红两档。挨刀从 `CUT_FRAME` 起 12 帧；
// 死亡一直红到消失，这里挨刀时前半截还活着，从 `DIS` 起算。
const HURT_END = CUT_FRAME + (HURT_OVERLAY.ticks * FPS) / 20;
export const nagaHurt = (f: number) => (f >= CUT_FRAME && f < HURT_END) || f >= DIS;
const dissolveStart = (() => {
  const seg: number[] = [];
  for (let i = 0; i < NSEG; i++) seg[i] = DIS + DIS_STEP * (i <= CUT_I ? CUT_I - i : i - CUT_I - 1);
  return { seg, head: DIS + DIS_STEP * (CUT_I + 1) };
})();
const alive = (f: number, s0: number) => (f < s0 ? 1 : 0);
const since = (f: number, s0: number) => (f - s0) / FPS;

// 头相对爬行方向转向李樱的角度（限制 ±100°）：李樱 5 格/帧冲过去，所以取前 10 帧朝向平均；他掠过头后头从前面甩过，每帧最多转 16°，不扭到正后方。
const AIM_REL: number[] = (() => {
  const world: number[] = [];
  for (let i = 1; i <= END; i++) {
    const [hx, hy] = trailAt(sHead(i));
    const [lx, ly] = liying(i).pose.loc;
    const angle = (Math.atan2(ly - hy, lx - hx) * 180) / Math.PI;
    world[i] = i === 1 ? angle : world[i - 1] + wrap180(angle - world[i - 1]);
  }
  const out: number[] = [];
  for (let i = 1; i <= END; i++) {
    let avg = 0;
    for (let k = 0; k < 10; k++) avg += world[Math.max(1, i - k)] / 10;
    const target = Math.max(-100, Math.min(100, wrap180(avg - trailAt(sHead(i))[2])));
    out[i] = i === 1 ? target : out[i - 1] + Math.max(-16, Math.min(16, target - out[i - 1]));
  }
  return out;
})();
const nagaAim = (f: number) => AIM_REL[Math.min(Math.max(1, Math.round(f)), END)];

export const naga = (frame: number) => {
  // 身体节正面（本地 -Y）朝着前进方向：数学角 dir 对应 yaw = dir + 90
  const segs: GameNagaPose['segs'] = Array.from({ length: NSEG }, (_, i) => ({
    loc: segLoc(i, frame),
    yaw: trailAt(segS(i, frame))[2] + 90,
    scale: alive(frame, dissolveStart.seg[i]),
  }));
  const sh = sHead(frame);
  const [hx, hy, dir] = trailAt(sh);
  const look = track(LOOK, frame);
  const pose: GameNagaPose = {
    hurt: nagaHurt(frame),
    segs,
    head: {
      loc: [hx, hy, groundOn(sh)],
      pitch: track(PITCH, frame),
      yaw: dir + 90 + 20 * Math.sin((2 * Math.PI * 0.3 * frame) / FPS) * (1 - look) + nagaAim(frame) * look,
      state: charging(frame) ? 'charging' : 'normal',
      scale: alive(frame, dissolveStart.head),
    },
  };
  const bursts = segs.map((_, i) => ({ center: [...segLoc(i, dissolveStart.seg[i]).slice(0, 2), SEG / 2] as V3, sec: since(frame, dissolveStart.seg[i]), seed: i + 1 }));
  const [px, py] = trailAt(sHead(dissolveStart.head));
  const poof = { center: [px, py, GAME_NAGA.headBottom + NAGA_HEAD / 2] as V3, sec: since(frame, dissolveStart.head) };
  const c0 = segLoc(CUT_I, CUT_FRAME);
  const c1 = segLoc(CUT_I + 1, CUT_FRAME);
  const debris = { sec: (frame - CUT_FRAME) / FPS, origin: [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, 1.0] as V3 };
  return { pose, bursts, poof, debris };
};

// 俯拍里刀穿过脖子那帧人被娜迦身子挡住：在脖子顶面沿冲刺线画一道亮白刀痕，两帧淡出
export const neckSlash = (f: number) => (f < 117 ? 0 : Math.max(0, 1 - (f - 117) / 3));

// 战利品箱落在刀斩过的地方（冲刺线和娜迦爬过的路的交点，就在庭院中心刷怪点旁边），断口附近几节炸完之后弹出
const CHEST_S: Key[] = [[1, 0], [179, 0], [185, 1.15], [189, 1]];
// 箱子开始冒出来的剧情帧（CHEST_S 按停住 12 帧后的时间取）：暮色 boss 的战利品箱冒出时放 boss_chest.appear（声音.tsx）
export const chestAppearFrame = 179 + HOLD;
export const chest = (f: number) => ({ loc: [CUT_X, DASH_Y, 0] as V3, scale: sample(CHEST_S, warp(f)) });
