// 安息仪式（召唤亚波伦）的摆法、祭品、时刻表。纯数据、纯计算，段.ts 也能引。画法在 安息仪式.tsx。
// 出处（Goety 2.5.60.6 + 启示录 2.3.6 反编译）：
//   配方 goety_revelation:summon_apollyon：激活物 破碎之环，仪式类型 sabbath，每秒 666 灵魂、30 秒，12 件祭品，生成 goety_revelation:summon_apollyon（过渡实体）。
//   结构（RitualRequirements "sabbath"）：游戏只数范围里的方块，哭泣黑曜石 ≥ 8、黑曜石（forge:obsidian）≥ 16、灵魂火 ≥ 4，不查位置；祭坛正下方必须是装着灵魂图腾的诅咒笼（DarkAltarBlockEntity.checkCage）。
//   过程（DarkAltarBlockEntity.tick、Ritual.update）：见下面「游戏」。祭品每 30/13 秒吃一件（RitualRecipe.durationPerIngredient = 时长 ÷ (件数 + 1)）。
//   完成（SummonRitual.finish、SabbathRitualType）：暗红光柱、altar_finish、祭坛中心一颗大烟、破碎之环消失、过渡实体生在祭坛那格的中心。
//     灭掉灵魂火、给黑暗那一段只认本体的 SUMMON_APOSTLE，亚波伦的过渡实体是另一个类型，不触发：火一直烧着。
//   过渡（SummonApostle.tick、SummonApostleRenderer、启示录 SummonApollyonMixin）：活 450 刻，地面法阵加两道环、聚风带越来越密；
//     第 150 刻提示「世界凝视着你....」加黑暗，第 300 刻使徒低语、此后每刻一颗大烟，第 450 刻雷声、200 颗火焰炸开、亚波伦生在原地。亚波伦自己没有出场动作，「召唤动画」就是这个过渡。
// 坐标：场景约定（Z 朝上，单位格），祭坛那一列的中心在 (0, 0)，地面（黑曜石底的顶）z = 0。
import { clamp } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';

/** 游戏里的数（刻 = 1/20 秒） */
export const 游戏 = {
  仪式秒: 30,
  每秒灵魂: 666,
  /** 第 k 件（1 起）在第 ceil(k × 30/13) 秒被吃掉：3、5、7、10、12、14、17、19、21、24、26、28 */
  祭品消失秒: Array.from({ length: 12 }, (_, i) => Math.ceil(((i + 1) * 30) / 13)),
  过渡刻: 450,
  提示刻: 150,
  低语刻: 300,
  /** 法阵半边长 = clamp(年龄 × 0.1, 0, 3)，最后 10 刻缩回 0 */
  法阵半边: 3,
  法阵长大刻: 30,
  法阵收回刻: 10,
  /** 过渡实体的碰撞箱（启示录 ModEntityType：宽 2、高 0.5；本体使徒的是 2 × 1.95） */
  实体高: 0.5,
  光柱刻: 20,
  提示文字: '世界凝视着你....',
} as const;

export type 祭品名 = '暗夜之心' | '龙息' | '禁忌卷轴' | '附魔金苹果' | '下界之星' | '不洁之血' | '暗影精华' | '灵魂红宝石' | '炼狱魔典' | '邪恶头盔' | '老巫婆帽' | '术士腰带';
/** 配方里的顺序（英文 id 在右） */
export const 祭品们: readonly { 名: 祭品名; id: string }[] = [
  { 名: '暗夜之心', id: 'goety:heart_of_the_night' },
  { 名: '龙息', id: 'minecraft:dragon_breath' },
  { 名: '禁忌卷轴', id: 'goety:forbidden_scroll' },
  { 名: '附魔金苹果', id: 'minecraft:enchanted_golden_apple' },
  { 名: '下界之星', id: 'minecraft:nether_star' },
  { 名: '不洁之血', id: 'goety:unholy_blood' },
  { 名: '暗影精华', id: 'goety:shadow_essence' },
  { 名: '灵魂红宝石', id: 'goety:soul_ruby' },
  { 名: '炼狱魔典', id: 'goety:infernal_tome' },
  { 名: '邪恶头盔', id: 'goety:malefic_helm' },
  { 名: '老巫婆帽', id: 'goety:crone_hat' },
  { 名: '术士腰带', id: 'goety:warlock_sash' },
];

