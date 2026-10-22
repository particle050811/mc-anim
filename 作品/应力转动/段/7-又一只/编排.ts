// 7-4-2 又一只：时间轴、人和怪的姿势、机位，纯函数，输入本段帧号 f（0 起，24 帧/秒）。画面在 画面.tsx，声音在 声音.tsx，地理见 ../7-4-1/几何.ts。
// 戏（正篇/07-监守者之怒/脚本规划.md 7-4-2）：从 7-4-1 硬切过来，二人在岛上得意；再硬切到北墙外小石龛：刘心忠骑在马上开战利品箱，振动飞进感测体（咔嗒）、再飞进龛里四个尖啸体，
//   四个尖啸体先后尖啸，每个旁边钻出一只监守者（钻出动画同 6-4-8，快放到 1.75 秒），一只接一只错开 0.5～0.6 秒（用户 10-18：「陆陆续续从几个尖啸体爬出好几个……然后直接吓跑他们」）。
//   第一只（龛口外东边）出来二人扭头看、一缩；第二只就在箱子跟前钻出来：一激灵、马受惊往后一退；第三只冒头时二人互看一眼，掉头就跑，第四只在他们逃跑的路边钻出来。
// 为什么开箱会召出监守者（照 1.20.1，同 6-4-2 文件头的振动链）：刘心忠的警告等级在 6-4-7 已叫满四次，一叫就直接召唤；48 格内原来那只已死。
//   和游戏不同（用户要的）：游戏里四个尖啸体几乎同一刻收到咔嗒，但警告有 10 秒冷却、48 格内只召一只；这里四个都叫、各召一只，并错开。尖啸后 0.75 秒钻出（游戏 90 刻，同 6-4-8）。
// 镜头（硬切）：1 得意（1a 刘心忠勒停在岛南头台面上、朝着它倒下的地方举杖，1b 黄叛在传送门顶上垂弓举拳；剧情时刻接着 7-4-1 末帧往下走）；2a 开箱（龛口外东边看进龛里：开盖 → 咔嗒 → 尖啸）；
//   2b 第一只身后（它在前景钻出，二人扭头看过来，第二只在箱子跟前冒头，一激灵）；3 龛口往西（马受惊、第三只在马头前冒头、对视、掉头）；
//   4 逃（南边过道口往回看：马 50、黄叛 30 米/秒冲下地台朝镜头跑来、从镜头底下过，第四只在路边钻出），硬切 7-4-3。
import { type Key, sample } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { WARDEN } from '@库/生物/监守者.tsx';
import { ridePose } from '../../角色/追兵.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import type { Cam, ChestOpening } from '../../地点/古城4x/6-4-1/古城画面.tsx';
import { toScene, yawTo } from '../../地点/古城4x/6-4-1/古城戏.ts';
import { RAMP_SEC, runCadence, runPoseAt } from '@库/角色/跑步.ts';
import * as K8 from '../../地点/古城4x/6-4-8/编排.ts';
import * as geom from '../../场/7-收场/7-4-1/几何.ts';
import * as X741 from '../../场/7-收场/7-4-1/戏.ts';
import * as K741 from '../../场/7-收场/7-4-1/编排.ts';
import { baseSpeed } from '../../地点/古城4x/布局.ts';

export const FPS = geom.FPS;
const secOf = (f: number) => f / FPS;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const rampIn = (f: number, a: number, b: number) => ss((f - a) / (b - a));
// 0 → 1 → 0 的一下（a 起、b 落回）
const bump = (f: number, a: number, b: number) => (f <= a || f >= b ? 0 : Math.sin((Math.PI * (f - a)) / (b - a)));
const nearestYaw = (a: number, b: number) => a + ((((b - a + 540) % 360) + 360) % 360) - 180;
const yawFromTo = (from: V3, to: V3) => yawTo(to[0] - from[0], to[1] - from[1]);

