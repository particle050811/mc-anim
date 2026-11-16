// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配音/7-李樱-五万血": {
      "duration": 2.24,
      "peakDb": -4,
      "loudness": -18,
      "sha": "08eae572c6c6"
    },
    "配音/7-李樱-溜了": {
      "duration": 1.081,
      "peakDb": -5.2,
      "loudness": -18,
      "sha": "cfeb568789c0"
    },
    "音效/entity.warden.tendril_clicks.6": {
      "duration": 1.024104,
      "peakDb": -2,
      "loudness": -24.9,
      "sha": "f568609506ab"
    }
  },
  "lines": {
    "7-李樱-五万血": {
      "voice": "配音/7-李樱-五万血",
      "mouthOpen": 0,
      "duration": 2.24
    },
    "7-李樱-溜了": {
      "voice": "配音/7-李樱-溜了",
      "mouthOpen": 0,
      "duration": 1.081
    }
  }
};
export default soundTable;
