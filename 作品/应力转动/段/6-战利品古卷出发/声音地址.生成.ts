// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配乐/Wasted";
import sound1 from "asset:配音/6-九胡-导航";
import sound2 from "asset:配音/6-李樱-不算白跑";
import sound3 from "asset:配音/6-李樱-古城寻宝";
import sound4 from "asset:配音/6-李樱-夸克古卷";
import sound5 from "asset:配音/6-李樱-沉淀";
import sound6 from "asset:配音/6-李樱-熔炼温度";
import sound7 from "asset:配音/6-李樱-锁链基底";
import sound8 from "asset:音效/block.wood.step.1";
import sound9 from "asset:音效/block.wood.step.2";
import sound10 from "asset:音效/block.wood.step.5";
import sound11 from "asset:音效/block.wool.place.3";
import sound12 from "asset:音效/ui.button.click";

const soundUrl: SoundUrl = {
  urls: {
    "配乐/Wasted": sound0,
    "配音/6-九胡-导航": sound1,
    "配音/6-李樱-不算白跑": sound2,
    "配音/6-李樱-古城寻宝": sound3,
    "配音/6-李樱-夸克古卷": sound4,
    "配音/6-李樱-沉淀": sound5,
    "配音/6-李樱-熔炼温度": sound6,
    "配音/6-李樱-锁链基底": sound7,
    "音效/block.wood.step.1": sound8,
    "音效/block.wood.step.2": sound9,
    "音效/block.wood.step.5": sound10,
    "音效/block.wool.place.3": sound11,
    "音效/ui.button.click": sound12,
  },
  表: soundTable,
};
export default soundUrl;
