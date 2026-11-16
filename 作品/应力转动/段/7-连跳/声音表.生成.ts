// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
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
    "音效/entity.warden.hurt.2": {
      "duration": 2.534958,
      "peakDb": -1.3,
      "loudness": -17.4,
      "sha": "3626ff733503"
    },
    "音效/entity.warden.tendril_clicks.6": {
      "duration": 1.024104,
      "peakDb": -2,
      "loudness": -24.9,
      "sha": "f568609506ab"
    }
  },
  "lines": {}
};
export default soundTable;
