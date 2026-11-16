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
    "音效/把回忆拼好给你/block.beacon.activate": {
      "duration": 2.953292,
      "peakDb": -13.5,
      "loudness": -25.6,
      "sha": "cff5ac29875b"
    },
    "音效/把回忆拼好给你/weather.rain.2": {
      "duration": 1.978667,
      "peakDb": -3.2,
      "loudness": -24.8,
      "sha": "5f754e4c7e64"
    },
    "音效/把回忆拼好给你/weather.rain.3": {
      "duration": 2.085333,
      "peakDb": -4.5,
      "loudness": -25,
      "sha": "4cafe2fcec6a"
    },
    "音效/把回忆拼好给你/weather.rain.4": {
      "duration": 2.165333,
      "peakDb": -6.4,
      "loudness": -24.5,
      "sha": "94a3c04d5b51"
    }
  },
  "lines": {}
};
export default soundTable;
