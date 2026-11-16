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
    "音效/block.ladder.break.1": {
      "duration": 0.5,
      "peakDb": -1.9,
      "loudness": -26.3,
      "sha": "cb6071c83a7f"
    },
    "音效/block.ladder.break.2": {
      "duration": 0.5,
      "peakDb": -5.1,
      "loudness": -28.2,
      "sha": "59edca848409"
    },
    "音效/block.ladder.break.3": {
      "duration": 0.5,
      "peakDb": -5,
      "loudness": -29.4,
      "sha": "cf6be2314c08"
    },
    "音效/block.ladder.break.4": {
      "duration": 0.5,
      "peakDb": -6,
      "loudness": -29.3,
      "sha": "de868b3119b0"
    },
    "音效/block.ladder.hit.5": {
      "duration": 0.312517,
      "peakDb": 0.1,
      "loudness": -70,
      "sha": "87214c02fc96"
    },
    "音效/block.metal.break.1": {
      "duration": 0.5,
      "peakDb": -4.1,
      "loudness": -28.5,
      "sha": "97f2a8a73b6f"
    },
    "音效/block.metal.break.3": {
      "duration": 0.5,
      "peakDb": -7.2,
      "loudness": -28.6,
      "sha": "19273f0e7e25"
    },
    "音效/block.metal.hit.2": {
      "duration": 0.484376,
      "peakDb": -7,
      "loudness": -33.9,
      "sha": "2cfbf8787436"
    },
    "音效/block.snow.break.3": {
      "duration": 0.437506,
      "peakDb": -9.8,
      "loudness": -34.9,
      "sha": "ae97513c5bca"
    },
    "音效/block.snow.hit.2": {
      "duration": 0.437506,
      "peakDb": -19.8,
      "loudness": -38,
      "sha": "a0d603f69ad5"
    },
    "音效/block.stone.break.1": {
      "duration": 0.5,
      "peakDb": -4.1,
      "loudness": -28.5,
      "sha": "97f2a8a73b6f"
    },
    "音效/block.stone.break.2": {
      "duration": 0.5,
      "peakDb": -3.5,
      "loudness": -29.2,
      "sha": "98a5c3197845"
    },
    "音效/block.stone.break.3": {
      "duration": 0.5,
      "peakDb": -7.2,
      "loudness": -28.6,
      "sha": "19273f0e7e25"
    },
    "音效/block.stone.break.4": {
      "duration": 0.5,
      "peakDb": -2.5,
      "loudness": -27.7,
      "sha": "b164e7324510"
    },
    "音效/block.stone.hit.1": {
      "duration": 0.609388,
      "peakDb": -8.9,
      "loudness": -33.4,
      "sha": "e94a295a8764"
    },
    "音效/block.stone.hit.2": {
      "duration": 0.484376,
      "peakDb": -7,
      "loudness": -33.9,
      "sha": "2cfbf8787436"
    },
    "音效/block.stone.hit.3": {
      "duration": 0.421882,
      "peakDb": -12,
      "loudness": -36.4,
      "sha": "c5d71e8d3251"
    },
    "音效/block.stone.hit.4": {
      "duration": 0.546893,
      "peakDb": -5.9,
      "loudness": -31.8,
      "sha": "95820d0b75e8"
    },
    "音效/block.stone.hit.5": {
      "duration": 0.562517,
      "peakDb": -9.1,
      "loudness": -31.3,
      "sha": "67b1e50426b2"
    },
    "音效/block.stone.hit.6": {
      "duration": 0.609388,
      "peakDb": -5.5,
      "loudness": -29.7,
      "sha": "2b65e1bdb942"
    },
    "音效/block.wood.break.1": {
      "duration": 0.5,
      "peakDb": -1.9,
      "loudness": -26.3,
      "sha": "cb6071c83a7f"
    },
    "音效/block.wood.break.3": {
      "duration": 0.5,
      "peakDb": -5,
      "loudness": -29.4,
      "sha": "cf6be2314c08"
    },
    "音效/block.wood.break.4": {
      "duration": 0.5,
      "peakDb": -6,
      "loudness": -29.3,
      "sha": "de868b3119b0"
    },
    "音效/block.wood.hit.4": {
      "duration": 0.544938,
      "peakDb": -5.1,
      "loudness": -31.2,
      "sha": "58375f561a2e"
    },
    "音效/block.wood.hit.5": {
      "duration": 0.689958,
      "peakDb": -6.4,
      "loudness": -28.4,
      "sha": "f950e9c56383"
    },
    "音效/block.wood.hit.6": {
      "duration": 0.518563,
      "peakDb": -2.8,
      "loudness": -27.7,
      "sha": "38ad366819ad"
    },
    "音效/entity.hostile.death.1": {
      "duration": 0.5,
      "peakDb": 1,
      "loudness": -20,
      "sha": "5e190650c27c"
    },
    "音效/entity.hostile.death.3": {
      "duration": 0.656281,
      "peakDb": 0.3,
      "loudness": -19.7,
      "sha": "637b73c4218d"
    },
    "音效/entity.item.pickup": {
      "duration": 0.173923,
      "peakDb": -1.2,
      "loudness": -70,
      "sha": "5e3baf518a01"
    },
    "音效/entity.minecart.inside": {
      "duration": 5.770181,
      "peakDb": -0.2,
      "loudness": -12.5,
      "sha": "fac373e9fc2d"
    },
    "音效/entity.painting.break.1": {
      "duration": 0.224667,
      "peakDb": -0.4,
      "loudness": -70,
      "sha": "41ec5ff8cf02"
    },
    "音效/entity.painting.break.2": {
      "duration": 0.215833,
      "peakDb": -2.9,
      "loudness": -70,
      "sha": "b121173f60dd"
    },
    "音效/entity.painting.break.3": {
      "duration": 0.235333,
      "peakDb": -0.2,
      "loudness": -70,
      "sha": "750a489a0d75"
    },
    "音效/entity.player.attack.strong.1": {
      "duration": 0.182667,
      "peakDb": -0.3,
      "loudness": -70,
      "sha": "4b5d655f7b74"
    },
    "音效/entity.player.attack.strong.2": {
      "duration": 0.226667,
      "peakDb": 0.5,
      "loudness": -70,
      "sha": "f814be39a285"
    },
    "音效/entity.player.attack.strong.3": {
      "duration": 0.204,
      "peakDb": 0.4,
      "loudness": -70,
      "sha": "829d8d2db757"
    },
    "音效/entity.player.attack.strong.4": {
      "duration": 0.193333,
      "peakDb": 0.4,
      "loudness": -70,
      "sha": "d422289de1b1"
    },
    "音效/entity.player.attack.strong.5": {
      "duration": 0.226667,
      "peakDb": 0.7,
      "loudness": -70,
      "sha": "9734330f6a2c"
    },
    "音效/entity.splash_potion.break.1": {
      "duration": 0.691497,
      "peakDb": 2.5,
      "loudness": -17.7,
      "sha": "ac96668c1b15"
    },
    "音效/entity.splash_potion.break.2": {
      "duration": 0.691497,
      "peakDb": -1,
      "loudness": -22.8,
      "sha": "7288bb874add"
    },
    "音效/entity.splash_potion.break.3": {
      "duration": 0.691497,
      "peakDb": -0.4,
      "loudness": -19.5,
      "sha": "062c3175b3ab"
    },
    "音效/entity.splash_potion.throw": {
      "duration": 0.455102,
      "peakDb": -0.1,
      "loudness": -21.4,
      "sha": "9492b5233938"
    },
    "音效/twilightforest.block.twilightforest.boss_chest.appear": {
      "duration": 3.488,
      "peakDb": -4.6,
      "loudness": -22.9,
      "sha": "96e683a5590c"
    },
    "音效/twilightforest.entity.twilightforest.alpha_yeti.death": {
      "duration": 4.554898,
      "peakDb": -2.2,
      "loudness": -19.1,
      "sha": "8afd7a1dfe95"
    },
    "音效/twilightforest.entity.twilightforest.hydra.death": {
      "duration": 8.612789,
      "peakDb": 4.7,
      "loudness": -11.4,
      "sha": "c578d0416512"
    },
    "音效/twilightforest.entity.twilightforest.lich.death": {
      "duration": 3.5,
      "peakDb": -0.2,
      "loudness": -18.2,
      "sha": "9ef443fb83d9"
    },
    "音效/twilightforest.entity.twilightforest.shield.break": {
      "duration": 0.388209,
      "peakDb": -0.9,
      "loudness": -70,
      "sha": "5f6a07395aff"
    },
    "音效/twilightforest.entity.twilightforest.snow_queen.break": {
      "duration": 0.388209,
      "peakDb": -0.9,
      "loudness": -70,
      "sha": "5f6a07395aff"
    },
    "音效/twilightforest.entity.twilightforest.snow_queen.death.1": {
      "duration": 0.695125,
      "peakDb": 0,
      "loudness": -14.6,
      "sha": "0d0e97ae247a"
    },
    "音效/twilightforest.entity.twilightforest.ur_ghast.death": {
      "duration": 3.062517,
      "peakDb": -3.5,
      "loudness": -29.7,
      "sha": "999ae12476dc"
    }
  },
  "lines": {}
};
export default soundTable;
