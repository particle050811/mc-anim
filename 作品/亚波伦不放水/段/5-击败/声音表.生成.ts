// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "配乐/亚波伦/決戦の刻": {
      "时长": 215.693061,
      "峰值": 0.6,
      "响度": -11,
      "sha": "210a1de4eb5a"
    },
    "音效/ambient.nether_wastes.mood.1": {
      "时长": 8.809,
      "峰值": -11.8,
      "响度": -28.5,
      "sha": "cc110e397b92"
    },
    "音效/ambient.nether_wastes.mood.2": {
      "时长": 18,
      "峰值": -13.3,
      "响度": -30.6,
      "sha": "8441f44ac00c"
    }
  },
  "台词": {}
};
export default 表;
