// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "配乐/Wasted": {
      "时长": 180.238753,
      "峰值": 1.8,
      "响度": -5.3,
      "sha": "f779ec3814ab"
    },
    "音效/block.ladder.break.1": {
      "时长": 0.5,
      "峰值": -1.9,
      "响度": -26.3,
      "sha": "cb6071c83a7f"
    },
    "音效/block.ladder.break.2": {
      "时长": 0.5,
      "峰值": -5.1,
      "响度": -28.2,
      "sha": "59edca848409"
    },
    "音效/block.ladder.break.3": {
      "时长": 0.5,
      "峰值": -5,
      "响度": -29.4,
      "sha": "cf6be2314c08"
    },
    "音效/block.ladder.break.4": {
      "时长": 0.5,
      "峰值": -6,
      "响度": -29.3,
      "sha": "de868b3119b0"
    },
    "音效/block.ladder.hit.5": {
      "时长": 0.312517,
      "峰值": 0.1,
      "响度": -70,
      "sha": "87214c02fc96"
    },
    "音效/block.metal.break.1": {
      "时长": 0.5,
      "峰值": -4.1,
      "响度": -28.5,
      "sha": "97f2a8a73b6f"
    },
    "音效/block.metal.break.3": {
      "时长": 0.5,
      "峰值": -7.2,
      "响度": -28.6,
      "sha": "19273f0e7e25"
    },
    "音效/block.metal.hit.2": {
      "时长": 0.484376,
      "峰值": -7,
      "响度": -33.9,
      "sha": "2cfbf8787436"
    },
    "音效/block.snow.break.3": {
      "时长": 0.437506,
      "峰值": -9.8,
      "响度": -34.9,
      "sha": "ae97513c5bca"
    },
    "音效/block.snow.hit.2": {
      "时长": 0.437506,
      "峰值": -19.8,
      "响度": -38,
      "sha": "a0d603f69ad5"
    },
    "音效/block.stone.break.1": {
      "时长": 0.5,
      "峰值": -4.1,
      "响度": -28.5,
      "sha": "97f2a8a73b6f"
    },
    "音效/block.stone.break.2": {
      "时长": 0.5,
      "峰值": -3.5,
      "响度": -29.2,
      "sha": "98a5c3197845"
    },
    "音效/block.stone.break.3": {
      "时长": 0.5,
      "峰值": -7.2,
      "响度": -28.6,
      "sha": "19273f0e7e25"
    },
    "音效/block.stone.break.4": {
      "时长": 0.5,
      "峰值": -2.5,
      "响度": -27.7,
      "sha": "b164e7324510"
    },
    "音效/block.stone.hit.1": {
      "时长": 0.609388,
      "峰值": -8.9,
      "响度": -33.4,
      "sha": "e94a295a8764"
    },
    "音效/block.stone.hit.2": {
      "时长": 0.484376,
      "峰值": -7,
      "响度": -33.9,
      "sha": "2cfbf8787436"
    },
    "音效/block.stone.hit.3": {
      "时长": 0.421882,
      "峰值": -12,
      "响度": -36.4,
      "sha": "c5d71e8d3251"
    },
    "音效/block.stone.hit.4": {
      "时长": 0.546893,
      "峰值": -5.9,
      "响度": -31.8,
      "sha": "95820d0b75e8"
    },
    "音效/block.stone.hit.5": {
      "时长": 0.562517,
      "峰值": -9.1,
      "响度": -31.3,
      "sha": "67b1e50426b2"
    },
    "音效/block.stone.hit.6": {
      "时长": 0.609388,
      "峰值": -5.5,
      "响度": -29.7,
      "sha": "2b65e1bdb942"
    },
    "音效/block.wood.break.1": {
      "时长": 0.5,
      "峰值": -1.9,
      "响度": -26.3,
      "sha": "cb6071c83a7f"
    },
    "音效/block.wood.break.3": {
      "时长": 0.5,
      "峰值": -5,
      "响度": -29.4,
      "sha": "cf6be2314c08"
    },
    "音效/block.wood.break.4": {
      "时长": 0.5,
      "峰值": -6,
      "响度": -29.3,
      "sha": "de868b3119b0"
    },
    "音效/block.wood.hit.4": {
      "时长": 0.544938,
      "峰值": -5.1,
      "响度": -31.2,
      "sha": "58375f561a2e"
    },
    "音效/block.wood.hit.5": {
      "时长": 0.689958,
      "峰值": -6.4,
      "响度": -28.4,
      "sha": "f950e9c56383"
    },
    "音效/block.wood.hit.6": {
      "时长": 0.518563,
      "峰值": -2.8,
      "响度": -27.7,
      "sha": "38ad366819ad"
    },
    "音效/entity.hostile.death.1": {
      "时长": 0.5,
      "峰值": 1,
      "响度": -20,
      "sha": "5e190650c27c"
    },
    "音效/entity.hostile.death.3": {
      "时长": 0.656281,
      "峰值": 0.3,
      "响度": -19.7,
      "sha": "637b73c4218d"
    },
    "音效/entity.item.pickup": {
      "时长": 0.173923,
      "峰值": -1.2,
      "响度": -70,
      "sha": "5e3baf518a01"
    },
    "音效/entity.minecart.inside": {
      "时长": 5.770181,
      "峰值": -0.2,
      "响度": -12.5,
      "sha": "fac373e9fc2d"
    },
    "音效/entity.painting.break.1": {
      "时长": 0.224667,
      "峰值": -0.4,
      "响度": -70,
      "sha": "41ec5ff8cf02"
    },
    "音效/entity.painting.break.2": {
      "时长": 0.215833,
      "峰值": -2.9,
      "响度": -70,
      "sha": "b121173f60dd"
    },
    "音效/entity.painting.break.3": {
      "时长": 0.235333,
      "峰值": -0.2,
      "响度": -70,
      "sha": "750a489a0d75"
    },
    "音效/entity.player.attack.strong.1": {
      "时长": 0.182667,
      "峰值": -0.3,
      "响度": -70,
      "sha": "4b5d655f7b74"
    },
    "音效/entity.player.attack.strong.2": {
      "时长": 0.226667,
      "峰值": 0.5,
      "响度": -70,
      "sha": "f814be39a285"
    },
    "音效/entity.player.attack.strong.3": {
      "时长": 0.204,
      "峰值": 0.4,
      "响度": -70,
      "sha": "829d8d2db757"
    },
    "音效/entity.player.attack.strong.4": {
      "时长": 0.193333,
      "峰值": 0.4,
      "响度": -70,
      "sha": "d422289de1b1"
    },
    "音效/entity.player.attack.strong.5": {
      "时长": 0.226667,
      "峰值": 0.7,
      "响度": -70,
      "sha": "9734330f6a2c"
    },
    "音效/entity.splash_potion.break.1": {
      "时长": 0.691497,
      "峰值": 2.5,
      "响度": -17.7,
      "sha": "ac96668c1b15"
    },
    "音效/entity.splash_potion.break.2": {
      "时长": 0.691497,
      "峰值": -1,
      "响度": -22.8,
      "sha": "7288bb874add"
    },
    "音效/entity.splash_potion.break.3": {
      "时长": 0.691497,
      "峰值": -0.4,
      "响度": -19.5,
      "sha": "062c3175b3ab"
    },
    "音效/entity.splash_potion.throw": {
      "时长": 0.455102,
      "峰值": -0.1,
      "响度": -21.4,
      "sha": "9492b5233938"
    },
    "音效/twilightforest.block.twilightforest.boss_chest.appear": {
      "时长": 3.488,
      "峰值": -4.6,
      "响度": -22.9,
      "sha": "96e683a5590c"
    },
    "音效/twilightforest.entity.twilightforest.alpha_yeti.death": {
      "时长": 4.554898,
      "峰值": -2.2,
      "响度": -19.1,
      "sha": "8afd7a1dfe95"
    },
    "音效/twilightforest.entity.twilightforest.hydra.death": {
      "时长": 8.612789,
      "峰值": 4.7,
      "响度": -11.4,
      "sha": "c578d0416512"
    },
    "音效/twilightforest.entity.twilightforest.lich.death": {
      "时长": 3.5,
      "峰值": -0.2,
      "响度": -18.2,
      "sha": "9ef443fb83d9"
    },
    "音效/twilightforest.entity.twilightforest.shield.break": {
      "时长": 0.388209,
      "峰值": -0.9,
      "响度": -70,
      "sha": "5f6a07395aff"
    },
    "音效/twilightforest.entity.twilightforest.snow_queen.break": {
      "时长": 0.388209,
      "峰值": -0.9,
      "响度": -70,
      "sha": "5f6a07395aff"
    },
    "音效/twilightforest.entity.twilightforest.snow_queen.death.1": {
      "时长": 0.695125,
      "峰值": 0,
      "响度": -14.6,
      "sha": "0d0e97ae247a"
    },
    "音效/twilightforest.entity.twilightforest.ur_ghast.death": {
      "时长": 3.062517,
      "峰值": -3.5,
      "响度": -29.7,
      "sha": "999ae12476dc"
    }
  },
  "台词": {}
};
export default 表;
