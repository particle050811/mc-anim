// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/entity.arrow.hit.1";
import sound1 from "asset:音效/entity.creeper.hurt.3";
import sound2 from "asset:音效/entity.generic.explode.1";
import sound3 from "asset:音效/entity.generic.explode.3";
import sound4 from "asset:音效/entity.generic.explode.4";
import sound5 from "asset:音效/entity.horse.gallop.3";
import sound6 from "asset:音效/entity.horse.gallop.4";
import sound7 from "asset:音效/entity.horse.jump";
import sound8 from "asset:音效/entity.horse.land";
import sound9 from "asset:音效/entity.illusioner.cast_spell.1";
import sound10 from "asset:音效/entity.player.hurt.2";
import sound11 from "asset:音效/entity.warden.hurt.3";
import sound12 from "asset:音效/entity.warden.hurt.4";
import sound13 from "asset:音效/entity.warden.sonic_boom.4";
import sound14 from "asset:音效/entity.warden.sonic_charge.4";

const soundUrl: SoundUrl = {
  urls: {
    "音效/entity.arrow.hit.1": sound0,
    "音效/entity.creeper.hurt.3": sound1,
    "音效/entity.generic.explode.1": sound2,
    "音效/entity.generic.explode.3": sound3,
    "音效/entity.generic.explode.4": sound4,
    "音效/entity.horse.gallop.3": sound5,
    "音效/entity.horse.gallop.4": sound6,
    "音效/entity.horse.jump": sound7,
    "音效/entity.horse.land": sound8,
    "音效/entity.illusioner.cast_spell.1": sound9,
    "音效/entity.player.hurt.2": sound10,
    "音效/entity.warden.hurt.3": sound11,
    "音效/entity.warden.hurt.4": sound12,
    "音效/entity.warden.sonic_boom.4": sound13,
    "音效/entity.warden.sonic_charge.4": sound14,
  },
  表: soundTable,
};
export default soundUrl;
