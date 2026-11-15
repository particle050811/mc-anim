// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/block.deepslate.fall.6";
import sound1 from "asset:音效/block.sculk.step.3";
import sound2 from "asset:音效/block.sculk.step.5";
import sound3 from "asset:音效/entity.arrow.hit.1";
import sound4 from "asset:音效/entity.arrow.hit.2";
import sound5 from "asset:音效/entity.arrow.shoot";
import sound6 from "asset:音效/entity.horse.jump";
import sound7 from "asset:音效/entity.horse.land";
import sound8 from "asset:音效/entity.illusioner.cast_spell.1";
import sound9 from "asset:音效/entity.illusioner.mirror_move.2";
import sound10 from "asset:音效/entity.illusioner.prepare_mirror";
import sound11 from "asset:音效/entity.warden.hurt.2";
import sound12 from "asset:音效/entity.warden.hurt.4";
import sound13 from "asset:音效/entity.warden.tendril_clicks.4";
import sound14 from "asset:音效/entity.warden.tendril_clicks.6";
import sound15 from "asset:音效/irons_spellbooks.force_impact";
import sound16 from "asset:音效/item.elytra.flying";

const soundUrl: SoundUrl = {
  urls: {
    "音效/block.deepslate.fall.6": sound0,
    "音效/block.sculk.step.3": sound1,
    "音效/block.sculk.step.5": sound2,
    "音效/entity.arrow.hit.1": sound3,
    "音效/entity.arrow.hit.2": sound4,
    "音效/entity.arrow.shoot": sound5,
    "音效/entity.horse.jump": sound6,
    "音效/entity.horse.land": sound7,
    "音效/entity.illusioner.cast_spell.1": sound8,
    "音效/entity.illusioner.mirror_move.2": sound9,
    "音效/entity.illusioner.prepare_mirror": sound10,
    "音效/entity.warden.hurt.2": sound11,
    "音效/entity.warden.hurt.4": sound12,
    "音效/entity.warden.tendril_clicks.4": sound13,
    "音效/entity.warden.tendril_clicks.6": sound14,
    "音效/irons_spellbooks.force_impact": sound15,
    "音效/item.elytra.flying": sound16,
  },
  表: soundTable,
};
export default soundUrl;
