// 安息仪式（召唤亚波伦）的摆法、祭品、时刻表。纯数据、纯计算，段.ts 也能引。画法在 安息仪式.tsx。
// 出处（Goety 2.5.60.6 + 启示录 2.3.6 反编译）：
//   配方 goety_revelation:summon_apollyon2：激活物 末日勋章，仪式类型 sabbath，每秒 666 灵魂、30 秒，4 件祭品，生成 goety_revelation:summon_apollyon（过渡实体）。
//     用这个不用 12 件祭品、破碎之环激活的 summon_apollyon（用户 11-19 定）：本片在下界召唤，下界能召唤的前提是在主世界召唤过祂（启示录 DarkAltarBlockEntityMixin），打过就有她掉的末日勋章。
//   结构（RitualRequirements "sabbath"）：游戏只数范围里的方块，哭泣黑曜石 ≥ 8、黑曜石（forge:obsidian）≥ 16、灵魂火 ≥ 4，不查位置；本片由祭坛下的诅咒笼通过连接宝石从灵魂方舟取能。
//   过程（DarkAltarBlockEntity.tick、Ritual.update）：见下面「游戏」。祭品每 30/5 秒吃一件（RitualRecipe.durationPerIngredient = 时长 ÷ (件数 + 1)）。
//   完成（SummonRitual.finish、SabbathRitualType）：暗红光柱、altar_finish、祭坛中心一颗大烟、末日勋章消失、过渡实体生在祭坛那格的中心。
//     灭掉灵魂火、给黑暗那一段只认本体的 SUMMON_APOSTLE，亚波伦的过渡实体是另一个类型，不触发：火一直烧着。
//   过渡（SummonApostle.tick、SummonApostleRenderer、启示录 SummonApollyonMixin）：活 450 刻，地面法阵加两道环、聚风带越来越密；
//     第 150 刻提示「世界凝视着你....」加黑暗，第 300 刻使徒低语、此后每刻一颗大烟，第 450 刻雷声、200 颗火焰炸开、亚波伦生在原地。亚波伦自己没有出场动作，「召唤动画」就是这个过渡。
//   没演：下界里第一次右键祭坛只出警告「你即将召唤此界最为畏怖之神，你做好准备了么?」、不开始（启示录 setApostleWarned），第二次才开始；片里当他已经点过一次。
// 坐标：场景约定（Z 朝上，单位格），祭坛那一列的中心在 (0, 0)，地面（黑曜石底的顶）z = 0。
import { clamp } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';

/** 游戏里的数（刻 = 1/20 秒） */
export const game = {
  ritualSec: 30,
  soulPerSec: 666,
  /** 第 k 件（1 起）在第 k × 30/5 秒被吃掉：6、12、18、24 */
  offeringVanishSecs: Array.from({ length: 4 }, (_, i) => Math.ceil(((i + 1) * 30) / 5)),
  transitionTicks: 450,
  hintTicks: 150,
  whisperTicks: 300,
  /** 法阵半边长 = clamp(年龄 × 0.1, 0, 3)，最后 10 刻缩回 0 */
  circleHalf: 3,
  circleGrowTicks: 30,
  circleRetractTicks: 10,
  /** 过渡实体的碰撞箱（启示录 ModEntityType：宽 2、高 0.5；本体使徒的是 2 × 1.95） */
  entityHeight: 0.5,
  pillarTicks: 20,
  hintText: '世界凝视着你....',
} as const;

export type OfferingName = '邪恶头盔' | '老巫婆帽' | '术士腰带';
/** 配方里的顺序（英文 id 在右）；术士腰带要两条。基座：放在第几个基座（baseCells 的下标），各边正中那个 */
export const offerings: readonly { name: OfferingName; id: string; pedestal: number }[] = [
  { name: '老巫婆帽', id: 'goety:crone_hat', pedestal: 1 },
  { name: '邪恶头盔', id: 'goety:malefic_helm', pedestal: 4 },
  { name: '术士腰带', id: 'goety:warlock_sash', pedestal: 7 },
  { name: '术士腰带', id: 'goety:warlock_sash', pedestal: 10 },
];

