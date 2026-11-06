// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "配乐/把回忆拼好给你-无男声DJ": {
      "时长": 56.005011,
      "峰值": -1.1,
      "响度": -9.3,
      "sha": "c31621fc073a"
    },
    "音效/把回忆拼好给你/touhou_little_maid.block.altar_craft.2": {
      "时长": 1.718753,
      "峰值": -1.5,
      "响度": -11.8,
      "sha": "a7ebd396ef42"
    }
  },
  "台词": {}
};
export default 表;
