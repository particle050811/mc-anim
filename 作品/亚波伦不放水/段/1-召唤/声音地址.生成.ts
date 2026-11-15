// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import { privateMusic } from '@engine/audio/私有配乐.ts';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/ambient.nether_wastes.mood.2";
import sound1 from "asset:音效/block.sculk_catalyst.bloom.1";
import sound2 from "asset:音效/block.sculk_catalyst.bloom.2";
import sound3 from "asset:音效/block.stone.step.1";
import sound4 from "asset:音效/block.stone.step.2";
import sound5 from "asset:音效/block.stone.step.3";
import sound6 from "asset:音效/block.stone.step.4";
import sound7 from "asset:音效/block.stone.step.5";
import sound8 from "asset:音效/block.stone.step.6";
import sound9 from "asset:音效/entity.item.pickup";
import sound10 from "asset:音效/entity.lightning_bolt.thunder.1";
import sound11 from "asset:音效/item.armor.equip_generic.1";
import sound12 from "asset:音效/仪式/goety.altar_finish";
import sound13 from "asset:音效/仪式/goety.altar_loop";
import sound14 from "asset:音效/仪式/goety.altar_start";
import sound15 from "asset:音效/诡厄巫法/goety.apostle_ambient.1";
import sound16 from "asset:音效/诡厄巫法/goety.wind.1";

const soundUrl: SoundUrl = {
  urls: {
    "配乐/亚波伦/決戦の刻": privateMusic("配乐/亚波伦/決戦の刻"),
    "音效/ambient.nether_wastes.mood.2": sound0,
    "音效/block.sculk_catalyst.bloom.1": sound1,
    "音效/block.sculk_catalyst.bloom.2": sound2,
    "音效/block.stone.step.1": sound3,
    "音效/block.stone.step.2": sound4,
    "音效/block.stone.step.3": sound5,
    "音效/block.stone.step.4": sound6,
    "音效/block.stone.step.5": sound7,
    "音效/block.stone.step.6": sound8,
    "音效/entity.item.pickup": sound9,
    "音效/entity.lightning_bolt.thunder.1": sound10,
    "音效/item.armor.equip_generic.1": sound11,
    "音效/仪式/goety.altar_finish": sound12,
    "音效/仪式/goety.altar_loop": sound13,
    "音效/仪式/goety.altar_start": sound14,
    "音效/诡厄巫法/goety.apostle_ambient.1": sound15,
    "音效/诡厄巫法/goety.wind.1": sound16,
  },
  表: soundTable,
};
export default soundUrl;
