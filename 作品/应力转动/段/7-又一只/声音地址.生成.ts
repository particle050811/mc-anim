// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:音效/block.chest.open";
import sound1 from "asset:音效/block.sculk_sensor.clicking.1";
import sound2 from "asset:音效/block.sculk_sensor.clicking.3";
import sound3 from "asset:音效/block.sculk_sensor.clicking.4";
import sound4 from "asset:音效/block.sculk_sensor.clicking_stop.2";
import sound5 from "asset:音效/block.sculk_sensor.clicking_stop.3";
import sound6 from "asset:音效/block.sculk_sensor.clicking_stop.5";
import sound7 from "asset:音效/block.sculk_shrieker.shriek.3";
import sound8 from "asset:音效/block.sculk_shrieker.shriek.4";
import sound9 from "asset:音效/entity.horse.gallop.1";
import sound10 from "asset:音效/entity.horse.gallop.2";
import sound11 from "asset:音效/entity.horse.gallop.3";
import sound12 from "asset:音效/entity.horse.gallop.4";
import sound13 from "asset:音效/entity.warden.emerge";
import sound14 from "asset:音效/entity.warden.heartbeat.3";
import sound15 from "asset:音效/entity.warden.heartbeat.4";
import sound16 from "asset:音效/entity.warden.tendril_clicks.2";
import sound17 from "asset:音效/entity.warden.tendril_clicks.3";
import sound18 from "asset:音效/entity.warden.tendril_clicks.6";

const soundUrl: SoundUrl = {
  urls: {
    "音效/block.chest.open": sound0,
    "音效/block.sculk_sensor.clicking.1": sound1,
    "音效/block.sculk_sensor.clicking.3": sound2,
    "音效/block.sculk_sensor.clicking.4": sound3,
    "音效/block.sculk_sensor.clicking_stop.2": sound4,
    "音效/block.sculk_sensor.clicking_stop.3": sound5,
    "音效/block.sculk_sensor.clicking_stop.5": sound6,
    "音效/block.sculk_shrieker.shriek.3": sound7,
    "音效/block.sculk_shrieker.shriek.4": sound8,
    "音效/entity.horse.gallop.1": sound9,
    "音效/entity.horse.gallop.2": sound10,
    "音效/entity.horse.gallop.3": sound11,
    "音效/entity.horse.gallop.4": sound12,
    "音效/entity.warden.emerge": sound13,
    "音效/entity.warden.heartbeat.3": sound14,
    "音效/entity.warden.heartbeat.4": sound15,
    "音效/entity.warden.tendril_clicks.2": sound16,
    "音效/entity.warden.tendril_clicks.3": sound17,
    "音效/entity.warden.tendril_clicks.6": sound18,
  },
  表: soundTable,
};
export default soundUrl;