// ---------- 镜 1：岛上得意（7-4-1 硬切过来） ----------
export const shot1aEnd = 24; // 刘心忠举杖：起 4 帧、举 12 帧、举着停 8 帧
export const shot1End = shot1aEnd + 22; // 黄叛举拳：起 2 帧、举 10 帧、举着停 10 帧
// 镜 1 的剧情时刻（7-4-1/戏.ts 的时间轴）：第 0 帧是 7-4-1 末帧的下一帧，不共用帧
const T741End = K741.storyT(K741.END - 1);
export const T12 = (f: number) => T741End + (f + 1) / FPS;

// ---------- 开箱和振动链（镜 2） ----------
export const lidOpenFrame = shot1End + 18;
export const lidOpenSec = lidOpenFrame / FPS;
// 刘心忠开 #213：开盖、已开贴图都由画布按 模型/物品/箱子.tsx 算（用户 10-20：「这边打开箱子以后 箱子应该变白」）
export const chestOpenAt = (f: number): ChestOpening => ({ 号: geom.chest.号, 开: lidOpenSec, 秒: secOf(f) });
const tickSec = 1 / 20;
const blockCenter = ([x, y, z]: V3): V3 => toScene(x + 0.5, y + 0.5, z + 0.5);
export const blockBottomCenter = ([x, y, z]: V3): V3 => toScene(x + 0.5, y, z + 0.5);
const flightTicks = (a: V3, b: V3) => Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
export const chestCenter: V3 = blockCenter(geom.chest.block);
// 龛里全部的感测体、尖啸体（读城.py 读的新世界，工具/古城4x布局/方块.py 查）：7-4-1/几何.ts 只列了地台上的三个感测体、两个尖啸体，
// 西墙头还有两个感测体 (-713,-45,196)、(-713,-45,198)，地台上还有尖啸体 (-710,-49,199)、西墙头上一个 (-713,-46,199)，都在箱子 8 格内
export const sensors: V3[] = [...geom.sensors, [-713, -45, 196], [-713, -45, 198]];
export const shriekers: V3[] = [...geom.shriekers, [-710, -49, 199], [-713, -46, 199]];
type Vibration = { from: V3; to: V3; t: number };
// 照 6-4-2/编排.ts 的 声音链：感测体都在 8 格内、中间没有羊毛挡，各自飞 floor(距离) 刻激活；每个尖啸体收最早到的那一下咔嗒（8 格内）
const chain = (() => {
  const vibrations: Vibration[] = [];
  const activateSecs = sensors.map((sensor) => {
    const to = blockCenter(sensor);
    vibrations.push({ from: chestCenter, to, t: lidOpenSec });
    return lidOpenSec + flightTicks(chestCenter, to) * tickSec;
  });
  const clicks = sensors.map((b, i) => ({ t: activateSecs[i], p: blockCenter(b) }));
  const receivedSecs = shriekers.map((shrieker) => {
    const to = blockCenter(shrieker);
    const distTo = (e: { p: V3 }) => Math.hypot(to[0] - e.p[0], to[1] - e.p[1], to[2] - e.p[2]);
    const first = clicks.filter((e) => distTo(e) <= 8).sort((a, c) => a.t - c.t || distTo(a) - distTo(c))[0];
    vibrations.push({ from: first.p, to, t: first.t });
    return first.t + flightTicks(first.p, to) * tickSec;
  });
  return { vibrations, activateSecs, receivedSecs };
})();
export const vibrations = chain.vibrations;
export const activateSecs = chain.activateSecs;
// 感测体触须的钟（幽匿感测体.tsx）：加 32 秒免得负数
export const sensorClock = (f: number) => secOf(f) + 32;

