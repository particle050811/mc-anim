// 6-4-9 Warden：全部时间轴和机位，纯函数，输入段内秒 t（0 起；第 7 章还在用的帧号接口见文件末）。场景、站位同 6-4-8（../古城4x布局.ts 的场子、../6-4-8/编排.ts、../6-4-8/二人.ts）；机位按监守者自己的朝向取（前、右、离地，见 `wardenLocal`），监守者面朝东、二人在它东边。
// 用户 10-19 嫌原来八镜 11 秒「完全是站桩展示」：缩到 6 秒，监守者特写只留三个（大口、心脏、触角），各零点几秒；二人一直在动（举着家伙一小步一小步横挪、各往外绕着逼近找位置），
//   吼的起势直接切到吼声出来那一刻的全景，全景不等吼完（吼到一半接 7-1-1，7-1/戏/监守者.ts 接着放吼叫动画、7-1/声音.tsx 接着放吼声）。
// 振动、怒气照原版（`VibrationSystem`、`Warden`）：脚步落地那刻发出，按 1 格/刻（取整）飞到监守者眼睛（离地 2.5）；听到一下以后 40 刻（`VIBRATION_COOLDOWN`）不再听，冷却里的脚步不算；
//   每听到一下怒气 +35，三下过 80 就吼（6-4-8 刘心忠那一踏是第一下）。吼叫 ROAR 4.2 秒、第 25 刻出声。听到第三下到起吼隔 5 刻（大脑换到 ROAR 活动）。
// 心跳（照原版，见 模型/角色/监守者.tsx 文件头）：游戏时间整 2 秒那刻跳（不生气的 40 刻）；怒气上来 getHeartBeatDelay 会变短，这里没做（同 6-4-8、7-1）。
import { type Key, sample, sampleV, type VKey } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { WARDEN } from '@库/生物/监守者.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { bowTextureFor } from '@库/物品/弓.tsx';
import { nearYaw, snapSec } from '../6-4-1/古城戏.ts';
import * as K648 from '../6-4-8/编排.ts';
import { bump, crouchBy, elevationTo, endSpots, hopTo, huangAimPose, liuGuardPose, rampIn, stepLeg, yawToWarden } from '../6-4-8/二人.ts';
import { smoothstep01, lerp } from '@engine/core/数学.ts';
import type { Cam } from '@engine/core/机位.ts';

// ---------- 接 6-4-8 ----------
// 本段 0 秒 = 6-4-8 末帧；二人的喘气、晃动接着 6-4-8 的秒走
const sec648 = (t: number) => K648.lastSec + t;
export const gameSec0 = K648.warden(K648.lastSec).秒;
export const WARDEN_AT = K648.WARDEN_AT;
export const WARDEN_YAW = K648.WARDEN_YAW;

