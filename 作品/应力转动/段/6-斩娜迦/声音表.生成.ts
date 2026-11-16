// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/6-李樱-不值一提": {
      "duration": 3.392,
      "peakDb": -3.4,
      "loudness": -18,
      "sha": "ebfdf78e48fe"
    },
    "音效/block.chain.hit.2": {
      "duration": 0.484375,
      "peakDb": -2.4,
      "loudness": -24.8,
      "sha": "307e0de8e074"
    },
    "音效/block.grass.step.1": {
      "duration": 0.5,
      "peakDb": -23.9,
      "loudness": -38.6,
      "sha": "2959b1742d6f"
    },
    "音效/block.grass.step.2": {
      "duration": 0.609388,
      "peakDb": -21.5,
      "loudness": -39.1,
      "sha": "226e6e9270b4"
    },
    "音效/block.grass.step.3": {
      "duration": 0.484376,
      "peakDb": -21.4,
      "loudness": -36.2,
      "sha": "6e06a73583c8"
    },
    "音效/block.grass.step.4": {
      "duration": 0.53127,
      "peakDb": -21.9,
      "loudness": -38.1,
      "sha": "ba77cb905a84"
    },
    "音效/block.grass.step.5": {
      "duration": 0.562517,
      "peakDb": -18.6,
      "loudness": -34.4,
      "sha": "21bd69b639eb"
    },
    "音效/block.grass.step.6": {
      "duration": 0.546893,
      "peakDb": -24.7,
      "loudness": -37.8,
      "sha": "e7078d68311e"
    },
    "音效/block.portal.travel": {
      "duration": 9.5,
      "peakDb": -0.7,
      "loudness": -13,
      "sha": "2a78858744fa"
    },
    "音效/block.stone.step.1": {
      "duration": 0.609388,
      "peakDb": -8.9,
      "loudness": -33.4,
      "sha": "e94a295a8764"
    },
    "音效/block.stone.step.6": {
      "duration": 0.609388,
      "peakDb": -5.5,
      "loudness": -29.7,
      "sha": "2b65e1bdb942"
    },
    "音效/efn.whoosh_light_1": {
      "duration": 0.8,
      "peakDb": -8.7,
      "loudness": -26.3,
      "sha": "59556b7733a6"
    },
    "音效/epicfight.entity.hit.blade.1": {
      "duration": 0.552154,
      "peakDb": -0.1,
      "loudness": -14.9,
      "sha": "b2f4851e2177"
    },
    "音效/item.trident.throw.2": {
      "duration": 1.464,
      "peakDb": -3.1,
      "loudness": -22.1,
      "sha": "8fd32459f6ef"
    },
    "音效/twilightforest.block.twilightforest.boss_chest.appear": {
      "duration": 3.488,
      "peakDb": -4.6,
      "loudness": -22.9,
      "sha": "96e683a5590c"
    },
    "音效/twilightforest.entity.twilightforest.naga.hurt.2": {
      "duration": 0.692018,
      "peakDb": -7.9,
      "loudness": -18.8,
      "sha": "b71792658bd8"
    },
    "音效/twilightforest.entity.twilightforest.naga.hurt.3": {
      "duration": 0.365578,
      "peakDb": 0.7,
      "loudness": -70,
      "sha": "63e2d40665de"
    }
  },
  "lines": {
    "6-李樱-不值一提": {
      "voice": "配音/6-李樱-不值一提",
      "mouthOpen": 0.03,
      "duration": 3.392
    }
  }
};
export default soundTable;
