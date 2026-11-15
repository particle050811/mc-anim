// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配音/6-李樱-烦死了";
import sound1 from "asset:音效/block.sculk_sensor.clicking.3";
import sound2 from "asset:音效/block.sculk_shrieker.shriek.3";

const soundUrl: SoundUrl = {
  urls: {
    "配音/6-李樱-烦死了": sound0,
    "音效/block.sculk_sensor.clicking.3": sound1,
    "音效/block.sculk_shrieker.shriek.3": sound2,
  },
  表: soundTable,
};
export default soundUrl;
