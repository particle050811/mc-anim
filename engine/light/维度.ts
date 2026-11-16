// 维度：环境描述（环境.ts）里的「在哪个维度」。字段照 MC 的 dimension_type 和 DimensionSpecialEffects，只收灯光、天空用得上的。
// 纯数据。原版三个照 1.20.1 client（srg jar 里 javap 对过 net/minecraft/data/worldgen/DimensionTypes、DimensionSpecialEffects$*Effects 的构造参数）。
// 加模组维度：别往这个文件里堆，在 库/维度/<模组>.ts 另写一个 维度信息 常量（改这里会让所有用到 <环境> 的段过期）。暮色森林放这里是因为 engine/light 已有暮色那套画法。

export type DimensionInfo = {
  /** 维度 id（resource location） */
  id: string;
  /** dimension_type 的 fixed_time：有就是时间固定（时刻不随游戏走），给了别的 时刻 也不起作用 */
  fixedGameTime?: number;
  /** has_skylight：有没有天光（下界、末地没有） */
  hasSkyLight: boolean;
  /** has_ceiling：头上有没有基岩顶 */
  hasCeiling: boolean;
  /** ambient_light：最暗处也有的亮度（0～1，下界 0.1） */
  ambient: number;
  /** effects：天空、云、雾用哪套客户端效果 */
  effect: string;
  /** 原版方块云的高度（DimensionSpecialEffects 的 cloudLevel，世界 y）；NaN = 这个维度没有云；null = 没核对过 */
  cloudHeight: number | null;
  /** 数从哪来 */
  provenance: string;
};

export const overworld: DimensionInfo = {
  id: 'minecraft:overworld',
  hasSkyLight: true,
  hasCeiling: false,
  ambient: 0,
  effect: 'minecraft:overworld',
  cloudHeight: 192,
  provenance: '1.20.1 DimensionTypes.bootstrap；云高 DimensionSpecialEffects$OverworldEffects',
};

export const nether: DimensionInfo = {
  id: 'minecraft:the_nether',
  fixedGameTime: 18000,
  hasSkyLight: false,
  hasCeiling: true,
  ambient: 0.1,
  effect: 'minecraft:the_nether',
  cloudHeight: NaN,
  provenance: '1.20.1 DimensionTypes.bootstrap；云高 DimensionSpecialEffects$NetherEffects',
};
// 云高在模组注册 TwilightForestRenderInfo 时传入，没核对，记 null
export const twilightForest: DimensionInfo = {
  id: 'twilightforest:twilight_forest',
  fixedGameTime: 13000,
  hasSkyLight: true,
  hasCeiling: false,
  ambient: 0,
  effect: 'twilightforest:renderer',
  cloudHeight: null,
  provenance: 'twilightforest-1.20.1-4.3.2508 data/twilightforest/dimension_type/twilight_forest_type.json',
};
