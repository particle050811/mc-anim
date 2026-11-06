// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:配乐/Wasted";
import 声1 from "asset:配音/6-九胡-等等我";
import 声2 from "asset:配音/6-李樱-看我速通暮色";
import 声3 from "asset:音效/block.grass.step.1";
import 声4 from "asset:音效/block.grass.step.2";
import 声5 from "asset:音效/block.grass.step.3";
import 声6 from "asset:音效/block.grass.step.4";
import 声7 from "asset:音效/block.grass.step.5";
import 声8 from "asset:音效/block.grass.step.6";
import 声9 from "asset:音效/block.portal.travel";
import 声10 from "asset:音效/block.stone.step.2";
import 声11 from "asset:音效/block.stone.step.3";
import 声12 from "asset:音效/block.stone.step.4";
import 声13 from "asset:音效/block.stone.step.5";
import 声14 from "asset:音效/block.wool.place.4";
import 声15 from "asset:音效/twilightforest.block.twilightforest.boss_chest.appear";

const 声音: 声音地址 = {
  地址: {
    "配乐/Wasted": 声0,
    "配音/6-九胡-等等我": 声1,
    "配音/6-李樱-看我速通暮色": 声2,
    "音效/block.grass.step.1": 声3,
    "音效/block.grass.step.2": 声4,
    "音效/block.grass.step.3": 声5,
    "音效/block.grass.step.4": 声6,
    "音效/block.grass.step.5": 声7,
    "音效/block.grass.step.6": 声8,
    "音效/block.portal.travel": 声9,
    "音效/block.stone.step.2": 声10,
    "音效/block.stone.step.3": 声11,
    "音效/block.stone.step.4": 声12,
    "音效/block.stone.step.5": 声13,
    "音效/block.wool.place.4": 声14,
    "音效/twilightforest.block.twilightforest.boss_chest.appear": 声15,
  },
  表,
};
export default 声音;