// ---------- 四只监守者 ----------
// 落点：尖啸体召唤时落在它周围水平 ±5 格、上下 ±6 格内能站下监守者（0.9 × 2.9）的实心地面上（SpawnUtil.trySpawnMob，见 6-4-8 文件头），
//   四个点都用 方块.py 的 can_stand(…, 3) 核过、离马和黄叛 3 格以上。格 = 脚底那一格（游戏坐标），画在格中心。
// 叫的先后：第一声在最早收到咔嗒的那一刻，后面三声按 隔 错开（钻出也就错开同样的秒数）。
const wardenPlans = [
  { 名: '龛口东', 尖啸体: 0, 格: [-704, -51, 196] as V3, 隔: 0 }, // 原来那一只：龛口外东边的地上，比地台低两格
  { 名: '箱前', 尖啸体: 3, 格: [-711, -49, 197] as V3, 隔: 0.6 }, // 龛里、箱子跟前（刘心忠刚伸手的地方），西墙头那个尖啸体召的
  { 名: '马前', 尖啸体: 2, 格: [-712, -49, 200] as V3, 隔: 1.1 }, // 龛里西南角，马头前面不到 3 格
  { 名: '南墙外', 尖啸体: 1, 格: [-709, -51, 204] as V3, 隔: 1.7 }, // 龛南墙外的地上，二人逃跑的路西边 5 米
];
const firstShriekSec = Math.min(...wardenPlans.map((w) => chain.receivedSecs[w.尖啸体]));
// 面朝二人中间（实体正面 −Y，转 θ + 90°）
const pairMid: V3 = [(geom.horseChestSpot[0] + geom.huangPanChestSpot[0]) / 2, (geom.horseChestSpot[1] + geom.huangPanChestSpot[1]) / 2, 0];
export const wardens = wardenPlans.map((plan) => {
  const shriekSec = Math.max(chain.receivedSecs[plan.尖啸体], firstShriekSec + plan.隔);
  const emergeFrame = Math.round((shriekSec + 0.75) * FPS);
  const p = toScene(plan.格[0] + 0.5, plan.格[1], plan.格[2] + 0.5);
  // 游戏时间（驱动待机晃动、心跳发光）：让第一下心跳落在钻出后 1 秒（心跳整 2 秒一次，见 6-4-8 声音.tsx）
  const gameSecOffset = (((2 - ((31 + emergeFrame / FPS) % 2)) % 2) + 2) % 2;
  return {
    名: plan.名,
    p,
    shrieker: shriekers[plan.尖啸体],
    shriekP: blockBottomCenter(shriekers[plan.尖啸体]),
    shriekSec,
    emergeFrame,
    standUpFrame: emergeFrame + K8.emergeDurationSec * FPS,
    yaw: (Math.atan2(pairMid[1] - p[1], pairMid[0] - p[0]) * 180) / Math.PI + 90,
    gameSecOffset,
  };
});
export type WardenPlan = (typeof wardens)[number];
export const emergeSecAt = (w: WardenPlan, f: number) => (f - w.emergeFrame) / FPS; // 开始钻出以后过了几秒（画面时间）
export const debrisSec = K8.crumbSec;
export const wardenGameSec = (w: WardenPlan, f: number) => 30 + secOf(f) + w.gameSecOffset;
export const wardenState = (w: WardenPlan, frame: number) => {
  const t = emergeSecAt(w, frame);
  const emergeT = t * K8.emergeSpeedup;
  const tendril = t > K8.emergeDurationSec + 0.1 ? Math.max(0, 1 - (t - K8.emergeDurationSec - 0.1) / 0.5) : 0;
  return { 秒: wardenGameSec(w, frame), 钻出: emergeT <= WARDEN.emergeSec ? Math.max(0, emergeT) : undefined, 触角: tendril, 头偏: 0, headPitch: emergeT > WARDEN.emergeSec ? 8 : 0 };
};
const [wA, wB, wC] = wardens;

