// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/7-刘心忠-风筝": {
      "duration": 8.266,
      "peakDb": -1.5,
      "loudness": -20.3,
      "sha": "f8fc02cd4727"
    },
    "音效/entity.arrow.hit.1": {
      "duration": 0.734376,
      "peakDb": -0.3,
      "loudness": -27.7,
      "sha": "31e05e73edb5"
    },
    "音效/entity.arrow.hit.3": {
      "duration": 0.890635,
      "peakDb": 0.2,
      "loudness": -25.1,
      "sha": "5904f027d0db"
    },
    "音效/entity.arrow.hit.4": {
      "duration": 1,
      "peakDb": 0.9,
      "loudness": -22.9,
      "sha": "1f5dfd0b9a20"
    },
    "音效/entity.arrow.shoot": {
      "duration": 0.455102,
      "peakDb": -0.1,
      "loudness": -21.4,
      "sha": "9492b5233938"
    },
    "音效/entity.creeper.hurt.2": {
      "duration": 0.485442,
      "peakDb": -4.9,
      "loudness": -21.9,
      "sha": "1154ea9daaff"
    },
    "音效/entity.generic.explode.1": {
      "duration": 2.5,
      "peakDb": -0.3,
      "loudness": -12.6,
      "sha": "ec6fe52205a8"
    },
    "音效/entity.generic.explode.2": {
      "duration": 3.25,
      "peakDb": 0.6,
      "loudness": -13.6,
      "sha": "c6438fb756b6"
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
    "音效/entity.horse.gallop.4": {
      "duration": 0.531293,
      "peakDb": 1,
      "loudness": -14,
      "sha": "01704b35910c"
    },
    "音效/entity.warden.death.1": {
      "duration": 4.5,
      "peakDb": -2.5,
      "loudness": -19.7,
      "sha": "1d16f7dfdd3e"
    },
    "音效/entity.warden.hurt.1": {
      "duration": 3,
      "peakDb": -1.8,
      "loudness": -16.5,
      "sha": "3b5c72ff37d8"
    },
    "音效/entity.warden.hurt.2": {
      "duration": 2.534958,
      "peakDb": -1.3,
      "loudness": -17.4,
      "sha": "3626ff733503"
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
    "音效/entity.warden.sonic_boom.1": {
      "duration": 4,
      "peakDb": -1,
      "loudness": -15.3,
      "sha": "4bba573e07f6"
    },
    "音效/entity.warden.sonic_boom.4": {
      "duration": 4,
      "peakDb": -1,
      "loudness": -14.8,
      "sha": "0e0a886e1e78"
    }
  },
  "lines": {
    "7-刘心忠-风筝": {
      "voice": "配音/7-刘心忠-风筝",
      "mouthOpen": 0.03,
      "duration": 8.266
    }
  }
};
export default soundTable;
