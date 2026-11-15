// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配音/7-刘心忠-风筝";
import sound1 from "asset:音效/entity.arrow.hit.1";
import sound2 from "asset:音效/entity.arrow.hit.3";
import sound3 from "asset:音效/entity.arrow.hit.4";
import sound4 from "asset:音效/entity.arrow.shoot";
import sound5 from "asset:音效/entity.creeper.hurt.2";
import sound6 from "asset:音效/entity.generic.explode.1";
import sound7 from "asset:音效/entity.generic.explode.2";
import sound8 from "asset:音效/entity.generic.explode.3";
import sound9 from "asset:音效/entity.generic.explode.4";
import sound10 from "asset:音效/entity.horse.gallop.1";
import sound11 from "asset:音效/entity.horse.gallop.2";
import sound12 from "asset:音效/entity.horse.gallop.4";
import sound13 from "asset:音效/entity.warden.death.1";
import sound14 from "asset:音效/entity.warden.hurt.1";
import sound15 from "asset:音效/entity.warden.hurt.2";
import sound16 from "asset:音效/entity.warden.hurt.3";
import sound17 from "asset:音效/entity.warden.hurt.4";
import sound18 from "asset:音效/entity.warden.sonic_boom.1";
import sound19 from "asset:音效/entity.warden.sonic_boom.4";

const soundUrl: SoundUrl = {
  urls: {
    "配音/7-刘心忠-风筝": sound0,
    "音效/entity.arrow.hit.1": sound1,
    "音效/entity.arrow.hit.3": sound2,
    "音效/entity.arrow.hit.4": sound3,
    "音效/entity.arrow.shoot": sound4,
    "音效/entity.creeper.hurt.2": sound5,
    "音效/entity.generic.explode.1": sound6,
    "音效/entity.generic.explode.2": sound7,
    "音效/entity.generic.explode.3": sound8,
    "音效/entity.generic.explode.4": sound9,
    "音效/entity.horse.gallop.1": sound10,
    "音效/entity.horse.gallop.2": sound11,
    "音效/entity.horse.gallop.4": sound12,
    "音效/entity.warden.death.1": sound13,
    "音效/entity.warden.hurt.1": sound14,
    "音效/entity.warden.hurt.2": sound15,
    "音效/entity.warden.hurt.3": sound16,
    "音效/entity.warden.hurt.4": sound17,
    "音效/entity.warden.sonic_boom.1": sound18,
    "音效/entity.warden.sonic_boom.4": sound19,
  },
  表: soundTable,
};
export default soundUrl;
