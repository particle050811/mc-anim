// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "音效/block.chest.close.3": {
      "duration": 0.623667,
      "peakDb": 0,
      "loudness": -18.4,
      "sha": "b54ef7661015"
    },
    "音效/block.chest.open": {
      "duration": 0.515208,
      "peakDb": -0.7,
      "loudness": -14.1,
      "sha": "6b9b0c3672b4"
    },
    "音效/block.wool.place.1": {
      "duration": 0.203469,
      "peakDb": -6.9,
      "loudness": -70,
      "sha": "8a716f2a3cbf"
    },
    "音效/block.wool.place.4": {
      "duration": 0.203469,
      "peakDb": -11,
      "loudness": -70,
      "sha": "09d5879722c5"
    },
    "音效/block.wool.step.2": {
      "duration": 0.203469,
      "peakDb": -13.8,
      "loudness": -70,
      "sha": "139fc234e51f"
    },
    "音效/block.wool.step.3": {
      "duration": 0.203469,
      "peakDb": -12.8,
      "loudness": -70,
      "sha": "ac49293ab32a"
    }
  },
  "lines": {}
};
export default soundTable;
