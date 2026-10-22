// 第 7 章第 1 场「黑暗监守」的整场时间线：七段是同一条连续时间轴（t，秒）上前后相接的七截。t = 0 是 6-4-9 末帧，7-1-1 第 0 帧是它的下一帧（t = 1/24）。
// 段界放在切镜头的那一刻，一个镜头不拆进两段；段与段不共用帧，后一段第 0 帧是前一段末帧的下一帧（写法同 ../7-3/时间线.ts）。
// 人物、监守者、恼鬼、箭的状态全是 t 的函数（戏.ts），各段只管机位和声音。
// 二人全程强者跳（../古城4x布局.ts 的 强者跳、闪避跳，落脚点在 七一）；监守者 60 米/秒（用户 10-18 定的古城基准速度，比人快一倍），循着振动追，攻击冷却照原版 18 刻；
//   它几步就到，所以每一下都是人刚跳走它就扑到：二人靠往它够不着的高处跳、落地即走，打法不回合制（用户 10-18）。恼鬼照原版 VexMoveControl 逐刻推。
// 事件时刻能算的都从走位、跳的弹道算（`wardenTravelSec`、`eliteLeap`），台词配音已出（src/配音/，台词表.json 的 有声长），说完才接下一句。
import lineTableJson from 'asset:数据/配音/台词表';
import { elite, eliteLeap } from '../布局.ts';
import * as geom from './几何.ts';
export const FPS = 24;

const leapOf = (a: number[], b: number[], apex: number) => eliteLeap(a as [number, number, number], b as [number, number, number], apex);
const travel = (a: number[], b: number[]) => geom.wardenTravelSec(geom.flatDist(a as [number, number, number], b as [number, number, number]));
const voicedSec = (id: string) => (lineTableJson as unknown as Record<string, { 有声长: number }>)[id].有声长;

