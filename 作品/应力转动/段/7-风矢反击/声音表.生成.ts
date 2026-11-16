// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/7-黄叛-受死": {
      "duration": 1.007,
      "peakDb": -4.7,
      "loudness": -18,
      "sha": "ac93750e337f"
    },
    "音效/block.deepslate.fall.2": {
      "duration": 0.913375,
      "peakDb": -7.1,
      "loudness": -31,
      "sha": "11895f18bea0"
    },
    "音效/entity.arrow.hit.2": {
      "duration": 0.75,
      "peakDb": -0.1,
      "loudness": -26.2,
      "sha": "fa7acce9893c"
    },
    "音效/entity.arrow.shoot": {
      "duration": 0.455102,
      "peakDb": -0.1,
      "loudness": -21.4,
      "sha": "9492b5233938"
    },
    "音效/entity.warden.hurt.2": {
      "duration": 2.534958,
      "peakDb": -1.3,
      "loudness": -17.4,
      "sha": "3626ff733503"
    },
    "音效/item.elytra.flying": {
      "duration": 10.220333,
      "peakDb": -12.3,
      "loudness": -24.9,
      "sha": "0f51f0fd6647"
    }
  },
  "lines": {
    "7-黄叛-受死": {
      "voice": "配音/7-黄叛-受死",
      "mouthOpen": 0.03,
      "duration": 1.007
    }
  }
};
export default soundTable;