// ---- 摆法 ----
// 游戏不规定位置，这是本片的摆法：中间照 MC 百科那张图（哭泣黑曜石 3×3 台高一格、中心诅咒笼上摞祭坛、灵魂火烧在灵魂土上），
// 火放台子四个斜角外（用户说的「四角灵魂火」），12 个基座在外圈每边 3 个（用户 11-19 定：基座平常就是摆多的，只用其中几个；百科图只摆了 4 个），祭品放每边正中那个，底下铺一层 7×7 黑曜石凑够 16 块。
export type GridPos = readonly [number, number, number];
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** 基座的格（k = 0：立在黑曜石底上），从北边西头起顺时针，每边 3 个 */
export const baseCells: readonly GridPos[] = [
  ...range(-1, 1).map((i): GridPos => [i, 3, 0]),
  ...range(-1, 1).map((i): GridPos => [3, -i, 0]),
  ...range(-1, 1).map((i): GridPos => [-i, -3, 0]),
  ...range(-1, 1).map((i): GridPos => [-3, i, 0]),
];
export const soulFireCells: readonly GridPos[] = [[2, 2, 1], [2, -2, 1], [-2, -2, 1], [-2, 2, 1]];
export const cageCell: GridPos = [0, 0, 1];
export const altarCell: GridPos = [0, 0, 2];

/** 方块状态和格（给 @engine/model/方块拼搭.tsx，原点 [-0.5, -0.5, 0]：格 i 的中心在 x = i）。灵魂火不在里面（要动，安息仪式.tsx 另画） */
export const structureBlocks = (options: { obsidianBase?: boolean } = {}): { state: string; 位: GridPos }[] => {
  const placedBlocks: { state: string; 位: GridPos }[] = [];
  if (options.obsidianBase ?? true) for (const i of range(-3, 3)) for (const j of range(-3, 3)) placedBlocks.push({ state: 'minecraft:obsidian', 位: [i, j, -1] });
  for (const i of range(-1, 1)) for (const j of range(-1, 1)) placedBlocks.push({ state: 'minecraft:crying_obsidian', 位: [i, j, 0] });
  for (const [i, j, k] of soulFireCells) placedBlocks.push({ state: 'minecraft:soul_soil', 位: [i, j, k - 1] });
  for (const pos of baseCells) placedBlocks.push({ state: 'goety:pedestal', 位: pos });
  placedBlocks.push({ state: 'goety:cursed_cage', 位: cageCell }, { state: 'goety:dark_altar[lit=true]', 位: altarCell });
  return placedBlocks;
};

// 物品浮在哪：方块实体渲染器把物品（ItemDisplayContext.GROUND）放在方块底面往上 基座 1.1、祭坛 0.85、笼 0.25，每刻转 3 度；
// item/generated 的 ground 变换再往上 2/16、缩到 0.5
const groundLift = 2 / 16;
export const itemSpinPerTick = 3;
/** 第 i 件祭品所在基座的格 */
export const offeringCell = (i: number): GridPos => baseCells[offerings[i]!.pedestal]!;
/** 第 i 件祭品的中心 */
export const offeringPos = (i: number): V3 => {
  const [x, y, z] = offeringCell(i);
  return [x, y, z + 1.1 + groundLift];
};
/** 祭坛上末日勋章的中心 */
export const activatorPos: V3 = [0, 0, altarCell[2] + 0.85 + groundLift];
/** 笼里物品的中心 */
export const cageItemPos: V3 = [0, 0, cageCell[2] + 0.25 + groundLift];
/** 祭坛那格的中心：光柱、完成的大烟、过渡实体都在这（SummonRitual.finish：方块坐标 + 0.5） */
export const altarCenter: V3 = [0, 0, altarCell[2] + 0.5];
/** 亚波伦现身的位置（脚底）= 过渡实体的位置 */
export const appearPos: V3 = altarCenter;

