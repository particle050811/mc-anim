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
    "音效/block.sculk_catalyst.bloom.1": {
      "duration": 3.735167,
      "peakDb": -15.3,
      "loudness": -35.3,
      "sha": "864e21f71018"
    },
    "音效/block.sculk_catalyst.bloom.2": {
      "duration": 2.841729,
      "peakDb": -26.2,
      "loudness": -40.3,
      "sha": "fd98605f7349"
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
    "音效/entity.item.pickup": {
      "duration": 0.173923,
      "peakDb": -1.2,
      "loudness": -70,
      "sha": "5e3baf518a01"
    },
    "音效/entity.lightning_bolt.thunder.1": {
      "duration": 7,
      "peakDb": 0.4,
      "loudness": -17.5,
      "sha": "a361a1586e1c"
    },
    "音效/item.armor.equip_generic.1": {
      "duration": 0.177333,
      "peakDb": -10.8,
      "loudness": -70,
      "sha": "b37a9bdf7794"
    },
    "音效/仪式/goety.altar_finish": {
      "duration": 3.5,
      "peakDb": -7.2,
      "loudness": -22.8,
      "sha": "776abc03ac36"
    },
    "音效/仪式/goety.altar_loop": {
      "duration": 4.5,
      "peakDb": -11.9,
      "loudness": -27.7,
      "sha": "f09a68f2af04"
    },
    "音效/仪式/goety.altar_start": {
      "duration": 3.5,
      "peakDb": -10.8,
      "loudness": -26.9,
      "sha": "52d59ff57fe2"
    },
    "音效/诡厄巫法/goety.apostle_ambient.1": {
      "duration": 2.216009,
      "peakDb": -1.6,
      "loudness": -17,
      "sha": "3b65ceda4a49"
    },
    "音效/诡厄巫法/goety.wind.1": {
      "duration": 1.945625,
      "peakDb": -9.7,
      "loudness": -25.9,
      "sha": "99dfe31aad93"
    }
  },
  "lines": {}
};
export default soundTable;