// ---------- 二人走位 ----------
// 吼声出来以前站在 `endSpots`（7-1-1 首帧的站位）往监守者那边 0.6 格的地方，吼声一到被顶得往后退一步，回到 endSpots。
const towardWarden = (p: V3, d: number): V3 => {
  const dx = WARDEN_AT[0] - p[0];
  const dy = WARDEN_AT[1] - p[1];
  const n = Math.hypot(dx, dy);
  return [p[0] + (dx / n) * d, p[1] + (dy / n) * d, p[2]];
};
const preRoar = { 刘: towardWarden(endSpots.刘, 0.6), 黄: towardWarden(endSpots.黄, 0.6) };
// 从 6-4-8 急退的落点（`hopTo`）挪到 preRoar：各往外绕（刘心忠往北、黄叛往南，二次曲线的控制点往外挪这么多格，场景 y = 北）。
// 黄叛南边 (−865～−864, −51, 226) 是凸起的深板岩，不能再往南（工具/古城4x布局/方块.py 查过，路上全是平的幽匿地）
const bulge = { 刘: 1.2, 黄: -0.8 };
const pathAt = (who: '刘' | '黄', k: number): V3 => {
  const p0 = hopTo[who];
  const p2 = preRoar[who];
  const c = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2 + bulge[who]];
  const u = 1 - k;
  return [u * u * p0[0] + 2 * u * k * c[0] + k * k * p2[0], u * u * p0[1] + 2 * u * k * c[1] + k * k * p2[1], p2[2]];
};
// 横挪的步子：[起秒]，每步 5/12 秒；一直在挪（步与步之间停 0.2～0.33 秒）。落地时刻决定监守者哪一刻听到（见 `tendrilSecs`），改步子要回头看那里的检查
const STEP_SEC = 5 / 12;
const approachStarts = { 刘: [1 / 8, 19 / 24, 3 / 2, 13 / 6, 35 / 12, 29 / 8], 黄: [3 / 8, 13 / 12, 7 / 4, 5 / 2, 77 / 24, 47 / 12] };
const approachLegs = { 刘: ['L', 'R', 'L', 'R', 'L', 'R'], 黄: ['R', 'L', 'R', 'L', 'R', 'L'] } as const;
type Step = { a: number; b: number; from: V3; to: V3; leg: 'R' | 'L'; amp: number };
const approachSteps = (who: '刘' | '黄'): Step[] => {
  const n = approachStarts[who].length;
  return approachStarts[who].map((a, i) => ({ a, b: a + STEP_SEC, from: pathAt(who, i / n), to: pathAt(who, (i + 1) / n), leg: approachLegs[who][i], amp: who === '刘' && approachLegs[who][i] === 'R' ? 0.6 : 1 }));
};

// ---------- 振动 → 听到 → 吼 ----------
const wardenEar: V3 = [WARDEN_AT[0], WARDEN_AT[1], WARDEN_AT[2] + 2.5];
const lastHeard648 = K648.emergeStartSec + K648.tendrilSec - K648.lastSec; // 6-4-8 刘心忠那一踏（本段秒，负的）
const cooldownSec = 2; // 40 刻
const heardFrom = (steps: Step[]) => {
  const arrivals = steps.map((s) => snapSec(s.b + Math.floor(Math.hypot(s.to[0] - wardenEar[0], s.to[1] - wardenEar[1], s.to[2] - wardenEar[2])) / 20)).sort((a, b) => a - b);
  const heard: number[] = [];
  let last = lastHeard648;
  for (const a of arrivals) if (a >= last + cooldownSec - 1e-9) heard.push((last = a));
  return heard;
};
const approachHeard = heardFrom([...approachSteps('刘'), ...approachSteps('黄')]);
// 第三下（本段第二下）听到后 5 刻起吼，第 25 刻（1.25 秒）出声、往前一扑
// 往上取整到 1/24 秒的格暂时留着：去掉（真值 3.7667 秒本来就在 1/60 秒上）吼、全景切点、段尾都提前 1/40 秒，6-贪功钻出Warden 段长和吼声 cue 跟着改，
// 第 7 章 7-1 按帧接的 `END` 也从 145 帧变 144 帧，要等第 7 章改按秒、用户定了再动
export const roarStart = Math.ceil((approachHeard[1] + 5 / 20) * 24 - 1e-9) / 24;
export const roarSoundSec = roarStart + 1.25;

// ---------- 镜头切点（秒） ----------
// 1 接 6-4-8 末帧机位（二人开始横挪）→ 2 大口 → 3 二人（画外咔嗒：第二下）→ 4 心脏（心跳）→ 5 触角（第三下：抖、亮、咔嗒，头一仰起吼）→ 6 吼的起势 → 7 全景（吼声出来那一刻切）
export const shot1End = 7 / 12; // 6-4-8 钻出声的尾巴在这一镜末尾淡完
const shotMouthEnd = 5 / 4;
const shotPairEnd = 29 / 12;
const shotHeartEnd = 25 / 8;
const shotTendrilEnd = roarStart + 1 / 4;
export const wideStart = roarSoundSec;
// 全景 1 秒（吼到 2.25 秒），7-1-1 接着吼完
export const durationSec = wideStart + 1;
const lastSec = durationSec - 1 / 24; // 末帧（原来按 1/24 秒一格）

