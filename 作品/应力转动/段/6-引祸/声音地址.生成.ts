// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:配音/6-李樱-会会你们";
import 声1 from "asset:音效/block.chain.hit.4";
import 声2 from "asset:音效/block.sculk_shrieker.shriek.3";
import 声3 from "asset:音效/block.wool.place.2";
import 声4 from "asset:音效/block.wool.step.4";

const 声音: 声音地址 = {
  地址: {
    "配音/6-李樱-会会你们": 声0,
    "音效/block.chain.hit.4": 声1,
    "音效/block.sculk_shrieker.shriek.3": 声2,
    "音效/block.wool.place.2": 声3,
    "音效/block.wool.step.4": 声4,
  },
  表,
};
export default 声音;
