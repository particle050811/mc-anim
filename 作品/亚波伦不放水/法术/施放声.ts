// 每个法术游戏里起手响的那一声（法术类的 CastingSound：瞬发的出手当刻响，蓄力、引导的蓄的时候响），按注册名查。纯模块。
// 出处是 声音表.md 第 2 节「施放声」一栏（照两个模组的反编译源码读的）；一个声音事件有几个文件的列全，游戏里随机挑一个，用的人轮着用。
// 游戏里读不到施放声的 6 个（雷暴、水蛭、水柱、卫射、霜呼、虫群）填的是同学派别的法术用的起手声，Agent 取的：雷暴 zap（风暴学派大多是它）、
// 水蛭 prepare_summon（死灵）、水柱和卫射 abyss_prepare_spell（深渊）、霜呼 frost_prepare_spell（霜冻）、虫群 wild_prepare_spell（荒野）。
// 一栏里写了两个事件的（熔岩炸弹、飓风、撕咬、流星雨）取第一个。
// 凋灵寂灭游戏里是启示录的 quietus_beam，那是私有音效、公开构建不能打进包（私有的只有配乐能按 cue 现取），换成凋灵射击，Agent 取的。
const spellSounds = (soundName: string, n = 0) => (n ? Array.from({ length: n }, (_, i) => `音效/诡厄巫法/goety.${soundName}.${i + 1}`) : [`音效/诡厄巫法/goety.${soundName}`]);
const soundPaths = (soundName: string, n = 0) => (n ? Array.from({ length: n }, (_, i) => `音效/${soundName}.${i + 1}`) : [`音效/${soundName}`]);

const prepareSound = spellSounds('prepare_spell', 2);
const frostSound = spellSounds('frost_prepare_spell', 3);
const voidSound = spellSounds('void_prepare_spell', 4);
const wildSound = spellSounds('wild_prepare_spell');
const abyssSound = spellSounds('abyss_prepare_spell', 4);
const apostleSound = spellSounds('apostle_prepare_spell', 2);
const zapSound = spellSounds('zap', 6);
const summonSound = spellSounds('prepare_summon', 2);
const evokerSound = soundPaths('entity.evoker.prepare_attack', 2);

/** 注册名 → 资产 id（几个变体） */
export const castSounds: Readonly<Record<string, readonly string[]>> = {
  revelation: apostleSound,
  fireball: soundPaths('entity.blaze.burn'),
  ice_spike: frostSound,
  whirlwind: spellSounds('wind', 4),
  bolting: zapSound,
  teeth: evokerSound,
  razor_wind: prepareSound,
  lightning: prepareSound,
  soul_bolt: spellSounds('cast_spell', 4),
  magic_bolt: spellSounds('cast_spell', 4),
  sword: soundPaths('entity.drowned.shoot', 2),
  poison_dart: wildSound,
  lavaball: apostleSound,
  wither_skull: soundPaths('entity.wither.shoot'),
  stellar: voidSound,
  bouncy_bubble: soundPaths('entity.generic.splash', 2),
  smack_stone: prepareSound,
  surging: zapSound,
  steaming: spellSounds('cast_steam', 4),
  bombardment: soundPaths('entity.blaze.ambient', 4),
  sonic_boom: soundPaths('entity.warden.sonic_charge', 4),
  wind_blast: prepareSound,
  ice_storm: frostSound,
  cyclone: apostleSound,
  tidal: abyssSound,
  barricade: evokerSound,
  overgrowth: wildSound,
  biting: spellSounds('master_fang_telegraph', 2),
  feast: evokerSound,
  shredding: soundPaths('entity.evoker.prepare_summon'),
  ghost_fire: summonSound,
  flame_strike: spellSounds('rumble', 3),
  blossoming: wildSound,
  electrocute: prepareSound,
  biomine: abyssSound,
  void_flash: voidSound,
  entangling: wildSound,
  updraft: prepareSound,
  earth_punch: summonSound,
  eruption: prepareSound,
  rupture: voidSound,
  arrow_rain: soundPaths('item.crossbow.loading_middle', 10),
  hail: frostSound,
  blizzard: frostSound,
  meteor_shower: apostleSound,
  monsoon: prepareSound,
  thunderstorm: zapSound,
  iceology: prepareSound,
  corruption: spellSounds('corrupt_beam_start', 2),
  leeching: summonSound,
  shocking: zapSound,
  thunderbolt: zapSound,
  water_jet: abyssSound,
  prisma_beam: abyssSound,
  wither_quietus: soundPaths('entity.wither.shoot'),
  temblor_clap: prepareSound,
  quaking: spellSounds('rumble', 3),
  shockwave: prepareSound,
  weakening: spellSounds('weaken_cast', 4),
  frost_nova: frostSound,
  trembling: prepareSound,
  discharge: prepareSound,
  fire_blast: prepareSound,
  frost_breath: frostSound,
  fire_breath: spellSounds('fire_breath_start'),
  swarm: wildSound,
  ice: frostSound,
  trident_storm: spellSounds('trident_storm_pre', 4),
  scatter: prepareSound,
  water_whip: soundPaths('entity.generic.splash', 2),
  killing: prepareSound,
};
