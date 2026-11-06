// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:配音/7-刘心忠-风筝";
import 声1 from "asset:音效/entity.arrow.hit.1";
import 声2 from "asset:音效/entity.arrow.hit.3";
import 声3 from "asset:音效/entity.arrow.hit.4";
import 声4 from "asset:音效/entity.arrow.shoot";
import 声5 from "asset:音效/entity.creeper.hurt.2";
import 声6 from "asset:音效/entity.generic.explode.1";
import 声7 from "asset:音效/entity.generic.explode.2";
import 声8 from "asset:音效/entity.generic.explode.3";
import 声9 from "asset:音效/entity.generic.explode.4";
import 声10 from "asset:音效/entity.horse.gallop.1";
import 声11 from "asset:音效/entity.horse.gallop.2";
import 声12 from "asset:音效/entity.horse.gallop.4";
import 声13 from "asset:音效/entity.warden.death.1";
import 声14 from "asset:音效/entity.warden.hurt.1";
import 声15 from "asset:音效/entity.warden.hurt.2";
import 声16 from "asset:音效/entity.warden.hurt.3";
import 声17 from "asset:音效/entity.warden.hurt.4";
import 声18 from "asset:音效/entity.warden.sonic_boom.1";
import 声19 from "asset:音效/entity.warden.sonic_boom.4";

const 声音: 声音地址 = {
  地址: {
    "配音/7-刘心忠-风筝": 声0,
    "音效/entity.arrow.hit.1": 声1,
    "音效/entity.arrow.hit.3": 声2,
    "音效/entity.arrow.hit.4": 声3,
    "音效/entity.arrow.shoot": 声4,
    "音效/entity.creeper.hurt.2": 声5,
    "音效/entity.generic.explode.1": 声6,
    "音效/entity.generic.explode.2": 声7,
    "音效/entity.generic.explode.3": 声8,
    "音效/entity.generic.explode.4": 声9,
    "音效/entity.horse.gallop.1": 声10,
    "音效/entity.horse.gallop.2": 声11,
    "音效/entity.horse.gallop.4": 声12,
    "音效/entity.warden.death.1": 声13,
    "音效/entity.warden.hurt.1": 声14,
    "音效/entity.warden.hurt.2": 声15,
    "音效/entity.warden.hurt.3": 声16,
    "音效/entity.warden.hurt.4": 声17,
    "音效/entity.warden.sonic_boom.1": 声18,
    "音效/entity.warden.sonic_boom.4": 声19,
  },
  表,
};
export default 声音;
