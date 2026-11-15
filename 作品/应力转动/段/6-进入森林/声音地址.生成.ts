// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配音/6-李樱-出征暮色";
import sound1 from "asset:音效/block.grass.step.1";
import sound2 from "asset:音效/block.grass.step.4";
import sound3 from "asset:音效/block.portal.travel";
import sound4 from "asset:音效/entity.generic.splash.1";
import sound5 from "asset:音效/entity.lightning_bolt.impact.1";
import sound6 from "asset:音效/entity.lightning_bolt.thunder.2";
import sound7 from "asset:音效/entity.player.splash.2";

const soundUrl: SoundUrl = {
  urls: {
    "配音/6-李樱-出征暮色": sound0,
    "音效/block.grass.step.1": sound1,
    "音效/block.grass.step.4": sound2,
    "音效/block.portal.travel": sound3,
    "音效/entity.generic.splash.1": sound4,
    "音效/entity.lightning_bolt.impact.1": sound5,
    "音效/entity.lightning_bolt.thunder.2": sound6,
    "音效/entity.player.splash.2": sound7,
  },
  表: soundTable,
};
export default soundUrl;