// 吼声一到压低身子往后退一步（0.3 秒）。压低是潜行（isSteppingCarefully），原版潜行走路不发振动（Entity.move 的 STEP 事件），这一步监守者听不到、也不放脚步声
const blastSteps = {
  刘: { a: wideStart, b: wideStart + 7 / 24, from: preRoar.刘, to: endSpots.刘, leg: 'R', amp: 0.6 } as Step,
  黄: { a: wideStart + 1 / 24, b: wideStart + 1 / 3, from: preRoar.黄, to: endSpots.黄, leg: 'L', amp: 0.8 } as Step,
};
export const steps = { 刘: [...approachSteps('刘'), blastSteps.刘], 黄: [...approachSteps('黄'), blastSteps.黄] };
// 听到的振动（秒）：每一下触角抖、亮、咔嗒
export const tendrilSecs: number[] = approachHeard;
// 落地有脚步声、发振动的步子（../6-4-9/声音.tsx）
export const audibleSteps = { 刘: approachSteps('刘'), 黄: approachSteps('黄') };

// ---------- 游戏时间、心跳 ----------
// 接着 6-4-8 走；切全景那下往回跳，让末帧还是 19.95 秒（7-1/戏/公用.ts 的 `gameSec` 从本段末帧接着走，第七章的心跳、斑纹不跟着挪）。硬切，看不出
const lastFrameGameSec = 19.95;
const wideSkipSec = lastFrameGameSec - (gameSec0 + lastSec);
export const gameClock = (t: number) => gameSec0 + t + (t >= wideStart ? wideSkipSec : 0);
const heartbeatIntervalSec = WARDEN.heartbeatTicks.calm / 20;
// 本段哪几秒心跳：游戏时间整 2 秒那一刻；切全景前后分开算
export const heartbeatSecs = (untilSec: number) => {
  const out: number[] = [];
  for (const [from, to, skip] of [
    [0, Math.min(wideStart, untilSec), 0],
    [wideStart, untilSec, wideSkipSec],
  ]) {
    const g0 = gameSec0 + skip;
    for (let k = Math.ceil((g0 + from) / heartbeatIntervalSec); k * heartbeatIntervalSec - g0 < to; k++) out.push(k * heartbeatIntervalSec - g0);
  }
  return out;
};

{
  // 第二下要落在二人那一镜里（画外咔嗒）、第三下在触角那一镜里，心跳在心脏那一镜里；改了步子或切点对不上就报错
  const [h2, h3] = tendrilSecs;
  const beatOk = heartbeatSecs(durationSec).some((b) => b > shotPairEnd + 1 / 8 && b < shotHeartEnd - 1 / 6);
  if (!(h2 > shotMouthEnd + 1 / 12 && h2 < shotPairEnd - 1 / 4) || !(h3 > shotHeartEnd + 1 / 12 && h3 < shotTendrilEnd - 1 / 3) || !beatOk)
    throw new Error(`6-4-9 振动、心跳和切点对不上：听到 ${tendrilSecs.map((x) => x.toFixed(3))} 秒，心跳 ${heartbeatSecs(durationSec).map((x) => x.toFixed(3))} 秒`);
}

