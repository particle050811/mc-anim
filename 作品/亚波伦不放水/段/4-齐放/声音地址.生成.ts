// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import { 私有配乐 } from '@engine/audio/私有配乐.ts';
import 表 from './声音表.生成.ts';
import 声0 from "asset:音效/block.basalt.break.1";
import 声1 from "asset:音效/block.basalt.place.1";
import 声2 from "asset:音效/block.fire.ambient";
import 声3 from "asset:音效/block.glass.break.1";
import 声4 from "asset:音效/block.grindstone.use.1";
import 声5 from "asset:音效/entity.arrow.shoot";
import 声6 from "asset:音效/entity.blaze.ambient.1";
import 声7 from "asset:音效/entity.blaze.burn";
import 声8 from "asset:音效/entity.blaze.shoot";
import 声9 from "asset:音效/entity.dragon_fireball.explode.1";
import 声10 from "asset:音效/entity.drowned.shoot.1";
import 声11 from "asset:音效/entity.evoker.cast_spell.1";
import 声12 from "asset:音效/entity.evoker.prepare_attack.1";
import 声13 from "asset:音效/entity.evoker.prepare_attack.2";
import 声14 from "asset:音效/entity.evoker.prepare_summon";
import 声15 from "asset:音效/entity.evoker_fangs.attack";
import 声16 from "asset:音效/entity.generic.explode.1";
import 声17 from "asset:音效/entity.generic.splash.1";
import 声18 from "asset:音效/entity.generic.splash.2";
import 声19 from "asset:音效/entity.ghast.shoot";
import 声20 from "asset:音效/entity.lightning_bolt.impact.1";
import 声21 from "asset:音效/entity.lightning_bolt.thunder.1";
import 声22 from "asset:音效/entity.player.attack.sweep.1";
import 声23 from "asset:音效/entity.player.attack.sweep.2";
import 声24 from "asset:音效/entity.player.attack.sweep.3";
import 声25 from "asset:音效/entity.player.attack.sweep.4";
import 声26 from "asset:音效/entity.player.attack.sweep.5";
import 声27 from "asset:音效/entity.player.attack.sweep.6";
import 声28 from "asset:音效/entity.player.attack.sweep.7";
import 声29 from "asset:音效/entity.player.hurt.1";
import 声30 from "asset:音效/entity.player.hurt.2";
import 声31 from "asset:音效/entity.player.hurt.3";
import 声32 from "asset:音效/entity.player.hurt_freeze.1";
import 声33 from "asset:音效/entity.player.hurt_on_fire.1";
import 声34 from "asset:音效/entity.player.hurt_on_fire.2";
import 声35 from "asset:音效/entity.player.hurt_on_fire.3";
import 声36 from "asset:音效/entity.player.splash.high_speed";
import 声37 from "asset:音效/entity.warden.sonic_boom.1";
import 声38 from "asset:音效/entity.warden.sonic_charge.1";
import 声39 from "asset:音效/entity.wither.shoot";
import 声40 from "asset:音效/item.crossbow.loading_middle.1";
import 声41 from "asset:音效/item.totem.use";
import 声42 from "asset:音效/item.trident.hit.1";
import 声43 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.1";
import 声44 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.2";
import 声45 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.3";
import 声46 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.4";
import 声47 from "asset:音效/诡厄巫法/goety.apostle_cast_spell.1";
import 声48 from "asset:音效/诡厄巫法/goety.apostle_cast_spell.2";
import 声49 from "asset:音效/诡厄巫法/goety.apostle_prepare_spell.1";
import 声50 from "asset:音效/诡厄巫法/goety.apostle_prepare_spell.2";
import 声51 from "asset:音效/诡厄巫法/goety.biomine_spawn.1";
import 声52 from "asset:音效/诡厄巫法/goety.biomine_spawn.2";
import 声53 from "asset:音效/诡厄巫法/goety.biomine_spawn.3";
import 声54 from "asset:音效/诡厄巫法/goety.blast_fungus_throw.1";
import 声55 from "asset:音效/诡厄巫法/goety.bolt_impact.1";
import 声56 from "asset:音效/诡厄巫法/goety.bomb_load";
import 声57 from "asset:音效/诡厄巫法/goety.bomb_spawn.1";
import 声58 from "asset:音效/诡厄巫法/goety.cast_spell.1";
import 声59 from "asset:音效/诡厄巫法/goety.cast_spell.2";
import 声60 from "asset:音效/诡厄巫法/goety.cast_spell_two.1";
import 声61 from "asset:音效/诡厄巫法/goety.cast_steam.1";
import 声62 from "asset:音效/诡厄巫法/goety.cast_steam.2";
import 声63 from "asset:音效/诡厄巫法/goety.corrupt_beam_start.1";
import 声64 from "asset:音效/诡厄巫法/goety.dirt_debris.1";
import 声65 from "asset:音效/诡厄巫法/goety.fire_breath";
import 声66 from "asset:音效/诡厄巫法/goety.fire_breath_start";
import 声67 from "asset:音效/诡厄巫法/goety.fire_projectile_fly.1";
import 声68 from "asset:音效/诡厄巫法/goety.fire_tornado_ambient";
import 声69 from "asset:音效/诡厄巫法/goety.flight";
import 声70 from "asset:音效/诡厄巫法/goety.frost_breath";
import 声71 from "asset:音效/诡厄巫法/goety.frost_prepare_spell.1";
import 声72 from "asset:音效/诡厄巫法/goety.frost_prepare_spell.2";
import 声73 from "asset:音效/诡厄巫法/goety.frost_prepare_spell.3";
import 声74 from "asset:音效/诡厄巫法/goety.heavy_woosh.1";
import 声75 from "asset:音效/诡厄巫法/goety.heavy_woosh.2";
import 声76 from "asset:音效/诡厄巫法/goety.heavy_woosh.3";
import 声77 from "asset:音效/诡厄巫法/goety.heavy_woosh.4";
import 声78 from "asset:音效/诡厄巫法/goety.heavy_woosh.5";
import 声79 from "asset:音效/诡厄巫法/goety.hell_blast_impact.1";
import 声80 from "asset:音效/诡厄巫法/goety.ice_chunk_drop";
import 声81 from "asset:音效/诡厄巫法/goety.ice_chunk_hit";
import 声82 from "asset:音效/诡厄巫法/goety.ice_chunk_idle";
import 声83 from "asset:音效/诡厄巫法/goety.ice_chunk_summon";
import 声84 from "asset:音效/诡厄巫法/goety.ice_spike_cast";
import 声85 from "asset:音效/诡厄巫法/goety.ice_spike_hit.1";
import 声86 from "asset:音效/诡厄巫法/goety.insect_swarm.1";
import 声87 from "asset:音效/诡厄巫法/goety.insect_swarm.2";
import 声88 from "asset:音效/诡厄巫法/goety.master_fang_telegraph.1";
import 声89 from "asset:音效/诡厄巫法/goety.necromancer_summon.1";
import 声90 from "asset:音效/诡厄巫法/goety.poison_quill_impact.1";
import 声91 from "asset:音效/诡厄巫法/goety.poison_quill_vine_shoot.1";
import 声92 from "asset:音效/诡厄巫法/goety.prepare_spell.1";
import 声93 from "asset:音效/诡厄巫法/goety.prepare_spell.2";
import 声94 from "asset:音效/诡厄巫法/goety.prepare_summon.1";
import 声95 from "asset:音效/诡厄巫法/goety.prepare_summon.2";
import 声96 from "asset:音效/诡厄巫法/goety.quick_growing_vine_burrow.1";
import 声97 from "asset:音效/诡厄巫法/goety.quick_growing_vine_burst.1";
import 声98 from "asset:音效/诡厄巫法/goety.redstone_explode.1";
import 声99 from "asset:音效/诡厄巫法/goety.redstone_fire_projectile";
import 声100 from "asset:音效/诡厄巫法/goety.redstone_golem_electric_sparks.1";
import 声101 from "asset:音效/诡厄巫法/goety.rumble.1";
import 声102 from "asset:音效/诡厄巫法/goety.rumble.2";
import 声103 from "asset:音效/诡厄巫法/goety.shock_cast.1";
import 声104 from "asset:音效/诡厄巫法/goety.shock_cast.2";
import 声105 from "asset:音效/诡厄巫法/goety.shock_cast.3";
import 声106 from "asset:音效/诡厄巫法/goety.soul_bolt_cast";
import 声107 from "asset:音效/诡厄巫法/goety.soul_eat.1";
import 声108 from "asset:音效/诡厄巫法/goety.soul_eat.2";
import 声109 from "asset:音效/诡厄巫法/goety.soul_eat.3";
import 声110 from "asset:音效/诡厄巫法/goety.soul_explode.1";
import 声111 from "asset:音效/诡厄巫法/goety.steam_impact.1";
import 声112 from "asset:音效/诡厄巫法/goety.teleport_orb_throw";
import 声113 from "asset:音效/诡厄巫法/goety.thunderbolt.1";
import 声114 from "asset:音效/诡厄巫法/goety.tooth_spawn.1";
import 声115 from "asset:音效/诡厄巫法/goety.trident_storm_explode.1";
import 声116 from "asset:音效/诡厄巫法/goety.trident_storm_pre.1";
import 声117 from "asset:音效/诡厄巫法/goety.updraft_blast.1";
import 声118 from "asset:音效/诡厄巫法/goety.vex_vapor.1";
import 声119 from "asset:音效/诡厄巫法/goety.vine_trap_burst.1";
import 声120 from "asset:音效/诡厄巫法/goety.vine_trap_hold";
import 声121 from "asset:音效/诡厄巫法/goety.void_prepare_spell.1";
import 声122 from "asset:音效/诡厄巫法/goety.void_prepare_spell.2";
import 声123 from "asset:音效/诡厄巫法/goety.void_prepare_spell.3";
import 声124 from "asset:音效/诡厄巫法/goety.wall_erupt.1";
import 声125 from "asset:音效/诡厄巫法/goety.wall_spawn.1";
import 声126 from "asset:音效/诡厄巫法/goety.water_jet";
import 声127 from "asset:音效/诡厄巫法/goety.weaken_cast.1";
import 声128 from "asset:音效/诡厄巫法/goety.whip_swing.1";
import 声129 from "asset:音效/诡厄巫法/goety.whirlwind";
import 声130 from "asset:音效/诡厄巫法/goety.wild_prepare_spell";
import 声131 from "asset:音效/诡厄巫法/goety.wind.1";
import 声132 from "asset:音效/诡厄巫法/goety.wind_blast.1";
import 声133 from "asset:音效/诡厄巫法/goety.wind_horn";
import 声134 from "asset:音效/诡厄巫法/goety.wraith_fire";
import 声135 from "asset:音效/诡厄巫法/goety.zap.1";
import 声136 from "asset:音效/诡厄巫法/goety.zap.2";
import 声137 from "asset:音效/诡厄巫法/goety.zap.3";
import 声138 from "asset:音效/诡厄巫法/goety.zap.4";
import 声139 from "asset:音效/诡厄巫法/goety.zap.5";

