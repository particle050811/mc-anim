// 6-4-2 规矩（放大 4 倍的新城）：全部时间轴和机位，纯函数，输入本段剧情帧 `f`（0 起，24 帧/秒）。李樱一路的跳在 ../6-4-1/跳搭.ts（同一条剧情时间线）。
// 戏：跳切接 6-4-1（Q1～Q4 不演）：他从兵营南门外（Q4）一小跳翻进兵营、落在 #210 跟前的羊毛（`woolCFoot`）上，掀开战利品箱。
//   箱盖一开，6.4 米外感测体触须一抖，振动飞进紧挨着的尖啸体——尖啸，第一次警告。他扭身对着尖啸体定住。尖啸后 4.5 秒监守者低吼，黑暗效果落下，黑雾退开才转回去接着翻箱子——末帧是 6-4-3a 首帧的前一刻（契约 `lastFrame642`）。镜头 3 和 6-4-3a 的 A1 是一个不切的镜头，两段合成 6-4-2至3a（../6-4-2至3a/）。
//   转回箱子时弹出箱子界面，古城战利品一格一格 shift 点击拿走，跨进 6-4-3a 的 A1 拿完（用户 10-20：「这里应该显示拾取这个箱子里面的东西」，见「拾取」）。
//   用户 10-12 删了「满四次……」内心独白；剧情里照游戏等 4.5 秒、黑暗 13 秒（260 刻），剪辑里只留够看懂的几截（见「跳切」）。
// 帧号：`liying`、`camera`、`wool`、`keyMoments` 等全按本段「剧情帧」（不跳，0 = 跳搭.ts 的 `start642`）；成片帧 `f` 用 `toStoryFrame(f)` 换（规矩.tsx、声音.tsx 的听者）。
//
// 为什么是开箱惹出警告（1.20.1 javap 核对，jar 在 game/缓存/）：
//   - Lootr 开箱：`LootrChestBlockEntity.startOpen` → `incrementOpeners` → gameEvent(CONTAINER_OPEN)，在 vibrations 标签里，源头是箱子方块中心。新城的箱子是夸克 quark:ancient_chest，镜头里画成 Lootr 战利品箱（共用箱子 模型/物品/箱子.tsx）。
//   - 踩羊毛、垫羊毛不响：羊毛在 dampens_vibrations 里，`VibrationSystem.User.isValidVibration` 不收；开箱的振动躲不掉。
//   - 振动链（工具/古城4x布局/核对.py「6-4-2 开 #210 的振动链」）：#210 8 格内只有感测体 (−1092,−47,191)，6.4 米，中间无羊毛；飞 6 刻激活（触须快抖 40 刻），8 格内尖啸体 (−1091,−47,191) 1 刻后收到，
//     不在冷却就尖啸（`tryShriek`，levelEvent 3007，90 刻后 tick），随即进 10 秒冷却；(−1098,−47,189) 6.3 格、6 刻后收到时已在冷却，不叫。
//   - 尖啸后 90 刻 `tryRespond`：第 1 级警告召不出监守者，先 `playWardenReplySound`（entity.warden.nearby_close，位置三轴各加 [−10,10] 随机整数，HOSTILE、volume 5、pitch 1），
//     再 `Warden.applyDarknessAround`：40 格内玩家 260 刻黑暗（模型/特效/黑暗效果.tsx：头尾各 1.1 秒渐入渐出，雾压到 15 格、亮度 4 秒一周期）。
//   - 6-4-3 挡箭惹的是第二次警告：离这次远超 10 秒冷却，照样尖啸。
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { FigurePose } from '../../../../world/角色/骨架.tsx';
import { shriekToDarknessSec, darknessParams } from '../../../../world/特效/黑暗效果.tsx';
import { G4 } from '../../../../world/地点/古城4x.tsx';
import type { Cam, ChestOpening } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import * as jumpBuild from '../../../场/6-古城/6-4-1/跳搭.ts';
import { lootPose, mixPose, nearYaw, pivotStep, standAt, yawTo } from '../../../../world/地点/古城4x/6-4-1/古城戏.ts';
import { lastFrame642, archery, chestArchery, cellCenter, footOf } from '../../../../world/地点/古城4x/布局.ts';
import type { Stack } from '../../../../world/界面/箱子界面.tsx';