// ---------- 二人姿势 ----------
const feetAt = (who: '刘' | '黄', t: number): V3 => {
  const list = steps[who];
  let feet = list[0].from;
  for (const s of list) {
    if (t >= s.b) feet = s.to;
    else if (t > s.a) {
      const k = smoothstep01((t - s.a) / (s.b - s.a));
      feet = [lerp(s.from[0], s.to[0], k), lerp(s.from[1], s.to[1], k), s.to[2]];
    }
  }
  return feet;
};
const stepOverlay = (pose: FigurePose, who: '刘' | '黄', t: number) => {
  for (const s of steps[who]) pose = stepLeg(pose, rampIn(t, s.a, s.b), s.leg, s.amp);
  return pose;
};
// 0 秒脚底在 `hopTo`，姿势零件、秒都和 6-4-8 一样，所以本段首帧 = 6-4-8 末帧
const yawAt = (feet: number[]) => nearYaw(K648.pursuers(K648.lastSec).刘.yaw ?? 0, yawToWarden(feet));
// 顶着吼声：吼声出来那刻（全景首帧）1/6 秒一缩、压低，撑到吼声弱下去（吼叫第 3 秒，已在 7-1-1 里）再慢慢起来。本段以后的时刻 7-1-1 开头也拿来用
const braceAt = (t: number) => smoothstep01(rampIn(t, wideStart, wideStart + 1 / 6)) * (1 - smoothstep01(rampIn(t, roarStart + 2.9, roarStart + 3.9)));
// 吼声刚到那一下往后一晃（0.3 秒）
const blastAt = (t: number) => bump(t, wideStart, wideStart + 0.3);
// 接 7-1-1：全景里头摆正（7-1/戏/刘心忠.ts 开头头偏按 0 起）
const handoffAt = (t: number) => smoothstep01(rampIn(t, wideStart + 1 / 6, durationSec - 1 / 8));
// 刘心忠摆架势：挪到一半把杖往前上方再送一截、身子拧过来一点（压上去），之后一直这么举着
const liuPressAt = (t: number) => smoothstep01(rampIn(t, 5 / 3, 31 / 12));
export const liuPoseAt = (t: number): FigurePose => {
  const s = sec648(t);
  const feet = feetAt('刘', t);
  let pose = liuGuardPose(feet, yawAt(feet), s, 1, elevationTo(feet, 2.6), 1);
  const press = liuPressAt(t);
  pose = { ...pose, armR: pose.armR + 14 * press, twist: (pose.twist ?? 0) + 6 * press, headYaw: pose.headYaw - 6 * press, pitch: pose.pitch - 3 * press };
  pose = stepOverlay(pose, '刘', t);
  const brace = braceAt(t);
  const blast = blastAt(t);
  pose = crouchBy(pose, 0.4 * brace);
  // 左小臂横到脸前挡、头一偏
  pose = { ...pose, armL: pose.armL + 50 * brace, armLRoll: pose.armLRoll - 14 * brace, pitch: pose.pitch + 7 * blast, headPitch: pose.headPitch - 10 * brace + 6 * blast, headYaw: pose.headYaw + 14 * brace };
  pose.headYaw = lerp(pose.headYaw, 0, handoffAt(t));
  return pose;
};
// 拉弓 0～1：6-4-8 落地以后拉满，吼声里撑不住松回（贴图回到没拉，箭还搭着、弓还举着），全景里松完，接 7-1-1 开头
export const bowDrawAt = (t: number) => 1 - smoothstep01(rampIn(t, wideStart + 0.2, wideStart + 0.8));
export const bowTextureAt = (t: number) => bowTextureFor(bowDrawAt(t) > 0.05, bowDrawAt(t));
// 7-1-1 开头黄叛的 headPitch（照 7-1/戏/黄叛.ts 站着那段：−(看监守者离地 1.5 那一点的仰角) × 0.7），末帧对上
const huangHandoffHeadPitch = (feet: number[]) => -Math.max(-35, Math.min(20, elevationTo(feet, 1.5))) * 0.7;
export const huangPoseAt = (t: number): FigurePose => {
  const s = sec648(t);
  const feet = feetAt('黄', t);
  const draw = bowDrawAt(t);
  let pose = huangAimPose(feet, yawAt(feet), s, 1, draw, elevationTo(feet, 2.6), 1);
  pose = stepOverlay(pose, '黄', t);
  const brace = braceAt(t);
  pose = crouchBy(pose, 0.35 * brace);
  pose = { ...pose, pitch: pose.pitch + 5 * blastAt(t), headPitch: pose.headPitch - 8 * brace };
  pose.headPitch = lerp(pose.headPitch, huangHandoffHeadPitch(feet), handoffAt(t));
  return pose;
};
export const pursuersAt = (t: number): { 刘: FigurePose; 黄: FigurePose } => ({ 刘: liuPoseAt(t), 黄: huangPoseAt(t) });

