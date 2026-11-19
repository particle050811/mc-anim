// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import { privateMusic } from '@engine/audio/私有配乐.ts';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/ambient.nether_wastes.mood.1";
import sound1 from "asset:音效/block.beacon.deactivate";
import sound2 from "asset:音效/entity.generic.small_fall";
import sound3 from "asset:音效/entity.player.death.1";
import sound4 from "asset:音效/ui.button.click";
import sound5 from "asset:音效/诡厄巫法/goety.heavy_woosh.1";
import sound6 from "asset:音效/诡厄巫法/goety.heavy_woosh.2";

const soundUrl: SoundUrl = {
  urls: {
    "配乐/亚波伦/決戦の刻": privateMusic("配乐/亚波伦/決戦の刻"),
    "音效/ambient.nether_wastes.mood.1": sound0,
    "音效/block.beacon.deactivate": sound1,
    "音效/entity.generic.small_fall": sound2,
    "音效/entity.player.death.1": sound3,
    "音效/ui.button.click": sound4,
    "音效/诡厄巫法/goety.heavy_woosh.1": sound5,
    "音效/诡厄巫法/goety.heavy_woosh.2": sound6,
  },
  表: soundTable,
};
export default soundUrl;
