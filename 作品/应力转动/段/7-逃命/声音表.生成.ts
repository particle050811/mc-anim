// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/7-刘心忠-不可能": {
      "duration": 2.57,
      "peakDb": -1.5,
      "loudness": -18.7,
      "sha": "e60ae48f1663"
    },
    "音效/block.deepslate.fall.2": {
      "duration": 0.913375,
      "peakDb": -7.1,
      "loudness": -31,
      "sha": "11895f18bea0"
    },
    "音效/entity.vex.death.2": {
      "duration": 1.386667,
      "peakDb": -7.5,
      "loudness": -20.5,
      "sha": "e7bde881c60d"
    },
    "音效/entity.warden.attack_impact.1": {
      "duration": 0.906604,
      "peakDb": -5.5,
      "loudness": -22.5,
      "sha": "e67f8b6cacb4"
    }
  },
  "lines": {
    "7-刘心忠-不可能": {
      "voice": "配音/7-刘心忠-不可能",
      "mouthOpen": 0.03,
      "duration": 2.57,
      "上段开口秒": -0.442
    }
  }
};
export default soundTable;
