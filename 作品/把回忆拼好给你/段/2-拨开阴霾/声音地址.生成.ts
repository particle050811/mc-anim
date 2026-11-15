// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import { privateMusic } from '@engine/audio/私有配乐.ts';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/把回忆拼好给你/block.beacon.activate";
import sound1 from "asset:音效/把回忆拼好给你/weather.rain.2";
import sound2 from "asset:音效/把回忆拼好给你/weather.rain.3";
import sound3 from "asset:音效/把回忆拼好给你/weather.rain.4";

const soundUrl: SoundUrl = {
  urls: {
    "配乐/把回忆拼好给你-无男声DJ": privateMusic("配乐/把回忆拼好给你-无男声DJ"),
    "音效/把回忆拼好给你/block.beacon.activate": sound0,
    "音效/把回忆拼好给你/weather.rain.2": sound1,
    "音效/把回忆拼好给你/weather.rain.3": sound2,
    "音效/把回忆拼好给你/weather.rain.4": sound3,
  },
  表: soundTable,
};
export default soundUrl;