// ---------- 事件（场时刻 t，秒） ----------
// 7-1-1 黑暗：6-4-9 末帧之后 0.5 秒，监守者放黑暗（原版 Warden.applyDarknessAround：每 120 刻对 20 格内的玩家上黑暗 260 刻）
export const darknessT = 0.5;
// 监守者听到刘心忠的声音（「这是怎么回事？」1.3 秒开口）：头先扭过去，再朝他扑
export const wardenTurnHeadT = 2.0;
// 刘心忠看它扭过头来就举杖施法（铁魔法召唤恼鬼 castTime 20 刻），蹲下蹬地；恼鬼在他半空里出来、马上冲出去
export const raiseStaffT = 2.55;
// 二人同时蹬地分开（蓄力 0.2 秒）：刘心忠一跳上东南的土丘顶，黄叛一跳 9 米高跳上中央台北沿（黄台）
export const liuCrouchT = 2.85;
export const liuTakeoffT = liuCrouchT + 0.2; // 3.05
export const huangCrouchT = 2.9;
export const huangTakeoffT = huangCrouchT + 0.2; // 3.1
// 监守者扑到刘心忠跟前、爪子扫过的那一刻他刚离地（扑空，没有伤害）
export const firstLungeArriveT = liuTakeoffT + 0.03;
export const wardenStepT = firstLungeArriveT - travel(geom.wardenStart, geom.firstLungeStep);
export const firstLungeSwingT = firstLungeArriveT - 0.1; // 攻击动画起点（打中那一下在 +0.1）
export const vexSpawnT = raiseStaffT + 1.0;
export const vexChargeT = vexSpawnT + 0.15;
// 黄叛边跳边射火把箭照亮场子（拉弓 0.6 秒，弓前开小风的鼓风机，见 戏/黄叛.ts）：H1 最高点一支、落黄台一支，监守者拍恼鬼的工夫跳去南台顶、最高点再一支，落地一支
// （第 1、3 支在 H1、H2 的最高点，落黄台那支、南台顶那支是落地后站着射）
export const huangH2TakeoffT = 6.75;
const H1 = leapOf(geom.pursuersStart.黄.loc as number[], geom.spots.huangPlatform, geom.leapApex.H1);
const H2 = leapOf(geom.spots.huangPlatform, geom.spots.southPlatformTop, geom.leapApex.H2);
export const torchArrowReleaseTs = [huangTakeoffT + H1.tUp, 4.75, huangH2TakeoffT + H2.tUp, 8.6];
// 7-1-3：恼鬼俯冲；监守者够得着就拍（攻击冷却 18 刻），拍哪只、哪一刻由 戏/恼鬼.ts 逐刻推出来（swingTs）。散开的参数挑成第一拍在这一刻、之后每 0.9 秒一拍
export const firstVexSwingT = 5.8;
// 第五只一没，刘心忠在丘顶上就喊「一百级的恼鬼……就这么没了？！」
export const impossibleT = 9.75;
export const impossibleEndT = impossibleT + voicedSec('7-1-3-刘心忠-不可能');
// 他一喊，监守者立刻掉头朝他扑过去（照振动），0.4 秒就扑到丘脚；刘心忠前半句喊到末尾蹬地一跳上东墙脊（7 格高，它够不着），落上墙脊那一下喊出后半句（配音里停顿后 1.68 秒起音）
export const wardenTurnToLiuT = impossibleT + 0.1;
export const wardenLungeMoundT = impossibleT + 0.3;
export const moundArriveT = wardenLungeMoundT + travel(geom.platformNE, geom.moundFoot);
export const liuJ2TakeoffT = moundArriveT + 0.15;
// 黄叛在南台顶上伸手想拦、不喊话（用户 10-17：刘心忠转身逃画面看得出来）
export const dontPanicT = liuJ2TakeoffT;
// 7-1-5 风矢：刘心忠喊完，黄叛「怪物受死！」拉弓，蓄力跳回黄叛高台，在最高点放箭；监守者早已追到东墙脚下仰头等着
export const dieT = impossibleEndT + 0.12;
export const windArrowDrawT = dieT + 0.05;
export const huangH3TakeoffT = dieT + 0.5;
export const windArrowReleaseT = huangH3TakeoffT + leapOf(geom.spots.southPlatformTop, geom.spots.huangPanPerch, geom.leapApex.H3).tUp;
// 7-1-6 连跳：风矢一钉上（它头往黄叛那边一甩），墙脊上的刘心忠就回身一蹬，从监守者头顶越过去落 C1、连跳 C2；
//   黄叛一落黄叛高台就往北墙根射火把照亮（拉弓 0.75 秒，鼓风机转起来）
export const liuJ3TakeoffT = windArrowReleaseT + 0.18;
const J3 = leapOf(geom.spots.eastWallRidge, geom.spots.C1, geom.leapApex.J3);
const J4 = leapOf(geom.spots.C1, geom.spots.C2, geom.leapApex.J4);
const H3 = leapOf(geom.spots.southPlatformTop, geom.spots.huangPanPerch, geom.leapApex.H3);
export const liuJ3LandT = liuJ3TakeoffT + J3.T;
export const liuJ4TakeoffT = liuJ3LandT + elite.landingSquatSec;
export const liuJ4LandT = liuJ4TakeoffT + J4.T;
export const woolTorchDrawT = huangH3TakeoffT + H3.T + 0.02;
export const woolTorchReleaseT = woolTorchDrawT + 0.75;
// 7-1-7 骏马：监守者循着 C2 的落地声扑过来挥臂，刘心忠闪避跳往西 10 米躲开、半空里甩出护盾（护盾在 盾前 挡住它）；落地就召马，
//   护盾硬吃三拍的工夫马出来，他翻身上马，第三拍拍碎护盾那一下马一跃跳上北墙头（它两拍之间不停手，冷却一好就拍）
// 监守者在 C1 站着（J3 落地后它扑到 C1，刘心忠已经跳走了），C2 落地 0.25 秒后起跑，扑到扑刘点那一刻爪子落下
export const lungeSwingT = liuJ4LandT + 0.25 + travel(geom.spots.C1, geom.lungeAtLiuPoint) - 0.1;
export const liuDodgeT = lungeSwingT;
export const shieldT = lungeSwingT + 0.55; // 闪避跳（0.79 秒）半空里甩护盾（瞬发）
export const summonHorseT = lungeSwingT + 1.25; // 施法 1 秒
export const horseSpawnT = summonHorseT + 1.0;
export const mountT = horseSpawnT + 0.3;
// 拍护盾：扑空 0.3 秒后接着往盾前压，到了 0.05 秒（冷却没好就等冷却）就拍，每 0.9 秒一拍，第三拍拍碎
const reachShieldT = lungeSwingT + 0.3 + travel(geom.lungeAtLiuPoint, geom.shieldFront);
const firstShieldSwingT = Math.max(reachShieldT + 0.05, lungeSwingT + geom.attackCooldownSec, shieldT + 0.2);
export const shieldSwingTs = [0, 1, 2].map((i) => firstShieldSwingT + i * geom.attackCooldownSec);
export const shieldBreakT = shieldSwingTs[2] + 0.1;
export const horseJumpT = shieldBreakT;
if (horseJumpT < mountT + 0.15) throw new Error('7-1-7：护盾碎时刘心忠还没骑上马');
export const wallLandT = horseJumpT + leapOf(geom.horseSpawnPos, geom.spots.wallEntry, geom.horseLeapApex).T;
// 黄叛在黄叛高台上接着射风矢，都钉在监守者身上（钉中的时刻，放箭按飞多久倒推）：第一支和第二拍打中同一刻，第二支在第三拍之前。
//   都要在 7-2-1 镜 Jade 之后（Jade 显示的血只扣了 7-1-5 那一箭，7-2-1/编排.ts 核）
export const huangFollowArrowHitTs = [shieldSwingTs[1] + 0.1, shieldSwingTs[1] + 0.92];

