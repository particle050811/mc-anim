// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配音/6-刘心忠-怕了我们";
import sound1 from "asset:配音/6-黄叛-结构奇怪";
import sound2 from "asset:音效/block.deepslate.step.3";
import sound3 from "asset:音效/block.sculk.step.6";
import sound4 from "asset:音效/block.sculk_sensor.clicking.1";
import sound5 from "asset:音效/block.sculk_sensor.clicking.2";
import sound6 from "asset:音效/block.sculk_sensor.clicking.3";
import sound7 from "asset:音效/block.sculk_sensor.clicking.4";
import sound8 from "asset:音效/block.sculk_sensor.clicking.5";
import sound9 from "asset:音效/block.sculk_sensor.clicking.6";
import sound10 from "asset:音效/block.sculk_shrieker.shriek.3";
import sound11 from "asset:音效/block.stone.step.5";

const soundUrl: SoundUrl = {
  urls: {
    "配音/6-刘心忠-怕了我们": sound0,
    "配音/6-黄叛-结构奇怪": sound1,
    "音效/block.deepslate.step.3": sound2,
    "音效/block.sculk.step.6": sound3,
    "音效/block.sculk_sensor.clicking.1": sound4,
    "音效/block.sculk_sensor.clicking.2": sound5,
    "音效/block.sculk_sensor.clicking.3": sound6,
    "音效/block.sculk_sensor.clicking.4": sound7,
    "音效/block.sculk_sensor.clicking.5": sound8,
    "音效/block.sculk_sensor.clicking.6": sound9,
    "音效/block.sculk_shrieker.shriek.3": sound10,
    "音效/block.stone.step.5": sound11,
  },
  表: soundTable,
};
export default soundUrl;
