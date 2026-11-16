// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/6-李樱-出征暮色": {
      "duration": 1.53,
      "peakDb": -4.5,
      "loudness": -18,
      "sha": "9813a7c592a6"
    },
    "音效/block.grass.step.1": {
      "duration": 0.5,
      "peakDb": -23.9,
      "loudness": -38.6,
      "sha": "2959b1742d6f"
    },
    "音效/block.grass.step.4": {
      "duration": 0.53127,
      "peakDb": -21.9,
      "loudness": -38.1,
      "sha": "ba77cb905a84"
    },
    "音效/block.portal.travel": {
      "duration": 9.5,
      "peakDb": -0.7,
      "loudness": -13,
      "sha": "2a78858744fa"
    },
    "音效/entity.generic.splash.1": {
      "duration": 1.652562,
      "peakDb": -2,
      "loudness": -26.2,
      "sha": "a53b581f8654"
    },
    "音效/entity.lightning_bolt.impact.1": {
      "duration": 2.5,
      "peakDb": -0.3,
      "loudness": -12.6,
      "sha": "ec6fe52205a8"
    },
    "音效/entity.lightning_bolt.thunder.2": {
      "duration": 7.25,
      "peakDb": -0.4,
      "loudness": -22.4,
      "sha": "c6618caf8747"
    },
    "音效/entity.player.splash.2": {
      "duration": 3.867188,
      "peakDb": -1.4,
      "loudness": -32,
      "sha": "6c968a1702ad"
    }
  },
  "lines": {
    "6-李樱-出征暮色": {
      "voice": "配音/6-李樱-出征暮色",
      "mouthOpen": 0,
      "duration": 1.53
    }
  }
};
export default soundTable;
