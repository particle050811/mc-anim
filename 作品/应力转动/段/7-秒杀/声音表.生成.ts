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
    "音效/block.wood.place.1": {
      "duration": 0.5,
      "peakDb": -1.9,
      "loudness": -26.3,
      "sha": "cb6071c83a7f"
    },
    "音效/block.wood.place.3": {
      "duration": 0.5,
      "peakDb": -5,
      "loudness": -29.4,
      "sha": "cf6be2314c08"
    },
    "音效/block.wood.place.4": {
      "duration": 0.5,
      "peakDb": -6,
      "loudness": -29.3,
      "sha": "de868b3119b0"
    },
    "音效/entity.arrow.shoot": {
      "duration": 0.455102,
      "peakDb": -0.1,
      "loudness": -21.4,
      "sha": "9492b5233938"
    },
    "音效/entity.evoker.cast_spell.1": {
      "duration": 1.973333,
      "peakDb": -2.1,
      "loudness": -19.8,
      "sha": "34a2b826f7b0"
    },
    "音效/entity.vex.charge.1": {
      "duration": 1.926667,
      "peakDb": -13.3,
      "loudness": -27.8,
      "sha": "8f627f058f18"
    },
    "音效/entity.vex.charge.2": {
      "duration": 2.037333,
      "peakDb": -13.8,
      "loudness": -29.1,
      "sha": "6df5c659a4db"
    },
    "音效/entity.vex.death.1": {
      "duration": 1.386667,
      "peakDb": -9.4,
      "loudness": -21.5,
      "sha": "4dcc603ca76d"
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
    },
    "音效/entity.warden.attack_impact.2": {
      "duration": 1.067125,
      "peakDb": 0.2,
      "loudness": -23.2,
      "sha": "dbc24cf14297"
    },
    "音效/entity.warden.tendril_clicks.4": {
      "duration": 1.791625,
      "peakDb": -0.5,
      "loudness": -17.9,
      "sha": "1cc999aeaa9f"
    },
    "音效/entity.warden.tendril_clicks.6": {
      "duration": 1.024104,
      "peakDb": -2,
      "loudness": -24.9,
      "sha": "f568609506ab"
    },
    "音效/item.elytra.flying": {
      "duration": 10.220333,
      "peakDb": -12.3,
      "loudness": -24.9,
      "sha": "0f51f0fd6647"
    }
  },
  "lines": {
    "7-刘心忠-不可能": {
      "voice": "配音/7-刘心忠-不可能",
      "mouthOpen": 0.03,
      "duration": 2.57
    }
  }
};
export default soundTable;
