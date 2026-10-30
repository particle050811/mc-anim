// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { 声音地址 } from '@engine/段/段画面.tsx';
import 表 from './声音表.生成.ts';
import 声0 from "asset:音效/把回忆拼好给你/entity.firework_rocket.blast";

const 声音: 声音地址 = {
  地址: {
    "音效/把回忆拼好给你/entity.firework_rocket.blast": 声0,
  },
  表,
};
export default 声音;
