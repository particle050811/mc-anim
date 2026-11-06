// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:音效/block.wood.place.4";
import 声1 from "asset:音效/entity.arrow.shoot";
import 声2 from "asset:音效/entity.evoker.cast_spell.1";
import 声3 from "asset:音效/entity.evoker.prepare_summon";
import 声4 from "asset:音效/entity.vex.charge.1";
import 声5 from "asset:音效/entity.vex.charge.2";
import 声6 from "asset:音效/entity.warden.angry.5";
import 声7 from "asset:音效/entity.warden.tendril_clicks.4";
import 声8 from "asset:音效/entity.warden.tendril_clicks.6";
import 声9 from "asset:音效/item.elytra.flying";

const 声音: 声音地址 = {
  地址: {
    "音效/block.wood.place.4": 声0,
    "音效/entity.arrow.shoot": 声1,
    "音效/entity.evoker.cast_spell.1": 声2,
    "音效/entity.evoker.prepare_summon": 声3,
    "音效/entity.vex.charge.1": 声4,
    "音效/entity.vex.charge.2": 声5,
    "音效/entity.warden.angry.5": 声6,
    "音效/entity.warden.tendril_clicks.4": 声7,
    "音效/entity.warden.tendril_clicks.6": 声8,
    "音效/item.elytra.flying": 声9,
  },
  表,
};
export default 声音;
