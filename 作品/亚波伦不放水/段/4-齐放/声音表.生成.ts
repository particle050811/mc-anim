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
    "音效/block.basalt.place.1": {
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
    "音效/entity.blaze.burn": {
      "时长": 1.82059,
      "峰值": -3.8,
      "响度": -36.3,
      "sha": "d7c0af67c932"
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
    "音效/entity.drowned.shoot.2": {
      "时长": 1.464,
      "峰值": -3.1,
      "响度": -22.1,
      "sha": "8fd32459f6ef"
    },
    "音效/entity.evoker.cast_spell.1": {
      "时长": 1.973333,
      "峰值": -2.1,
      "响度": -19.8,
      "sha": "34a2b826f7b0"
    },
    "音效/entity.evoker.prepare_attack.1": {
      "时长": 3.178667,
      "峰值": -4.2,
      "响度": -18,
      "sha": "ce5681cbd411"
    },
    "音效/entity.evoker.prepare_attack.2": {
      "时长": 2.656,
      "峰值": -1.9,
      "响度": -17,
      "sha": "5f6c84e5821d"
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
    "音效/entity.player.hurt_freeze.1": {
      "时长": 0.988021,
      "峰值": -4.6,
      "响度": -26.1,
      "sha": "ac3d80eb2051"
    },
    "音效/entity.player.splash.high_speed": {
      "时长": 3.026667,
      "峰值": 0.1,
      "响度": -16.9,
      "sha": "23465cd6325f"
    },
    "音效/entity.warden.sonic_boom.1": {
      "时长": 4,
      "峰值": -1,
      "响度": -15.3,
      "sha": "4bba573e07f6"
    },
    "音效/entity.warden.sonic_charge.1": {
      "时长": 1.625011,
      "峰值": -0.8,
      "响度": -14.3,
      "sha": "c0bef8632826"
    },
    "音效/entity.warden.sonic_charge.2": {
      "时长": 1.625011,
      "峰值": -0.8,
      "响度": -13.7,
      "sha": "2171ff1e7ec7"
    },
    "音效/entity.warden.sonic_charge.3": {
      "时长": 1.625011,
      "峰值": -0.9,
      "响度": -13.9,
      "sha": "9153a4bc071d"
    },
    "音效/entity.warden.sonic_charge.4": {
      "时长": 1.625011,
      "峰值": -0.9,
      "响度": -13.7,
      "sha": "8d235cd7ac4c"
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
    "音效/item.trident.hit.1": {
      "时长": 0.489833,
      "峰值": -1,
      "响度": -21.3,
      "sha": "588390abee8e"
    },
    "音效/诡厄巫法/goety.abyss_prepare_spell.1": {
      "时长": 2.67059,
      "峰值": -0.1,
      "响度": -16.8,
      "sha": "8b61bca2044f"
    },
    "音效/诡厄巫法/goety.abyss_prepare_spell.2": {
      "时长": 2.554739,
      "峰值": -0.4,
      "响度": -16.8,
      "sha": "b38a5b8e8ede"
    },
    "音效/诡厄巫法/goety.abyss_prepare_spell.3": {
      "时长": 2.59458,
      "峰值": -0.6,
      "响度": -16.2,
      "sha": "588824f0d732"
    },
    "音效/诡厄巫法/goety.abyss_prepare_spell.4": {
      "时长": 3.189025,
      "峰值": -0.3,
      "响度": -16.8,
      "sha": "bc496c00616e"
    },
    "音效/诡厄巫法/goety.apostle_cast_spell.1": {
      "时长": 1.691995,
      "峰值": 0.1,
      "响度": -11.9,
      "sha": "497795f7a0ac"
    },
    "音效/诡厄巫法/goety.apostle_prepare_spell.1": {
      "时长": 3.871746,
      "峰值": 0.5,
      "响度": -10.1,
      "sha": "29c8a8dd5c2c"
    },
    "音效/诡厄巫法/goety.apostle_prepare_spell.2": {
      "时长": 3.871746,
      "峰值": -3.7,
      "响度": -17.1,
      "sha": "975dcc012094"
    },
    "音效/诡厄巫法/goety.blast_fungus_throw.1": {
      "时长": 0.985918,
      "峰值": -1.7,
      "响度": -21,
      "sha": "c3381a703aa4"
    },
    "音效/诡厄巫法/goety.cast_spell.1": {
      "时长": 1.254603,
      "峰值": -6.5,
      "响度": -25,
      "sha": "0aa0cebc1535"
    },
    "音效/诡厄巫法/goety.cast_spell.2": {
      "时长": 1.101859,
      "峰值": -8,
      "响度": -27,
      "sha": "e824c6f59409"
    },
    "音效/诡厄巫法/goety.cast_spell.3": {
      "时长": 1.973333,
      "峰值": -2.1,
      "响度": -19.8,
      "sha": "34a2b826f7b0"
    },
    "音效/诡厄巫法/goety.cast_spell.4": {
      "时长": 1.604,
      "峰值": -5.3,
      "响度": -21.3,
      "sha": "72e699b3f7d3"
    },
    "音效/诡厄巫法/goety.flight": {
      "时长": 2.322268,
      "峰值": -28.5,
      "响度": -43.2,
      "sha": "78a8002d908c"
    },
    "音效/诡厄巫法/goety.frost_prepare_spell.1": {
      "时长": 2.728798,
      "峰值": -3.4,
      "响度": -22,
      "sha": "f739096df7cb"
    },
    "音效/诡厄巫法/goety.frost_prepare_spell.2": {
      "时长": 2.437506,
      "峰值": -9.5,
      "响度": -26.3,
      "sha": "758354abdcaa"
    },
    "音效/诡厄巫法/goety.frost_prepare_spell.3": {
      "时长": 2.937506,
      "峰值": -6.5,
      "响度": -21.4,
      "sha": "54dfd6e27cae"
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
    "音效/诡厄巫法/goety.poison_quill_impact.1": {
      "时长": 0.980839,
      "峰值": -0.1,
      "响度": -17.7,
      "sha": "cb59c979c978"
    },
    "音效/诡厄巫法/goety.poison_quill_vine_shoot.1": {
      "时长": 1.031247,
      "峰值": -6,
      "响度": -27.3,
      "sha": "a9f1105e25ab"
    },
    "音效/诡厄巫法/goety.prepare_spell.1": {
      "时长": 1.573152,
      "峰值": -3.5,
      "响度": -20.1,
      "sha": "8c464068f6ca"
    },
    "音效/诡厄巫法/goety.prepare_spell.2": {
      "时长": 1.573152,
      "峰值": -1.8,
      "响度": -18.5,
      "sha": "5353f7482db7"
    },
    "音效/诡厄巫法/goety.prepare_summon.1": {
      "时长": 3.488,
      "峰值": -4.6,
      "响度": -22.9,
      "sha": "96e683a5590c"
    },
    "音效/诡厄巫法/goety.prepare_summon.2": {
      "时长": 3.504671,
      "峰值": -4.3,
      "响度": -22.6,
      "sha": "76cff7f36bb0"
    },
    "音效/诡厄巫法/goety.quick_growing_vine_burrow.1": {
      "时长": 0.766916,
      "峰值": -3.7,
      "响度": -20.6,
      "sha": "68dc1752d5bc"
    },
    "音效/诡厄巫法/goety.rumble.1": {
      "时长": 4.101338,
      "峰值": -1.7,
      "响度": -17.9,
      "sha": "f04d3af3b59d"
    },
    "音效/诡厄巫法/goety.shock_cast.1": {
      "时长": 1.214354,
      "峰值": -3.5,
      "响度": -18.5,
      "sha": "4709dd3fb74b"
    },
    "音效/诡厄巫法/goety.soul_bolt_cast": {
      "时长": 0.729977,
      "峰值": -10.9,
      "响度": -24.6,
      "sha": "daec572f8f60"
    },
    "音效/诡厄巫法/goety.teleport_orb_throw": {
      "时长": 0.595556,
      "峰值": -23.7,
      "响度": -39.4,
      "sha": "351cd2f48c83"
    },
    "音效/诡厄巫法/goety.thunder_strike_fast.1": {
      "时长": 4.523356,
      "峰值": 0.5,
      "响度": -14.9,
      "sha": "e5c5aa0ca425"
    },
    "音效/诡厄巫法/goety.thunderbolt.1": {
      "时长": 2.239433,
      "峰值": -1.5,
      "响度": -16.3,
      "sha": "a56afeaa1f69"
    },
    "音效/诡厄巫法/goety.tooth_spawn.1": {
      "时长": 2.242177,
      "峰值": 0.3,
      "响度": -15.8,
      "sha": "5965ad5b6dc7"
    },
    "音效/诡厄巫法/goety.vex_vapor.1": {
      "时长": 1.63068,
      "峰值": -18.1,
      "响度": -37,
      "sha": "b43e964163c7"
    },
    "音效/诡厄巫法/goety.void_prepare_spell.1": {
      "时长": 1.813583,
      "峰值": -13.1,
      "响度": -26.6,
      "sha": "c7e2c6012e6d"
    },
    "音效/诡厄巫法/goety.void_prepare_spell.2": {
      "时长": 1.166667,
      "峰值": -17.7,
      "响度": -29.4,
      "sha": "af35143d1153"
    },
    "音效/诡厄巫法/goety.void_prepare_spell.4": {
      "时长": 1.454104,
      "峰值": -16.3,
      "响度": -28.5,
      "sha": "42255a3d54ee"
    },
    "音效/诡厄巫法/goety.wall_erupt.1": {
      "时长": 1.239592,
      "峰值": -3.6,
      "响度": -19.8,
      "sha": "7cad16462e1d"
    },
    "音效/诡厄巫法/goety.wild_prepare_spell": {
      "时长": 3.25,
      "峰值": 0.3,
      "响度": -12.7,
      "sha": "2a8f4667f472"
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
    },
    "音效/诡厄巫法/goety.zap.1": {
      "时长": 1.100385,
      "峰值": -15.7,
      "响度": -28.9,
      "sha": "7e0bcfbb3d70"
    }
  },
  "台词": {}
};
export default 表;