// ---- 时长方案 ----
/**
 * 一套压缩后的时刻（秒，从放下末日勋章算起）。游戏里仪式 30 秒 + 过渡 22.5 秒，片里压短：
 * 转速、粒子怎么飞照真实时间走（不跟着快进），只有「进行到哪」（聚风带的疏密和粗细、几时起烟）按 过渡进度刻 映射。
 */
export type SummonPlan = {
  name: string;
  /** 祭品同时消失的时刻（用户 11-10 定同时消失；游戏里隔 2.3 秒一件） */
  offeringVanishSec: number;
  /** 祭品消失前自己飞向祭坛、缩小的秒数。游戏里祭品不动（只往祭坛喷物品碎屑），0 = 照游戏；大于 0 是本片自己补的 */
  offeringFlyInSec: number;
  /** 仪式完成：光柱、过渡实体出现 */
  completed: number;
  /** 提示「世界凝视着你....」、黑暗（游戏第 150 刻） */
  提示: number;
  /** 使徒低语、开始冒大烟（游戏第 300 刻） */
  whisperSec: number;
  /** 雷声、火焰炸开、亚波伦现身（游戏第 450 刻） */
  appear: number;
  /** 整段到这里结束（现身后留给火焰散开） */
  totalSec: number;
};

export const summonPlans = {
  /** 约 6 秒：仪式 2.5 秒、过渡 3.5 秒 */
  短: { name: '短', offeringVanishSec: 1.5, offeringFlyInSec: 0, completed: 2.5, 提示: 3.6, whisperSec: 4.8, appear: 6, totalSec: 7 },
  /** 约 10 秒：仪式 4 秒、过渡 6 秒 */
  长: { name: '长', offeringVanishSec: 2.6, offeringFlyInSec: 0, completed: 4, 提示: 6, whisperSec: 8, appear: 10, totalSec: 11 },
} satisfies Record<string, SummonPlan>;

const linearMap = (x: number, x0: number, x1: number, y0: number, y1: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);

/** 片里第几秒 → 相当于游戏里过渡实体的第几刻（0～450），分三段线性：完成→提示 是 0～150，提示→低语 是 150～300，低语→现身 是 300～450 */
export const transitionProgressTick = (sec: number, plan: SummonPlan): number => {
  if (sec <= plan.completed) return 0;
  if (sec <= plan.提示) return linearMap(sec, plan.completed, plan.提示, 0, game.hintTicks);
  if (sec <= plan.whisperSec) return linearMap(sec, plan.提示, plan.whisperSec, game.hintTicks, game.whisperTicks);
  return Math.min(game.transitionTicks, linearMap(sec, plan.whisperSec, plan.appear, game.whisperTicks, game.transitionTicks));
};

export type SummonPhase = '没开始' | '仪式' | '过渡' | '现身后';
export type SummonState = {
  stage: SummonPhase;
  /** 祭坛上有末日勋章（仪式期间） */
  hasActivator: boolean;
  /** 基座上的祭品：1 = 原样在基座上，0 = 没了；飞入期间在中间（位置按它往祭坛插，大小乘它） */
  offeringAlpha: number;
  /** 基座是不是在往祭坛喷物品碎屑（祭品还在、仪式在进行） */
  emitDebris: boolean;
  /** 过渡实体活了多少真实刻（没出现是负的） */
  transitionRealTick: number;
  /** 相当于游戏第几刻（疏密用） */
  transitionProgressTick: number;
  /** 法阵的半边长（格）：开头 1.5 秒长到 3，现身前 0.5 秒缩回 0 */
  circleHalf: number;
  /** 两道环离法阵的高度（格）：年龄 × 0.3 封顶 2、年龄 × 0.6 封顶 4 */
  ringHeight: readonly [number, number];
  /** 亚波伦出现了 */
  yaBoLunPresent: boolean;
};

