// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:音效/block.chest.open";
import 声1 from "asset:音效/block.sculk_sensor.clicking.1";
import 声2 from "asset:音效/block.sculk_sensor.clicking.3";
import 声3 from "asset:音效/block.sculk_sensor.clicking.4";
import 声4 from "asset:音效/block.sculk_sensor.clicking_stop.2";
import 声5 from "asset:音效/block.sculk_sensor.clicking_stop.3";
import 声6 from "asset:音效/block.sculk_sensor.clicking_stop.5";
import 声7 from "asset:音效/block.sculk_shrieker.shriek.3";
import 声8 from "asset:音效/block.sculk_shrieker.shriek.4";
import 声9 from "asset:音效/entity.horse.gallop.1";
import 声10 from "asset:音效/entity.horse.gallop.2";
import 声11 from "asset:音效/entity.horse.gallop.3";
import 声12 from "asset:音效/entity.horse.gallop.4";
import 声13 from "asset:音效/entity.warden.emerge";
import 声14 from "asset:音效/entity.warden.heartbeat.3";
import 声15 from "asset:音效/entity.warden.heartbeat.4";
import 声16 from "asset:音效/entity.warden.tendril_clicks.2";
import 声17 from "asset:音效/entity.warden.tendril_clicks.3";
import 声18 from "asset:音效/entity.warden.tendril_clicks.6";

const 声音: 声音地址 = {
  地址: {
    "音效/block.chest.open": 声0,
    "音效/block.sculk_sensor.clicking.1": 声1,
    "音效/block.sculk_sensor.clicking.3": 声2,
    "音效/block.sculk_sensor.clicking.4": 声3,
    "音效/block.sculk_sensor.clicking_stop.2": 声4,
    "音效/block.sculk_sensor.clicking_stop.3": 声5,
    "音效/block.sculk_sensor.clicking_stop.5": 声6,
    "音效/block.sculk_shrieker.shriek.3": 声7,
    "音效/block.sculk_shrieker.shriek.4": 声8,
    "音效/entity.horse.gallop.1": 声9,
    "音效/entity.horse.gallop.2": 声10,
    "音效/entity.horse.gallop.3": 声11,
    "音效/entity.horse.gallop.4": 声12,
    "音效/entity.warden.emerge": 声13,
    "音效/entity.warden.heartbeat.3": 声14,
    "音效/entity.warden.heartbeat.4": 声15,
    "音效/entity.warden.tendril_clicks.2": 声16,
    "音效/entity.warden.tendril_clicks.3": 声17,
    "音效/entity.warden.tendril_clicks.6": 声18,
  },
  表,
};
export default 声音;
