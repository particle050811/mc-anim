// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配音/6-李樱-不值一提";
import sound1 from "asset:音效/block.chain.hit.2";
import sound2 from "asset:音效/block.grass.step.1";
import sound3 from "asset:音效/block.grass.step.2";
import sound4 from "asset:音效/block.grass.step.3";
import sound5 from "asset:音效/block.grass.step.4";
import sound6 from "asset:音效/block.grass.step.5";
import sound7 from "asset:音效/block.grass.step.6";
import sound8 from "asset:音效/block.portal.travel";
import sound9 from "asset:音效/block.stone.step.1";
import sound10 from "asset:音效/block.stone.step.6";
import sound11 from "asset:音效/efn.whoosh_light_1";
import sound12 from "asset:音效/epicfight.entity.hit.blade.1";
import sound13 from "asset:音效/item.trident.throw.2";
import sound14 from "asset:音效/twilightforest.block.twilightforest.boss_chest.appear";
import sound15 from "asset:音效/twilightforest.entity.twilightforest.naga.hurt.2";
import sound16 from "asset:音效/twilightforest.entity.twilightforest.naga.hurt.3";

const soundUrl: SoundUrl = {
  urls: {
    "配音/6-李樱-不值一提": sound0,
    "音效/block.chain.hit.2": sound1,
    "音效/block.grass.step.1": sound2,
    "音效/block.grass.step.2": sound3,
    "音效/block.grass.step.3": sound4,
    "音效/block.grass.step.4": sound5,
    "音效/block.grass.step.5": sound6,
    "音效/block.grass.step.6": sound7,
    "音效/block.portal.travel": sound8,
    "音效/block.stone.step.1": sound9,
    "音效/block.stone.step.6": sound10,
    "音效/efn.whoosh_light_1": sound11,
    "音效/epicfight.entity.hit.blade.1": sound12,
    "音效/item.trident.throw.2": sound13,
    "音效/twilightforest.block.twilightforest.boss_chest.appear": sound14,
    "音效/twilightforest.entity.twilightforest.naga.hurt.2": sound15,
    "音效/twilightforest.entity.twilightforest.naga.hurt.3": sound16,
  },
  表: soundTable,
};
export default soundUrl;
