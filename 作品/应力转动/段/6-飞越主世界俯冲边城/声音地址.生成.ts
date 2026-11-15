// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配乐/Wasted";
import sound1 from "asset:配音/6-九胡-怎么下去";
import sound2 from "asset:配音/6-九胡-边城脚下";
import sound3 from "asset:配音/6-李樱-又回到这里";
import sound4 from "asset:配音/镜头/6-3-2/李樱-压路机-改字";
import sound5 from "asset:音效/item.elytra.flying";
import sound6 from "asset:音效/镜头/6-3-2/点击";

const soundUrl: SoundUrl = {
  urls: {
    "配乐/Wasted": sound0,
    "配音/6-九胡-怎么下去": sound1,
    "配音/6-九胡-边城脚下": sound2,
    "配音/6-李樱-又回到这里": sound3,
    "配音/镜头/6-3-2/李樱-压路机-改字": sound4,
    "音效/item.elytra.flying": sound5,
    "音效/镜头/6-3-2/点击": sound6,
  },
  表: soundTable,
};
export default soundUrl;
