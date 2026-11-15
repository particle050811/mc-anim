// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import { privateMusic } from '@engine/audio/私有配乐.ts';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/ambient.nether_wastes.mood.2";
import sound1 from "asset:音效/block.basalt.break.1";
import sound2 from "asset:音效/block.basalt.place.1";
import sound3 from "asset:音效/block.fire.ambient";
import sound4 from "asset:音效/entity.blaze.burn";
import sound5 from "asset:音效/entity.blaze.shoot";
import sound6 from "asset:音效/entity.drowned.shoot.1";
import sound7 from "asset:音效/entity.drowned.shoot.2";
import sound8 from "asset:音效/entity.evoker.cast_spell.1";
import sound9 from "asset:音效/entity.evoker.prepare_attack.1";
import sound10 from "asset:音效/entity.evoker.prepare_attack.2";
import sound11 from "asset:音效/entity.generic.explode.1";
import sound12 from "asset:音效/entity.ghast.shoot";
import sound13 from "asset:音效/entity.lightning_bolt.impact.1";
import sound14 from "asset:音效/entity.lightning_bolt.thunder.1";
import sound15 from "asset:音效/entity.player.attack.sweep.1";
import sound16 from "asset:音效/entity.player.attack.sweep.2";
import sound17 from "asset:音效/entity.player.attack.sweep.3";
import sound18 from "asset:音效/entity.player.attack.sweep.4";
import sound19 from "asset:音效/entity.player.attack.sweep.5";
import sound20 from "asset:音效/entity.player.attack.sweep.6";
import sound21 from "asset:音效/entity.player.attack.sweep.7";
import sound22 from "asset:音效/entity.player.hurt.1";
import sound23 from "asset:音效/entity.player.hurt.2";
import sound24 from "asset:音效/entity.player.hurt.3";
import sound25 from "asset:音效/entity.player.hurt_freeze.1";
import sound26 from "asset:音效/entity.player.splash.high_speed";
import sound27 from "asset:音效/entity.warden.sonic_boom.1";
import sound28 from "asset:音效/entity.warden.sonic_charge.1";
import sound29 from "asset:音效/entity.warden.sonic_charge.2";
import sound30 from "asset:音效/entity.warden.sonic_charge.3";
import sound31 from "asset:音效/entity.warden.sonic_charge.4";
import sound32 from "asset:音效/entity.wither.shoot";
import sound33 from "asset:音效/item.totem.use";
import sound34 from "asset:音效/item.trident.hit.1";
import sound35 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.1";
import sound36 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.2";
import sound37 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.3";
import sound38 from "asset:音效/诡厄巫法/goety.abyss_prepare_spell.4";
import sound39 from "asset:音效/诡厄巫法/goety.apostle_cast_spell.1";
import sound40 from "asset:音效/诡厄巫法/goety.apostle_prepare_spell.1";
import sound41 from "asset:音效/诡厄巫法/goety.apostle_prepare_spell.2";
import sound42 from "asset:音效/诡厄巫法/goety.blast_fungus_throw.1";
import sound43 from "asset:音效/诡厄巫法/goety.cast_spell.1";
import sound44 from "asset:音效/诡厄巫法/goety.cast_spell.2";
import sound45 from "asset:音效/诡厄巫法/goety.cast_spell.3";
import sound46 from "asset:音效/诡厄巫法/goety.cast_spell.4";
import sound47 from "asset:音效/诡厄巫法/goety.flight";
import sound48 from "asset:音效/诡厄巫法/goety.frost_prepare_spell.1";
import sound49 from "asset:音效/诡厄巫法/goety.frost_prepare_spell.2";
import sound50 from "asset:音效/诡厄巫法/goety.frost_prepare_spell.3";
import sound51 from "asset:音效/诡厄巫法/goety.heavy_woosh.1";
import sound52 from "asset:音效/诡厄巫法/goety.heavy_woosh.2";
import sound53 from "asset:音效/诡厄巫法/goety.heavy_woosh.3";
import sound54 from "asset:音效/诡厄巫法/goety.ice_spike_cast";
import sound55 from "asset:音效/诡厄巫法/goety.ice_spike_hit.1";
import sound56 from "asset:音效/诡厄巫法/goety.poison_quill_impact.1";
import sound57 from "asset:音效/诡厄巫法/goety.poison_quill_vine_shoot.1";
import sound58 from "asset:音效/诡厄巫法/goety.prepare_spell.1";
import sound59 from "asset:音效/诡厄巫法/goety.prepare_spell.2";
import sound60 from "asset:音效/诡厄巫法/goety.prepare_summon.1";
import sound61 from "asset:音效/诡厄巫法/goety.prepare_summon.2";
import sound62 from "asset:音效/诡厄巫法/goety.quick_growing_vine_burrow.1";
import sound63 from "asset:音效/诡厄巫法/goety.rumble.1";
import sound64 from "asset:音效/诡厄巫法/goety.shock_cast.1";
import sound65 from "asset:音效/诡厄巫法/goety.soul_bolt_cast";
import sound66 from "asset:音效/诡厄巫法/goety.teleport_orb_throw";
import sound67 from "asset:音效/诡厄巫法/goety.thunder_strike_fast.1";
import sound68 from "asset:音效/诡厄巫法/goety.thunderbolt.1";
import sound69 from "asset:音效/诡厄巫法/goety.tooth_spawn.1";
import sound70 from "asset:音效/诡厄巫法/goety.vex_vapor.1";
import sound71 from "asset:音效/诡厄巫法/goety.void_prepare_spell.1";
import sound72 from "asset:音效/诡厄巫法/goety.void_prepare_spell.2";
import sound73 from "asset:音效/诡厄巫法/goety.void_prepare_spell.4";
import sound74 from "asset:音效/诡厄巫法/goety.wall_erupt.1";
import sound75 from "asset:音效/诡厄巫法/goety.wild_prepare_spell";
import sound76 from "asset:音效/诡厄巫法/goety.wind.1";
import sound77 from "asset:音效/诡厄巫法/goety.wind_blast.1";
import sound78 from "asset:音效/诡厄巫法/goety.zap.1";

