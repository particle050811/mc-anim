// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:配乐/Wasted";
import 声1 from "asset:配音/6-九胡-导航";
import 声2 from "asset:配音/6-李樱-不算白跑";
import 声3 from "asset:配音/6-李樱-古城寻宝";
import 声4 from "asset:配音/6-李樱-夸克古卷";
import 声5 from "asset:配音/6-李樱-沉淀";
import 声6 from "asset:配音/6-李樱-熔炼温度";
import 声7 from "asset:配音/6-李樱-锁链基底";
import 声8 from "asset:音效/block.wood.step.1";
import 声9 from "asset:音效/block.wood.step.2";
import 声10 from "asset:音效/block.wood.step.5";
import 声11 from "asset:音效/block.wool.place.3";
import 声12 from "asset:音效/ui.button.click";

const 声音: 声音地址 = {
  地址: {
    "配乐/Wasted": 声0,
    "配音/6-九胡-导航": 声1,
    "配音/6-李樱-不算白跑": 声2,
    "配音/6-李樱-古城寻宝": 声3,
    "配音/6-李樱-夸克古卷": 声4,
    "配音/6-李樱-沉淀": 声5,
    "配音/6-李樱-熔炼温度": 声6,
    "配音/6-李樱-锁链基底": 声7,
    "音效/block.wood.step.1": 声8,
    "音效/block.wood.step.2": 声9,
    "音效/block.wood.step.5": 声10,
    "音效/block.wool.place.3": 声11,
    "音效/ui.button.click": 声12,
  },
  表,
};
export default 声音;
