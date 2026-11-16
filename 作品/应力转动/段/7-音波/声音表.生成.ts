// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "音效/entity.arrow.hit.1": {
      "duration": 0.734376,
      "peakDb": -0.3,
      "loudness": -27.7,
      "sha": "31e05e73edb5"
    },
    "音效/entity.creeper.hurt.3": {
      "duration": 0.461179,
      "peakDb": -8.2,
      "loudness": -28.3,
      "sha": "ffcc84fa087b"
    },
    "音效/entity.generic.explode.1": {
      "duration": 2.5,
      "peakDb": -0.3,
      "loudness": -12.6,
      "sha": "ec6fe52205a8"
    },
    "音效/entity.generic.explode.3": {
      "duration": 3.25,
      "peakDb": 1.2,
      "loudness": -14.7,
      "sha": "6178b31e2001"
    },
    "音效/entity.generic.explode.4": {
      "duration": 3.25,
      "peakDb": -0.1,
      "loudness": -16.3,
      "sha": "0524d95e0f8d"
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
    "音效/entity.player.hurt.2": {
      "duration": 0.437506,
      "peakDb": 1.2,
      "loudness": -19.8,
      "sha": "67ceec1f40e1"
    },
    "音效/entity.warden.hurt.3": {
      "duration": 2.763063,
      "peakDb": -1.8,
      "loudness": -16.6,
      "sha": "8da114446a8c"
    },
    "音效/entity.warden.hurt.4": {
      "duration": 2.441104,
      "peakDb": -1.7,
      "loudness": -18.7,
      "sha": "3bd28143b3ad"
    },
    "音效/entity.warden.sonic_boom.4": {
      "duration": 4,
      "peakDb": -1,
      "loudness": -14.8,
      "sha": "0e0a886e1e78"
    },
    "音效/entity.warden.sonic_charge.4": {
      "duration": 1.625011,
      "peakDb": -0.9,
      "loudness": -13.7,
      "sha": "8d235cd7ac4c"
    }
  },
  "lines": {}
};
export default soundTable;
