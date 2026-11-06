// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "音效/block.chest.open": {
      "时长": 0.515208,
      "峰值": -0.7,
      "响度": -14.1,
      "sha": "6b9b0c3672b4"
    },
    "音效/block.sculk_sensor.clicking.1": {
      "时长": 1.295333,
      "峰值": -3.2,
      "响度": -23,
      "sha": "0cf5bf9d988f"
    },
    "音效/block.sculk_sensor.clicking.3": {
      "时长": 0.943896,
      "峰值": -1.6,
      "响度": -17.8,
      "sha": "3003e277b377"
    },
    "音效/block.sculk_sensor.clicking.4": {
      "时长": 1.791625,
      "峰值": -0.5,
      "响度": -17.9,
      "sha": "1cc999aeaa9f"
    },
    "音效/block.sculk_sensor.clicking_stop.2": {
      "时长": 1.54,
      "峰值": -13.1,
      "响度": -36.3,
      "sha": "f8eeca8f9244"
    },
    "音效/block.sculk_sensor.clicking_stop.3": {
      "时长": 1.424104,
      "峰值": -16.6,
      "响度": -35.6,
      "sha": "5f91031b56a7"
    },
    "音效/block.sculk_sensor.clicking_stop.5": {
      "时长": 1.295875,
      "峰值": -16.4,
      "响度": -35.2,
      "sha": "0c9fd5463340"
    },
    "音效/block.sculk_shrieker.shriek.3": {
      "时长": 6.484146,
      "峰值": -1.1,
      "响度": -15.6,
      "sha": "1eeecb1c8939"
    },
    "音效/block.sculk_shrieker.shriek.4": {
      "时长": 6.493375,
      "峰值": -2.3,
      "响度": -16.8,
      "sha": "38828b02caa7"
    },
    "音效/entity.horse.gallop.1": {
      "时长": 0.537166,
      "峰值": 0.1,
      "响度": -17.2,
      "sha": "825efbb27b82"
    },
    "音效/entity.horse.gallop.2": {
      "时长": 0.562517,
      "峰值": 0.4,
      "响度": -17.5,
      "sha": "48345b93aca7"
    },
    "音效/entity.horse.gallop.3": {
      "时长": 0.500023,
      "峰值": 0.3,
      "响度": -17.5,
      "sha": "e8a26fc805b8"
    },
    "音效/entity.horse.gallop.4": {
      "时长": 0.531293,
      "峰值": 1,
      "响度": -14,
      "sha": "01704b35910c"
    },
    "音效/entity.warden.emerge": {
      "时长": 8.526063,
      "峰值": -0.1,
      "响度": -12.7,
      "sha": "db6fdfe8d155"
    },
    "音效/entity.warden.heartbeat.3": {
      "时长": 1.271417,
      "峰值": -1.1,
      "响度": -19.9,
      "sha": "ef4f0afb84ae"
    },
    "音效/entity.warden.heartbeat.4": {
      "时长": 1.099167,
      "峰值": -1.2,
      "响度": -19.8,
      "sha": "0b4e5b512905"
    },
    "音效/entity.warden.tendril_clicks.2": {
      "时长": 1.448896,
      "峰值": -3.5,
      "响度": -19.4,
      "sha": "cd05b445dea7"
    },
    "音效/entity.warden.tendril_clicks.3": {
      "时长": 0.943896,
      "峰值": -1.6,
      "响度": -17.8,
      "sha": "3003e277b377"
    },
    "音效/entity.warden.tendril_clicks.6": {
      "时长": 1.024104,
      "峰值": -2,
      "响度": -24.9,
      "sha": "f568609506ab"
    }
  },
  "台词": {}
};
export default 表;
