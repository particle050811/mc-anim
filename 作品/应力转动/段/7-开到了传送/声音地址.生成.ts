// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:配音/7-李樱-开到了";
import 声1 from "asset:音效/block.chest.close.2";
import 声2 from "asset:音效/block.chest.open";
import 声3 from "asset:音效/block.portal.travel";
import 声4 from "asset:音效/block.portal.trigger";
import 声5 from "asset:音效/block.sculk_sensor.clicking.1";
import 声6 from "asset:音效/block.sculk_sensor.clicking.2";
import 声7 from "asset:音效/block.sculk_sensor.clicking.3";
import 声8 from "asset:音效/block.sculk_sensor.clicking.4";
import 声9 from "asset:音效/block.sculk_sensor.clicking.6";
import 声10 from "asset:音效/block.sculk_sensor.clicking_stop.1";
import 声11 from "asset:音效/block.sculk_sensor.clicking_stop.2";
import 声12 from "asset:音效/block.sculk_sensor.clicking_stop.4";
import 声13 from "asset:音效/block.sculk_sensor.clicking_stop.5";
import 声14 from "asset:音效/block.sculk_shrieker.shriek.4";

const 声音: 声音地址 = {
  地址: {
    "配音/7-李樱-开到了": 声0,
    "音效/block.chest.close.2": 声1,
    "音效/block.chest.open": 声2,
    "音效/block.portal.travel": 声3,
    "音效/block.portal.trigger": 声4,
    "音效/block.sculk_sensor.clicking.1": 声5,
    "音效/block.sculk_sensor.clicking.2": 声6,
    "音效/block.sculk_sensor.clicking.3": 声7,
    "音效/block.sculk_sensor.clicking.4": 声8,
    "音效/block.sculk_sensor.clicking.6": 声9,
    "音效/block.sculk_sensor.clicking_stop.1": 声10,
    "音效/block.sculk_sensor.clicking_stop.2": 声11,
    "音效/block.sculk_sensor.clicking_stop.4": 声12,
    "音效/block.sculk_sensor.clicking_stop.5": 声13,
    "音效/block.sculk_shrieker.shriek.4": 声14,
  },
  表,
};
export default 声音;
