// 每个法术游戏里起手响的那一声（法术类的 CastingSound：瞬发的出手当刻响，蓄力、引导的蓄的时候响），按注册名查。纯模块。
// 出处是 声音表.md 第 2 节「施放声」一栏（照两个模组的反编译源码读的）；一个声音事件有几个文件的列全，游戏里随机挑一个，用的人轮着用。
// 游戏里读不到施放声的 6 个（雷暴、水蛭、水柱、卫射、霜呼、虫群）填的是同学派别的法术用的起手声，Agent 取的：雷暴 zap（风暴学派大多是它）、
// 水蛭 prepare_summon（死灵）、水柱和卫射 abyss_prepare_spell（深渊）、霜呼 frost_prepare_spell（霜冻）、虫群 wild_prepare_spell（荒野）。
// 一栏里写了两个事件的（熔岩炸弹、飓风、撕咬、流星雨）取第一个。
// 凋灵寂灭游戏里是启示录的 quietus_beam，那是私有音效、公开构建不能打进包（私有的只有配乐能按 cue 现取），换成凋灵射击，Agent 取的。
const 本 = (名: string, n = 0) => (n ? Array.from({ length: n }, (_, i) => `音效/诡厄巫法/goety.${名}.${i + 1}`) : [`音效/诡厄巫法/goety.${名}`]);
const 原 = (名: string, n = 0) => (n ? Array.from({ length: n }, (_, i) => `音效/${名}.${i + 1}`) : [`音效/${名}`]);

const 起手 = 本('prepare_spell', 2);
const 霜 = 本('frost_prepare_spell', 3);
const 虚 = 本('void_prepare_spell', 4);
const 野 = 本('wild_prepare_spell');
const 渊 = 本('abyss_prepare_spell', 4);
const 使徒 = 本('apostle_prepare_spell', 2);
const 电 = 本('zap', 6);
const 唤 = 本('prepare_summon', 2);
const 唤魔 = 原('entity.evoker.prepare_attack', 2);

/** 注册名 → 资产 id（几个变体） */
export const 施放声: Readonly<Record<string, readonly string[]>> = {
  revelation: 使徒,
  fireball: 原('entity.blaze.burn'),
  ice_spike: 霜,
  whirlwind: 本('wind', 4),
  bolting: 电,
  teeth: 唤魔,
  razor_wind: 起手,
  lightning: 起手,
  soul_bolt: 本('cast_spell', 4),
  magic_bolt: 本('cast_spell', 4),
  sword: 原('entity.drowned.shoot', 2),
  poison_dart: 野,
  lavaball: 使徒,
  wither_skull: 原('entity.wither.shoot'),
  stellar: 虚,
  bouncy_bubble: 原('entity.generic.splash', 2),
  smack_stone: 起手,
  surging: 电,
  steaming: 本('cast_steam', 4),
  bombardment: 原('entity.blaze.ambient', 4),
  sonic_boom: 原('entity.warden.sonic_charge', 4),
  wind_blast: 起手,
  ice_storm: 霜,
  cyclone: 使徒,
  tidal: 渊,
  barricade: 唤魔,
  overgrowth: 野,
  biting: 本('master_fang_telegraph', 2),
  feast: 唤魔,
  shredding: 原('entity.evoker.prepare_summon'),
  ghost_fire: 唤,
  flame_strike: 本('rumble', 3),
  blossoming: 野,
  electrocute: 起手,
  biomine: 渊,
  void_flash: 虚,
  entangling: 野,
  updraft: 起手,
  earth_punch: 唤,
  eruption: 起手,
  rupture: 虚,
  arrow_rain: 原('item.crossbow.loading_middle', 10),
  hail: 霜,
  blizzard: 霜,
  meteor_shower: 使徒,
  monsoon: 起手,
  thunderstorm: 电,
  iceology: 起手,
  corruption: 本('corrupt_beam_start', 2),
  leeching: 唤,
  shocking: 电,
  thunderbolt: 电,
  water_jet: 渊,
  prisma_beam: 渊,
  wither_quietus: 原('entity.wither.shoot'),
  temblor_clap: 起手,
  quaking: 本('rumble', 3),
  shockwave: 起手,
  weakening: 本('weaken_cast', 4),
  frost_nova: 霜,
  trembling: 起手,
  discharge: 起手,
  fire_blast: 起手,
  frost_breath: 霜,
  fire_breath: 本('fire_breath_start'),
  swarm: 野,
  ice: 霜,
  trident_storm: 本('trident_storm_pre', 4),
  scatter: 起手,
  water_whip: 原('entity.generic.splash', 2),
  killing: 起手,
};
