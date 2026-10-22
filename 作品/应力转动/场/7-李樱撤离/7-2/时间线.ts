// 第 7 章第 2 场「李樱撤离」的剧情时间线（场内秒 s，24 帧/秒，原速、无慢放），两段都从这里取时刻。纯数据。
// 段与段不共用帧（同 7-3）：7-2-2至3 第 0 帧是 7-2-1 末帧的下一帧；场内帧 = 段起始场内帧 + 段内帧（见 `segmentStartFrame`）。段界在切镜那一帧，一个镜头不拆进两段（用户 10-18 定）。
// 戏（脚本规划 7-2；场景在放大 4 倍的新城，地理见 几何.ts）：7-2-1 开场就是他在屋顶 V 上远望监守者的镜 Jade：Jade 显出它的血量，看到就喊出台词（画外音），
//   切回他转回身强者跳 19.7 米落差 8 格；7-2-2至3 落到 #240 跟前垫的羊毛 X 上，掀开战利品箱，开箱发 container_open 振动，感测体咔嗒、尖啸体尖啸；
//   弹出箱子界面，思索引线指出古卷，他 shift 点击把古卷、护腿移进物品栏，关掉界面、箱盖合上，传送石拉弓式按住 32 刻（1.6 秒）、警惕地张望，满了 128 个传送门粒子一炸人没了，镜头停在空羊毛上。
//
// 为什么他要赶紧走（照 1.20.1，同 6-4-2/编排.ts 文件头的规矩，javap 核对）：
//   - 箱子周围 8 格内有感测体，开箱振动没法避（羊毛只挡踩、放方块）。
//   - 尖啸体收到咔嗒就 `tryShriek` → `WardenSpawnTracker.tryWarn`：周围 48×48×48 盒子里有监守者才不叫（client-1.20.1-srg.jar 核过 48.0d）。监守者在 80 米外，所以照叫；
//     第 6 章他已满 4 级警告，尖啸后 90 刻 `tryRespond` 会再召唤一只监守者（并给 40 格内的人上黑暗）。所以开到东西就走：镜头在回应（尖啸后 4.5 秒）之前切走，回应、黑暗、第二只监守者都不演。
//   - 看界面、移东西要 2 秒多，关箱（container_close）时三个感测体都已过了 40 刻（激活 30 + 冷却 10），又咔嗒一遍；尖啸体在叫或在 10 秒警告冷却里，不再叫。
//     开始按住传送石（item_interact_start）时感测体还在第二遍的 40 刻里，不响；用完（item_interact_finish）人已传走。时序由 戏.ts 核对。
import { FPS } from '../../../地点/古城4x/6-4-1/古城戏.ts';
import { eliteLeap, feetOnWool, wool722, lookoutFeet } from '../../../地点/古城4x/布局.ts';

export { FPS };
const tickSec = 1 / 20;

// ---------- 7-2-1 ----------
// 段首就是镜 Jade（用户 10-20：他背对镜头站着看的镜 1「意义不明」，删掉）：引线、信息框先出来，他看到血量就喊「五万血？！这我打个集贸啊！」
// （用户 10-19 定：台词在看血量这一镜里说，单独说话那一镜删掉），说完就切回他
export const jadeLineSec = 0.5; // 镜内秒：引线开始往上长（0.3 秒长到框）
export const fiftyKHpLineT = 0.95; // 框出来 0.15 秒后开口
export const fiftyKHpLineDur = 2.1; // 配音有声 2.10 秒（src/配音/台词表.json）
export const jadeShotEndSec = Math.round((fiftyKHpLineT + fiftyKHpLineDur + 0.13) * FPS) / FPS;