// ---------- 剪辑点 ----------
export const shot2aEnd = wA.emergeFrame - 3; // 第一只钻出前切到它身后
export const shot2End = wB.emergeFrame + 10; // 第二只手撑出地面、二人一激灵的当口切反打
export const eyeContactStart = wC.emergeFrame + 8; // 第三只冒头，二人对看一眼
export const eyeContactEnd = eyeContactStart + 9;
export const turnAwayStart = eyeContactEnd + 2;
export const shot3End = turnAwayStart + 9; // 马原地拧过去的当口切逃跑
export const END = shot3End + 26;
export const shotIndex = (f: number) => (f < shot1End ? 1 : f < shot2End ? 2 : f < shot3End ? 3 : 4);

// ---------- 二人 ----------
const horseChestYaw = yawFromTo(geom.horseChestSpot, chestCenter);
const huangChestYaw = yawFromTo(geom.huangPanChestSpot, chestCenter);
// 镜 1：他还站在传送门顶上，面朝它倒下的地方
const huangPanIslandFeet = X741.huangFeet(T12(0));
const huangPanGazeYaw = yawFromTo(huangPanIslandFeet, X741.deathPos());
// 反应（人的反应时间 0.25 秒，同 6-4-8）：第一只手撑出地面（钻出后 0.14 秒）后转头看、身子一缩；第二只就在箱子跟前，手一出来就一激灵
const lookAFrame = wA.emergeFrame + 0.14 * FPS;
const flinchAFrame = wA.emergeFrame + 0.39 * FPS;
const startleBFrame = wB.emergeFrame + 0.3 * FPS;
// 马受惊：第二只手撑出地面后 0.1 秒（马比人快），头往上一甩、往左后方（离开箱子）退 0.8 格、身子往左拧 25°
const spookFrame = wB.emergeFrame + 0.24 * FPS;
const spookSec = 0.45;
const horseBackDir: V3 = (() => {
  const dx = geom.horseChestSpot[0] - chestCenter[0];
  const dy = geom.horseChestSpot[1] - chestCenter[1];
  const n = Math.hypot(dx, dy);
  return [dx / n, dy / n, 0];
})();
const horseSpookPos = (frame: number): V3 => {
  const k = rampIn(frame, spookFrame, spookFrame + spookSec * FPS) * 0.8;
  return [geom.horseChestSpot[0] + horseBackDir[0] * k, geom.horseChestSpot[1] + horseBackDir[1] * k, geom.horseChestSpot[2]];
};
const horseSpookYaw = (frame: number) => horseChestYaw + 25 * rampIn(frame, spookFrame, spookFrame + spookSec * FPS) + 8 * bump(frame, spookFrame, spookFrame + 8);
// 逃跑路线（游戏坐标，脚底）：出龛口往东跳下地台（高两格）、拐向南边过道（x −702～−701 往南到 z 235 是通的，二人进来走的就是这条；z 236～242 横着一座小亭子，跑到它跟前停住）
const along = (pts: V3[], dist: number): { p: V3; yaw: number } => {
  let rem = Math.max(0, dist);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (rem <= len || i === pts.length - 2) {
      const k = Math.min(1, rem / len);
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], yaw: yawTo(b[0] - a[0], b[1] - a[1]) };
    }
    rem -= len;
  }
  return { p: pts[0], yaw: 0 };
};
const horseFleeFrom = horseSpookPos(turnAwayStart);
// 地台东沿在 x = -705：马身子整个过了沿再往下落两格（不斜着穿地台边）；龛口南角 (-705,-49,201)、(-706,-48,201) 有两块石头，贴北边走；
// 往南从柱子 (-702,201) 西边那条缝（x -704～-702）穿过去；进南过道（x -702～-701）前先摆到过道正中，不蹭西边墙角
// 南过道里有感测体 (-702,219)、(-701,224) 和催化体 (-701,226)：过了 z 216 那排幽匿块马才靠东走，踩上感测体、催化体顶过去；黄叛贴东边走（x -700 那一列）
const horseFleePath: V3[] = [horseFleeFrom, toScene(-705.8, -49, 199.3), toScene(-704.0, -49, 199.9), toScene(-703.3, -51, 200.9), toScene(-703.1, -51, 202.6), toScene(-702.0, -51, 204.6), toScene(-701.1, -51, 206.2), toScene(-701.0, -51, 208), toScene(-701.0, -51, 217.0), toScene(-700.3, -51, 219.3), toScene(-700.3, -51, 222.0), toScene(-700.3, -50, 223.5), toScene(-700.3, -50, 227.8), toScene(-700.3, -51, 229.0), toScene(-700.3, -51, 234.5)];
// 黄叛一激灵往后（东边）退半步，掉头跟在马后面跑
const huangBackStep: V3 = [0.45, 0.1, 0]; // 场景坐标：往东、略往北
const huangFleeStart = turnAwayStart + 3;
const huangFleeFrom: V3 = [geom.huangPanChestSpot[0] + huangBackStep[0], geom.huangPanChestSpot[1] + huangBackStep[1], geom.huangPanChestSpot[2]];
const huangFleePath: V3[] = [huangFleeFrom, toScene(-705.2, -49, 198.3), toScene(-704.7, -49, 198.7), toScene(-704.1, -51, 199.3), toScene(-702.6, -51, 203.2), toScene(-701.4, -51, 206.6), toScene(-701.6, -51, 216.0), toScene(-699.6, -51, 218.4), toScene(-699.6, -51, 232.5)];
const pathLen = (pts: V3[]) => pts.slice(1).reduce((sum, b, i) => sum + Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]), 0);
const horseFleeLen = pathLen(horseFleePath);
const huangFleeLen = pathLen(huangFleePath);
// 起步：先拧身 0.2 秒，之后 `RAMP_SEC` 加速到 v（马 50、人 30 米/秒，用户 10-18 定）；跑到路尽头前 `RAMP_SEC` 刹住（都已经跑出镜 4 的画面）
const fleeDist = (frame: number, start: number, speed: number, len: number) => {
  const t = Math.max(0, (frame - start) / FPS - 0.2);
  const d = t < RAMP_SEC ? (speed * t * t) / (2 * RAMP_SEC) : speed * (t - RAMP_SEC / 2);
  const brake = (RAMP_SEC / 2) * speed;
  if (d <= len - brake) return d;
  const left = Math.max(0, 1 - (d - (len - brake)) / (2 * brake));
  return len - brake * left * left;
};
const horseTurnSec = 0.35;
export const horseState = (frame: number) => {
  if (shotIndex(frame) === 1) {
    const h = X741.horseState(T12(frame));
    return { p: h.p, yaw: h.yaw, entityYaw: h.entityYaw, 行走: h.行走 as { 相位: number; 幅度: number } | undefined, 头偏: 0, headPitch: 0, 人立: h.人立 };
  }
  // 受惊：头往上一甩（马头 xRot 30° 往回收）、之后一直昂着；退步时腿小步倒腾
  const headToss = -35 * bump(frame, spookFrame, spookFrame + 10) - 15 * rampIn(frame, spookFrame + 4, spookFrame + 12);
  if (frame < turnAwayStart) {
    const shuffling = frame >= spookFrame && frame < spookFrame + spookSec * FPS + 3;
    const yaw = horseSpookYaw(frame);
    return { p: horseSpookPos(frame), yaw, entityYaw: yaw + 180, 行走: shuffling ? { 相位: (frame - spookFrame) * 1.2, 幅度: 0.35 } : undefined, 头偏: 0, headPitch: headToss };
  }
  const dist = fleeDist(frame, turnAwayStart, baseSpeed.马, horseFleeLen);
  const at = along(horseFleePath, dist);
  const fromYaw = horseSpookYaw(turnAwayStart);
  const yaw = fromYaw + (nearestYaw(fromYaw, at.yaw) - fromYaw) * rampIn(frame, turnAwayStart, turnAwayStart + horseTurnSec * FPS);
  return { p: at.p, yaw, entityYaw: yaw + 180, 行走: { 相位: (frame - turnAwayStart) * (20 / FPS) + dist * 2, 幅度: Math.min(1, 0.4 + dist) }, 头偏: 0, headPitch: -15 + 15 * rampIn(frame, turnAwayStart, turnAwayStart + 10) };
};
export const liuXinzhongPose = (frame: number): FigurePose => {
  const horse = horseState(frame);
  if (shotIndex(frame) === 1) {
    // 举杖（镜 1a 开头 4 帧起举，0.5 秒举到头顶）：马已经勒过来朝着它倒下的地方（7-4-1/戏.ts），头微仰
    const raise = rampIn(frame, 4, 16);
    return ridePose(horse, { pitch: 4, armR: 36 + 130 * raise, headPitch: 4 + 10 * raise });
  }
  // 探身开箱：开盖前 0.4 秒往前探、右手往前伸，开着以后收回一半
  const lean = rampIn(frame, lidOpenFrame - 10, lidOpenFrame - 2) * (1 - 0.5 * rampIn(frame, lidOpenFrame + 8, lidOpenFrame + 20));
  // 第一只：头往右后扭过去看（它在马的右后方、低两格），身子一缩；第二只（正前方箱子跟前）：头猛地扭回来，一激灵往后仰、杖横到身前
  const lookA = rampIn(frame, lookAFrame, lookAFrame + 0.4 * FPS);
  const lookAYaw = Math.max(-75, nearestYaw(horse.yaw, yawFromTo(horse.p, wA.p)) - horse.yaw);
  const flinchA = bump(frame, flinchAFrame, flinchAFrame + 8) * 0.6;
  const lookB = rampIn(frame, startleBFrame - 3, startleBFrame + 2);
  const lookBYaw = Math.max(-75, Math.min(75, nearestYaw(horse.yaw, yawFromTo(horse.p, wB.p)) - horse.yaw));
  const startle = rampIn(frame, startleBFrame, startleBFrame + 0.3 * FPS);
  const eyeContact = rampIn(frame, eyeContactStart, eyeContactStart + 4) * (1 - rampIn(frame, eyeContactEnd, eyeContactEnd + 3));
  const eyeContactYaw = Math.max(-75, Math.min(75, nearestYaw(horse.yaw, yawFromTo(horse.p, huangPanAt(frame))) - horse.yaw));
  const turnAway = rampIn(frame, turnAwayStart, turnAwayStart + 6);
  let headYaw = lookAYaw * lookA;
  headYaw += (lookBYaw - headYaw) * lookB;
  headYaw += (eyeContactYaw - headYaw) * eyeContact;
  headYaw *= 1 - turnAway;
  return ridePose(horse, {
    pitch: -18 * lean + 5 * flinchA + 10 * startle * (1 - turnAway) - 14 * turnAway,
    armR: 36 + 40 * lean + 50 * startle * (1 - turnAway),
    armL: 36 - 10 * startle,
    headYaw,
    headPitch: -10 * lean + 6 * startle,
    twist: headYaw * 0.3,
  });
};
// 黄叛脚底（逃跑前：一激灵退半步）
function huangPanAt(frame: number): V3 {
  if (frame >= huangFleeStart) return along(huangFleePath, fleeDist(frame, huangFleeStart, baseSpeed.人, huangFleeLen)).p;
  const k = rampIn(frame, startleBFrame, startleBFrame + 0.3 * FPS);
  return [geom.huangPanChestSpot[0] + huangBackStep[0] * k, geom.huangPanChestSpot[1] + huangBackStep[1] * k, geom.huangPanChestSpot[2]];
}
export const huangPanPose = (frame: number): FigurePose => {
  if (shotIndex(frame) === 1) {
    // 还面朝它倒下的地方，垂下弓、右手举拳（镜 1b 开头 2 帧起举）
    const raise = rampIn(frame, shot1aEnd + 2, shot1aEnd + 12);
    return { ...standPose(huangPanIslandFeet), yaw: huangPanGazeYaw, armL: 20, armLRoll: 4, armR: 15 + 160 * raise, armRRoll: 6 + 19 * raise, elbowR: 20 * raise, headPitch: 10 * raise };
  }
  const pos = huangPanAt(frame);
  // 第一只：转过身去看它（0.6 秒）、一缩；第二只：身子猛地扭回箱子那边，一激灵退半步、握弓的左手抬到身前
  const lookA = rampIn(frame, lookAFrame, lookAFrame + 0.6 * FPS);
  const flinchA = bump(frame, flinchAFrame, flinchAFrame + 8) * 0.6;
  const lookB = rampIn(frame, startleBFrame - 2, startleBFrame + 4);
  const startle = rampIn(frame, startleBFrame, startleBFrame + 0.3 * FPS);
  const eyeContact = rampIn(frame, eyeContactStart, eyeContactStart + 4) * (1 - rampIn(frame, eyeContactEnd, eyeContactEnd + 3));
  const yawA = nearestYaw(huangChestYaw, yawFromTo(geom.huangPanChestSpot, wA.p));
  const yawB = nearestYaw(yawA, yawFromTo(geom.huangPanChestSpot, wB.p));
  let yaw = huangChestYaw + (yawA - huangChestYaw) * lookA;
  yaw += (yawB - yaw) * lookB;
  const eyeContactYaw = nearestYaw(yaw, yawFromTo(pos, horseState(frame).p));
  yaw += (eyeContactYaw - yaw) * eyeContact * 0.4;
  const headYaw = Math.max(-70, Math.min(70, (eyeContactYaw - yaw) * eyeContact));
  if (frame >= huangFleeStart) {
    const dist = fleeDist(frame, huangFleeStart, baseSpeed.人, huangFleeLen);
    const at = along(huangFleePath, dist);
    const turn = rampIn(frame, huangFleeStart, huangFleeStart + 0.35 * FPS);
    const runYaw = yaw + (nearestYaw(yaw, at.yaw) - yaw) * turn;
    // 摆腿相位 = ∫步频（模型/角色/跑步.ts，步频封顶、快了靠步子大）；拧身那 0.35 秒腿先小步倒腾起来
    let cycles = 0;
    for (let f = huangFleeStart; f < frame; f++) cycles += runCadence((fleeDist(f + 1, huangFleeStart, baseSpeed.人, huangFleeLen) - fleeDist(f, huangFleeStart, baseSpeed.人, huangFleeLen)) * FPS) / FPS;
    const speed = (fleeDist(frame + 1, huangFleeStart, baseSpeed.人, huangFleeLen) - dist) * FPS;
    const run = runPoseAt(pos, runYaw, cycles, speed);
    const k = Math.min(1, turn * 1.5);
    return { ...run, legR: run.legR * k, legL: run.legL * k, armR: run.armR * k, armL: 30 };
  }
  return {
    ...standPose(pos),
    yaw,
    headYaw,
    headPitch: -8 + 4 * flinchA + 6 * startle,
    pitch: 3 * flinchA + 6 * startle,
    armL: 20 + 10 * flinchA + 30 * startle,
    armLRoll: 4,
    armR: 12 + 20 * startle,
    armRRoll: 6,
    legR: -18 * bump(frame, startleBFrame, startleBFrame + 0.3 * FPS),
  };
};

