// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/6-黄叛-纳命来": {
      "duration": 1.091021,
      "peakDb": -1.5,
      "loudness": -18.9,
      "sha": "bc5b515d32d1"
    },
    "音效/block.chest.open": {
      "duration": 0.515208,
      "peakDb": -0.7,
      "loudness": -14.1,
      "sha": "6b9b0c3672b4"
    },
    "音效/block.sculk_sensor.clicking.5": {
      "duration": 1.223583,
      "peakDb": -3.1,
      "loudness": -24,
      "sha": "59efe9756a0d"
    },
    "音效/block.sculk_shrieker.shriek.3": {
      "duration": 6.484146,
      "peakDb": -1.1,
      "loudness": -15.6,
      "sha": "1eeecb1c8939"
    },
    "音效/entity.arrow.shoot": {
      "duration": 0.455102,
      "peakDb": -0.1,
      "loudness": -21.4,
      "sha": "9492b5233938"
    },
    "音效/entity.minecart.inside": {
      "duration": 5.770181,
      "peakDb": -0.2,
      "loudness": -12.5,
      "sha": "fac373e9fc2d"
    },
    "音效/entity.warden.nearby_close.2": {
      "duration": 5.381146,
      "peakDb": -8.7,
      "loudness": -32.4,
      "sha": "fd9b7895c512"
    },
    "音效/item.elytra.flying": {
      "duration": 10.220333,
      "peakDb": -12.3,
      "loudness": -24.9,
      "sha": "0f51f0fd6647"
    }
  },
  "lines": {
    "6-黄叛-纳命来": {
      "voice": "配音/6-黄叛-纳命来",
      "mouthOpen": 0,
      "duration": 1.091021
    }
  }
};
export default soundTable;