export const FPS = jumpBuild.FPS;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (a: number[], b: number[], k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const tickSec = 1 / 20;

// ---------- 接 6-4-1（跳切） ----------
// 本段剧情帧 0 = 跳搭.ts 的 `start642`：他往 Q4 落下，离落地还有 10～11 帧（剧情时间的原点，成片从翻进兵营那一跳的半空演起）。
export const start642 = Math.floor(jumpBuild.landFrame('Q4') - 10);
const toJumpFrame = (f: number) => f + start642; // 本段剧情帧 → 跳搭.ts 的剧情帧

// ---------- 路线 ----------
const JC = jumpBuild.jumpOnto('C');
const woolCFoot = JC.p1; // 站在 C 上的脚底
export const landCFrame = JC.f1 - start642;
const LAND_C = 6;
const LOOT0 = landCFrame + LAND_C;
const LOOT_LEN = 28; // 同 6-4-1：开箱、伸手拿东西这一套 1.2 秒
const FACE_CHEST = yawTo(0, -1); // 面朝南（#210 在 C 南边一格）
// 箱盖：弯腰后 4 帧掀开（同 6-4-1），一直开着（他开着箱子定住、黑暗过去接着翻，6-4-3a 开头箱子还开着）
export const lidOpenSec = (LOOT0 + 4) / FPS;
export const openChest = (f: number): ChestOpening => ({ 号: chestArchery.号, 开: lidOpenSec, 秒: f / FPS });

// ---------- 羊毛（6-4-1 一路垫的那些在场景里一直留着） ----------
export const wool = (f: number) => jumpBuild.woolStateAt(toJumpFrame(f));

// ---------- 感测体、尖啸体（振动链，见文件头） ----------
const sensorBlock: V3 = archery.感测体 as V3;
export const sensors: V3[] = [sensorBlock];
const shriekers: V3[] = [archery.尖啸体 as V3, [-1098, -47, 189]]; // 第二个收到时已在冷却里，不叫
const blockCenter = (b: number[]): V3 => cellCenter(b as [number, number, number]);
const blockBottomCenter = (b: number[]): V3 => footOf(b as [number, number, number]);
const flightTicks = (a: V3, b: V3) => Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
export const chestCenter: V3 = blockCenter(archery.箱子);
type Vibration = { from: V3; to: V3; t: number };
const soundChain = (() => {
  const t0 = lidOpenSec;
  const sensorCenter = blockCenter(sensorBlock);
  const activateSec = t0 + flightTicks(chestCenter, sensorCenter) * tickSec;
  const vibrations: Vibration[] = [{ from: chestCenter, to: sensorCenter, t: t0 }];
  const received = shriekers.map((shrieker) => {
    const to = blockCenter(shrieker);
    vibrations.push({ from: sensorCenter, to, t: activateSec });
    return { b: shrieker, t: activateSec + flightTicks(sensorCenter, to) * tickSec };
  });
  received.sort((a, c) => a.t - c.t);
  return { vibrations: vibrations, activateSecs: [activateSec], shriek: { 块: received[0].b, p: blockBottomCenter(received[0].b), t: received[0].t } };
})();
export const vibrations = soundChain.vibrations;
export const activateSecs = soundChain.activateSecs; // 各感测体激活的本段秒数
export const shriek = soundChain.shriek; // 尖啸的本段秒数、尖啸体（开箱后 7 刻）
// 感测体触须动画跟全局时间走（幽匿感测体.tsx 的 触须帧）：末帧的下一帧是 6-4-3a 首帧（6-4-3 剧情 0 秒），
// 再整体加 32 秒（640 刻，32 刻一圈的整数倍）免得出现负数。按剪辑帧走：镜头 3 里的跳点不是 32 刻的整数倍，按剧情帧走触须会在跳点上跳一下
export const sensorClock = (f: number) => (toEditFrame(f) - END) / FPS + 32;

// ---------- 黑暗 ----------
export const darknessStartSec = shriek.t + shriekToDarknessSec;
export const darknessEndSec = darknessStartSec + darknessParams.durationTicks / 20;
// 回应声的位置：尖啸体方块坐标三个轴各加 [−10, 10] 的随机整数（游戏用 level.random，这里固定种子）
export const wardenReplyPos: V3 = (() => {
  const rand = rng(6402);
  const k = () => Math.floor(rand() * 21) - 10;
  const [x, y, z] = shriek.块;
  return blockCenter([x + k(), y + k(), z + k()]);
})();
// 监守者回应声（entity.warden.nearby_close）开不开：照游戏补的（tryRespond 里和黑暗效果同一刻），要去掉改成 false
export const wardenReplyOn = true;

// ---------- 台词 ----------
// 没有（「满四次……」用户 10-12 删了，配音文件留着不动）。空表留着：台词落点.ts、同步表按段读 台词
export const lines: { id: string; 帧: number }[] = [];

// ---------- 时间轴的尾巴 ----------
// 黑暗退干净（黑暗止秒）他才动：0.6 秒低下头、手伸回箱子里，再翻 0.3 秒，下一帧就是 6-4-3a（同一个镜头接着翻 1.6 秒）
const recoverSec = darknessEndSec;
const recoverDuration = 0.6;
export const STORY_END = Math.round((recoverSec + recoverDuration + 0.3) * FPS) + 1; // 不跳的时间轴有多长（帧），末帧是 剧情END − 1

// ---------- 拾取（用户 10-20：「这里应该显示拾取这个箱子里面的东西 箱子里面就有一些古城的战利品」） ----------
// 原文第 6 章只写「看见战利品箱，他便打开，拿走里面的东西就迅速跳走」，没写开到什么；古卷第 7 章才开到（7-2-2至3），这里没有。
// 东西照原版古城战利品表（client-1.20.1.jar 的 minecraft:chests/ancient_city，5～10 抽，数量在各条目 set_count 范围内）挑：迅捷潜行附魔书、回响碎片等。
// 界面同 7-2-2至3（模型/界面/箱子界面.tsx，贴在翻开的箱盖上方，不画指针）：他转回箱子快低下头时弹出，停一拍看清，再逐格 shift 点击（ChestMenu.quickMoveStack 整叠进物品栏），
// 点前那格亮起悬停高亮。原版界面里移东西没有声音。时间接着本段剧情时间轴往后算：剧情帧 ≥ STORY_END 就是 6-4-3a（A1 原速，6-4-3 剧情秒 = (剧情帧 − STORY_END) / 24）。
// 界面开着就是箱盖开着：箱子一直开到 6-4-3 转身关盖，切黄叛（6-4-3a 的 A2）以后的镜头不画界面（合成见 ../6-4-2至3a/规矩风矢.tsx）。
const lootSlots: Record<number, Stack> = {
  2: { item: '骨头', count: 7 },
  5: { item: '煤炭', count: 9 },
  9: { item: '附魔书' },
  13: { item: '回响碎片', count: 2 },
  16: { item: '蜡烛', count: 3 },
  19: { item: '紫水晶碎片', count: 11 },
  22: { item: '附魔之瓶', count: 2 },
  25: { item: '唱片残片' },
};
const lootOrder = Object.keys(lootSlots).map(Number); // 逐行往下点
export const lootUiOpenSec = recoverSec + 0.45;
const firstTakeSec = lootUiOpenSec + 0.35;
const takeIntervalSec = 0.18;
const hoverLeadSec = 0.08;
export const lootTakeSecs = lootOrder.map((_, i) => firstTakeSec + i * takeIntervalSec);
export type LootUiState = { visibility: number; chest: (Stack | null)[]; hovered?: number };
// 剧情帧（可以过 STORY_END，接着算到 6-4-3a）
export const lootUi = (storyFrame: number): LootUiState => {
  const sec = storyFrame / FPS;
  const chest: (Stack | null)[] = Array.from({ length: 27 }, (_, i) => lootSlots[i] ?? null);
  let hovered: number | undefined;
  lootOrder.forEach((slot, i) => {
    if (sec >= lootTakeSecs[i] - hoverLeadSec) hovered = slot;
    if (sec >= lootTakeSecs[i]) chest[slot] = null;
  });
  return { visibility: ss((sec - lootUiOpenSec) / 0.12), chest, hovered };
};

// ---------- 跳切 ----------
// 用户 10-19：「跳跃和展示尖啸体的镜头也应该缩短点」——只留够看懂的三截，截与截之间换机位硬切（剧情时刻、STORY_END 都不动，6-4-3 不受影响）：
//   镜头 1（兵营里，感测体、尖啸体身后往东南看）：他翻进兵营落在 C 上前 0.25 秒起，开箱 → 振动 → 尖啸 → 他扭身定住，尖啸后 1 秒切；
//   镜头 2（他东南高处越过他的背看尖啸体）：低吼前 0.1 秒起，低吼、黑雾压下来，渐入完、第一下脉动最暗以后再停半秒切；
//   镜头 3（箱子南边，慢慢落到 6-4-3a 首帧机位）：渐出还剩 0.6 秒时切进来，黑雾退开，他转回箱子接着翻，不切接 6-4-3a。
export const cutStart = Math.round(landCFrame - 6);
export const cutA = Math.round((shriek.t + 1.0) * FPS); // 镜头 1 的最后一帧是它前一帧
export const cutB = Math.round((darknessStartSec - 0.1) * FPS); // 镜头 2 第一帧的剧情帧
export const jumpCutFrame = Math.round((darknessStartSec + 1.6) * FPS); // 镜头 2 的最后一帧是它前一帧（渐入 1.1 秒，第一下脉动最暗在 1.1 秒）
export const resumeFrame = Math.round((darknessEndSec - 0.6) * FPS); // 镜头 3 第一帧的剧情帧
export const skippedFrames = resumeFrame - jumpCutFrame;
const storyWindows: [number, number][] = [[cutStart, cutA], [cutB, jumpCutFrame], [resumeFrame, STORY_END]];
export const END = storyWindows.reduce((n, [winStart, winEnd]) => n + winEnd - winStart, 0); // 段长（成片帧），末帧是 END − 1
// 成片帧 → 剧情帧
export const toStoryFrame = (cutFrame: number) => {
  let cutOffset = 0;
  for (const [winStart, winEnd] of storyWindows) {
    if (cutFrame < cutOffset + winEnd - winStart) return winStart + (cutFrame - cutOffset);
    cutOffset += winEnd - winStart;
  }
  return STORY_END - 1 + (cutFrame - END + 1);
};
// 剧情帧 → 成片帧（落在跳掉的那几段里返回 undefined）；声音.tsx 用
export const toCutFrame = (storyFrame: number): number | undefined => {
  let cutOffset = 0;
  for (const [winStart, winEnd] of storyWindows) {
    if (storyFrame >= winStart && storyFrame < winEnd) return cutOffset + (storyFrame - winStart);
    cutOffset += winEnd - winStart;
  }
  return undefined;
};
// 剧情帧 → 剪辑上的帧（可带小数）：跳掉那几段里的停在前一个窗口的末尾。按成片走的动作（定住时的呼吸、拧头，镜头 3 的机位）用它，跳点两边接得上
const toEditFrame = (storyFrame: number): number => {
  let editOffset = 0;
  for (const [winStart, winEnd] of storyWindows) {
    if (storyFrame < winStart) return editOffset;
    if (storyFrame < winEnd) return editOffset + (storyFrame - winStart);
    editOffset += winEnd - winStart;
  }
  return editOffset + (storyFrame - STORY_END);
};

// ---------- 李樱 ----------
// 翻箱子（6-4-3a 首帧起接着翻，见 古城4x布局.ts 的 六四二末帧）：t 是 6-4-3 的剧情秒，本段末帧 t = −1/24，往前是负的
export const rummagePose = (t: number): FigurePose => lootPose(woolCFoot, FACE_CHEST, 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t * 7)), 1.4);
const rummageAt = (f: number) => rummagePose((f - STORY_END) / FPS);
// 定住（用户 10-19：「你转头不转身体 很诡异」）：尖啸一响（反应 0.12 秒），头先猛地扭向尖啸体（西北，比他的眼睛低），肩跟着拧，
// 身子随后转过来、脚挪一步，手从箱子里抽出来按住刀柄（左手按鞘）、膝盖微屈，侧身对着尖啸体；之后一动不动
const reactionSec = 0.12;
const freezeDuration = 0.5;
const headTurnDeg = (() => {
  const toShrieker = [shriek.p[0] - woolCFoot[0], shriek.p[1] - woolCFoot[1]];
  return nearYaw(0, yawTo(toShrieker[0], toShrieker[1]) - FACE_CHEST);
})();
// 一共要转 headTurnDeg：身子（连脚）转四成、胸对髋拧两成半，余下的归头
const freezeBodyTurn = headTurnDeg * 0.4;
const freezeTwist = headTurnDeg * 0.25;
const lootProgress = (f: number) => Math.min(1, (f - LOOT0) / LOOT_LEN);
const freezeLootProgress = lootProgress((shriek.t + reactionSec) * FPS);
// 朝箱子的 yaw 取和落 C 那一跳连续的值（−180），混合姿势时不绕一整圈
const faceChestYaw = nearYaw(JC.yaw, FACE_CHEST);
const guardCrouch = (yaw: number): FigurePose => ({ ...standAt(woolCFoot, yaw), pitch: -6, legR: 16, legL: 10, kneeR: 28, kneeL: 22 });
// sec：尖啸后反应过来以后过了几秒
const freezeTurn = (sec: number): FigurePose => {
  const kHead = ss(sec / 0.2);
  const kTwist = ss((sec - 0.05) / 0.3);
  const kBody = ss((sec - 0.12) / (freezeDuration - 0.12));
  const kHands = ss((sec - 0.05) / 0.35);
  const body = freezeBodyTurn * kBody;
  const twist = freezeTwist * kTwist;
  const pose = mixPose(lootPose(woolCFoot, faceChestYaw, freezeLootProgress, 1.4), guardCrouch(faceChestYaw), kHands);
  const stepping = pivotStep(pose, Math.min(1, Math.max(0, (sec - 0.12) / (freezeDuration - 0.12))), freezeBodyTurn > 0);
  return {
    ...stepping,
    yaw: faceChestYaw + body,
    twist,
    headYaw: Math.max(-80, Math.min(80, headTurnDeg * kHead - body - twist)),
    headPitch: lerp(stepping.headPitch, -18, kHead),
  };
};

