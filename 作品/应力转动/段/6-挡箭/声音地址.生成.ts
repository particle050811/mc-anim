// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/block.chest.close.2";
import sound1 from "asset:音效/block.deepslate.break.1";
import sound2 from "asset:音效/block.deepslate.break.2";
import sound3 from "asset:音效/block.deepslate.break.3";
import sound4 from "asset:音效/block.sculk.break.12";
import sound5 from "asset:音效/block.sculk.break.13";
import sound6 from "asset:音效/block.sculk.break.5";
import sound7 from "asset:音效/block.sculk.break.7";
import sound8 from "asset:音效/efn.parry.3";
import sound9 from "asset:音效/efn.whoosh_light_1";
import sound10 from "asset:音效/item.elytra.flying";

const soundUrl: SoundUrl = {
  urls: {
    "音效/block.chest.close.2": sound0,
    "音效/block.deepslate.break.1": sound1,
    "音效/block.deepslate.break.2": sound2,
    "音效/block.deepslate.break.3": sound3,
    "音效/block.sculk.break.12": sound4,
    "音效/block.sculk.break.13": sound5,
    "音效/block.sculk.break.5": sound6,
    "音效/block.sculk.break.7": sound7,
    "音效/efn.parry.3": sound8,
    "音效/efn.whoosh_light_1": sound9,
    "音效/item.elytra.flying": sound10,
  },
  表: soundTable,
};
export default soundUrl;