// ---------- 跳、开箱 ----------
// 切回他时他还望着场子，0.1 秒后转回身（往 #240）、蹲、跳
export const turnBackStart = jadeShotEndSec + 0.1;
export const turnBackEnd = turnBackStart + 0.35;
export const crouchStart = turnBackStart + 0.25;
export const takeoffSec = turnBackStart + 0.65; // 离开 V 上的羊毛
// 「溜了溜了。」起跳就开口，人在空中说完（用户 10-20：跳的时候说，不为它改镜头）
export const slipLineT = takeoffSec;
export const slipLineDur = 0.93; // 配音有声 0.93 秒（src/配音/台词表.json）
// 强者跳：V → X，19.7 米、落差 8 格。离地照 ../7-1/几何.ts 的 `leapApex` 的规矩：落差大、跳得短，水平到不了 28 米/秒，取最快的 1.5（最高点比 V 上的脚底高 1.5），1.08 秒
export const leap = eliteLeap(lookoutFeet, feetOnWool(wool722.X), 1.5, takeoffSec * FPS);
export const landSec = leap.f1 / FPS; // 场内秒
export const landSquatSec = 0.3; // 秒
export const lidOpenSec = landSec + 0.45; // 右键开箱：箱盖开始翻、container_open 振动、开箱声

// ---------- 箱子界面（用户 10-19 定：开到的东西在箱子界面里用思索引线指出来，shift 点击移进物品栏，不拿在手上） ----------
// 界面在箱盖翻开一半时弹出（先看到他开箱）；引线描框 → 拉线 → 出说明框，说明框出来时说「开到了！」
export const uiOpenSec = lidOpenSec + 0.3;
export const tomeCalloutSec = lidOpenSec + 0.4; // 引线开始（0.5 秒画完，说明框在 0.25 秒时出来）
export const tomeCalloutDur = 0.5;
// 台词「开到了！」：配音有声 0.80 秒
export const gotItLineT = tomeCalloutSec + tomeCalloutDur * 0.5;
export const gotItLineDur = 0.8;
// 说完话 shift 点击古卷，再 shift 点击护腿（到了就点，不停留出提示框）。指针不画（用户 10-20），点哪格靠悬停高亮：点前 `hoverLeadSec` 那格亮起
// 说明框留 1 秒上下看清；关箱时刻定死（见下），点击往后排
export const tomeClickSec = gotItLineT + gotItLineDur + 0.25;
export const leggingsClickSec = tomeClickSec + 0.35;
export const hoverLeadSec = 0.12;

// ---------- 传送 ----------
export const lidCloseSec = lidOpenSec + 2.35; // 关掉界面、箱盖开始合：要在三个感测体都过了 40 刻之后（戏.ts 核对），见文件头
export const stoneOutSec = lidCloseSec + 0.15; // 切到快捷栏的传送石，出现在右手里
export const useStartSec = lidCloseSec + 0.25; // 开始按住使用（block.portal.trigger）
export const useTicks = 32; // WarpStoneItem 的 warpStoneUseTime 默认值
export const teleportSec = useStartSec + useTicks * tickSec; // 用满，传走（选传送点的界面不画，直接传）
export const holdAfterTeleport = 0.6; // 人没了以后镜头再停多久：要赶在尖啸体回应（尖啸后 4.5 秒）之前

// ---------- 段起止（场内帧） ----------
// 段界：落地后 0.1 秒切到开箱的镜头（编排见 7-2-1、7-2-2至3）
export const cutToChestSec = landSec + 0.1;
export const sceneFrames = Math.round((teleportSec + holdAfterTeleport) * FPS) + 1;
export const segments = [
  { id: '7-2-1', frameCount: Math.ceil(cutToChestSec * FPS) },
  { id: '7-2-2至3', frameCount: sceneFrames - Math.ceil(cutToChestSec * FPS) },
] as const;
export type SegmentId = (typeof segments)[number]['id'];
export const segmentStartFrame: Record<SegmentId, number> = { '7-2-1': 0, '7-2-2至3': segments[0].frameCount };
export const frameCountOf = (segId: SegmentId) => segments.find((s) => s.id === segId)!.frameCount;
// 感测体咔嗒在关盖前 0.1 秒淡完：再往后只剩听不见的尾巴（用户 10-18 批）
export const sensorClickCutFrame = Math.round((lidCloseSec - 0.1) * FPS);

// ---------- 振动、尖啸（由 戏.ts 的 声音链 算出，这里只给回应时刻的上限检查用） ----------
export const shriekResponseSec = 90 * tickSec; // SculkShriekerBlockEntity：尖啸后 90 刻 tryRespond