export const liying = (storyFrame: number): FigurePose => {
  if (storyFrame < landCFrame) return jumpBuild.poseAt(toJumpFrame(storyFrame));
  const faceChest = faceChestYaw;
  const landed = (s: number) => jumpBuild.landBeforeChest(woolCFoot, JC.yaw, faceChest, s, LAND_C);
  if (storyFrame < LOOT0) return landed(storyFrame - landCFrame);
  const t = storyFrame / FPS;
  const freezeSec = shriek.t + reactionSec;
  const yawFix = (p: FigurePose): FigurePose => ({ ...p, yaw: faceChest });
  if (t < freezeSec) {
    const loot = yawFix(lootPose(woolCFoot, FACE_CHEST, lootProgress(storyFrame), 1.4));
    return storyFrame < LOOT0 + 5 ? mixPose(landed(LAND_C), loot, ss((storyFrame - LOOT0) / 5)) : loot;
  }
  // 定住不是冻帧——屏着气，上身随呼吸极轻地起伏（0.6°、3 秒一次），头还在一点点往尖啸体那边拧（几秒里多 5°）。
  // 按剪辑上的秒算（剪辑帧）：黑暗中间那一截是在同一个镜头里跳的，按剧情秒算呼吸、拧头会在跳点上闪一下
  const addMicroMotion = (pose: FigurePose): FigurePose => {
    const heldSec = Math.max(0, (toEditFrame(Math.min(storyFrame, recoverSec * FPS)) - toEditFrame((freezeSec + freezeDuration) * FPS)) / FPS);
    const breath = Math.min(1, heldSec / 0.5) * Math.sin((heldSec * 2 * Math.PI) / 3);
    return { ...pose, pitch: pose.pitch - 0.6 * breath, headYaw: pose.headYaw + Math.sign(headTurnDeg || 1) * 5 * (1 - Math.exp(-heldSec / 2.5)) };
  };
  const frozenPose = addMicroMotion(freezeTurn(freezeDuration));
  if (t < recoverSec) return addMicroMotion(freezeTurn(t - freezeSec));
  // 黑雾退开：身子转回箱子（同样挪一步），低头接着翻
  const back = Math.min(1, (t - recoverSec) / recoverDuration);
  return pivotStep(mixPose(frozenPose, yawFix(rummageAt(storyFrame)), ss(back)), back, freezeBodyTurn < 0);
};
export const where = (f: number): V3 => (f < landCFrame ? jumpBuild.footAt(toJumpFrame(f)) : woolCFoot);

