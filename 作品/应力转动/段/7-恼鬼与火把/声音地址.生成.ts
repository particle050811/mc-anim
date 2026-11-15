// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/block.wood.place.4";
import sound1 from "asset:音效/entity.arrow.shoot";
import sound2 from "asset:音效/entity.evoker.cast_spell.1";
import sound3 from "asset:音效/entity.evoker.prepare_summon";
import sound4 from "asset:音效/entity.vex.charge.1";
import sound5 from "asset:音效/entity.vex.charge.2";
import sound6 from "asset:音效/entity.warden.angry.5";
import sound7 from "asset:音效/entity.warden.tendril_clicks.4";
import sound8 from "asset:音效/entity.warden.tendril_clicks.6";
import sound9 from "asset:音效/item.elytra.flying";

const soundUrl: SoundUrl = {
  urls: {
    "音效/block.wood.place.4": sound0,
    "音效/entity.arrow.shoot": sound1,
    "音效/entity.evoker.cast_spell.1": sound2,
    "音效/entity.evoker.prepare_summon": sound3,
    "音效/entity.vex.charge.1": sound4,
    "音效/entity.vex.charge.2": sound5,
    "音效/entity.warden.angry.5": sound6,
    "音效/entity.warden.tendril_clicks.4": sound7,
    "音效/entity.warden.tendril_clicks.6": sound8,
    "音效/item.elytra.flying": sound9,
  },
  表: soundTable,
};
export default soundUrl;