// ---------- 监守者 ----------
// 触角动画：听到那一刻 1，10 刻（0.5 秒）线性降到 0
export const tendrilAt = (t: number) => Math.max(0, ...tendrilSecs.map((h) => (t < h ? 0 : 1 - (t - h) / 0.5)));
// 吼叫动画放到第几秒（没在吼 = undefined）；7-1/戏/监守者.ts 用它接着放
export const roarAnimAt = (t: number) => {
  const sec = t - roarStart;
  return sec >= 0 && sec < WARDEN.roarSec ? sec : undefined;
};
// 头：一直跟着刘心忠（6-4-8 末尾就转过去了）、低头 12°；全景里摆正、回到 8°（7-1/戏/监守者.ts 开头头偏 0、headPitch 8）
export const wardenAt = (t: number) => {
  const h = handoffAt(t);
  return {
    秒: gameClock(t),
    tendril: tendrilAt(t),
    headYaw: K648.wardenHeadYawTo(liuPoseAt(t).loc) * (1 - h),
    headPitch: 12 - 4 * h,
    吼叫: roarAnimAt(t),
  };
};

// ---------- 机位 ----------
// 监守者自己的坐标系：前 = 它面朝的方向（朝着二人，东偏南一点），右 = 它的右手边（南），离地 = 脚底往上。
// 身上几处（站直）：胸口心脏离地 1.41、胸前在前 0.34；头中心离地 2.625、脸在前 0.31；左触角离中线 −0.5，离地 2.7～3.7。
const wardenPos = WARDEN_AT;
const forwardDir = [Math.sin((WARDEN_YAW * Math.PI) / 180), -Math.cos((WARDEN_YAW * Math.PI) / 180)];
const rightDir = [forwardDir[1], -forwardDir[0]];
export const wardenLocal = (right: number, forward: number, height: number): V3 => [wardenPos[0] + rightDir[0] * right + forwardDir[0] * forward, wardenPos[1] + rightDir[1] * right + forwardDir[1] * forward, wardenPos[2] + height];
// 人自己的坐标系（脚底、面朝 yaw）：前、右（他自己的右手）、离地
const personLocal = (feet: number[], yaw: number, right: number, forward: number, height: number): V3 => {
  const r = (yaw * Math.PI) / 180;
  const fwd = [-Math.sin(r), Math.cos(r)];
  const rt = [Math.cos(r), Math.sin(r)];
  return [feet[0] + fwd[0] * forward + rt[0] * right, feet[1] + fwd[1] * forward + rt[1] * right, feet[2] + height];
};
const pairMid = (t: number): V3 => {
  const a = feetAt('刘', t);
  const b = feetAt('黄', t);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2] + 1.25];
};
type Shot = { start: number; cam?: (t: number) => Cam; pos?: VKey[]; tgt?: VKey[]; lens?: Key[] };
const cam648 = K648.camera(K648.lastSec);
const towardPos = (from: V3, to: V3, d: number): V3 => {
  const v = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [from[0] + (v[0] / n) * d, from[1] + (v[1] / n) * d, from[2] + (v[2] / n) * d];
};
const shots: Shot[] = [
  {
    // 1 接 6-4-8 末帧机位：二人一左一右在前景下方开始横挪，镜头往前再推一点
    start: 0,
    pos: [[0, cam648.pos], [shot1End, towardPos(cam648.pos, cam648.tgt, 0.5)]],
    tgt: [[0, cam648.tgt], [shot1End, cam648.tgt]],
    lens: [[0, cam648.lens], [shot1End, cam648.lens + 2]],
  },
  {
    // 2 大口：脸的正前下方仰拍，慢慢推近（模型没有能张合的下巴，「张嘴」只靠推近仰看）
    start: shot1End,
    pos: [[shot1End, wardenLocal(-0.15, 2.05, 1.45)], [shotMouthEnd, wardenLocal(-0.13, 1.75, 1.58)]],
    tgt: [[shot1End, wardenLocal(-0.02, 0.3, 2.5)], [shotMouthEnd, wardenLocal(-0.02, 0.3, 2.5)]],
    lens: [[shot1End, 30], [shotMouthEnd, 32]],
  },
  {
    // 3 二人：监守者右前方、腰高，对着二人正脸，两人一北一南横着挪、往外绕；镜头跟着他们中点摇、往右平移一点
    start: shotMouthEnd,
    cam: (t) => {
      const k = (t - shotMouthEnd) / (shotPairEnd - shotMouthEnd);
      return { pos: wardenLocal(2.2 + 0.4 * k, 1.8, 1.15), tgt: pairMid(t), lens: 26 };
    },
  },
  {
    // 4 心脏：胸口正前方，慢慢往左扫
    start: shotPairEnd,
    pos: [[shotPairEnd, wardenLocal(0.1, 1.9, 1.4)], [shotHeartEnd, wardenLocal(-0.06, 1.85, 1.4)]],
    tgt: [[shotPairEnd, wardenLocal(-0.02, 0.3, 1.35)], [shotHeartEnd, wardenLocal(-0.02, 0.3, 1.35)]],
    lens: [[shotPairEnd, 30], [shotHeartEnd, 31]],
  },
  {
    // 5 触角：头的左侧（北边，离北墙还有 3 格），左触角整根在画面正中；听到第三下抖、亮，头往后一仰起吼
    start: shotHeartEnd,
    pos: [[shotHeartEnd, wardenLocal(-1.75, 0.3, 2.8)], [shotTendrilEnd, wardenLocal(-1.68, 0.34, 2.79)]],
    tgt: [[shotHeartEnd, wardenLocal(-0.5, 0, 3.2)], [shotTendrilEnd, wardenLocal(-0.5, 0, 3.2)]],
    lens: [[shotHeartEnd, 28], [shotTendrilEnd, 29]],
  },
  {
    // 6 吼的起势：刘心忠左后方 3.6 米、离地 1.3 仰拍（再近他的背占半个画面），监守者头锁着他、身子往后仰、两臂张开；慢慢往前推
    start: shotTendrilEnd,
    cam: (t) => {
      const feet = preRoar.刘;
      const yaw = yawAt(feet);
      const k = (t - shotTendrilEnd) / (wideStart - shotTendrilEnd);
      return { pos: personLocal(feet, yaw, -1.5, -3.6 + 0.4 * k, 1.3), tgt: wardenLocal(0, 0, 2.1), lens: 30 + 3 * k };
    },
  },
  {
    // 7 全景：吼声出来、往前一扑那一刻切过来。二人身后（东边 20 格、偏南 1.5 格），离地 2.9 格，不动
    start: wideStart,
    pos: [[wideStart, wardenLocal(1.5, 20, 2.9)]],
    tgt: [[wideStart, wardenLocal(-0.05, 0, 1.65)]],
    lens: [[wideStart, 34]],
  },
];
// 切点落在输出帧上时那一帧算下一镜
export const shotIndex = (t: number) => {
  let i = 0;
  while (i + 1 < shots.length && t >= shots[i + 1].start - 1e-9) i++;
  return i;
};
export const camera = (t: number): Cam => {
  const shot = shots[shotIndex(t)];
  if (shot.cam) return shot.cam(t);
  return { pos: sampleV(shot.pos!, t) as V3, tgt: sampleV(shot.tgt!, t) as V3, lens: sample(shot.lens!, t) };
};

// ---------- 第 7 章还按 1/24 秒一格的帧号取（7-1/几何.ts、7-1/戏.ts、7-1/戏/公用.ts），等第 7 章改按秒后删 ----------
export const PER_SEC_7 = 24;
export const END = Math.round(durationSec * PER_SEC_7);
export const pursuers = (f: number) => pursuersAt(f / PER_SEC_7);
export const warden = (f: number) => wardenAt(f / PER_SEC_7);
export const bowAt = (f: number) => bowTextureAt(f / PER_SEC_7);
export const gameSecAt = (f: number) => gameClock(f / PER_SEC_7);
export const roarAnimSec = (f: number) => roarAnimAt(f / PER_SEC_7);
