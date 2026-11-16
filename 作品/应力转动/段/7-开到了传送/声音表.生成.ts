// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/7-李樱-开到了": {
      "duration": 0.95,
      "peakDb": -4,
      "loudness": -18,
      "sha": "54af6f426546"
    },
    "音效/block.chest.close.2": {
      "duration": 0.631375,
      "peakDb": 0,
      "loudness": -16.5,
      "sha": "08c2e383401f"
    },
    "音效/block.chest.open": {
      "duration": 0.515208,
      "peakDb": -0.7,
      "loudness": -14.1,
      "sha": "6b9b0c3672b4"
    },
    "音效/block.portal.travel": {
      "duration": 9.5,
      "peakDb": -0.7,
      "loudness": -13,
      "sha": "2a78858744fa"
    },
    "音效/block.portal.trigger": {
      "duration": 4,
      "peakDb": -1.5,
      "loudness": -17.7,
      "sha": "58ec8b9d6c81"
    },
    "音效/block.sculk_sensor.clicking.1": {
      "duration": 1.295333,
      "peakDb": -3.2,
      "loudness": -23,
      "sha": "0cf5bf9d988f"
    },
    "音效/block.sculk_sensor.clicking.2": {
      "duration": 1.448896,
      "peakDb": -3.5,
      "loudness": -19.4,
      "sha": "cd05b445dea7"
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
    "音效/block.sculk_sensor.clicking.6": {
      "duration": 1.024104,
      "peakDb": -2,
      "loudness": -24.9,
      "sha": "f568609506ab"
    },
    "音效/block.sculk_sensor.clicking_stop.1": {
      "duration": 1.451896,
      "peakDb": -16.3,
      "loudness": -37.4,
      "sha": "ec119c7a8526"
    },
    "音效/block.sculk_sensor.clicking_stop.2": {
      "duration": 1.54,
      "peakDb": -13.1,
      "loudness": -36.3,
      "sha": "f8eeca8f9244"
    },
    "音效/block.sculk_sensor.clicking_stop.4": {
      "duration": 1.768896,
      "peakDb": -19.3,
      "loudness": -35.1,
      "sha": "ee565be33545"
    },
    "音效/block.sculk_sensor.clicking_stop.5": {
      "duration": 1.295875,
      "peakDb": -16.4,
      "loudness": -35.2,
      "sha": "0c9fd5463340"
    },
    "音效/block.sculk_shrieker.shriek.4": {
      "duration": 6.493375,
      "peakDb": -2.3,
      "loudness": -16.8,
      "sha": "38828b02caa7"
    }
  },
  "lines": {
    "7-李樱-开到了": {
      "voice": "配音/7-李樱-开到了",
      "mouthOpen": 0,
      "duration": 0.95
    }
  }
};
export default soundTable;
