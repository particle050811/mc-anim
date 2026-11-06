// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:配音/6-李樱-RoadRoller";
import 声1 from "asset:音效/block.deepslate.break.2";
import 声2 from "asset:音效/block.deepslate.break.3";
import 声3 from "asset:音效/block.deepslate.break.4";
import 声4 from "asset:音效/block.deepslate.fall.2";
import 声5 from "asset:音效/block.gravel.break.1";
import 声6 from "asset:音效/block.gravel.break.2";
import 声7 from "asset:音效/block.gravel.break.3";
import 声8 from "asset:音效/block.sculk.break.1";
import 声9 from "asset:音效/block.sculk.break.13";
import 声10 from "asset:音效/block.sculk.break.4";
import 声11 from "asset:音效/block.stone.break.1";
import 声12 from "asset:音效/block.stone.break.2";
import 声13 from "asset:音效/block.stone.break.3";
import 声14 from "asset:音效/block.stone.break.4";
import 声15 from "asset:音效/block.stone.fall.2";
import 声16 from "asset:音效/cataclysm.heavy_smash";
import 声17 from "asset:音效/entity.player.big_fall";
import 声18 from "asset:音效/item.elytra.flying";

const 声音: 声音地址 = {
  地址: {
    "配音/6-李樱-RoadRoller": 声0,
    "音效/block.deepslate.break.2": 声1,
    "音效/block.deepslate.break.3": 声2,
    "音效/block.deepslate.break.4": 声3,
    "音效/block.deepslate.fall.2": 声4,
    "音效/block.gravel.break.1": 声5,
    "音效/block.gravel.break.2": 声6,
    "音效/block.gravel.break.3": 声7,
    "音效/block.sculk.break.1": 声8,
    "音效/block.sculk.break.13": 声9,
    "音效/block.sculk.break.4": 声10,
    "音效/block.stone.break.1": 声11,
    "音效/block.stone.break.2": 声12,
    "音效/block.stone.break.3": 声13,
    "音效/block.stone.break.4": 声14,
    "音效/block.stone.fall.2": 声15,
    "音效/cataclysm.heavy_smash": 声16,
    "音效/entity.player.big_fall": 声17,
    "音效/item.elytra.flying": 声18,
  },
  表,
};
export default 声音;
