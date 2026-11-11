// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import { 私有配乐 } from '@engine/audio/私有配乐.ts';
import 表 from './声音表.生成.ts';
import 声0 from "asset:音效/ambient.nether_wastes.mood.1";
import 声1 from "asset:音效/block.beacon.deactivate";
import 声2 from "asset:音效/entity.generic.small_fall";
import 声3 from "asset:音效/entity.player.death.1";
import 声4 from "asset:音效/ui.button.click";
import 声5 from "asset:音效/诡厄巫法/goety.cast_spell.2";
import 声6 from "asset:音效/诡厄巫法/goety.heavy_woosh.2";

const 声音: 声音地址 = {
  地址: {
    "配乐/亚波伦/決戦の刻": 私有配乐("配乐/亚波伦/決戦の刻"),
    "音效/ambient.nether_wastes.mood.1": 声0,
    "音效/block.beacon.deactivate": 声1,
    "音效/entity.generic.small_fall": 声2,
    "音效/entity.player.death.1": 声3,
    "音效/ui.button.click": 声4,
    "音效/诡厄巫法/goety.cast_spell.2": 声5,
    "音效/诡厄巫法/goety.heavy_woosh.2": 声6,
  },
  表,
};
export default 声音;
