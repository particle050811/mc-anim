// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/6-李樱-会会你们": {
      "duration": 3.133,
      "peakDb": -3.6,
      "loudness": -18,
      "sha": "e507340eced4"
    },
    "音效/block.chain.hit.4": {
      "duration": 0.546896,
      "peakDb": -2.4,
      "loudness": -24.6,
      "sha": "2626277da373"
    },
    "音效/block.sculk_shrieker.shriek.3": {
      "duration": 6.484146,
      "peakDb": -1.1,
      "loudness": -15.6,
      "sha": "1eeecb1c8939"
    },
    "音效/block.wool.place.2": {
      "duration": 0.203469,
      "peakDb": -13.8,
      "loudness": -70,
      "sha": "139fc234e51f"
    },
    "音效/block.wool.step.4": {
      "duration": 0.203469,
      "peakDb": -11,
      "loudness": -70,
      "sha": "09d5879722c5"
    }
  },
  "lines": {
    "6-李樱-会会你们": {
      "voice": "配音/6-李樱-会会你们",
      "mouthOpen": 0.03,
      "duration": 3.133
    }
  }
};
export default soundTable;
