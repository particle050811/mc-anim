// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import { 私有配乐 } from '@engine/audio/私有配乐.ts';
import 表 from './声音表.生成.ts';
import 声0 from "asset:音效/ambient.nether_wastes.mood.2";
import 声1 from "asset:音效/block.basalt.break.1";
import 声2 from "asset:音效/block.fire.ambient";
import 声3 from "asset:音效/block.glass.break.1";
import 声4 from "asset:音效/entity.blaze.shoot";
import 声5 from "asset:音效/entity.drowned.shoot.1";
import 声6 from "asset:音效/entity.evoker.cast_spell.1";
import 声7 from "asset:音效/entity.generic.explode.1";
import 声8 from "asset:音效/entity.ghast.shoot";
import 声9 from "asset:音效/entity.lightning_bolt.impact.1";
import 声10 from "asset:音效/entity.lightning_bolt.thunder.1";
import 声11 from "asset:音效/entity.player.attack.sweep.1";
import 声12 from "asset:音效/entity.player.attack.sweep.2";
import 声13 from "asset:音效/entity.player.attack.sweep.3";
import 声14 from "asset:音效/entity.player.attack.sweep.4";
import 声15 from "asset:音效/entity.player.attack.sweep.5";
import 声16 from "asset:音效/entity.player.attack.sweep.6";
import 声17 from "asset:音效/entity.player.attack.sweep.7";
import 声18 from "asset:音效/entity.player.hurt.1";
import 声19 from "asset:音效/entity.player.hurt.2";
import 声20 from "asset:音效/entity.player.hurt.3";
import 声21 from "asset:音效/entity.player.hurt_on_fire.1";
import 声22 from "asset:音效/entity.player.hurt_on_fire.2";
import 声23 from "asset:音效/entity.player.hurt_on_fire.3";
import 声24 from "asset:音效/entity.warden.sonic_boom.1";
import 声25 from "asset:音效/entity.wither.shoot";
import 声26 from "asset:音效/item.totem.use";
import 声27 from "asset:音效/诡厄巫法/goety.apostle_cast_spell.1";
import 声28 from "asset:音效/诡厄巫法/goety.apostle_cast_spell.2";
import 声29 from "asset:音效/诡厄巫法/goety.apostle_prepare_spell.1";
import 声30 from "asset:音效/诡厄巫法/goety.heavy_woosh.1";
import 声31 from "asset:音效/诡厄巫法/goety.heavy_woosh.2";
import 声32 from "asset:音效/诡厄巫法/goety.heavy_woosh.3";
import 声33 from "asset:音效/诡厄巫法/goety.heavy_woosh.4";
import 声34 from "asset:音效/诡厄巫法/goety.heavy_woosh.5";
import 声35 from "asset:音效/诡厄巫法/goety.ice_chunk_drop";
import 声36 from "asset:音效/诡厄巫法/goety.ice_chunk_hit";
import 声37 from "asset:音效/诡厄巫法/goety.ice_spike_cast";
import 声38 from "asset:音效/诡厄巫法/goety.ice_spike_hit.1";
import 声39 from "asset:音效/诡厄巫法/goety.redstone_explode.1";
import 声40 from "asset:音效/诡厄巫法/goety.shock_cast.1";
import 声41 from "asset:音效/诡厄巫法/goety.soul_explode.1";
import 声42 from "asset:音效/诡厄巫法/goety.thunderbolt.1";
import 声43 from "asset:音效/诡厄巫法/goety.wind.1";
import 声44 from "asset:音效/诡厄巫法/goety.wind_blast.1";

const 声音: 声音地址 = {
  地址: {
    "配乐/亚波伦/決戦の刻": 私有配乐("配乐/亚波伦/決戦の刻"),
    "音效/ambient.nether_wastes.mood.2": 声0,
    "音效/block.basalt.break.1": 声1,
    "音效/block.fire.ambient": 声2,
    "音效/block.glass.break.1": 声3,
    "音效/entity.blaze.shoot": 声4,
    "音效/entity.drowned.shoot.1": 声5,
    "音效/entity.evoker.cast_spell.1": 声6,
    "音效/entity.generic.explode.1": 声7,
    "音效/entity.ghast.shoot": 声8,
    "音效/entity.lightning_bolt.impact.1": 声9,
    "音效/entity.lightning_bolt.thunder.1": 声10,
    "音效/entity.player.attack.sweep.1": 声11,
    "音效/entity.player.attack.sweep.2": 声12,
    "音效/entity.player.attack.sweep.3": 声13,
    "音效/entity.player.attack.sweep.4": 声14,
    "音效/entity.player.attack.sweep.5": 声15,
    "音效/entity.player.attack.sweep.6": 声16,
    "音效/entity.player.attack.sweep.7": 声17,
    "音效/entity.player.hurt.1": 声18,
    "音效/entity.player.hurt.2": 声19,
    "音效/entity.player.hurt.3": 声20,
    "音效/entity.player.hurt_on_fire.1": 声21,
    "音效/entity.player.hurt_on_fire.2": 声22,
    "音效/entity.player.hurt_on_fire.3": 声23,
    "音效/entity.warden.sonic_boom.1": 声24,
    "音效/entity.wither.shoot": 声25,
    "音效/item.totem.use": 声26,
    "音效/诡厄巫法/goety.apostle_cast_spell.1": 声27,
    "音效/诡厄巫法/goety.apostle_cast_spell.2": 声28,
    "音效/诡厄巫法/goety.apostle_prepare_spell.1": 声29,
    "音效/诡厄巫法/goety.heavy_woosh.1": 声30,
    "音效/诡厄巫法/goety.heavy_woosh.2": 声31,
    "音效/诡厄巫法/goety.heavy_woosh.3": 声32,
    "音效/诡厄巫法/goety.heavy_woosh.4": 声33,
    "音效/诡厄巫法/goety.heavy_woosh.5": 声34,
    "音效/诡厄巫法/goety.ice_chunk_drop": 声35,
    "音效/诡厄巫法/goety.ice_chunk_hit": 声36,
    "音效/诡厄巫法/goety.ice_spike_cast": 声37,
    "音效/诡厄巫法/goety.ice_spike_hit.1": 声38,
    "音效/诡厄巫法/goety.redstone_explode.1": 声39,
    "音效/诡厄巫法/goety.shock_cast.1": 声40,
    "音效/诡厄巫法/goety.soul_explode.1": 声41,
    "音效/诡厄巫法/goety.thunderbolt.1": 声42,
    "音效/诡厄巫法/goety.wind.1": 声43,
    "音效/诡厄巫法/goety.wind_blast.1": 声44,
  },
  表,
};
export default 声音;