// ---------- 机位 ----------
// 镜 1a：台面上马的正前方（它倒下的那边，西北）4.6 米、比马背高 2 格往下看（马前头是岛上高一截的墙，再低就挡住马身），回看刘心忠举杖
const horseIsland = X741.horseState(T12(0));
const liuFwd: V3 = [-Math.sin((horseIsland.yaw * Math.PI) / 180), Math.cos((horseIsland.yaw * Math.PI) / 180), 0];
const liuChest: V3 = [horseIsland.p[0], horseIsland.p[1], horseIsland.p[2] + 2.4];
const shot1aCam: Cam = { pos: [liuChest[0] + liuFwd[0] * 4.6 + liuFwd[1] * 1.4, liuChest[1] + liuFwd[1] * 4.6 - liuFwd[0] * 1.4, liuChest[2] + 1.6], tgt: [liuChest[0], liuChest[1], liuChest[2] + 0.1], lens: 28 };
// 镜 1b：黄叛右前方 4.3 米、和胸口差不多高（再低就贴着门顶沿），看点在胸口上方（举起的拳头在画里）；举拳那只手（右手）朝着镜头这边，roll 往外张，不和头叠在一起
const huangPanChest: V3 = [huangPanIslandFeet[0], huangPanIslandFeet[1], huangPanIslandFeet[2] + 1.3];
const huangPanForward: V3 = [-Math.sin((huangPanGazeYaw * Math.PI) / 180), Math.cos((huangPanGazeYaw * Math.PI) / 180), 0];
const shot1bCam: Cam = {
  pos: [huangPanChest[0] + huangPanForward[0] * 4.0 + huangPanForward[1] * 1.6, huangPanChest[1] + huangPanForward[1] * 4.0 - huangPanForward[0] * 1.6, huangPanChest[2] + 0.1],
  tgt: [huangPanChest[0], huangPanChest[1], huangPanChest[2] + 0.6],
  lens: 26,
};
// 机位都用 工具/古城4x布局/方块.py 的视线查过（人、各只监守者的脚、腰、头到镜头不被方块挡）。
// 镜 2a：龛口外东边、比地台高 3 格往西看进龛里：开盖、咔嗒、尖啸（马、箱子、感测体、尖啸体都在画面里）
const shot2aCam: Cam = { pos: toScene(-700.3, -45.8, 199.6), tgt: toScene(-708.5, -48.2, 198.4), lens: 22 };
// 镜 2b：第一只钻出前 3 帧硬切到它身后、离地 2 格往西看：它在画面右下方破土爬出来（背对镜头），二人隔着它扭头朝镜头这边看，第二只在他们后面箱子跟前冒头；慢慢推近一点
const shot2bCam: Cam = { pos: toScene(-700.4, -49.0, 197.8), tgt: toScene(-707.0, -49.2, 198.4), lens: 18 };
const shot2bEndCam: Cam = { pos: toScene(-700.6, -49.0, 197.8), tgt: toScene(-707.0, -49.1, 198.4), lens: 21 };
// 镜 3：从镜 2b 往前推进到龛口、比地台高 2.4 格往西看：刘心忠骑马在画面左边、黄叛在右边背对镜头，中间后面是尖啸体和箱子，
//   第二只在箱子跟前站起来、第三只在马头前钻出来；马受惊往后退，二人对看一眼、往镜头这边（东）掉头。第一只在镜头右后方，不入画
const shot3Cam: Cam = { pos: toScene(-703.2, -46.6, 198.8), tgt: toScene(-708.6, -47.5, 199.5), lens: 17 };
// 镜 4：南边过道口北边、比地面高 6.5 格往西北俯看（院墙在镜头身后，不入画）：马冲下地台朝镜头跑来、从镜头底下过，黄叛跟着；第四只在画面左边路旁钻出来，
//   第一只在右边地上、第二、三只在龛里
const shot4Cam: Cam = { pos: toScene(-700.3, -44.5, 205.3), tgt: toScene(-704.6, -48.6, 200.9), lens: 20 };
const lerpCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3,
  tgt: a.tgt.map((v, i) => v + (b.tgt[i] - v) * k) as V3,
  lens: a.lens + (b.lens - a.lens) * k,
});
export const camera = (frame: number): Cam => {
  const k = shotIndex(frame);
  if (k === 1) return frame < shot1aEnd ? shot1aCam : shot1bCam;
  if (k === 2) return frame < shot2aEnd ? shot2aCam : lerpCam(shot2bCam, shot2bEndCam, sample([[shot2aEnd, 0], [shot2End, 1]] as Key[], frame));
  if (k === 3) return shot3Cam;
  return shot4Cam;
};
