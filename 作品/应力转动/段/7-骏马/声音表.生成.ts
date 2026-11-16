// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "音效/block.deepslate.fall.6": {
      "duration": 0.784458,
      "peakDb": -4.5,
      "loudness": -28.3,
      "sha": "2e71fb598007"
    },
    "音效/block.sculk.step.3": {
      "duration": 0.977104,
      "peakDb": -12.6,
      "loudness": -38,
      "sha": "ed2e94ae19c9"
    },
    "音效/block.sculk.step.5": {
      "duration": 1.390292,
      "peakDb": -18.1,
      "loudness": -38.3,
      "sha": "724cd274985c"
    },
    "音效/entity.arrow.hit.1": {
      "duration": 0.734376,
      "peakDb": -0.3,
      "loudness": -27.7,
      "sha": "31e05e73edb5"
    },
    "音效/entity.arrow.hit.2": {
      "duration": 0.75,
      "peakDb": -0.1,
      "loudness": -26.2,
      "sha": "fa7acce9893c"
    },
    "音效/entity.arrow.shoot": {
      "duration": 0.455102,
      "peakDb": -0.1,
      "loudness": -21.4,
      "sha": "9492b5233938"
    },
    "音效/entity.horse.jump": {
      "duration": 0.500023,
      "peakDb": -0.1,
      "loudness": -21.4,
      "sha": "3f1abd7a2e21"
    },
    "音效/entity.horse.land": {
      "duration": 0.75,
      "peakDb": 0.4,
      "loudness": -19.2,
      "sha": "e92a4e181025"
    },
    "音效/entity.illusioner.cast_spell.1": {
      "duration": 1.973333,
      "peakDb": -2.1,
      "loudness": -19.8,
      "sha": "34a2b826f7b0"
    },
    "音效/entity.illusioner.mirror_move.2": {
      "duration": 3.314667,
      "peakDb": -0.4,
      "loudness": -20.7,
      "sha": "6fdf13659e6f"
    },
    "音效/entity.illusioner.prepare_mirror": {
      "duration": 2.794667,
      "peakDb": -11.5,
      "loudness": -25.5,
      "sha": "0c5191a18513"
    },
    "音效/entity.warden.hurt.2": {
      "duration": 2.534958,
      "peakDb": -1.3,
      "loudness": -17.4,
      "sha": "3626ff733503"
    },
    "音效/entity.warden.hurt.4": {
      "duration": 2.441104,
      "peakDb": -1.7,
      "loudness": -18.7,
      "sha": "3bd28143b3ad"
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
    "音效/irons_spellbooks.force_impact": {
      "duration": 0.894694,
      "peakDb": -8.4,
      "loudness": -22.9,
      "sha": "13d2bda18ea9"
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
