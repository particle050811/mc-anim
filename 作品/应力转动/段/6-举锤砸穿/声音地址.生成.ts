// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配音/6-李樱-RoadRoller";
import sound1 from "asset:音效/block.deepslate.break.2";
import sound2 from "asset:音效/block.deepslate.break.3";
import sound3 from "asset:音效/block.deepslate.break.4";
import sound4 from "asset:音效/block.deepslate.fall.2";
import sound5 from "asset:音效/block.gravel.break.1";
import sound6 from "asset:音效/block.gravel.break.2";
import sound7 from "asset:音效/block.gravel.break.3";
import sound8 from "asset:音效/block.sculk.break.1";
import sound9 from "asset:音效/block.sculk.break.13";
import sound10 from "asset:音效/block.sculk.break.4";
import sound11 from "asset:音效/block.stone.break.1";
import sound12 from "asset:音效/block.stone.break.2";
import sound13 from "asset:音效/block.stone.break.3";
import sound14 from "asset:音效/block.stone.break.4";
import sound15 from "asset:音效/block.stone.fall.2";
import sound16 from "asset:音效/cataclysm.heavy_smash";
import sound17 from "asset:音效/entity.player.big_fall";
import sound18 from "asset:音效/item.elytra.flying";

const soundUrl: SoundUrl = {
  urls: {
    "配音/6-李樱-RoadRoller": sound0,
    "音效/block.deepslate.break.2": sound1,
    "音效/block.deepslate.break.3": sound2,
    "音效/block.deepslate.break.4": sound3,
    "音效/block.deepslate.fall.2": sound4,
    "音效/block.gravel.break.1": sound5,
    "音效/block.gravel.break.2": sound6,
    "音效/block.gravel.break.3": sound7,
    "音效/block.sculk.break.1": sound8,
    "音效/block.sculk.break.13": sound9,
    "音效/block.sculk.break.4": sound10,
    "音效/block.stone.break.1": sound11,
    "音效/block.stone.break.2": sound12,
    "音效/block.stone.break.3": sound13,
    "音效/block.stone.break.4": sound14,
    "音效/block.stone.fall.2": sound15,
    "音效/cataclysm.heavy_smash": sound16,
    "音效/entity.player.big_fall": sound17,
    "音效/item.elytra.flying": sound18,
  },
  表: soundTable,
};
export default soundUrl;
