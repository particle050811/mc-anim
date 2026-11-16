// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "音效/block.chest.open": {
      "duration": 0.515208,
      "peakDb": -0.7,
      "loudness": -14.1,
      "sha": "6b9b0c3672b4"
    },
    "音效/block.sculk_sensor.clicking.1": {
      "duration": 1.295333,
      "peakDb": -3.2,
      "loudness": -23,
      "sha": "0cf5bf9d988f"
    },
    "音效/block.sculk_sensor.clicking.3": {
      "duration": 0.943896,
      "peakDb": -1.6,
      "loudness": -17.8,
      "sha": "3003e277b377"
    },
    "音效/block.sculk_sensor.clicking.4": {
      "duration": 1.791625,
      "peakDb": -0.5,
      "loudness": -17.9,
      "sha": "1cc999aeaa9f"
    },
    "音效/block.sculk_sensor.clicking_stop.2": {
      "duration": 1.54,
      "peakDb": -13.1,
      "loudness": -36.3,
      "sha": "f8eeca8f9244"
    },
    "音效/block.sculk_sensor.clicking_stop.3": {
      "duration": 1.424104,
      "peakDb": -16.6,
      "loudness": -35.6,
      "sha": "5f91031b56a7"
    },
    "音效/block.sculk_sensor.clicking_stop.5": {
      "duration": 1.295875,
      "peakDb": -16.4,
      "loudness": -35.2,
      "sha": "0c9fd5463340"
    },
    "音效/block.sculk_shrieker.shriek.3": {
      "duration": 6.484146,
      "peakDb": -1.1,
      "loudness": -15.6,
      "sha": "1eeecb1c8939"
    },
    "音效/block.sculk_shrieker.shriek.4": {
      "duration": 6.493375,
      "peakDb": -2.3,
      "loudness": -16.8,
      "sha": "38828b02caa7"
    },
    "音效/entity.horse.gallop.1": {
      "duration": 0.537166,
      "peakDb": 0.1,
      "loudness": -17.2,
      "sha": "825efbb27b82"
    },
    "音效/entity.horse.gallop.2": {
      "duration": 0.562517,
      "peakDb": 0.4,
      "loudness": -17.5,
      "sha": "48345b93aca7"
    },
    "音效/entity.horse.gallop.3": {
      "duration": 0.500023,
      "peakDb": 0.3,
      "loudness": -17.5,
      "sha": "e8a26fc805b8"
    },
    "音效/entity.horse.gallop.4": {
      "duration": 0.531293,
      "peakDb": 1,
      "loudness": -14,
      "sha": "01704b35910c"
    },
    "音效/entity.warden.emerge": {
      "duration": 8.526063,
      "peakDb": -0.1,
      "loudness": -12.7,
      "sha": "db6fdfe8d155"
    },
    "音效/entity.warden.heartbeat.3": {
      "duration": 1.271417,
      "peakDb": -1.1,
      "loudness": -19.9,
      "sha": "ef4f0afb84ae"
    },
    "音效/entity.warden.heartbeat.4": {
      "duration": 1.099167,
      "peakDb": -1.2,
      "loudness": -19.8,
      "sha": "0b4e5b512905"
    },
    "音效/entity.warden.tendril_clicks.2": {
      "duration": 1.448896,
      "peakDb": -3.5,
      "loudness": -19.4,
      "sha": "cd05b445dea7"
    },
    "音效/entity.warden.tendril_clicks.3": {
      "duration": 0.943896,
      "peakDb": -1.6,
      "loudness": -17.8,
      "sha": "3003e277b377"
    },
    "音效/entity.warden.tendril_clicks.6": {
      "duration": 1.024104,
      "peakDb": -2,
      "loudness": -24.9,
      "sha": "f568609506ab"
    }
  },
  "lines": {}
};
export default soundTable;
