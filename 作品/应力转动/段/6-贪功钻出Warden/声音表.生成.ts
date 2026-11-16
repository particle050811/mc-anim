// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/6-刘心忠-贵族生活": {
      "duration": 4.643,
      "peakDb": -1.5,
      "loudness": -18.6,
      "sha": "fe84daa1d74b"
    },
    "音效/block.deepslate.step.1": {
      "duration": 1.002,
      "peakDb": -10.4,
      "loudness": -35.9,
      "sha": "7972b2948e80"
    },
    "音效/block.deepslate.step.5": {
      "duration": 0.7,
      "peakDb": -14.5,
      "loudness": -37.2,
      "sha": "7f65476a592e"
    },
    "音效/block.sculk.step.1": {
      "duration": 1.380854,
      "peakDb": -11.2,
      "loudness": -37.5,
      "sha": "7c06aa7b9292"
    },
    "音效/block.sculk.step.2": {
      "duration": 1.115792,
      "peakDb": -9.1,
      "loudness": -37.5,
      "sha": "2887a97574d3"
    },
    "音效/block.sculk.step.3": {
      "duration": 0.977104,
      "peakDb": -12.6,
      "loudness": -38,
      "sha": "ed2e94ae19c9"
    },
    "音效/block.sculk.step.4": {
      "duration": 1.242313,
      "peakDb": -13.1,
      "loudness": -39,
      "sha": "5ed1e899eb2d"
    },
    "音效/block.sculk.step.5": {
      "duration": 1.390292,
      "peakDb": -18.1,
      "loudness": -38.3,
      "sha": "724cd274985c"
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
    "音效/block.sculk_shrieker.shriek.3": {
      "duration": 6.484146,
      "peakDb": -1.1,
      "loudness": -15.6,
      "sha": "1eeecb1c8939"
    },
    "音效/entity.warden.emerge": {
      "duration": 8.526063,
      "peakDb": -0.1,
      "loudness": -12.7,
      "sha": "db6fdfe8d155"
    },
    "音效/entity.warden.heartbeat.1": {
      "duration": 1.26225,
      "peakDb": -1.2,
      "loudness": -20.9,
      "sha": "f920fe98e871"
    },
    "音效/entity.warden.heartbeat.2": {
      "duration": 1.381146,
      "peakDb": -2.1,
      "loudness": -20.1,
      "sha": "90d28738336c"
    },
    "音效/entity.warden.heartbeat.3": {
      "duration": 1.271417,
      "peakDb": -1.1,
      "loudness": -19.9,
      "sha": "ef4f0afb84ae"
    },
    "音效/entity.warden.roar.3": {
      "duration": 3.357375,
      "peakDb": -0.3,
      "loudness": -15.9,
      "sha": "413d47b1d639"
    },
    "音效/entity.warden.tendril_clicks.4": {
      "duration": 1.791625,
      "peakDb": -0.5,
      "loudness": -17.9,
      "sha": "1cc999aeaa9f"
    },
    "音效/entity.warden.tendril_clicks.5": {
      "duration": 1.223583,
      "peakDb": -3.1,
      "loudness": -24,
      "sha": "59efe9756a0d"
    }
  },
  "lines": {
    "6-刘心忠-贵族生活": {
      "voice": "配音/6-刘心忠-贵族生活",
      "mouthOpen": 0.03,
      "duration": 4.643
    }
  }
};
export default soundTable;
