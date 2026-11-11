// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import { 私有配乐 } from '@engine/audio/私有配乐.ts';
import 表 from './声音表.生成.ts';
import 声0 from "asset:音效/ambient.nether_wastes.mood.2";
import 声1 from "asset:音效/block.basalt.break.1";
import 声2 from "asset:音效/block.basalt.place.1";
import 声3 from "asset:音效/block.fire.ambient";
import 声4 from "asset:音效/entity.blaze.burn";
import 声5 from "asset:音效/entity.blaze.shoot";
import 声6 from "asset:音效/entity.drowned.shoot.1";
import 声7 from "asset:音效/entity.drowned.shoot.2";
import 声8 from "asset:音效/entity.evoker.cast_spell.1";
import 声9 from "asset:音效/entity.evoker.prepare_attack.1";
import 声10 from "asset:音效/entity.evoker.prepare_attack.2";
import 声11 from "asset:音效/entity.generic.explode.1";
import 声12 from "asset:音效/entity.ghast.shoot";
import 声13 from "asset:音效/entity.lightning_bolt.impact.1";
import 声14 from "asset:音效/entity.lightning_bolt.thunder.1";
import 声15 from "asset:音效/entity.player.attack.sweep.1";
import 声16 from "asset:音效/entity.player.attack.sweep.2";
import 声17 from "asset:音效/entity.player.attack.sweep.3";
import 声18 from "asset:音效/entity.player.attack.sweep.4";
import 声19 from "asset:音效/entity.player.attack.sweep.5";
import 声20 from "asset:音效/entity.player.attack.sweep.6";
import 声21 from "asset:音效/entity.player.attack.sweep.7";
import 声22 from "asset:音效/entity.player.hurt.1";
import 声23 from "asset:音效/entity.player.hurt.2";
import 声24 from "asset:音效/entity.player.hurt.3";
import 声25 from "asset:音效/entity.player.hurt_freeze.1";
import 声26 from "asset:音效/entity.player.splash.high_speed";
import 声27 from "asset:音效/entity.warden.sonic_boom.1";
import 声28 from "asset:音效/entity.warden.sonic_charge.1";
import 声29 from "asset:音效/entity.warden.sonic_charge.2";
import 声30 from "asset:音效/entity.warden.sonic_charge.3";
import 声31 from "asset:音效/entity.warden.sonic_charge.4";
import 声32 from "asset:音效/entity.wither.shoot";
import 声33 from "asset:音效/item.totem.use";
import 声34 from "asset:音效/item.trident.hit.1";
import 声35 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.1";
import 声36 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.2";
import 声37 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.3";
import 声38 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.4";
import 声39 from "asset:音效/诡厄巫法/goety.apostle_cast_spell.1";
import 声40 from "asset:音效/诡厄巫法/goety.apostle_prepare_spell.1";
import 声41 from "asset:音效/诡厄巫法/goety.apostle_prepare_spell.2";
import 声42 from "asset:音效/诡厄巫法/goety.blast_fungus_throw.1";
import 声43 from "asset:音效/诡厄巫法/goety.cast_spell.1";
import 声44 from "asset:音效/诡厄巫法/goety.cast_spell.2";
import 声45 from "asset:音效/诡厄巫法/goety.cast_spell.3";
import 声46 from "asset:音效/诡厄巫法/goety.cast_spell.4";
import 声47 from "asset:音效/诡厄巫法/goety.flight";
import 声48 from "asset:音效/诡厄巫法/goety.frost_prepare_spell.1";
import 声49 from "asset:音效/诡厄巫法/goety.frost_prepare_spell.2";
import 声50 from "asset:音效/诡厄巫法/goety.frost_prepare_spell.3";
import 声51 from "asset:音效/诡厄巫法/goety.heavy_woosh.1";
import 声52 from "asset:音效/诡厄巫法/goety.heavy_woosh.2";
import 声53 from "asset:音效/诡厄巫法/goety.heavy_woosh.3";
import 声54 from "asset:音效/诡厄巫法/goety.ice_spike_cast";
import 声55 from "asset:音效/诡厄巫法/goety.ice_spike_hit.1";
import 声56 from "asset:音效/诡厄巫法/goety.poison_quill_impact.1";
import 声57 from "asset:音效/诡厄巫法/goety.poison_quill_vine_shoot.1";
import 声58 from "asset:音效/诡厄巫法/goety.prepare_spell.1";
import 声59 from "asset:音效/诡厄巫法/goety.prepare_spell.2";
import 声60 from "asset:音效/诡厄巫法/goety.prepare_summon.1";
import 声61 from "asset:音效/诡厄巫法/goety.prepare_summon.2";
import 声62 from "asset:音效/诡厄巫法/goety.quick_growing_vine_burrow.1";
import 声63 from "asset:音效/诡厄巫法/goety.rumble.1";
import 声64 from "asset:音效/诡厄巫法/goety.shock_cast.1";
import 声65 from "asset:音效/诡厄巫法/goety.soul_bolt_cast";
import 声66 from "asset:音效/诡厄巫法/goety.teleport_orb_throw";
import 声67 from "asset:音效/诡厄巫法/goety.thunder_strike_fast.1";
import 声68 from "asset:音效/诡厄巫法/goety.thunderbolt.1";
import 声69 from "asset:音效/诡厄巫法/goety.tooth_spawn.1";
import 声70 from "asset:音效/诡厄巫法/goety.vex_vapor.1";
import 声71 from "asset:音效/诡厄巫法/goety.void_prepare_spell.1";
import 声72 from "asset:音效/诡厄巫法/goety.void_prepare_spell.2";
import 声73 from "asset:音效/诡厄巫法/goety.void_prepare_spell.4";
import 声74 from "asset:音效/诡厄巫法/goety.wall_erupt.1";
import 声75 from "asset:音效/诡厄巫法/goety.wild_prepare_spell";
import 声76 from "asset:音效/诡厄巫法/goety.wind.1";
import 声77 from "asset:音效/诡厄巫法/goety.wind_blast.1";
import 声78 from "asset:音效/诡厄巫法/goety.zap.1";

