// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import { 私有配乐 } from '@engine/audio/私有配乐.ts';
import 表 from './声音表.生成.ts';
import 声0 from "asset:音效/ambient.nether_wastes.mood.2";
import 声1 from "asset:音效/block.stone.step.1";
import 声2 from "asset:音效/block.stone.step.2";
import 声3 from "asset:音效/block.stone.step.3";
import 声4 from "asset:音效/block.stone.step.4";
import 声5 from "asset:音效/block.stone.step.5";
import 声6 from "asset:音效/block.stone.step.6";
import 声7 from "asset:音效/item.trident.riptide_1";
import 声8 from "asset:音效/诡厄巫法/goety.apostle_pre_teleport";
import 声9 from "asset:音效/诡厄巫法/goety.apostle_prepare_spell.1";
import 声10 from "asset:音效/诡厄巫法/goety.apostle_teleport.1";
import 声11 from "asset:音效/诡厄巫法/goety.wind.1";
import 声12 from "asset:音效/诡厄巫法/goety.wind.2";
import 声13 from "asset:音效/诡厄巫法/goety.wind.3";

const 声音: 声音地址 = {
  地址: {
    "配乐/亚波伦/決戦の刻": 私有配乐("配乐/亚波伦/決戦の刻"),
    "音效/ambient.nether_wastes.mood.2": 声0,
    "音效/block.stone.step.1": 声1,
    "音效/block.stone.step.2": 声2,
    "音效/block.stone.step.3": 声3,
    "音效/block.stone.step.4": 声4,
    "音效/block.stone.step.5": 声5,
    "音效/block.stone.step.6": 声6,
    "音效/item.trident.riptide_1": 声7,
    "音效/诡厄巫法/goety.apostle_pre_teleport": 声8,
    "音效/诡厄巫法/goety.apostle_prepare_spell.1": 声9,
    "音效/诡厄巫法/goety.apostle_teleport.1": 声10,
    "音效/诡厄巫法/goety.wind.1": 声11,
    "音效/诡厄巫法/goety.wind.2": 声12,
    "音效/诡厄巫法/goety.wind.3": 声13,
  },
  表,
};
export default 声音;
