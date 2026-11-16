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
    "音效/ambient.nether_wastes.mood.2": {
      "duration": 18,
      "peakDb": -13.3,
      "loudness": -30.6,
      "sha": "8441f44ac00c"
    },
    "音效/block.stone.step.1": {
      "duration": 0.609388,
      "peakDb": -8.9,
      "loudness": -33.4,
      "sha": "e94a295a8764"
    },
    "音效/block.stone.step.2": {
      "duration": 0.484376,
      "peakDb": -7,
      "loudness": -33.9,
      "sha": "2cfbf8787436"
    },
    "音效/block.stone.step.3": {
      "duration": 0.421882,
      "peakDb": -12,
      "loudness": -36.4,
      "sha": "c5d71e8d3251"
    },
    "音效/block.stone.step.4": {
      "duration": 0.546893,
      "peakDb": -5.9,
      "loudness": -31.8,
      "sha": "95820d0b75e8"
    },
    "音效/block.stone.step.5": {
      "duration": 0.562517,
      "peakDb": -9.1,
      "loudness": -31.3,
      "sha": "67b1e50426b2"
    },
    "音效/block.stone.step.6": {
      "duration": 0.609388,
      "peakDb": -5.5,
      "loudness": -29.7,
      "sha": "2b65e1bdb942"
    },
    "音效/item.trident.riptide_1": {
      "duration": 1.780458,
      "peakDb": -7,
      "loudness": -22.2,
      "sha": "36fc7a12163c"
    },
    "音效/诡厄巫法/goety.apostle_pre_teleport": {
      "duration": 2.647917,
      "peakDb": -0.3,
      "loudness": -15.9,
      "sha": "b69493a97818"
    },
    "音效/诡厄巫法/goety.apostle_prepare_spell.1": {
      "duration": 3.871746,
      "peakDb": 0.5,
      "loudness": -10.1,
      "sha": "29c8a8dd5c2c"
    },
    "音效/诡厄巫法/goety.apostle_teleport.1": {
      "duration": 0.915714,
      "peakDb": -0.1,
      "loudness": -21.7,
      "sha": "22ea617abb67"
    },
    "音效/诡厄巫法/goety.wind.1": {
      "duration": 1.945625,
      "peakDb": -9.7,
      "loudness": -25.9,
      "sha": "99dfe31aad93"
    },
    "音效/诡厄巫法/goety.wind.2": {
      "duration": 1.998292,
      "peakDb": -8.6,
      "loudness": -24.6,
      "sha": "48969cedd3fb"
    },
    "音效/诡厄巫法/goety.wind.3": {
      "duration": 1.886021,
      "peakDb": -9.1,
      "loudness": -26,
      "sha": "09ae3887f11a"
    }
  },
  "lines": {}
};
export default soundTable;
