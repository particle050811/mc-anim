// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "音效/item.book.page_turn.2": {
      "时长": 0.699773,
      "峰值": -20.9,
      "响度": -36.7,
      "sha": "d16bd1c1a420"
    },
    "音效/item.book.page_turn.3": {
      "时长": 0.537483,
      "峰值": -15.6,
      "响度": -36.3,
      "sha": "4715e14e54c5"
    }
  },
  "台词": {}
};
export default 表;
