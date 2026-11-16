// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配乐/把回忆拼好给你-无男声DJ": {
      "duration": 56.005011,
      "peakDb": -1.1,
      "loudness": -9.3,
      "sha": "c31621fc073a"
    },
    "音效/entity.lightning_bolt.thunder.2": {
      "duration": 7.25,
      "peakDb": -0.4,
      "loudness": -22.4,
      "sha": "c6618caf8747"
    },
    "音效/把回忆拼好给你/weather.rain.1": {
      "duration": 2.010667,
      "peakDb": -9.1,
      "loudness": -25.2,
      "sha": "44d72c5a4419"
    },
    "音效/把回忆拼好给你/weather.rain.2": {
      "duration": 1.978667,
      "peakDb": -3.2,
      "loudness": -24.8,
      "sha": "5f754e4c7e64"
    }
  },
  "lines": {}
};
export default soundTable;
