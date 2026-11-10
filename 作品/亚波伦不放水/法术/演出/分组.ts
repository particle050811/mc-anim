// 71 个进齐放的法术怎么分给四个组（纯数据）。按画面类型分，工作量照 法术表.ts 的难度估（易 1、中 2、难 4）尽量摊平；三个样板已经做了，不进组。
// 各组做完一个，就在自己的 组/<组>.ts、组/<组>.tsx 里各加一行；分组.test.ts 查没人做到别组的法术。
export const 法术分组 = {
  样板: ['soul_bolt', 'ghost_fire', 'thunderbolt'],
  // 甲：弹道、飞行物、从天上落下来的一群；乙：地面上长出来的实体模型；丙：束、电弧、吐息；丁：环、爆、云、区域粒子
  甲: ['magic_bolt', 'sword', 'ice_spike', 'poison_dart', 'razor_wind', 'bouncy_bubble', 'smack_stone', 'fireball', 'lavaball', 'bombardment', 'wither_skull', 'steaming', 'surging', 'stellar', 'void_flash', 'electrocute', 'ice_storm', 'cyclone', 'tidal', 'blossoming', 'meteor_shower', 'arrow_rain', 'blizzard'],
  乙: ['biting', 'feast', 'teeth', 'shredding', 'barricade', 'earth_punch', 'eruption', 'iceology', 'entangling', 'scatter', 'biomine', 'trident_storm', 'overgrowth', 'water_whip', 'quaking'],
  丙: ['corruption', 'leeching', 'water_jet', 'prisma_beam', 'wind_blast', 'frost_breath', 'fire_breath', 'swarm', 'sonic_boom', 'lightning', 'killing', 'shocking', 'discharge', 'wither_quietus'],
  丁: ['shockwave', 'weakening', 'frost_nova', 'trembling', 'temblor_clap', 'fire_blast', 'whirlwind', 'bolting', 'updraft', 'flame_strike', 'hail', 'monsoon', 'thunderstorm', 'rupture', 'ice', 'revelation'],
} as const satisfies Record<string, readonly string[]>;

export type 法术组名 = keyof typeof 法术分组;
