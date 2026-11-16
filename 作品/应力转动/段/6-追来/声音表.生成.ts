// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/6-刘心忠-怕了我们": {
      "duration": 2.927,
      "peakDb": -2.1,
      "loudness": -18,
      "sha": "6683edb67616"
    },
    "配音/6-黄叛-结构奇怪": {
      "duration": 4.261,
      "peakDb": -1.9,
      "loudness": -18,
      "sha": "57224b78986f"
    },
    "音效/block.deepslate.step.3": {
      "duration": 0.788604,
      "peakDb": -12.3,
      "loudness": -35.3,
      "sha": "8ec1d8211c05"
    },
    "音效/block.sculk.step.6": {
      "duration": 0.933458,
      "peakDb": -10.4,
      "loudness": -37.5,
      "sha": "f582ce304dd1"
    },
    "音效/block.sculk_sensor.clicking.1": {
      "duration": 1.295333,
      "peakDb": -3.2,
      "loudness": -23,
      "sha": "0cf5bf9d988f"
    },
    "音效/block.sculk_sensor.clicking.2": {
      "duration": 1.448896,
      "peakDb": -3.5,
      "loudness": -19.4,
      "sha": "cd05b445dea7"
    },
    "音效/block.sculk_sensor.clicking.3": {
      "duration": 0.943896,
      "peakDb": -1.6,
      "loudness": -17.8,
      "sha": "3003e277b377"
    },
    "音效/block.sculk_sensor.clicking.4": {
      "duration": 1.791625,
      "peakDb": -0.5,
      "loudness": -17.9,
      "sha": "1cc999aeaa9f"
    },
    "音效/block.sculk_sensor.clicking.5": {
      "duration": 1.223583,
      "peakDb": -3.1,
      "loudness": -24,
      "sha": "59efe9756a0d"
    },
    "音效/block.sculk_sensor.clicking.6": {
      "duration": 1.024104,
      "peakDb": -2,
      "loudness": -24.9,
      "sha": "f568609506ab"
    },
    "音效/block.sculk_shrieker.shriek.3": {
      "duration": 6.484146,
      "peakDb": -1.1,
      "loudness": -15.6,
      "sha": "1eeecb1c8939"
    },
    "音效/block.stone.step.5": {
      "duration": 0.562517,
      "peakDb": -9.1,
      "loudness": -31.3,
      "sha": "67b1e50426b2"
    }
  },
  "lines": {
    "6-刘心忠-怕了我们": {
      "voice": "配音/6-刘心忠-怕了我们",
      "mouthOpen": 0.03,
      "duration": 2.927
    },
    "6-黄叛-结构奇怪": {
      "voice": "配音/6-黄叛-结构奇怪",
      "mouthOpen": 0.03,
      "duration": 4.261
    }
  }
};
export default soundTable;
