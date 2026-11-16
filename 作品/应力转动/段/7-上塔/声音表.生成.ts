// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "音效/entity.creeper.hurt.3": {
      "duration": 0.461179,
      "peakDb": -8.2,
      "loudness": -28.3,
      "sha": "ffcc84fa087b"
    },
    "音效/entity.creeper.hurt.4": {
      "duration": 0.515782,
      "peakDb": -0.5,
      "loudness": -20.5,
      "sha": "72dbbc987301"
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
    "音效/entity.warden.sonic_charge.4": {
      "duration": 1.625011,
      "peakDb": -0.9,
      "loudness": -13.7,
      "sha": "8d235cd7ac4c"
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
