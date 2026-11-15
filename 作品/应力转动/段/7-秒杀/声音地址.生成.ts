// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配音/7-刘心忠-不可能";
import sound1 from "asset:音效/block.wood.place.1";
import sound2 from "asset:音效/block.wood.place.3";
import sound3 from "asset:音效/block.wood.place.4";
import sound4 from "asset:音效/entity.arrow.shoot";
import sound5 from "asset:音效/entity.evoker.cast_spell.1";
import sound6 from "asset:音效/entity.vex.charge.1";
import sound7 from "asset:音效/entity.vex.charge.2";
import sound8 from "asset:音效/entity.vex.death.1";
import sound9 from "asset:音效/entity.vex.death.2";
import sound10 from "asset:音效/entity.warden.attack_impact.1";
import sound11 from "asset:音效/entity.warden.attack_impact.2";
import sound12 from "asset:音效/entity.warden.tendril_clicks.4";
import sound13 from "asset:音效/entity.warden.tendril_clicks.6";
import sound14 from "asset:音效/item.elytra.flying";

const soundUrl: SoundUrl = {
  urls: {
    "配音/7-刘心忠-不可能": sound0,
    "音效/block.wood.place.1": sound1,
    "音效/block.wood.place.3": sound2,
    "音效/block.wood.place.4": sound3,
    "音效/entity.arrow.shoot": sound4,
    "音效/entity.evoker.cast_spell.1": sound5,
    "音效/entity.vex.charge.1": sound6,
    "音效/entity.vex.charge.2": sound7,
    "音效/entity.vex.death.1": sound8,
    "音效/entity.vex.death.2": sound9,
    "音效/entity.warden.attack_impact.1": sound10,
    "音效/entity.warden.attack_impact.2": sound11,
    "音效/entity.warden.tendril_clicks.4": sound12,
    "音效/entity.warden.tendril_clicks.6": sound13,
    "音效/item.elytra.flying": sound14,
  },
  表: soundTable,
};
export default soundUrl;
