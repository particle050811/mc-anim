// 维度：环境描述（环境.ts）里的「在哪个维度」。字段照 MC 的 dimension_type 和 DimensionSpecialEffects，只收灯光、天空用得上的。
// 纯数据。原版三个照 1.20.1 client（srg jar 里 javap 对过 net/minecraft/data/worldgen/DimensionTypes、DimensionSpecialEffects$*Effects 的构造参数）。
// 加模组维度：别往这个文件里堆，在 库/维度/<模组>.ts 另写一个 维度信息 常量（改这里会让所有用到 <环境> 的段过期）。暮色森林放这里是因为 engine/light 已有暮色那套画法。

export type 维度信息 = {
  /** 维度 id（resource location） */
  id: string;
  /** dimension_type 的 fixed_time：有就是时间固定（时刻不随游戏走），给了别的 时刻 也不起作用 */
  固定时刻?: number;
  /** has_skylight：有没有天光（下界、末地没有） */
  有天光: boolean;
  /** has_ceiling：头上有没有基岩顶 */
  有天花板: boolean;
  /** ambient_light：最暗处也有的亮度（0～1，下界 0.1） */
  环境光: number;
  /** effects：天空、云、雾用哪套客户端效果 */
  效果: string;
  /** 原版方块云的高度（DimensionSpecialEffects 的 cloudLevel，世界 y）；NaN = 这个维度没有云；null = 没核对过 */
  云高: number | null;
  /** 数从哪来 */
  出处: string;
};

export const 主世界: 维度信息 = {
  id: 'minecraft:overworld',
  有天光: true,
  有天花板: false,
  环境光: 0,
  效果: 'minecraft:overworld',
  云高: 192,
  出处: '1.20.1 DimensionTypes.bootstrap；云高 DimensionSpecialEffects$OverworldEffects',
};

export const 下界: 维度信息 = {
  id: 'minecraft:the_nether',
  固定时刻: 18000,
  有天光: false,
  有天花板: true,
  环境光: 0.1,
  效果: 'minecraft:the_nether',
  云高: NaN,
  出处: '1.20.1 DimensionTypes.bootstrap；云高 DimensionSpecialEffects$NetherEffects',
};

export const 末地: 维度信息 = {
  id: 'minecraft:the_end',
  固定时刻: 6000,
  有天光: false,
  有天花板: false,
  环境光: 0,
  效果: 'minecraft:the_end',
  云高: NaN,
  出处: '1.20.1 DimensionTypes.bootstrap；云高 DimensionSpecialEffects$EndEffects',
};

// 云高在模组注册 TwilightForestRenderInfo 时传入，没核对，记 null
export const 暮色森林: 维度信息 = {
  id: 'twilightforest:twilight_forest',
  固定时刻: 13000,
  有天光: true,
  有天花板: false,
  环境光: 0,
  效果: 'twilightforest:renderer',
  云高: null,
  出处: 'twilightforest-1.20.1-4.3.2508 data/twilightforest/dimension_type/twilight_forest_type.json',
};
