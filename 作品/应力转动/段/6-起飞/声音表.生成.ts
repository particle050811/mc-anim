// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配乐/Wasted": {
      "duration": 180.238753,
      "peakDb": 1.8,
      "loudness": -5.3,
      "sha": "f779ec3814ab"
    },
    "配音/6-九胡-等等我": {
      "duration": 1.99,
      "peakDb": -4.8,
      "loudness": -18,
      "sha": "107c3777eb01"
    },
    "配音/6-李樱-看我速通暮色": {
      "duration": 1.963,
      "peakDb": -3.3,
      "loudness": -18,
      "sha": "e84f89b5eb68"
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
    "音效/block.stone.step.2": {
      "duration": 0.484376,
      "peakDb": -7,
      "loudness": -33.9,
      "sha": "2cfbf8787436"
    },
    "音效/block.stone.step.3": {
      "duration": 0.421882,
      "peakDb": -12,
      "loudness": -36.4,
      "sha": "c5d71e8d3251"
    },
    "音效/block.stone.step.4": {
      "duration": 0.546893,
      "peakDb": -5.9,
      "loudness": -31.8,
      "sha": "95820d0b75e8"
    },
    "音效/block.stone.step.5": {
      "duration": 0.562517,
      "peakDb": -9.1,
      "loudness": -31.3,
      "sha": "67b1e50426b2"
    },
    "音效/block.wool.place.4": {
      "duration": 0.203469,
      "peakDb": -11,
      "loudness": -70,
      "sha": "09d5879722c5"
    },
    "音效/twilightforest.block.twilightforest.boss_chest.appear": {
      "duration": 3.488,
      "peakDb": -4.6,
      "loudness": -22.9,
      "sha": "96e683a5590c"
    }
  },
  "lines": {
    "6-九胡-等等我": {
      "voice": "配音/6-九胡-等等我",
      "mouthOpen": 0.03,
      "duration": 1.99
    },
    "6-李樱-看我速通暮色": {
      "voice": "配音/6-李樱-看我速通暮色",
      "mouthOpen": 0.03,
      "duration": 1.963
    }
  }
};
export default soundTable;
