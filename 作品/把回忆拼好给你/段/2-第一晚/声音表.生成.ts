// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配乐/把回忆拼好给你-无男声DJ": {
      "duration": 56.005011,
      "peakDb": -1.1,
      "loudness": -9.3,
      "sha": "c31621fc073a"
    },
    "音效/block.grass.break.2": {
      "duration": 0.5,
      "peakDb": -1.5,
      "loudness": -21.1,
      "sha": "b0763cf2c5b4"
    },
    "音效/block.gravel.break.1": {
      "duration": 0.5,
      "peakDb": -1.5,
      "loudness": -23.9,
      "sha": "55a610c8739c"
    },
    "音效/block.gravel.break.2": {
      "duration": 0.5,
      "peakDb": -0.6,
      "loudness": -27.6,
      "sha": "60ebf0ed49f2"
    },
    "音效/block.gravel.break.3": {
      "duration": 0.5,
      "peakDb": -0.8,
      "loudness": -22.6,
      "sha": "ab5e4b408d1e"
    },
    "音效/block.gravel.break.4": {
      "duration": 0.5,
      "peakDb": -1.9,
      "loudness": -22.9,
      "sha": "fd4aa7553a4f"
    },
    "音效/把回忆拼好给你/entity.zombie.ambient.2": {
      "duration": 1.375011,
      "peakDb": -6.6,
      "loudness": -19.3,
      "sha": "626e0f7a5bb1"
    }
  },
  "lines": {}
};
export default soundTable;
