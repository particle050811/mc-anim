// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "配乐/亚波伦/決戦の刻": {
      "时长": 215.693061,
      "峰值": 0.6,
      "响度": -11,
      "sha": "210a1de4eb5a"
    },
    "音效/ambient.nether_wastes.mood.2": {
      "时长": 18,
      "峰值": -13.3,
      "响度": -30.6,
      "sha": "8441f44ac00c"
    },
    "音效/block.basalt.break.1": {
      "时长": 0.501708,
      "峰值": -0.1,
      "响度": -24.4,
      "sha": "001ac70316ce"
    },
    "音效/block.fire.ambient": {
      "时长": 1.82059,
      "峰值": -3.8,
      "响度": -36.3,
      "sha": "d7c0af67c932"
    },
    "音效/block.glass.break.1": {
      "时长": 0.691497,
      "峰值": 2.5,
      "响度": -17.7,
      "sha": "ac96668c1b15"
    },
    "音效/entity.blaze.shoot": {
      "时长": 0.718753,
      "峰值": 0.4,
      "响度": -16.6,
      "sha": "d88d1eea0f64"
    },
    "音效/entity.drowned.shoot.1": {
      "时长": 0.910667,
      "峰值": -2,
      "响度": -22.6,
      "sha": "40e19a6a8906"
    },
    "音效/entity.evoker.cast_spell.1": {
      "时长": 1.973333,
      "峰值": -2.1,
      "响度": -19.8,
      "sha": "34a2b826f7b0"
    },
    "音效/entity.generic.explode.1": {
      "时长": 2.5,
      "峰值": -0.3,
      "响度": -12.6,
      "sha": "ec6fe52205a8"
    },
    "音效/entity.ghast.shoot": {
      "时长": 0.718753,
      "峰值": 0.4,
      "响度": -16.6,
      "sha": "d88d1eea0f64"
    },
    "音效/entity.lightning_bolt.impact.1": {
      "时长": 2.5,
      "峰值": -0.3,
      "响度": -12.6,
      "sha": "ec6fe52205a8"
    },
    "音效/entity.lightning_bolt.thunder.1": {
      "时长": 7,
      "峰值": 0.4,
      "响度": -17.5,
      "sha": "a361a1586e1c"
    },
    "音效/entity.player.attack.sweep.1": {
      "时长": 0.234667,
      "峰值": 0.7,
      "响度": -70,
      "sha": "595f127d896a"
    },
    "音效/entity.player.attack.sweep.2": {
      "时长": 0.215,
      "峰值": 0.5,
      "响度": -70,
      "sha": "aba683ef86b1"
    },
    "音效/entity.player.attack.sweep.3": {
      "时长": 0.194,
      "峰值": 0.4,
      "响度": -70,
      "sha": "737538a8b1f9"
    },
    "音效/entity.player.attack.sweep.4": {
      "时长": 0.158,
      "峰值": 1,
      "响度": -70,
      "sha": "b1c96cc6b0e9"
    },
    "音效/entity.player.attack.sweep.5": {
      "时长": 0.197333,
      "峰值": 0.3,
      "响度": -70,
      "sha": "4087c81ce1c5"
    },
    "音效/entity.player.attack.sweep.6": {
      "时长": 0.174333,
      "峰值": 1.1,
      "响度": -70,
      "sha": "cd09c71ae431"
    },
    "音效/entity.player.attack.sweep.7": {
      "时长": 0.226,
      "峰值": 0.2,
      "响度": -70,
      "sha": "b043e15380d6"
    },
    "音效/entity.player.hurt.1": {
      "时长": 0.5,
      "峰值": 1,
      "响度": -20,
      "sha": "5e190650c27c"
    },
    "音效/entity.player.hurt.2": {
      "时长": 0.437506,
      "峰值": 1.2,
      "响度": -19.8,
      "sha": "67ceec1f40e1"
    },
    "音效/entity.player.hurt.3": {
      "时长": 0.656281,
      "峰值": 0.3,
      "响度": -19.7,
      "sha": "637b73c4218d"
    },
    "音效/entity.player.hurt_on_fire.1": {
      "时长": 1.515333,
      "峰值": 0.3,
      "响度": -21.3,
      "sha": "d62385b2a203"
    },
    "音效/entity.player.hurt_on_fire.2": {
      "时长": 1.400458,
      "峰值": -0.4,
      "响度": -21,
      "sha": "206e44c81719"
    },
    "音效/entity.player.hurt_on_fire.3": {
      "时长": 1.367333,
      "峰值": 0.1,
      "响度": -23.3,
      "sha": "4cb79c6e5dad"
    },
    "音效/entity.warden.sonic_boom.1": {
      "时长": 4,
      "峰值": -1,
      "响度": -15.3,
      "sha": "4bba573e07f6"
    },
    "音效/entity.wither.shoot": {
      "时长": 1,
      "峰值": 1.9,
      "响度": -10.7,
      "sha": "a29d10700537"
    },
    "音效/item.totem.use": {
      "时长": 3.422667,
      "峰值": 1.7,
      "响度": -10.7,
      "sha": "9d3a53dd9c60"
    },
    "音效/诡厄巫法/goety.apostle_cast_spell.1": {
      "时长": 1.691995,
      "峰值": 0.1,
      "响度": -11.9,
      "sha": "497795f7a0ac"
    },
    "音效/诡厄巫法/goety.apostle_cast_spell.2": {
      "时长": 2,
      "峰值": 0.2,
      "响度": -10.5,
      "sha": "cb1e9d2badb3"
    },
    "音效/诡厄巫法/goety.apostle_prepare_spell.1": {
      "时长": 3.871746,
      "峰值": 0.5,
      "响度": -10.1,
      "sha": "29c8a8dd5c2c"
    },
    "音效/诡厄巫法/goety.heavy_woosh.1": {
      "时长": 1.48542,
      "峰值": -0.6,
      "响度": -15.9,
      "sha": "08042e1e7a4c"
    },
    "音效/诡厄巫法/goety.heavy_woosh.2": {
      "时长": 1.669456,
      "峰值": -0.9,
      "响度": -16.2,
      "sha": "659943d6ed2c"
    },
    "音效/诡厄巫法/goety.heavy_woosh.3": {
      "时长": 1.104218,
      "峰值": -2.2,
      "响度": -16.9,
      "sha": "8374091aead9"
    },
    "音效/诡厄巫法/goety.heavy_woosh.4": {
      "时长": 1.671746,
      "峰值": -0.3,
      "响度": -16.1,
      "sha": "6d74560ec520"
    },
    "音效/诡厄巫法/goety.heavy_woosh.5": {
      "时长": 1.314535,
      "峰值": -0.3,
      "响度": -15.8,
      "sha": "6f995c58f7cb"
    },
    "音效/诡厄巫法/goety.ice_chunk_drop": {
      "时长": 1.75,
      "峰值": -10.7,
      "响度": -21.9,
      "sha": "e7fd7f66314c"
    },
    "音效/诡厄巫法/goety.ice_chunk_hit": {
      "时长": 3.312494,
      "峰值": -2.8,
      "响度": -15.2,
      "sha": "5ae2c1d267fa"
    },
    "音效/诡厄巫法/goety.ice_spike_cast": {
      "时长": 1.698005,
      "峰值": -7.7,
      "响度": -27.7,
      "sha": "78f61627ea6c"
    },
    "音效/诡厄巫法/goety.ice_spike_hit.1": {
      "时长": 1.05941,
      "峰值": 0.6,
      "响度": -21.7,
      "sha": "a6fd1cbe1911"
    },
    "音效/诡厄巫法/goety.redstone_explode.1": {
      "时长": 2,
      "峰值": -6.4,
      "响度": -25.1,
      "sha": "6b14dc8c54c3"
    },
    "音效/诡厄巫法/goety.shock_cast.1": {
      "时长": 1.214354,
      "峰值": -3.5,
      "响度": -18.5,
      "sha": "4709dd3fb74b"
    },
    "音效/诡厄巫法/goety.soul_explode.1": {
      "时长": 5,
      "峰值": 0.2,
      "响度": -11.5,
      "sha": "253283e26942"
    },
    "音效/诡厄巫法/goety.thunderbolt.1": {
      "时长": 2.239433,
      "峰值": -1.5,
      "响度": -16.3,
      "sha": "a56afeaa1f69"
    },
    "音效/诡厄巫法/goety.wind.1": {
      "时长": 1.945625,
      "峰值": -9.7,
      "响度": -25.9,
      "sha": "99dfe31aad93"
    },
    "音效/诡厄巫法/goety.wind_blast.1": {
      "时长": 2.75,
      "峰值": -3,
      "响度": -17,
      "sha": "1db08eb10c93"
    }
  },
  "台词": {}
};
export default 表;
