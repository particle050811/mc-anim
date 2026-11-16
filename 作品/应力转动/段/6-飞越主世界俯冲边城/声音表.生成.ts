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
    "配音/6-九胡-怎么下去": {
      "duration": 1.812,
      "peakDb": -1.5,
      "loudness": -18.6,
      "sha": "10737455d3c6"
    },
    "配音/6-九胡-边城脚下": {
      "duration": 3.444,
      "peakDb": -1.5,
      "loudness": -19.7,
      "sha": "ddf1d4b9e5b6"
    },
    "配音/6-李樱-又回到这里": {
      "duration": 1.996,
      "peakDb": -4.3,
      "loudness": -18,
      "sha": "db46cba8e699"
    },
    "配音/镜头/6-3-2/李樱-压路机-改字": {
      "duration": 11.294146,
      "peakDb": -3.1,
      "loudness": -18,
      "sha": "901d2d06f93f"
    },
    "音效/item.elytra.flying": {
      "duration": 10.220333,
      "peakDb": -12.3,
      "loudness": -24.9,
      "sha": "0f51f0fd6647"
    },
    "音效/镜头/6-3-2/点击": {
      "duration": 0.279646,
      "peakDb": -3.2,
      "loudness": -70,
      "sha": "42dd96d7f308"
    }
  },
  "lines": {
    "6-九胡-怎么下去": {
      "voice": "配音/6-九胡-怎么下去",
      "mouthOpen": 0.03,
      "duration": 1.812
    },
    "6-九胡-边城脚下": {
      "voice": "配音/6-九胡-边城脚下",
      "mouthOpen": 0.03,
      "duration": 3.444
    },
    "6-李樱-压路机": {
      "voice": "配音/镜头/6-3-2/李樱-压路机-改字",
      "mouthOpen": 0,
      "duration": 11.294146
    },
    "6-李樱-又回到这里": {
      "voice": "配音/6-李樱-又回到这里",
      "mouthOpen": 0,
      "duration": 1.996
    }
  }
};
export default soundTable;
