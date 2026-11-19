// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配乐/亚波伦/決戦の刻": {
      "duration": 215.693061,
      "peakDb": 0.6,
      "loudness": -11,
      "sha": "210a1de4eb5a"
    },
    "音效/ambient.nether_wastes.mood.1": {
      "duration": 8.809,
      "peakDb": -11.8,
      "loudness": -28.5,
      "sha": "cc110e397b92"
    },
    "音效/ambient.nether_wastes.mood.2": {
      "duration": 18,
      "peakDb": -13.3,
      "loudness": -30.6,
      "sha": "8441f44ac00c"
    },
    "音效/block.beacon.deactivate": {
      "duration": 3.500958,
      "peakDb": -8.2,
      "loudness": -23.3,
      "sha": "27acd3575b79"
    },
    "音效/entity.generic.small_fall": {
      "duration": 0.25,
      "peakDb": 0.3,
      "loudness": -70,
      "sha": "f6c607669ba7"
    },
    "音效/entity.player.death.1": {
      "duration": 0.5,
      "peakDb": 1,
      "loudness": -20,
      "sha": "5e190650c27c"
    },
    "音效/ui.button.click": {
      "duration": 0.279637,
      "peakDb": 0.4,
      "loudness": -70,
      "sha": "f69421ba0522"
    },
    "音效/诡厄巫法/goety.heavy_woosh.1": {
      "duration": 1.48542,
      "peakDb": -0.6,
      "loudness": -15.9,
      "sha": "08042e1e7a4c"
    },
    "音效/诡厄巫法/goety.heavy_woosh.2": {
      "duration": 1.669456,
      "peakDb": -0.9,
      "loudness": -16.2,
      "sha": "659943d6ed2c"
    }
  },
  "lines": {}
};
export default soundTable;
