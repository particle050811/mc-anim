// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import { 私有配乐 } from '@engine/audio/私有配乐.ts';
import 表 from './声音表.生成.ts';
import 声0 from "asset:音效/ambient.nether_wastes.mood.2";
import 声1 from "asset:音效/block.stone.fall.2";
import 声2 from "asset:音效/block.stone.fall.4";
import 声3 from "asset:音效/block.stone.fall.5";
import 声4 from "asset:音效/block.stone.fall.6";
import 声5 from "asset:音效/block.stone.step.1";
import 声6 from "asset:音效/block.stone.step.2";
import 声7 from "asset:音效/block.stone.step.3";
import 声8 from "asset:音效/block.stone.step.4";
import 声9 from "asset:音效/block.stone.step.5";
import 声10 from "asset:音效/block.stone.step.6";
import 声11 from "asset:音效/entity.player.attack.crit.1";
import 声12 from "asset:音效/entity.player.attack.crit.2";
import 声13 from "asset:音效/entity.player.attack.nodamage.2";
import 声14 from "asset:音效/entity.player.attack.strong.1";
import 声15 from "asset:音效/entity.player.attack.strong.4";
import 声16 from "asset:音效/entity.player.attack.sweep.1";
import 声17 from "asset:音效/entity.player.attack.sweep.3";
import 声18 from "asset:音效/诡厄巫法/goety.apostle_pre_teleport";
import 声19 from "asset:音效/诡厄巫法/goety.apostle_teleport.1";
import 声20 from "asset:音效/诡厄巫法/goety.wind.1";
import 声21 from "asset:音效/诡厄巫法/goety.wind.2";
import 声22 from "asset:音效/诡厄巫法/goety.wind.3";
import 声23 from "asset:音效/诡厄巫法/goety.wind.4";

const 声音: 声音地址 = {
  地址: {
    "配乐/亚波伦/決戦の刻": 私有配乐("配乐/亚波伦/決戦の刻"),
    "音效/ambient.nether_wastes.mood.2": 声0,
    "音效/block.stone.fall.2": 声1,
    "音效/block.stone.fall.4": 声2,
    "音效/block.stone.fall.5": 声3,
    "音效/block.stone.fall.6": 声4,
    "音效/block.stone.step.1": 声5,
    "音效/block.stone.step.2": 声6,
    "音效/block.stone.step.3": 声7,
    "音效/block.stone.step.4": 声8,
    "音效/block.stone.step.5": 声9,
    "音效/block.stone.step.6": 声10,
    "音效/entity.player.attack.crit.1": 声11,
    "音效/entity.player.attack.crit.2": 声12,
    "音效/entity.player.attack.nodamage.2": 声13,
    "音效/entity.player.attack.strong.1": 声14,
    "音效/entity.player.attack.strong.4": 声15,
    "音效/entity.player.attack.sweep.1": 声16,
    "音效/entity.player.attack.sweep.3": 声17,
    "音效/诡厄巫法/goety.apostle_pre_teleport": 声18,
    "音效/诡厄巫法/goety.apostle_teleport.1": 声19,
    "音效/诡厄巫法/goety.wind.1": 声20,
    "音效/诡厄巫法/goety.wind.2": 声21,
    "音效/诡厄巫法/goety.wind.3": 声22,
    "音效/诡厄巫法/goety.wind.4": 声23,
  },
  表,
};
export default 声音;