// ---- 摆法 ----
// 游戏不规定位置，这是本片的摆法：中间照 MC 百科那张图（哭泣黑曜石 3×3 台高一格、中心诅咒笼上摞祭坛、灵魂火烧在灵魂土上），
// 火放台子四个斜角外（用户说的「四角灵魂火」），12 个基座在外圈每边 3 个（百科图只摆了 4 个基座，放不下 12 件），底下铺一层 7×7 黑曜石凑够 16 块。
export type 格位 = readonly [number, number, number];
const 范围 = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** 基座的格（k = 0：立在黑曜石底上），从北边西头起顺时针，每边 3 个 */
export const 基座格: readonly 格位[] = [
  ...范围(-1, 1).map((i): 格位 => [i, 3, 0]),
  ...范围(-1, 1).map((i): 格位 => [3, -i, 0]),
  ...范围(-1, 1).map((i): 格位 => [-i, -3, 0]),
  ...范围(-1, 1).map((i): 格位 => [-3, i, 0]),
];
export const 灵魂火格: readonly 格位[] = [[2, 2, 1], [2, -2, 1], [-2, -2, 1], [-2, 2, 1]];
export const 笼格: 格位 = [0, 0, 1];
export const 祭坛格: 格位 = [0, 0, 2];

/** 方块状态和格（给 @engine/model/方块拼搭.tsx，原点 [-0.5, -0.5, 0]：格 i 的中心在 x = i）。灵魂火不在里面（要动，安息仪式.tsx 另画） */
export const 结构方块 = (选项: { 黑曜石底?: boolean } = {}): { 状态: string; 位: 格位 }[] => {
  const 块: { 状态: string; 位: 格位 }[] = [];
  if (选项.黑曜石底 ?? true) for (const i of 范围(-3, 3)) for (const j of 范围(-3, 3)) 块.push({ 状态: 'minecraft:obsidian', 位: [i, j, -1] });
  for (const i of 范围(-1, 1)) for (const j of 范围(-1, 1)) 块.push({ 状态: 'minecraft:crying_obsidian', 位: [i, j, 0] });
  for (const [i, j, k] of 灵魂火格) 块.push({ 状态: 'minecraft:soul_soil', 位: [i, j, k - 1] });
  for (const 位 of 基座格) 块.push({ 状态: 'goety:pedestal', 位 });
  块.push({ 状态: 'goety:cursed_cage', 位: 笼格 }, { 状态: 'goety:dark_altar[lit=true]', 位: 祭坛格 });
  return 块;
};

// 物品浮在哪：方块实体渲染器把物品（ItemDisplayContext.GROUND）放在方块底面往上 基座 1.1、祭坛 0.85、笼 0.25，每刻转 3 度；
// item/generated 的 ground 变换再往上 2/16、缩到 0.5
const 地面显示抬高 = 2 / 16;
export const 物品转速度每刻 = 3;
/** 第 i 个基座上祭品的中心 */
export const 祭品位置 = (i: number): V3 => [基座格[i]![0], 基座格[i]![1], 基座格[i]![2] + 1.1 + 地面显示抬高];
/** 祭坛上破碎之环的中心 */
export const 激活物位置: V3 = [0, 0, 祭坛格[2] + 0.85 + 地面显示抬高];
/** 笼里灵魂图腾的中心 */
export const 图腾位置: V3 = [0, 0, 笼格[2] + 0.25 + 地面显示抬高];
/** 祭坛那格的中心：光柱、完成的大烟、过渡实体都在这（SummonRitual.finish：方块坐标 + 0.5） */
export const 祭坛中心: V3 = [0, 0, 祭坛格[2] + 0.5];
/** 亚波伦现身的位置（脚底）= 过渡实体的位置 */
export const 现身位置: V3 = 祭坛中心;