const 声音: 声音地址 = {
  地址: {
    "配乐/亚波伦/決戦の刻": 私有配乐("配乐/亚波伦/決戦の刻"),
    "音效/block.basalt.break.1": 声0,
    "音效/block.basalt.place.1": 声1,
    "音效/block.fire.ambient": 声2,
    "音效/block.glass.break.1": 声3,
    "音效/block.grindstone.use.1": 声4,
    "音效/entity.arrow.shoot": 声5,
    "音效/entity.blaze.ambient.1": 声6,
    "音效/entity.blaze.burn": 声7,
    "音效/entity.blaze.shoot": 声8,
    "音效/entity.dragon_fireball.explode.1": 声9,
    "音效/entity.drowned.shoot.1": 声10,
    "音效/entity.evoker.cast_spell.1": 声11,
    "音效/entity.evoker.prepare_attack.1": 声12,
    "音效/entity.evoker.prepare_attack.2": 声13,
    "音效/entity.evoker.prepare_summon": 声14,
    "音效/entity.evoker_fangs.attack": 声15,
    "音效/entity.generic.explode.1": 声16,
    "音效/entity.generic.splash.1": 声17,
    "音效/entity.generic.splash.2": 声18,
    "音效/entity.ghast.shoot": 声19,
    "音效/entity.lightning_bolt.impact.1": 声20,
    "音效/entity.lightning_bolt.thunder.1": 声21,
    "音效/entity.player.attack.sweep.1": 声22,
    "音效/entity.player.attack.sweep.2": 声23,
    "音效/entity.player.attack.sweep.3": 声24,
    "音效/entity.player.attack.sweep.4": 声25,
    "音效/entity.player.attack.sweep.5": 声26,
    "音效/entity.player.attack.sweep.6": 声27,
    "音效/entity.player.attack.sweep.7": 声28,
    "音效/entity.player.hurt.1": 声29,
    "音效/entity.player.hurt.2": 声30,
    "音效/entity.player.hurt.3": 声31,
    "音效/entity.player.hurt_freeze.1": 声32,
    "音效/entity.player.hurt_on_fire.1": 声33,
    "音效/entity.player.hurt_on_fire.2": 声34,
    "音效/entity.player.hurt_on_fire.3": 声35,
    "音效/entity.player.splash.high_speed": 声36,
    "音效/entity.warden.sonic_boom.1": 声37,
    "音效/entity.warden.sonic_charge.1": 声38,
    "音效/entity.wither.shoot": 声39,
    "音效/item.crossbow.loading_middle.1": 声40,
    "音效/item.totem.use": 声41,
    "音效/item.trident.hit.1": 声42,
    "音效/诡厄巫法/goety.abyss_prepare_spell.1": 声43,
    "音效/诡厄巫法/goety.abyss_prepare_spell.2": 声44,
    "音效/诡厄巫法/goety.abyss_prepare_spell.3": 声45,
    "音效/诡厄巫法/goety.abyss_prepare_spell.4": 声46,
    "音效/诡厄巫法/goety.apostle_cast_spell.1": 声47,
    "音效/诡厄巫法/goety.apostle_cast_spell.2": 声48,
    "音效/诡厄巫法/goety.apostle_prepare_spell.1": 声49,
    "音效/诡厄巫法/goety.apostle_prepare_spell.2": 声50,
    "音效/诡厄巫法/goety.biomine_spawn.1": 声51,
    "音效/诡厄巫法/goety.biomine_spawn.2": 声52,
    "音效/诡厄巫法/goety.biomine_spawn.3": 声53,
    "音效/诡厄巫法/goety.blast_fungus_throw.1": 声54,
    "音效/诡厄巫法/goety.bolt_impact.1": 声55,
    "音效/诡厄巫法/goety.bomb_load": 声56,
    "音效/诡厄巫法/goety.bomb_spawn.1": 声57,
    "音效/诡厄巫法/goety.cast_spell.1": 声58,
    "音效/诡厄巫法/goety.cast_spell.2": 声59,
    "音效/诡厄巫法/goety.cast_spell_two.1": 声60,
    "音效/诡厄巫法/goety.cast_steam.1": 声61,
    "音效/诡厄巫法/goety.cast_steam.2": 声62,
    "音效/诡厄巫法/goety.corrupt_beam_start.1": 声63,
    "音效/诡厄巫法/goety.dirt_debris.1": 声64,
    "音效/诡厄巫法/goety.fire_breath": 声65,
    "音效/诡厄巫法/goety.fire_breath_start": 声66,
    "音效/诡厄巫法/goety.fire_projectile_fly.1": 声67,
    "音效/诡厄巫法/goety.fire_tornado_ambient": 声68,
    "音效/诡厄巫法/goety.flight": 声69,
    "音效/诡厄巫法/goety.frost_breath": 声70,
    "音效/诡厄巫法/goety.frost_prepare_spell.1": 声71,
    "音效/诡厄巫法/goety.frost_prepare_spell.2": 声72,
    "音效/诡厄巫法/goety.frost_prepare_spell.3": 声73,
    "音效/诡厄巫法/goety.heavy_woosh.1": 声74,
    "音效/诡厄巫法/goety.heavy_woosh.2": 声75,
    "音效/诡厄巫法/goety.heavy_woosh.3": 声76,
    "音效/诡厄巫法/goety.heavy_woosh.4": 声77,
    "音效/诡厄巫法/goety.heavy_woosh.5": 声78,
    "音效/诡厄巫法/goety.hell_blast_impact.1": 声79,
    "音效/诡厄巫法/goety.ice_chunk_drop": 声80,
    "音效/诡厄巫法/goety.ice_chunk_hit": 声81,
    "音效/诡厄巫法/goety.ice_chunk_idle": 声82,
    "音效/诡厄巫法/goety.ice_chunk_summon": 声83,
    "音效/诡厄巫法/goety.ice_spike_cast": 声84,
    "音效/诡厄巫法/goety.ice_spike_hit.1": 声85,
    "音效/诡厄巫法/goety.insect_swarm.1": 声86,
    "音效/诡厄巫法/goety.insect_swarm.2": 声87,
    "音效/诡厄巫法/goety.master_fang_telegraph.1": 声88,
    "音效/诡厄巫法/goety.necromancer_summon.1": 声89,
    "音效/诡厄巫法/goety.poison_quill_impact.1": 声90,
    "音效/诡厄巫法/goety.poison_quill_vine_shoot.1": 声91,
    "音效/诡厄巫法/goety.prepare_spell.1": 声92,
    "音效/诡厄巫法/goety.prepare_spell.2": 声93,
    "音效/诡厄巫法/goety.prepare_summon.1": 声94,
    "音效/诡厄巫法/goety.prepare_summon.2": 声95,
    "音效/诡厄巫法/goety.quick_growing_vine_burrow.1": 声96,
    "音效/诡厄巫法/goety.quick_growing_vine_burst.1": 声97,
    "音效/诡厄巫法/goety.redstone_explode.1": 声98,
    "音效/诡厄巫法/goety.redstone_fire_projectile": 声99,
    "音效/诡厄巫法/goety.redstone_golem_electric_sparks.1": 声100,
    "音效/诡厄巫法/goety.rumble.1": 声101,
    "音效/诡厄巫法/goety.rumble.2": 声102,
    "音效/诡厄巫法/goety.shock_cast.1": 声103,
    "音效/诡厄巫法/goety.shock_cast.2": 声104,
    "音效/诡厄巫法/goety.shock_cast.3": 声105,
    "音效/诡厄巫法/goety.soul_bolt_cast": 声106,
    "音效/诡厄巫法/goety.soul_eat.1": 声107,
    "音效/诡厄巫法/goety.soul_eat.2": 声108,
    "音效/诡厄巫法/goety.soul_eat.3": 声109,
    "音效/诡厄巫法/goety.soul_explode.1": 声110,
    "音效/诡厄巫法/goety.steam_impact.1": 声111,
    "音效/诡厄巫法/goety.teleport_orb_throw": 声112,
    "音效/诡厄巫法/goety.thunderbolt.1": 声113,
    "音效/诡厄巫法/goety.tooth_spawn.1": 声114,
    "音效/诡厄巫法/goety.trident_storm_explode.1": 声115,
    "音效/诡厄巫法/goety.trident_storm_pre.1": 声116,
    "音效/诡厄巫法/goety.updraft_blast.1": 声117,
    "音效/诡厄巫法/goety.vex_vapor.1": 声118,
    "音效/诡厄巫法/goety.vine_trap_burst.1": 声119,
    "音效/诡厄巫法/goety.vine_trap_hold": 声120,
    "音效/诡厄巫法/goety.void_prepare_spell.1": 声121,
    "音效/诡厄巫法/goety.void_prepare_spell.2": 声122,
    "音效/诡厄巫法/goety.void_prepare_spell.3": 声123,
    "音效/诡厄巫法/goety.wall_erupt.1": 声124,
    "音效/诡厄巫法/goety.wall_spawn.1": 声125,
    "音效/诡厄巫法/goety.water_jet": 声126,
    "音效/诡厄巫法/goety.weaken_cast.1": 声127,
    "音效/诡厄巫法/goety.whip_swing.1": 声128,
    "音效/诡厄巫法/goety.whirlwind": 声129,
    "音效/诡厄巫法/goety.wild_prepare_spell": 声130,
    "音效/诡厄巫法/goety.wind.1": 声131,
    "音效/诡厄巫法/goety.wind_blast.1": 声132,
    "音效/诡厄巫法/goety.wind_horn": 声133,
    "音效/诡厄巫法/goety.wraith_fire": 声134,
    "音效/诡厄巫法/goety.zap.1": 声135,
    "音效/诡厄巫法/goety.zap.2": 声136,
    "音效/诡厄巫法/goety.zap.3": 声137,
    "音效/诡厄巫法/goety.zap.4": 声138,
    "音效/诡厄巫法/goety.zap.5": 声139,
  },
  表,
};
export default 声音;
