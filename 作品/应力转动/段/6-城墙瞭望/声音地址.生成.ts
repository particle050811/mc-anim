// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/item.elytra.flying";
import sound1 from "asset:音效/item.spyglass.use.1";
import sound2 from "asset:音效/item.spyglass.use.2";
import sound3 from "asset:音效/item.spyglass.use.3";
import sound4 from "asset:音效/item.spyglass.use.4";

const soundUrl: SoundUrl = {
  urls: {
    "音效/item.elytra.flying": sound0,
    "音效/item.spyglass.use.1": sound1,
    "音效/item.spyglass.use.2": sound2,
    "音效/item.spyglass.use.3": sound3,
    "音效/item.spyglass.use.4": sound4,
  },
  表: soundTable,
};
export default soundUrl;