// ---- 时长方案 ----
/**
 * 一套压缩后的时刻（秒，从放下破碎之环算起）。游戏里仪式 30 秒 + 过渡 22.5 秒，片里压短：
 * 转速、粒子怎么飞照真实时间走（不跟着快进），只有「进行到哪」（聚风带的疏密和粗细、几时起烟）按 过渡进度刻 映射。
 */
export type 召唤方案 = {
  名: string;
  /** 12 件祭品同时消失的时刻（用户 11-10 定同时消失；游戏里隔 2.3 秒一件） */
  祭品消失: number;
  /** 祭品消失前自己飞向祭坛、缩小的秒数。游戏里祭品不动（只往祭坛喷物品碎屑），0 = 照游戏；大于 0 是本片自己补的 */
  祭品飞入秒: number;
  /** 仪式完成：光柱、过渡实体出现 */
  完成: number;
  /** 提示「世界凝视着你....」、黑暗（游戏第 150 刻） */
  提示: number;
  /** 使徒低语、开始冒大烟（游戏第 300 刻） */
  低语: number;
  /** 雷声、火焰炸开、亚波伦现身（游戏第 450 刻） */
  现身: number;
  /** 整段到这里结束（现身后留给火焰散开） */
  总秒: number;
};

export const 召唤方案们 = {
  /** 约 6 秒：仪式 2.5 秒、过渡 3.5 秒 */
  短: { 名: '短', 祭品消失: 1.5, 祭品飞入秒: 0, 完成: 2.5, 提示: 3.6, 低语: 4.8, 现身: 6, 总秒: 7 },
  /** 约 10 秒：仪式 4 秒、过渡 6 秒 */
  长: { 名: '长', 祭品消失: 2.6, 祭品飞入秒: 0, 完成: 4, 提示: 6, 低语: 8, 现身: 10, 总秒: 11 },
} satisfies Record<string, 召唤方案>;

const 线 = (x: number, x0: number, x1: number, y0: number, y1: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);

/** 片里第几秒 → 相当于游戏里过渡实体的第几刻（0～450），分三段线性：完成→提示 是 0～150，提示→低语 是 150～300，低语→现身 是 300～450 */
export const 过渡进度刻 = (秒: number, 方案: 召唤方案): number => {
  if (秒 <= 方案.完成) return 0;
  if (秒 <= 方案.提示) return 线(秒, 方案.完成, 方案.提示, 0, 游戏.提示刻);
  if (秒 <= 方案.低语) return 线(秒, 方案.提示, 方案.低语, 游戏.提示刻, 游戏.低语刻);
  return Math.min(游戏.过渡刻, 线(秒, 方案.低语, 方案.现身, 游戏.低语刻, 游戏.过渡刻));
};

export type 召唤阶段 = '没开始' | '仪式' | '过渡' | '现身后';
export type 召唤状态 = {
  阶段: 召唤阶段;
  /** 祭坛上有破碎之环（仪式期间） */
  有激活物: boolean;
  /** 基座上的祭品：1 = 原样在基座上，0 = 没了；飞入期间在中间（位置按它往祭坛插，大小乘它） */
  祭品在: number;
  /** 基座是不是在往祭坛喷物品碎屑（祭品还在、仪式在进行） */
  喷碎屑: boolean;
  /** 过渡实体活了多少真实刻（没出现是负的） */
  过渡真实刻: number;
  /** 相当于游戏第几刻（疏密用） */
  过渡进度刻: number;
  /** 法阵的半边长（格）：开头 1.5 秒长到 3，现身前 0.5 秒缩回 0 */
  法阵半边: number;
  /** 两道环离法阵的高度（格）：年龄 × 0.3 封顶 2、年龄 × 0.6 封顶 4 */
  环高: readonly [number, number];
  /** 亚波伦出现了 */
  亚波伦在: boolean;
};

