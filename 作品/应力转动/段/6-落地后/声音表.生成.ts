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
    "配音/6-九胡-什么也没有": {
      "duration": 3.838,
      "peakDb": -1.8,
      "loudness": -18,
      "sha": "605c7bbfcc56"
    },
    "配音/6-李樱-没有最终boss": {
      "duration": 3.634,
      "peakDb": -4.4,
      "loudness": -18,
      "sha": "fcfd70bc6df7"
    },
    "音效/block.stone.fall.2": {
      "duration": 0.484376,
      "peakDb": -7,
      "loudness": -33.9,
      "sha": "2cfbf8787436"
    },
    "音效/block.stone.fall.5": {
      "duration": 0.562517,
      "peakDb": -9.1,
      "loudness": -31.3,
      "sha": "67b1e50426b2"
    },
    "音效/entity.player.big_fall": {
      "duration": 0.25,
      "peakDb": -0.2,
      "loudness": -70,
      "sha": "abd98f860210"
    }
  },
  "lines": {
    "6-九胡-什么也没有": {
      "voice": "配音/6-九胡-什么也没有",
      "mouthOpen": 0.03,
      "duration": 3.838
    },
    "6-李樱-没有最终boss": {
      "voice": "配音/6-李樱-没有最终boss",
      "mouthOpen": 0.03,
      "duration": 3.634
    }
  }
};
export default soundTable;