// ---------- 机位 ----------
// 镜头 1（兵营里，到尖啸后 1 秒）：感测体、尖啸体身后（西北）往东南看：前景尖啸体和感测体，往后是他和箱子。
//   他从南墙上方落进来、弯腰掀开箱子，振动从箱子飞进感测体、再飞进尖啸体，声波环迎着镜头往上飘；他扭过身来对着尖啸体（脸朝镜头这边）定住。
// 镜头 2（低吼前 0.1 秒起）：从他东南高处（兵营南墙里面）越过他的背看向尖啸体，慢慢推近一点；低吼、黑雾压下来。
// 镜头 3（渐出还剩 0.6 秒起）：箱子南边略高处，慢慢落到 六四二末帧.cam（6-4-3a 首帧机位，起点速度 0，6-4-3a 接着推）；黑雾退开，他转回箱子低头接着翻
const cam1 = (storyFrame: number): Cam => {
  const progress = ss((storyFrame - cutStart) / (cutA - cutStart));
  return {
    pos: lerpV(G4(-1094.6, -44.2, 188.2), G4(-1094.2, -44.4, 188.6), progress),
    tgt: lerpV(G4(-1088.4, -45.9, 193.9), G4(-1087.9, -45.6, 194.1), progress),
    lens: lerp(30, 36, progress), // 慢慢推近：尖啸体、感测体在前景，他在后面定住
  };
};
const C2_0: Cam = { pos: G4(-1084.6, -42.4, 197.9), tgt: G4(-1087.2, -45.6, 194.6), lens: 22 };
const C2_1: Cam = { pos: G4(-1085.0, -42.7, 197.5), tgt: G4(-1087.4, -45.6, 194.4), lens: 24 };
const cam2 = (storyFrame: number): Cam => {
  const progress = ss((storyFrame - cutB) / (jumpCutFrame - 1 - cutB));
  return { pos: lerpV(C2_0.pos, C2_1.pos, progress), tgt: lerpV(C2_0.tgt, C2_1.tgt, progress), lens: lerp(C2_0.lens, C2_1.lens, progress) };
};
const C3_0: Cam = { pos: [lastFrame642.cam.pos[0], lastFrame642.cam.pos[1], lastFrame642.cam.pos[2] + 0.8], tgt: lastFrame642.cam.tgt, lens: 21 };
const cam3 = (storyFrame: number): Cam => {
  const progress = ss(Math.min(1, Math.max(0, (storyFrame - resumeFrame) / (STORY_END - 1 - resumeFrame))));
  const endCam = lastFrame642.cam;
  return { pos: lerpV(C3_0.pos, endCam.pos, progress), tgt: lerpV(C3_0.tgt, endCam.tgt, progress), lens: lerp(C3_0.lens, endCam.lens, progress) };
};
// 跳掉的几截成片里没有，核对时取到的是前一个镜头接着算的机位
export const camera = (storyFrame: number): Cam => {
  if (storyFrame < cutB) return cam1(Math.min(storyFrame, cutA - 1));
  if (storyFrame < resumeFrame) return cam2(Math.min(storyFrame, jumpCutFrame - 1));
  return cam3(storyFrame);
};

// 核对、字幕用：几个时刻（剧情帧，成片帧用 `toCutFrame` 换）
export const keyMoments = {
  落Q4: jumpBuild.landFrame('Q4') - start642,
  成片起: cutStart,
  落C: landCFrame,
  开盖: lidOpenSec * FPS,
  尖啸: shriek.t * FPS,
  黑暗起: darknessStartSec * FPS,
  黑暗止: darknessEndSec * FPS,
  切A: cutA,
  切B: cutB,
  跳切: jumpCutFrame,
  续起: resumeFrame,
  界面开: lootUiOpenSec * FPS,
  拿完: lootTakeSecs[lootTakeSecs.length - 1] * FPS,
  末帧: STORY_END - 1,
};