export const 召唤状态在 = (秒: number, 方案: 召唤方案): 召唤状态 => {
  const 阶段: 召唤阶段 = 秒 < 0 ? '没开始' : 秒 < 方案.完成 ? '仪式' : 秒 < 方案.现身 ? '过渡' : '现身后';
  const 真实刻 = (秒 - 方案.完成) * 20;
  const 剩刻 = (方案.现身 - 秒) * 20;
  const 活着 = 阶段 === '过渡';
  const 半边 = !活着 ? 0 : 剩刻 <= 游戏.法阵收回刻 ? (剩刻 / 游戏.法阵收回刻) * 游戏.法阵半边 : clamp(真实刻 * 0.1, 0, 游戏.法阵半边);
  const 飞入起 = 方案.祭品消失 - 方案.祭品飞入秒;
  const 祭品在 = 秒 >= 方案.祭品消失 ? 0 : 方案.祭品飞入秒 > 0 && 秒 > 飞入起 ? 1 - (秒 - 飞入起) / 方案.祭品飞入秒 : 1;
  return {
    阶段,
    有激活物: 阶段 === '仪式',
    祭品在,
    喷碎屑: 阶段 === '仪式' && 秒 < 方案.祭品消失,
    过渡真实刻: 活着 ? 真实刻 : -1,
    过渡进度刻: 过渡进度刻(秒, 方案),
    法阵半边: 半边,
    环高: 活着 ? [clamp(真实刻 * 0.3, 0.001, 2.001), clamp(真实刻 * 0.6, 0.001, 4.001)] : [0, 0],
    亚波伦在: 秒 >= 方案.现身,
  };
};

// ---- 声音 ----
/** 一声：资产 id（多选一的写了几个候选）、片里第几秒、游戏里的音量和音高。段.ts 里用 放() 照这张表排；本模块不放声音 */
export type 召唤声 = { 名: string; 资产: readonly string[]; 秒: number; 音量: number; 音高: string; 出处: string };
export const 召唤声音 = (方案: 召唤方案): 召唤声[] => {
  const 声: 召唤声[] = [
    { 名: '仪式开始', 资产: ['音效/仪式/goety.altar_start'], 秒: 0, 音量: 1, 音高: '0.8～1.2 随机', 出处: 'Ritual.start' },
    { 名: '仪式循环', 资产: ['音效/仪式/goety.altar_loop'], 秒: 0, 音量: 1, 音高: '0.8～1.2 随机', 出处: 'Ritual.update：世界时间每 4 秒整响一次，片里只在开头放一次' },
    { 名: '祭品被吃', 资产: ['音效/entity.item.pickup'], 秒: 方案.祭品消失, 音量: 0.7, 音高: '0.7', 出处: 'Ritual.consumeAdditionalIngredientFromPedestal：游戏里一件一声，片里同时消失只放一声' },
    { 名: '仪式完成', 资产: ['音效/仪式/goety.altar_finish'], 秒: 方案.完成, 音量: 1, 音高: '0.8～1.2 随机', 出处: 'Ritual.finish' },
    { 名: '提示', 资产: [1, 2, 3, 4, 5].map((n) => `音效/ambient.nether_wastes.mood.${n}`), 秒: 方案.提示, 音量: 1, 音高: '1', 出处: 'SummonApostle.tick 第 150 刻（启示录的 mixin 又放了一遍，同一刻两声）' },
    { 名: '使徒低语', 资产: [1, 2, 3, 4].map((n) => `音效/诡厄巫法/goety.apostle_ambient.${n}`), 秒: 方案.低语, 音量: 1, 音高: '1', 出处: 'SummonApostle.tick 第 300 刻' },
    { 名: '雷声', 资产: [1, 2, 3].map((n) => `音效/entity.lightning_bolt.thunder.${n}`), 秒: 方案.现身, 音量: 1, 音高: '1', 出处: 'SummonApostle.tick 第 450 刻；只有声音，没有闪电' },
  ];
  // 每秒扣一次灵魂：幽匿催发体绽放声、祭坛顶上两颗幽匿灵魂粒子（DarkAltarBlockEntity.tick，世界时间每 20 刻）
  for (let s = 1; s <= 方案.完成 + 1e-9; s++) 声.push({ 名: `扣灵魂${s}`, 资产: Array.from({ length: 13 }, (_, n) => `音效/block.sculk_catalyst.bloom.${n + 1}`), 秒: s, 音量: 1, 音高: '0.9～1.0 随机', 出处: 'DarkAltarBlockEntity.tick' });
  return 声.sort((a, b) => a.秒 - b.秒);
};