const 声音: 声音地址 = {
  地址: {
    "配乐/亚波伦/決戦の刻": 私有配乐("配乐/亚波伦/決戦の刻"),
    "音效/ambient.nether_wastes.mood.2": 声0,
    "音效/block.basalt.break.1": 声1,
    "音效/block.basalt.place.1": 声2,
    "音效/block.fire.ambient": 声3,
    "音效/entity.blaze.burn": 声4,
    "音效/entity.blaze.shoot": 声5,
    "音效/entity.drowned.shoot.1": 声6,
    "音效/entity.drowned.shoot.2": 声7,
    "音效/entity.evoker.cast_spell.1": 声8,
    "音效/entity.evoker.prepare_attack.1": 声9,
    "音效/entity.evoker.prepare_attack.2": 声10,
    "音效/entity.generic.explode.1": 声11,
    "音效/entity.ghast.shoot": 声12,
    "音效/entity.lightning_bolt.impact.1": 声13,
    "音效/entity.lightning_bolt.thunder.1": 声14,
    "音效/entity.player.attack.sweep.1": 声15,
    "音效/entity.player.attack.sweep.2": 声16,
    "音效/entity.player.attack.sweep.3": 声17,
    "音效/entity.player.attack.sweep.4": 声18,
    "音效/entity.player.attack.sweep.5": 声19,
    "音效/entity.player.attack.sweep.6": 声20,
    "音效/entity.player.attack.sweep.7": 声21,
    "音效/entity.player.hurt.1": 声22,
    "音效/entity.player.hurt.2": 声23,
    "音效/entity.player.hurt.3": 声24,
    "音效/entity.player.hurt_freeze.1": 声25,
    "音效/entity.player.splash.high_speed": 声26,
    "音效/entity.warden.sonic_boom.1": 声27,
    "音效/entity.warden.sonic_charge.1": 声28,
    "音效/entity.warden.sonic_charge.2": 声29,
    "音效/entity.warden.sonic_charge.3": 声30,
    "音效/entity.warden.sonic_charge.4": 声31,
    "音效/entity.wither.shoot": 声32,
    "音效/item.totem.use": 声33,
    "音效/item.trident.hit.1": 声34,
    "音效/诡厄巫法/goety.abyss_prepare_spell.1": 声35,
    "音效/诡厄巫法/goety.abyss_prepare_spell.2": 声36,
    "音效/诡厄巫法/goety.abyss_prepare_spell.3": 声37,
    "音效/诡厄巫法/goety.abyss_prepare_spell.4": 声38,
    "音效/诡厄巫法/goety.apostle_cast_spell.1": 声39,
    "音效/诡厄巫法/goety.apostle_prepare_spell.1": 声40,
    "音效/诡厄巫法/goety.apostle_prepare_spell.2": 声41,
    "音效/诡厄巫法/goety.blast_fungus_throw.1": 声42,
    "音效/诡厄巫法/goety.cast_spell.1": 声43,
    "音效/诡厄巫法/goety.cast_spell.2": 声44,
    "音效/诡厄巫法/goety.cast_spell.3": 声45,
    "音效/诡厄巫法/goety.cast_spell.4": 声46,
    "音效/诡厄巫法/goety.flight": 声47,
    "音效/诡厄巫法/goety.frost_prepare_spell.1": 声48,
    "音效/诡厄巫法/goety.frost_prepare_spell.2": 声49,
    "音效/诡厄巫法/goety.frost_prepare_spell.3": 声50,
    "音效/诡厄巫法/goety.heavy_woosh.1": 声51,
    "音效/诡厄巫法/goety.heavy_woosh.2": 声52,
    "音效/诡厄巫法/goety.heavy_woosh.3": 声53,
    "音效/诡厄巫法/goety.ice_spike_cast": 声54,
    "音效/诡厄巫法/goety.ice_spike_hit.1": 声55,
    "音效/诡厄巫法/goety.poison_quill_impact.1": 声56,
    "音效/诡厄巫法/goety.poison_quill_vine_shoot.1": 声57,
    "音效/诡厄巫法/goety.prepare_spell.1": 声58,
    "音效/诡厄巫法/goety.prepare_spell.2": 声59,
    "音效/诡厄巫法/goety.prepare_summon.1": 声60,
    "音效/诡厄巫法/goety.prepare_summon.2": 声61,
    "音效/诡厄巫法/goety.quick_growing_vine_burrow.1": 声62,
    "音效/诡厄巫法/goety.rumble.1": 声63,
    "音效/诡厄巫法/goety.shock_cast.1": 声64,
    "音效/诡厄巫法/goety.soul_bolt_cast": 声65,
    "音效/诡厄巫法/goety.teleport_orb_throw": 声66,
    "音效/诡厄巫法/goety.thunder_strike_fast.1": 声67,
    "音效/诡厄巫法/goety.thunderbolt.1": 声68,
    "音效/诡厄巫法/goety.tooth_spawn.1": 声69,
    "音效/诡厄巫法/goety.vex_vapor.1": 声70,
    "音效/诡厄巫法/goety.void_prepare_spell.1": 声71,
    "音效/诡厄巫法/goety.void_prepare_spell.2": 声72,
    "音效/诡厄巫法/goety.void_prepare_spell.4": 声73,
    "音效/诡厄巫法/goety.wall_erupt.1": 声74,
    "音效/诡厄巫法/goety.wild_prepare_spell": 声75,
    "音效/诡厄巫法/goety.wind.1": 声76,
    "音效/诡厄巫法/goety.wind_blast.1": 声77,
    "音效/诡厄巫法/goety.zap.1": 声78,
  },
  表,
};
export default 声音;
