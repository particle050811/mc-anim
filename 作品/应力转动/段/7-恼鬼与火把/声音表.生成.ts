// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
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
    "音效/entity.evoker.prepare_summon": {
      "duration": 3.488,
      "peakDb": -4.6,
      "loudness": -22.9,
      "sha": "96e683a5590c"
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
    "音效/entity.warden.angry.5": {
      "duration": 4.106042,
      "peakDb": -6.7,
      "loudness": -21.7,
      "sha": "6d6a95c28b7c"
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
  "lines": {}
};
export default soundTable;
