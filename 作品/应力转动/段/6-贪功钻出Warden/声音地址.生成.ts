// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import soundTable from './声音表.生成.ts';
import sound0 from "asset:配音/6-刘心忠-贵族生活";
import sound1 from "asset:音效/block.deepslate.step.1";
import sound2 from "asset:音效/block.deepslate.step.5";
import sound3 from "asset:音效/block.sculk.step.1";
import sound4 from "asset:音效/block.sculk.step.2";
import sound5 from "asset:音效/block.sculk.step.3";
import sound6 from "asset:音效/block.sculk.step.4";
import sound7 from "asset:音效/block.sculk.step.5";
import sound8 from "asset:音效/block.sculk.step.6";
import sound9 from "asset:音效/block.sculk_sensor.clicking.1";
import sound10 from "asset:音效/block.sculk_sensor.clicking.2";
import sound11 from "asset:音效/block.sculk_shrieker.shriek.3";
import sound12 from "asset:音效/entity.warden.emerge";
import sound13 from "asset:音效/entity.warden.heartbeat.1";
import sound14 from "asset:音效/entity.warden.heartbeat.2";
import sound15 from "asset:音效/entity.warden.heartbeat.3";
import sound16 from "asset:音效/entity.warden.roar.3";
import sound17 from "asset:音效/entity.warden.tendril_clicks.4";
import sound18 from "asset:音效/entity.warden.tendril_clicks.5";

const soundUrl: SoundUrl = {
  urls: {
    "配音/6-刘心忠-贵族生活": sound0,
    "音效/block.deepslate.step.1": sound1,
    "音效/block.deepslate.step.5": sound2,
    "音效/block.sculk.step.1": sound3,
    "音效/block.sculk.step.2": sound4,
    "音效/block.sculk.step.3": sound5,
    "音效/block.sculk.step.4": sound6,
    "音效/block.sculk.step.5": sound7,
    "音效/block.sculk.step.6": sound8,
    "音效/block.sculk_sensor.clicking.1": sound9,
    "音效/block.sculk_sensor.clicking.2": sound10,
    "音效/block.sculk_shrieker.shriek.3": sound11,
    "音效/entity.warden.emerge": sound12,
    "音效/entity.warden.heartbeat.1": sound13,
    "音效/entity.warden.heartbeat.2": sound14,
    "音效/entity.warden.heartbeat.3": sound15,
    "音效/entity.warden.roar.3": sound16,
    "音效/entity.warden.tendril_clicks.4": sound17,
    "音效/entity.warden.tendril_clicks.5": sound18,
  },
  表: soundTable,
};
export default soundUrl;
