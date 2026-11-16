// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/6-李樱-烦死了": {
      "duration": 1.06,
      "peakDb": -1.5,
      "loudness": -18.3,
      "sha": "9cd68b856272"
    },
    "音效/block.sculk_sensor.clicking.3": {
      "duration": 0.943896,
      "peakDb": -1.6,
      "loudness": -17.8,
      "sha": "3003e277b377"
    },
    "音效/block.sculk_shrieker.shriek.3": {
      "duration": 6.484146,
      "peakDb": -1.1,
      "loudness": -15.6,
      "sha": "1eeecb1c8939"
    }
  },
  "lines": {
    "6-李樱-烦死了": {
      "voice": "配音/6-李樱-烦死了",
      "mouthOpen": 0.03,
      "duration": 1.06
    }
  }
};
export default soundTable;
