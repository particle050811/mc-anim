// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:配乐/Wasted";
import 声1 from "asset:配音/6-九胡-怎么下去";
import 声2 from "asset:配音/6-九胡-边城脚下";
import 声3 from "asset:配音/6-李樱-又回到这里";
import 声4 from "asset:配音/镜头/6-3-2/李樱-压路机-改字";
import 声5 from "asset:音效/item.elytra.flying";
import 声6 from "asset:音效/镜头/6-3-2/点击";

const 声音: 声音地址 = {
  地址: {
    "配乐/Wasted": 声0,
    "配音/6-九胡-怎么下去": 声1,
    "配音/6-九胡-边城脚下": 声2,
    "配音/6-李樱-又回到这里": 声3,
    "配音/镜头/6-3-2/李樱-压路机-改字": 声4,
    "音效/item.elytra.flying": 声5,
    "音效/镜头/6-3-2/点击": 声6,
  },
  表,
};
export default 声音;
