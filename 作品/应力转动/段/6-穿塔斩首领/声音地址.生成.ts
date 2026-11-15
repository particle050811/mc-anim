// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配乐/Wasted";
import sound1 from "asset:音效/block.ladder.break.1";
import sound2 from "asset:音效/block.ladder.break.2";
import sound3 from "asset:音效/block.ladder.break.3";
import sound4 from "asset:音效/block.ladder.break.4";
import sound5 from "asset:音效/block.ladder.hit.5";
import sound6 from "asset:音效/block.metal.break.1";
import sound7 from "asset:音效/block.metal.break.3";
import sound8 from "asset:音效/block.metal.hit.2";
import sound9 from "asset:音效/block.snow.break.3";
import sound10 from "asset:音效/block.snow.hit.2";
import sound11 from "asset:音效/block.stone.break.1";
import sound12 from "asset:音效/block.stone.break.2";
import sound13 from "asset:音效/block.stone.break.3";
import sound14 from "asset:音效/block.stone.break.4";
import sound15 from "asset:音效/block.stone.hit.1";
import sound16 from "asset:音效/block.stone.hit.2";
import sound17 from "asset:音效/block.stone.hit.3";
import sound18 from "asset:音效/block.stone.hit.4";
import sound19 from "asset:音效/block.stone.hit.5";
import sound20 from "asset:音效/block.stone.hit.6";
import sound21 from "asset:音效/block.wood.break.1";
import sound22 from "asset:音效/block.wood.break.3";
import sound23 from "asset:音效/block.wood.break.4";
import sound24 from "asset:音效/block.wood.hit.4";
import sound25 from "asset:音效/block.wood.hit.5";
import sound26 from "asset:音效/block.wood.hit.6";
import sound27 from "asset:音效/entity.hostile.death.1";
import sound28 from "asset:音效/entity.hostile.death.3";
import sound29 from "asset:音效/entity.item.pickup";
import sound30 from "asset:音效/entity.minecart.inside";
import sound31 from "asset:音效/entity.painting.break.1";
import sound32 from "asset:音效/entity.painting.break.2";
import sound33 from "asset:音效/entity.painting.break.3";
import sound34 from "asset:音效/entity.player.attack.strong.1";
import sound35 from "asset:音效/entity.player.attack.strong.2";
import sound36 from "asset:音效/entity.player.attack.strong.3";
import sound37 from "asset:音效/entity.player.attack.strong.4";
import sound38 from "asset:音效/entity.player.attack.strong.5";
import sound39 from "asset:音效/entity.splash_potion.break.1";
import sound40 from "asset:音效/entity.splash_potion.break.2";
import sound41 from "asset:音效/entity.splash_potion.break.3";
import sound42 from "asset:音效/entity.splash_potion.throw";
import sound43 from "asset:音效/twilightforest.block.twilightforest.boss_chest.appear";
import sound44 from "asset:音效/twilightforest.entity.twilightforest.alpha_yeti.death";
import sound45 from "asset:音效/twilightforest.entity.twilightforest.hydra.death";
import sound46 from "asset:音效/twilightforest.entity.twilightforest.lich.death";
import sound47 from "asset:音效/twilightforest.entity.twilightforest.shield.break";
import sound48 from "asset:音效/twilightforest.entity.twilightforest.snow_queen.break";
import sound49 from "asset:音效/twilightforest.entity.twilightforest.snow_queen.death.1";
import sound50 from "asset:音效/twilightforest.entity.twilightforest.ur_ghast.death";

const soundUrl: SoundUrl = {
  urls: {
    "配乐/Wasted": sound0,
    "音效/block.ladder.break.1": sound1,
    "音效/block.ladder.break.2": sound2,
    "音效/block.ladder.break.3": sound3,
    "音效/block.ladder.break.4": sound4,
    "音效/block.ladder.hit.5": sound5,
    "音效/block.metal.break.1": sound6,
    "音效/block.metal.break.3": sound7,
    "音效/block.metal.hit.2": sound8,
    "音效/block.snow.break.3": sound9,
    "音效/block.snow.hit.2": sound10,
    "音效/block.stone.break.1": sound11,
    "音效/block.stone.break.2": sound12,
    "音效/block.stone.break.3": sound13,
    "音效/block.stone.break.4": sound14,
    "音效/block.stone.hit.1": sound15,
    "音效/block.stone.hit.2": sound16,
    "音效/block.stone.hit.3": sound17,
    "音效/block.stone.hit.4": sound18,
    "音效/block.stone.hit.5": sound19,
    "音效/block.stone.hit.6": sound20,
    "音效/block.wood.break.1": sound21,
    "音效/block.wood.break.3": sound22,
    "音效/block.wood.break.4": sound23,
    "音效/block.wood.hit.4": sound24,
    "音效/block.wood.hit.5": sound25,
    "音效/block.wood.hit.6": sound26,
    "音效/entity.hostile.death.1": sound27,
    "音效/entity.hostile.death.3": sound28,
    "音效/entity.item.pickup": sound29,
    "音效/entity.minecart.inside": sound30,
    "音效/entity.painting.break.1": sound31,
    "音效/entity.painting.break.2": sound32,
    "音效/entity.painting.break.3": sound33,
    "音效/entity.player.attack.strong.1": sound34,
    "音效/entity.player.attack.strong.2": sound35,
    "音效/entity.player.attack.strong.3": sound36,
    "音效/entity.player.attack.strong.4": sound37,
    "音效/entity.player.attack.strong.5": sound38,
    "音效/entity.splash_potion.break.1": sound39,
    "音效/entity.splash_potion.break.2": sound40,
    "音效/entity.splash_potion.break.3": sound41,
    "音效/entity.splash_potion.throw": sound42,
    "音效/twilightforest.block.twilightforest.boss_chest.appear": sound43,
    "音效/twilightforest.entity.twilightforest.alpha_yeti.death": sound44,
    "音效/twilightforest.entity.twilightforest.hydra.death": sound45,
    "音效/twilightforest.entity.twilightforest.lich.death": sound46,
    "音效/twilightforest.entity.twilightforest.shield.break": sound47,
    "音效/twilightforest.entity.twilightforest.snow_queen.break": sound48,
    "音效/twilightforest.entity.twilightforest.snow_queen.death.1": sound49,
    "音效/twilightforest.entity.twilightforest.ur_ghast.death": sound50,
  },
  表: soundTable,
};
export default soundUrl;