export const summonStateAt = (sec: number, plan: SummonPlan): SummonState => {
  const stage: SummonPhase = sec < 0 ? '没开始' : sec < plan.completed ? '仪式' : sec < plan.appear ? '过渡' : '现身后';
  const realTick = (sec - plan.completed) * 20;
  const remainTicks = (plan.appear - sec) * 20;
  const circleActive = stage === '过渡';
  const halfSide = !circleActive ? 0 : remainTicks <= game.circleRetractTicks ? (remainTicks / game.circleRetractTicks) * game.circleHalf : clamp(realTick * 0.1, 0, game.circleHalf);
  const flyInStartSec = plan.offeringVanishSec - plan.offeringFlyInSec;
  const offeringAlpha = sec >= plan.offeringVanishSec ? 0 : plan.offeringFlyInSec > 0 && sec > flyInStartSec ? 1 - (sec - flyInStartSec) / plan.offeringFlyInSec : 1;
  return {
    stage: stage,
    hasActivator: stage === '仪式',
    offeringAlpha,
    emitDebris: stage === '仪式' && sec < plan.offeringVanishSec,
    transitionRealTick: circleActive ? realTick : -1,
    transitionProgressTick: transitionProgressTick(sec, plan),
    circleHalf: halfSide,
    ringHeight: circleActive ? [clamp(realTick * 0.3, 0.001, 2.001), clamp(realTick * 0.6, 0.001, 4.001)] : [0, 0],
    yaBoLunPresent: sec >= plan.appear,
  };
};

// ---- 声音 ----
/** 一声：资产 id（多选一的写了几个候选）、片里第几秒、游戏里的音量和音高。段.ts 里用 放() 照这张表排；本模块不放声音 */
export type SummonSound = { name: string; asset: readonly string[]; sec: number; 音量: number; 音高: string; provenance: string };
export const summonSounds = (plan: SummonPlan): SummonSound[] => {
  const summonSounds: SummonSound[] = [
    { name: '仪式开始', asset: ['音效/仪式/goety.altar_start'], sec: 0, 音量: 1, 音高: '0.8～1.2 随机', provenance: 'Ritual.start' },
    { name: '仪式循环', asset: ['音效/仪式/goety.altar_loop'], sec: 0, 音量: 1, 音高: '0.8～1.2 随机', provenance: 'Ritual.update：世界时间每 4 秒整响一次，片里只在开头放一次' },
    { name: '祭品被吃', asset: ['音效/entity.item.pickup'], sec: plan.offeringVanishSec, 音量: 0.7, 音高: '0.7', provenance: 'Ritual.consumeAdditionalIngredientFromPedestal：游戏里一件一声，片里同时消失只放一声' },
    { name: '仪式完成', asset: ['音效/仪式/goety.altar_finish'], sec: plan.completed, 音量: 1, 音高: '0.8～1.2 随机', provenance: 'Ritual.finish' },
    { name: '提示', asset: [1, 2, 3, 4, 5].map((n) => `音效/ambient.nether_wastes.mood.${n}`), sec: plan.提示, 音量: 1, 音高: '1', provenance: 'SummonApostle.tick 第 150 刻（启示录的 mixin 又放了一遍，同一刻两声）' },
    { name: '使徒低语', asset: [1, 2, 3, 4].map((n) => `音效/诡厄巫法/goety.apostle_ambient.${n}`), sec: plan.whisperSec, 音量: 1, 音高: '1', provenance: 'SummonApostle.tick 第 300 刻' },
    { name: '雷声', asset: [1, 2, 3].map((n) => `音效/entity.lightning_bolt.thunder.${n}`), sec: plan.appear, 音量: 1, 音高: '1', provenance: 'SummonApostle.tick 第 450 刻；只有声音，没有闪电' },
  ];
  // 每秒扣一次灵魂：幽匿催发体绽放声、祭坛顶上两颗幽匿灵魂粒子（DarkAltarBlockEntity.tick，世界时间每 20 刻）
  for (let s = 1; s <= plan.completed + 1e-9; s++) summonSounds.push({ name: `扣灵魂${s}`, asset: Array.from({ length: 13 }, (_, n) => `音效/block.sculk_catalyst.bloom.${n + 1}`), sec: s, 音量: 1, 音高: '0.9～1.0 随机', provenance: 'DarkAltarBlockEntity.tick' });
  return summonSounds.sort((a, b) => a.sec - b.sec);
};