const soundUrl: SoundUrl = {
  urls: {
    "配乐/亚波伦/決戦の刻": privateMusic("配乐/亚波伦/決戦の刻"),
    "音效/ambient.nether_wastes.mood.2": sound0,
    "音效/block.basalt.break.1": sound1,
    "音效/block.basalt.place.1": sound2,
    "音效/block.fire.ambient": sound3,
    "音效/entity.blaze.burn": sound4,
    "音效/entity.blaze.shoot": sound5,
    "音效/entity.drowned.shoot.1": sound6,
    "音效/entity.drowned.shoot.2": sound7,
    "音效/entity.evoker.cast_spell.1": sound8,
    "音效/entity.evoker.prepare_attack.1": sound9,
    "音效/entity.evoker.prepare_attack.2": sound10,
    "音效/entity.generic.explode.1": sound11,
    "音效/entity.ghast.shoot": sound12,
    "音效/entity.lightning_bolt.impact.1": sound13,
    "音效/entity.lightning_bolt.thunder.1": sound14,
    "音效/entity.player.attack.sweep.1": sound15,
    "音效/entity.player.attack.sweep.2": sound16,
    "音效/entity.player.attack.sweep.3": sound17,
    "音效/entity.player.attack.sweep.4": sound18,
    "音效/entity.player.attack.sweep.5": sound19,
    "音效/entity.player.attack.sweep.6": sound20,
    "音效/entity.player.attack.sweep.7": sound21,
    "音效/entity.player.hurt.1": sound22,
    "音效/entity.player.hurt.2": sound23,
    "音效/entity.player.hurt.3": sound24,
    "音效/entity.player.hurt_freeze.1": sound25,
    "音效/entity.player.splash.high_speed": sound26,
    "音效/entity.warden.sonic_boom.1": sound27,
    "音效/entity.warden.sonic_charge.1": sound28,
    "音效/entity.warden.sonic_charge.2": sound29,
    "音效/entity.warden.sonic_charge.3": sound30,
    "音效/entity.warden.sonic_charge.4": sound31,
    "音效/entity.wither.shoot": sound32,
    "音效/item.totem.use": sound33,
    "音效/item.trident.hit.1": sound34,
    "音效/诡厄巫法/goety.abyss_prepare_spell.1": sound35,
    "音效/诡厄巫法/goety.abyss_prepare_spell.2": sound36,
    "音效/诡厄巫法/goety.abyss_prepare_spell.3": sound37,
    "音效/诡厄巫法/goety.abyss_prepare_spell.4": sound38,
    "音效/诡厄巫法/goety.apostle_cast_spell.1": sound39,
    "音效/诡厄巫法/goety.apostle_prepare_spell.1": sound40,
    "音效/诡厄巫法/goety.apostle_prepare_spell.2": sound41,
    "音效/诡厄巫法/goety.blast_fungus_throw.1": sound42,
    "音效/诡厄巫法/goety.cast_spell.1": sound43,
    "音效/诡厄巫法/goety.cast_spell.2": sound44,
    "音效/诡厄巫法/goety.cast_spell.3": sound45,
    "音效/诡厄巫法/goety.cast_spell.4": sound46,
    "音效/诡厄巫法/goety.flight": sound47,
    "音效/诡厄巫法/goety.frost_prepare_spell.1": sound48,
    "音效/诡厄巫法/goety.frost_prepare_spell.2": sound49,
    "音效/诡厄巫法/goety.frost_prepare_spell.3": sound50,
    "音效/诡厄巫法/goety.heavy_woosh.1": sound51,
    "音效/诡厄巫法/goety.heavy_woosh.2": sound52,
    "音效/诡厄巫法/goety.heavy_woosh.3": sound53,
    "音效/诡厄巫法/goety.ice_spike_cast": sound54,
    "音效/诡厄巫法/goety.ice_spike_hit.1": sound55,
    "音效/诡厄巫法/goety.poison_quill_impact.1": sound56,
    "音效/诡厄巫法/goety.poison_quill_vine_shoot.1": sound57,
    "音效/诡厄巫法/goety.prepare_spell.1": sound58,
    "音效/诡厄巫法/goety.prepare_spell.2": sound59,
    "音效/诡厄巫法/goety.prepare_summon.1": sound60,
    "音效/诡厄巫法/goety.prepare_summon.2": sound61,
    "音效/诡厄巫法/goety.quick_growing_vine_burrow.1": sound62,
    "音效/诡厄巫法/goety.rumble.1": sound63,
    "音效/诡厄巫法/goety.shock_cast.1": sound64,
    "音效/诡厄巫法/goety.soul_bolt_cast": sound65,
    "音效/诡厄巫法/goety.teleport_orb_throw": sound66,
    "音效/诡厄巫法/goety.thunder_strike_fast.1": sound67,
    "音效/诡厄巫法/goety.thunderbolt.1": sound68,
    "音效/诡厄巫法/goety.tooth_spawn.1": sound69,
    "音效/诡厄巫法/goety.vex_vapor.1": sound70,
    "音效/诡厄巫法/goety.void_prepare_spell.1": sound71,
    "音效/诡厄巫法/goety.void_prepare_spell.2": sound72,
    "音效/诡厄巫法/goety.void_prepare_spell.4": sound73,
    "音效/诡厄巫法/goety.wall_erupt.1": sound74,
    "音效/诡厄巫法/goety.wild_prepare_spell": sound75,
    "音效/诡厄巫法/goety.wind.1": sound76,
    "音效/诡厄巫法/goety.wind_blast.1": sound77,
    "音效/诡厄巫法/goety.zap.1": sound78,
  },
  表: soundTable,
};
export default soundUrl;
