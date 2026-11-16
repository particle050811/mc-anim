// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "音效/block.stone.step.1": {
      "duration": 0.609388,
      "peakDb": -8.9,
      "loudness": -33.4,
      "sha": "e94a295a8764"
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
    "音效/block.stone.step.6": {
      "duration": 0.609388,
      "peakDb": -5.5,
      "loudness": -29.7,
      "sha": "2b65e1bdb942"
    },
    "音效/entity.player.splash.high_speed": {
      "duration": 3.026667,
      "peakDb": 0.1,
      "loudness": -16.9,
      "sha": "23465cd6325f"
    }
  },
  "lines": {}
};
export default soundTable;
