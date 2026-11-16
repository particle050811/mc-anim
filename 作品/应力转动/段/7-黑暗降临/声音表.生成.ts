// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/7-刘心忠-怎么回事": {
      "duration": 0.96,
      "peakDb": -1.5,
      "loudness": -19.2,
      "sha": "a17c283108d1"
    },
    "音效/entity.evoker.prepare_summon": {
      "duration": 3.488,
      "peakDb": -4.6,
      "loudness": -22.9,
      "sha": "96e683a5590c"
    },
    "音效/entity.warden.angry.5": {
      "duration": 4.106042,
      "peakDb": -6.7,
      "loudness": -21.7,
      "sha": "6d6a95c28b7c"
    },
    "音效/entity.warden.roar.3": {
      "duration": 3.357375,
      "peakDb": -0.3,
      "loudness": -15.9,
      "sha": "413d47b1d639"
    }
  },
  "lines": {
    "7-刘心忠-怎么回事": {
      "voice": "配音/7-刘心忠-怎么回事",
      "mouthOpen": 0.03,
      "duration": 0.96
    }
  }
};
export default soundTable;
