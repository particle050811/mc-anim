// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:配乐/Wasted";
import 声1 from "asset:音效/block.ladder.break.1";
import 声2 from "asset:音效/block.ladder.break.2";
import 声3 from "asset:音效/block.ladder.break.3";
import 声4 from "asset:音效/block.ladder.break.4";
import 声5 from "asset:音效/block.ladder.hit.5";
import 声6 from "asset:音效/block.metal.break.1";
import 声7 from "asset:音效/block.metal.break.3";
import 声8 from "asset:音效/block.metal.hit.2";
import 声9 from "asset:音效/block.snow.break.3";
import 声10 from "asset:音效/block.snow.hit.2";
import 声11 from "asset:音效/block.stone.break.1";
import 声12 from "asset:音效/block.stone.break.2";
import 声13 from "asset:音效/block.stone.break.3";
import 声14 from "asset:音效/block.stone.break.4";
import 声15 from "asset:音效/block.stone.hit.1";
import 声16 from "asset:音效/block.stone.hit.2";
import 声17 from "asset:音效/block.stone.hit.3";
import 声18 from "asset:音效/block.stone.hit.4";
import 声19 from "asset:音效/block.stone.hit.5";
import 声20 from "asset:音效/block.stone.hit.6";
import 声21 from "asset:音效/block.wood.break.1";
import 声22 from "asset:音效/block.wood.break.3";
import 声23 from "asset:音效/block.wood.break.4";
import 声24 from "asset:音效/block.wood.hit.4";
import 声25 from "asset:音效/block.wood.hit.5";
import 声26 from "asset:音效/block.wood.hit.6";
import 声27 from "asset:音效/entity.hostile.death.1";
import 声28 from "asset:音效/entity.hostile.death.3";
import 声29 from "asset:音效/entity.item.pickup";
import 声30 from "asset:音效/entity.minecart.inside";
import 声31 from "asset:音效/entity.painting.break.1";
import 声32 from "asset:音效/entity.painting.break.2";
import 声33 from "asset:音效/entity.painting.break.3";
import 声34 from "asset:音效/entity.player.attack.strong.1";
import 声35 from "asset:音效/entity.player.attack.strong.2";
import 声36 from "asset:音效/entity.player.attack.strong.3";
import 声37 from "asset:音效/entity.player.attack.strong.4";
import 声38 from "asset:音效/entity.player.attack.strong.5";
import 声39 from "asset:音效/entity.splash_potion.break.1";
import 声40 from "asset:音效/entity.splash_potion.break.2";
import 声41 from "asset:音效/entity.splash_potion.break.3";
import 声42 from "asset:音效/entity.splash_potion.throw";
import 声43 from "asset:音效/twilightforest.block.twilightforest.boss_chest.appear";
import 声44 from "asset:音效/twilightforest.entity.twilightforest.alpha_yeti.death";
import 声45 from "asset:音效/twilightforest.entity.twilightforest.hydra.death";
import 声46 from "asset:音效/twilightforest.entity.twilightforest.lich.death";
import 声47 from "asset:音效/twilightforest.entity.twilightforest.shield.break";
import 声48 from "asset:音效/twilightforest.entity.twilightforest.snow_queen.break";
import 声49 from "asset:音效/twilightforest.entity.twilightforest.snow_queen.death.1";
import 声50 from "asset:音效/twilightforest.entity.twilightforest.ur_ghast.death";

const 声音: 声音地址 = {
  地址: {
    "配乐/Wasted": 声0,
    "音效/block.ladder.break.1": 声1,
    "音效/block.ladder.break.2": 声2,
    "音效/block.ladder.break.3": 声3,
    "音效/block.ladder.break.4": 声4,
    "音效/block.ladder.hit.5": 声5,
    "音效/block.metal.break.1": 声6,
    "音效/block.metal.break.3": 声7,
    "音效/block.metal.hit.2": 声8,
    "音效/block.snow.break.3": 声9,
    "音效/block.snow.hit.2": 声10,
    "音效/block.stone.break.1": 声11,
    "音效/block.stone.break.2": 声12,
    "音效/block.stone.break.3": 声13,
    "音效/block.stone.break.4": 声14,
    "音效/block.stone.hit.1": 声15,
    "音效/block.stone.hit.2": 声16,
    "音效/block.stone.hit.3": 声17,
    "音效/block.stone.hit.4": 声18,
    "音效/block.stone.hit.5": 声19,
    "音效/block.stone.hit.6": 声20,
    "音效/block.wood.break.1": 声21,
    "音效/block.wood.break.3": 声22,
    "音效/block.wood.break.4": 声23,
    "音效/block.wood.hit.4": 声24,
    "音效/block.wood.hit.5": 声25,
    "音效/block.wood.hit.6": 声26,
    "音效/entity.hostile.death.1": 声27,
    "音效/entity.hostile.death.3": 声28,
    "音效/entity.item.pickup": 声29,
    "音效/entity.minecart.inside": 声30,
    "音效/entity.painting.break.1": 声31,
    "音效/entity.painting.break.2": 声32,
    "音效/entity.painting.break.3": 声33,
    "音效/entity.player.attack.strong.1": 声34,
    "音效/entity.player.attack.strong.2": 声35,
    "音效/entity.player.attack.strong.3": 声36,
    "音效/entity.player.attack.strong.4": 声37,
    "音效/entity.player.attack.strong.5": 声38,
    "音效/entity.splash_potion.break.1": 声39,
    "音效/entity.splash_potion.break.2": 声40,
    "音效/entity.splash_potion.break.3": 声41,
    "音效/entity.splash_potion.throw": 声42,
    "音效/twilightforest.block.twilightforest.boss_chest.appear": 声43,
    "音效/twilightforest.entity.twilightforest.alpha_yeti.death": 声44,
    "音效/twilightforest.entity.twilightforest.hydra.death": 声45,
    "音效/twilightforest.entity.twilightforest.lich.death": 声46,
    "音效/twilightforest.entity.twilightforest.shield.break": 声47,
    "音效/twilightforest.entity.twilightforest.snow_queen.break": 声48,
    "音效/twilightforest.entity.twilightforest.snow_queen.death.1": 声49,
    "音效/twilightforest.entity.twilightforest.ur_ghast.death": 声50,
  },
  表,
};
export default 声音;
