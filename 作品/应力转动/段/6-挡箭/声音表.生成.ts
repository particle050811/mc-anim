// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "音效/block.chest.close.2": {
      "duration": 0.631375,
      "peakDb": 0,
      "loudness": -16.5,
      "sha": "08c2e383401f"
    },
    "音效/block.deepslate.break.1": {
      "duration": 1,
      "peakDb": -6.4,
      "loudness": -30.5,
      "sha": "13c0c2a22254"
    },
    "音效/block.deepslate.break.2": {
      "duration": 0.866729,
      "peakDb": -6.6,
      "loudness": -32.6,
      "sha": "8c2b92cba456"
    },
    "音效/block.deepslate.break.3": {
      "duration": 0.921708,
      "peakDb": -6.2,
      "loudness": -29.5,
      "sha": "337166a0c5f8"
    },
    "音效/block.sculk.break.12": {
      "duration": 1.596396,
      "peakDb": -14.7,
      "loudness": -34.3,
      "sha": "6fef9ee267f5"
    },
    "音效/block.sculk.break.13": {
      "duration": 1.419771,
      "peakDb": -13.7,
      "loudness": -36.3,
      "sha": "16764846abc4"
    },
    "音效/block.sculk.break.5": {
      "duration": 1.599688,
      "peakDb": -9.6,
      "loudness": -33.2,
      "sha": "05aa316a80fc"
    },
    "音效/block.sculk.break.7": {
      "duration": 1.793521,
      "peakDb": -15.5,
      "loudness": -36.9,
      "sha": "7900163aa314"
    },
    "音效/efn.parry.3": {
      "duration": 1.173333,
      "peakDb": 0.3,
      "loudness": -9,
      "sha": "98f632cab9df"
    },
    "音效/efn.whoosh_light_1": {
      "duration": 0.8,
      "peakDb": -8.7,
      "loudness": -26.3,
      "sha": "59556b7733a6"
    },
    "音效/item.elytra.flying": {
      "duration": 10.220333,
      "peakDb": -12.3,
      "loudness": -24.9,
      "sha": "0f51f0fd6647"
    }
  },
  "lines": {}
};
export default soundTable;
