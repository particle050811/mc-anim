// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import { privateMusic } from '@engine/audio/私有配乐.ts';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/block.wooden_door.open.1";
import sound1 from "asset:音效/item.elytra.flying";
import sound2 from "asset:音效/万法皆通/wind_seeking_bell";

const soundUrl: SoundUrl = {
  urls: {
    "配乐/把回忆拼好给你-无男声DJ": privateMusic("配乐/把回忆拼好给你-无男声DJ"),
    "音效/block.wooden_door.open.1": sound0,
    "音效/item.elytra.flying": sound1,
    "音效/万法皆通/wind_seeking_bell": sound2,
  },
  表: soundTable,
};
export default soundUrl;
