// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:配音/6-刘心忠-怕了我们";
import 声1 from "asset:配音/6-黄叛-结构奇怪";
import 声2 from "asset:音效/block.deepslate.step.3";
import 声3 from "asset:音效/block.sculk.step.6";
import 声4 from "asset:音效/block.sculk_sensor.clicking.1";
import 声5 from "asset:音效/block.sculk_sensor.clicking.2";
import 声6 from "asset:音效/block.sculk_sensor.clicking.3";
import 声7 from "asset:音效/block.sculk_sensor.clicking.4";
import 声8 from "asset:音效/block.sculk_sensor.clicking.5";
import 声9 from "asset:音效/block.sculk_sensor.clicking.6";
import 声10 from "asset:音效/block.sculk_shrieker.shriek.3";
import 声11 from "asset:音效/block.stone.step.5";

const 声音: 声音地址 = {
  地址: {
    "配音/6-刘心忠-怕了我们": 声0,
    "配音/6-黄叛-结构奇怪": 声1,
    "音效/block.deepslate.step.3": 声2,
    "音效/block.sculk.step.6": 声3,
    "音效/block.sculk_sensor.clicking.1": 声4,
    "音效/block.sculk_sensor.clicking.2": 声5,
    "音效/block.sculk_sensor.clicking.3": 声6,
    "音效/block.sculk_sensor.clicking.4": 声7,
    "音效/block.sculk_sensor.clicking.5": 声8,
    "音效/block.sculk_sensor.clicking.6": 声9,
    "音效/block.sculk_shrieker.shriek.3": 声10,
    "音效/block.stone.step.5": 声11,
  },
  表,
};
export default 声音;
