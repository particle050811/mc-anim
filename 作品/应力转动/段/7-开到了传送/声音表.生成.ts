// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "配音/7-李樱-开到了": {
      "时长": 0.95,
      "峰值": -4,
      "响度": -18,
      "sha": "54af6f426546"
    },
    "音效/block.chest.close.2": {
      "时长": 0.631375,
      "峰值": 0,
      "响度": -16.5,
      "sha": "08c2e383401f"
    },
    "音效/block.chest.open": {
      "时长": 0.515208,
      "峰值": -0.7,
      "响度": -14.1,
      "sha": "6b9b0c3672b4"
    },
    "音效/block.portal.travel": {
      "时长": 9.5,
      "峰值": -0.7,
      "响度": -13,
      "sha": "2a78858744fa"
    },
    "音效/block.portal.trigger": {
      "时长": 4,
      "峰值": -1.5,
      "响度": -17.7,
      "sha": "58ec8b9d6c81"
    },
    "音效/block.sculk_sensor.clicking.1": {
      "时长": 1.295333,
      "峰值": -3.2,
      "响度": -23,
      "sha": "0cf5bf9d988f"
    },
    "音效/block.sculk_sensor.clicking.2": {
      "时长": 1.448896,
      "峰值": -3.5,
      "响度": -19.4,
      "sha": "cd05b445dea7"
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
    "音效/block.sculk_sensor.clicking.6": {
      "时长": 1.024104,
      "峰值": -2,
      "响度": -24.9,
      "sha": "f568609506ab"
    },
    "音效/block.sculk_sensor.clicking_stop.1": {
      "时长": 1.451896,
      "峰值": -16.3,
      "响度": -37.4,
      "sha": "ec119c7a8526"
    },
    "音效/block.sculk_sensor.clicking_stop.2": {
      "时长": 1.54,
      "峰值": -13.1,
      "响度": -36.3,
      "sha": "f8eeca8f9244"
    },
    "音效/block.sculk_sensor.clicking_stop.4": {
      "时长": 1.768896,
      "峰值": -19.3,
      "响度": -35.1,
      "sha": "ee565be33545"
    },
    "音效/block.sculk_sensor.clicking_stop.5": {
      "时长": 1.295875,
      "峰值": -16.4,
      "响度": -35.2,
      "sha": "0c9fd5463340"
    },
    "音效/block.sculk_shrieker.shriek.4": {
      "时长": 6.493375,
      "峰值": -2.3,
      "响度": -16.8,
      "sha": "38828b02caa7"
    }
  },
  "台词": {
    "7-李樱-开到了": {
      "配音": "配音/7-李樱-开到了",
      "开口": 0,
      "时长": 0.95
    }
  }
};
export default 表;
