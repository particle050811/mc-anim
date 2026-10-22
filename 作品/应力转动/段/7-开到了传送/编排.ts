// 7-2-2至3 开到了、传送：机位、箱子界面和本段时刻，纯函数，输入段内帧 f（0 起，24 帧/秒）。戏在 ../7-2/戏.ts，时刻在 ../7-2/时间线.ts。本段第 0 帧接 7-2-1 末帧的下一帧。
// 戏：李樱强者跳落到 #240 跟前垫的羊毛 X 上，掀开战利品箱（Lootr，开盖换已开贴图）；开箱振动传给三个感测体再传给 8 格外的尖啸体，尖啸；
//   他不理，箱子界面弹出，思索引线指出古卷：「开到了！」shift 点击把古卷、附魔钻石护腿移进物品栏（用户 10-19 定：开到的东西在界面里指出来，进物品栏、不拿在手上；
//   界面只画箱子部分，东西从箱子格里消失，不交代物品栏）；
//   关掉界面、箱子关上（感测体又咔嗒一遍，尖啸体不再叫，他转头看过去）；切到传送石（Waystones），按住 32 刻（1.6 秒），按住时稍压低身子、警惕地看看四周（见 ../7-2/戏.ts）：
//   手边冒反向传送门粒子，过 1/4 绯红孢子，过 1/2 反向传送门，过 3/4 女巫粒子；用满 128 个传送门粒子一炸人没了（游戏里没有渐隐），选传送点界面不画。
//   镜头停在空羊毛上 0.6 秒，在尖啸体回应（尖啸后 4.5 秒：黑暗、再召唤监守者）之前收住。尖啸体为什么叫：见 ../7-2/时间线.ts 文件头。
// 开箱到传走是一个镜头，所以是一段（用户 10-18 定：一个镜头不拆进两段）：小屋里南边上空 28mm 正对北俯看，慢推到传走，尖啸体在画面外。
import type { V3 } from '@engine/model/parts.tsx';
import type { Cam } from '../../地点/古城4x/6-4-1/古城画面.tsx';
import { FPS } from '../../地点/古城4x/6-4-1/古城戏.ts';
import * as timeline from '../../场/7-李樱撤离/7-2/时间线.ts';
import * as geom from '../../场/7-李樱撤离/7-2/几何.ts';
import type { Stack } from '@库/界面/箱子界面.tsx';

export { FPS };
export const 号 = '7-2-2至3' as const;
export const 段起 = timeline.segmentStartFrame[号];
export const 帧数 = timeline.frameCountOf(号);
export const sf = (f: number) => 段起 + f;

// ---------- 台词 ----------
// id 沿用配音时的「7-2-2-李樱-开到了」（配音文件、口型按 id 存）
export const 开到了开口帧 = Math.round(timeline.gotItLineT * FPS) - 段起;
export const 台词: { id: string; 帧: number; text: string; estDuration: number }[] = [
  { id: '7-2-2-李樱-开到了', 帧: 开到了开口帧, text: '开到了！', estDuration: timeline.gotItLineDur },
];
// 传走那一帧（段内，带小数）
export const 传送帧 = timeline.teleportSec * FPS - 段起;

// ---------- 机位 ----------
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerpV = (a: number[], b: number[], k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// 段首 → 传走那一刻慢慢推近，之后停住、目标往下落到空羊毛上。
// #240 在一间没顶的小石屋里（x −955～−951、z 228～235，墙高 3～4 格），X 在北墙根。机位在小屋里南墙根上空、比他脚底高 3.5 格（游戏坐标），正对北俯看：
// 镜头只俯不偏，箱子的东西向棱在画面里是水平的，和上面弹出的箱子界面对齐（用户 10-20：原来斜着看，界面和箱子边框对不齐「怪怪的」）。推近、落目标都只动 y、z，机位和目标的 x 一直相同。
const feet = geom.chestFrontFeet;
const camX = feet[0] - 0.5; // 箱子和他之间：箱子在画面左边、他在右边
const B0: Cam = { pos: [camX, feet[1] - 4.8, feet[2] + 3.6], tgt: [camX, feet[1] - 0.2, feet[2] + 0.7], lens: 28 };
const B1: Cam = { pos: [camX, feet[1] - 4.2, feet[2] + 3.3], tgt: [camX, feet[1] - 0.2, feet[2] + 0.65], lens: 30 };
const pushStartSec = timeline.cutToChestSec;
export const camera = (f: number): Cam => {
  const sec = sf(f) / FPS;
  const k = ss((sec - pushStartSec) / (timeline.teleportSec - pushStartSec));
  const settle = ss((sec - timeline.teleportSec - 0.1) / 0.6);
  return { pos: lerpV(B0.pos, B1.pos, k), tgt: [camX, B1.tgt[1], lerp(lerp(B0.tgt[2], B1.tgt[2], k), feet[2] + 0.2, settle)], lens: lerp(B0.lens, B1.lens, k) };
};

// ---------- 箱子界面 ----------
// 开出来的东西：古城战利品表（minecraft:chests/ancient_city，5～10 抽）里常见的几样，加夸克往这张表里放的古卷；
// 原版装箱时把东西打散到随机空格、还会把一叠拆成几叠（LootTable.shuffleAndSplitItems），所以煤炭分了两格。
const lootSlots: Record<number, Stack> = {
  1: { item: '煤炭', count: 9 },
  4: { item: '古卷' },
  7: { item: '灵魂火把', count: 5 },
  10: { item: '骨头', count: 6 },
  12: { item: '回响碎片', count: 2 },
  15: { item: '钻石护腿' },
  18: { item: '紫水晶碎片', count: 7 },
  20: { item: '煤炭', count: 4 },
  24: { item: '唱片残片' },
};
// shift 点击（ChestMenu.quickMoveStack）把这格整叠移进物品栏，箱子格空出来
const tomeFrom = 4;
const leggingsFrom = 15;
export const tomeSlot = tomeFrom;

export type ChestUiState = { visibility: number; chest: (Stack | null)[]; hovered?: number; callout: number; calloutOpacity: number };
export const chestUi = (f: number): ChestUiState => {
  const sec = sf(f) / FPS;
  const visibility = ss((sec - timeline.uiOpenSec) / 0.12) * (1 - ss((sec - timeline.lidCloseSec) / 0.08));
  const chest: (Stack | null)[] = Array.from({ length: 27 }, (_, i) => lootSlots[i] ?? null);
  if (sec >= timeline.tomeClickSec) chest[tomeFrom] = null;
  if (sec >= timeline.leggingsClickSec) chest[leggingsFrom] = null;
  // 鼠标停到哪格那格亮（不画指针，用户 10-20）；点完东西没了，鼠标还停在空格上
  const hovered = sec >= timeline.leggingsClickSec - timeline.hoverLeadSec ? leggingsFrom : sec >= timeline.tomeClickSec - timeline.hoverLeadSec ? tomeFrom : undefined;
  return {
    visibility,
    chest,
    hovered,
    callout: Math.min(1, Math.max(0, (sec - timeline.tomeCalloutSec) / timeline.tomeCalloutDur)),
    calloutOpacity: 1 - ss((sec - timeline.tomeClickSec) / 0.12),
  };
};