// ---------- 分段（段界 = 切镜那一刻） ----------
// 段界按戏和台词定，切在动作上：7-1-1 收在监守者起扑；7-1-2 收在第一拍前 0.45 秒；7-1-3 收在它扑向丘脚的半路；
//   7-1-4 刘心忠蹬地上墙脊、它跟着扑到东墙脚下，收在黄叛开口前；7-1-5 收在刘心忠越过它头顶；7-1-6 收在它扑向 C2 之前；
//   7-1-7 演到马落上墙头（末帧 = 衔接.七三首，马落墙后 0.1 秒），它照样追，接第 3 场。
// 「一百级的恼鬼……就这么没了？！」说进 7-1-4（`segmentLines` 的 接上段）。
// 7-1-6 原来先有一镜黄叛越肩射火把、照出羊毛（「羊毛……？！」「刘兄，快到羊毛上逃！」），用户 10-19 删了这两句和这一镜：
//   后面是追逐，上羊毛躲不掉它。剧情时间轴不动（7-2-1 按它远望第 1 场），只把 7-1-5 末到刘心忠快落到 C2 那一截跳过去不演（`skipTo`）。
const cutTs = {
  '7-1-1': 1 / FPS,
  '7-1-2': wardenStepT + 0.03,
  '7-1-3': firstVexSwingT - 0.45,
  '7-1-4': impossibleT + 0.45,
  '7-1-5': dieT - 0.1,
  '7-1-6': liuJ3TakeoffT + 0.5,
  '7-1-7': lungeSwingT - 0.45,
};
// 段首往后跳到这一刻（前一段照旧收在 cutTs）：7-1-6 从刘心忠落 C2 前 0.35 秒演起（这一跳前半截他在画外，空镜不留）
const skipTo: Partial<Record<keyof typeof cutTs, number>> = { '7-1-6': liuJ4LandT - 0.35 };
export const sceneEndT0 = wallLandT + 0.1;
const names = { '7-1-1': '黑暗', '7-1-2': '恼鬼与火把', '7-1-3': '秒杀', '7-1-4': '逃', '7-1-5': '风矢', '7-1-6': '连跳', '7-1-7': '骏马' } as const;
export type SegmentId = keyof typeof cutTs;
const ids = Object.keys(cutTs) as SegmentId[];
const toFrame = (t: number) => Math.round(t * FPS);
// 段 n 是场帧 [段首n, 段界n+1) 那几帧；最后一段含 sceneEndT0 那一帧
export const segments = ids.map((id, i) => {
  const startFrame = toFrame(skipTo[id] ?? cutTs[id]);
  const endFrame = i + 1 < ids.length ? toFrame(cutTs[ids[i + 1]]) : toFrame(sceneEndT0) + 1;
  return { 号: id, 名: names[id], 帧数: endFrame - startFrame, startFrame };
});
export const segmentStartFrame = Object.fromEntries(segments.map((s) => [s.号, s.startFrame])) as Record<SegmentId, number>;
export const frameCountOf = (segId: SegmentId) => segments.find((s) => s.号 === segId)!.帧数;
// 段内帧 → 场时刻 t（秒）
export const tAt = (segId: SegmentId, f: number) => (segmentStartFrame[segId] + f) / FPS;
export const segmentStartT = (segId: SegmentId) => segmentStartFrame[segId] / FPS;
export const segmentEndT = (segId: SegmentId) => (segmentStartFrame[segId] + frameCountOf(segId) - 1) / FPS;

// ---------- 台词开口（场时刻 t；id 照 7-<场>-<段>-<角色>-<短名>，句子在 id 的那一段开口，给了 段 的在 段 开口） ----------
export const dialogue: Record<string, { t: number; 文: string; 段?: SegmentId }> = {
  '7-1-1-刘心忠-怎么回事': { t: 1.3, 文: '这是怎么回事？' },
  '7-1-3-刘心忠-不可能': { t: impossibleT, 文: '一百级的恼鬼……就这么没了？！' },
  '7-1-5-黄叛-受死': { t: dieT, 文: '怪物受死！' },
};
export type LineId = keyof typeof dialogue;
const lineSegment = (id: LineId) => dialogue[id].段 ?? (id.split('-').slice(0, 3).join('-') as SegmentId);
// 一段要放的句子：本段开口的，加上前一段开口、还没说完的（接上段 = 只放后半截，开口在本段之前）
export const segmentLines = (segId: SegmentId) => {
  const startT = segmentStartT(segId);
  const endT = segmentEndT(segId);
  return (Object.keys(dialogue) as LineId[]).flatMap((id) => {
    const { t } = dialogue[id];
    if (lineSegment(id) === segId) return [{ id, t, 接上段: false }];
    if (t < startT && t + voicedSec(id) > startT && t <= endT) return [{ id, t, 接上段: true }];
    return [];
  });
};
for (const id of Object.keys(dialogue) as LineId[]) {
  const segId = lineSegment(id);
  const { t } = dialogue[id];
  if (t < segmentStartT(segId) || t > segmentEndT(segId)) throw new Error(`${id} 开口不在 ${segId} 里`);
}
