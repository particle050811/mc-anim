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
    "配音/6-九胡-导航": {
      "duration": 3.032,
      "peakDb": -1.9,
      "loudness": -18,
      "sha": "c6a806db3672"
    },
    "配音/6-李樱-不算白跑": {
      "duration": 2.018,
      "peakDb": -4,
      "loudness": -18,
      "sha": "1faea75cb4d2"
    },
    "配音/6-李樱-古城寻宝": {
      "duration": 2.375,
      "peakDb": -4.1,
      "loudness": -18,
      "sha": "74898b9eed3d"
    },
    "配音/6-李樱-夸克古卷": {
      "duration": 8.607,
      "peakDb": -3.8,
      "loudness": -18,
      "sha": "d7868c38330a"
    },
    "配音/6-李樱-沉淀": {
      "duration": 2.638,
      "peakDb": -3.5,
      "loudness": -18,
      "sha": "8858a925a964"
    },
    "配音/6-李樱-熔炼温度": {
      "duration": 2.674,
      "peakDb": -3.9,
      "loudness": -18,
      "sha": "23a251a03533"
    },
    "配音/6-李樱-锁链基底": {
      "duration": 4.24,
      "peakDb": -3.6,
      "loudness": -18,
      "sha": "5bacda64648a"
    },
    "音效/block.wood.step.1": {
      "duration": 0.492208,
      "peakDb": -6.5,
      "loudness": -27.5,
      "sha": "9f6425b71baa"
    },
    "音效/block.wood.step.2": {
      "duration": 0.562521,
      "peakDb": -8.1,
      "loudness": -30.1,
      "sha": "5da109e455b3"
    },
    "音效/block.wood.step.5": {
      "duration": 0.689958,
      "peakDb": -6.4,
      "loudness": -28.4,
      "sha": "f950e9c56383"
    },
    "音效/block.wool.place.3": {
      "duration": 0.203469,
      "peakDb": -12.8,
      "loudness": -70,
      "sha": "ac49293ab32a"
    },
    "音效/ui.button.click": {
      "duration": 0.279637,
      "peakDb": 0.4,
      "loudness": -70,
      "sha": "f69421ba0522"
    }
  },
  "lines": {
    "6-九胡-导航": {
      "voice": "配音/6-九胡-导航",
      "mouthOpen": 0.03,
      "duration": 3.032
    },
    "6-李樱-不算白跑": {
      "voice": "配音/6-李樱-不算白跑",
      "mouthOpen": 0.03,
      "duration": 2.018
    },
    "6-李樱-古城寻宝": {
      "voice": "配音/6-李樱-古城寻宝",
      "mouthOpen": 0.03,
      "duration": 2.375
    },
    "6-李樱-夸克古卷": {
      "voice": "配音/6-李樱-夸克古卷",
      "mouthOpen": 0.03,
      "duration": 8.607
    },
    "6-李樱-沉淀": {
      "voice": "配音/6-李樱-沉淀",
      "mouthOpen": 0.03,
      "duration": 2.638
    },
    "6-李樱-熔炼温度": {
      "voice": "配音/6-李樱-熔炼温度",
      "mouthOpen": 0.03,
      "duration": 2.674
    },
    "6-李樱-锁链基底": {
      "voice": "配音/6-李樱-锁链基底",
      "mouthOpen": 0.03,
      "duration": 4.24
    }
  }
};
export default soundTable;
