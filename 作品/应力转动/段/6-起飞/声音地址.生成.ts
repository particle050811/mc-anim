// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配乐/Wasted";
import sound1 from "asset:配音/6-九胡-等等我";
import sound2 from "asset:配音/6-李樱-看我速通暮色";
import sound3 from "asset:音效/block.grass.step.1";
import sound4 from "asset:音效/block.grass.step.2";
import sound5 from "asset:音效/block.grass.step.3";
import sound6 from "asset:音效/block.grass.step.4";
import sound7 from "asset:音效/block.grass.step.5";
import sound8 from "asset:音效/block.grass.step.6";
import sound9 from "asset:音效/block.portal.travel";
import sound10 from "asset:音效/block.stone.step.2";
import sound11 from "asset:音效/block.stone.step.3";
import sound12 from "asset:音效/block.stone.step.4";
import sound13 from "asset:音效/block.stone.step.5";
import sound14 from "asset:音效/block.wool.place.4";
import sound15 from "asset:音效/twilightforest.block.twilightforest.boss_chest.appear";

const soundUrl: SoundUrl = {
  urls: {
    "配乐/Wasted": sound0,
    "配音/6-九胡-等等我": sound1,
    "配音/6-李樱-看我速通暮色": sound2,
    "音效/block.grass.step.1": sound3,
    "音效/block.grass.step.2": sound4,
    "音效/block.grass.step.3": sound5,
    "音效/block.grass.step.4": sound6,
    "音效/block.grass.step.5": sound7,
    "音效/block.grass.step.6": sound8,
    "音效/block.portal.travel": sound9,
    "音效/block.stone.step.2": sound10,
    "音效/block.stone.step.3": sound11,
    "音效/block.stone.step.4": sound12,
    "音效/block.stone.step.5": sound13,
    "音效/block.wool.place.4": sound14,
    "音效/twilightforest.block.twilightforest.boss_chest.appear": sound15,
  },
  表: soundTable,
};
export default soundUrl;
