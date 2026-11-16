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
    "音效/block.basalt.break.1": {
      "duration": 0.501708,
      "peakDb": -0.1,
      "loudness": -24.4,
      "sha": "001ac70316ce"
    },
    "音效/block.basalt.place.1": {
      "duration": 0.501708,
      "peakDb": -0.1,
      "loudness": -24.4,
      "sha": "001ac70316ce"
    },
    "音效/block.fire.ambient": {
      "duration": 1.82059,
      "peakDb": -3.8,
      "loudness": -36.3,
      "sha": "d7c0af67c932"
    },
    "音效/entity.blaze.burn": {
      "duration": 1.82059,
      "peakDb": -3.8,
      "loudness": -36.3,
      "sha": "d7c0af67c932"
    },
    "音效/entity.blaze.shoot": {
      "duration": 0.718753,
      "peakDb": 0.4,
      "loudness": -16.6,
      "sha": "d88d1eea0f64"
    },
    "音效/entity.drowned.shoot.1": {
      "duration": 0.910667,
      "peakDb": -2,
      "loudness": -22.6,
      "sha": "40e19a6a8906"
    },
    "音效/entity.drowned.shoot.2": {
      "duration": 1.464,
      "peakDb": -3.1,
      "loudness": -22.1,
      "sha": "8fd32459f6ef"
    },
    "音效/entity.evoker.cast_spell.1": {
      "duration": 1.973333,
      "peakDb": -2.1,
      "loudness": -19.8,
      "sha": "34a2b826f7b0"
    },
    "音效/entity.evoker.prepare_attack.1": {
      "duration": 3.178667,
      "peakDb": -4.2,
      "loudness": -18,
      "sha": "ce5681cbd411"
    },
    "音效/entity.evoker.prepare_attack.2": {
      "duration": 2.656,
      "peakDb": -1.9,
      "loudness": -17,
      "sha": "5f6c84e5821d"
    },
    "音效/entity.generic.explode.1": {
      "duration": 2.5,
      "peakDb": -0.3,
      "loudness": -12.6,
      "sha": "ec6fe52205a8"
    },
    "音效/entity.ghast.shoot": {
      "duration": 0.718753,
      "peakDb": 0.4,
      "loudness": -16.6,
      "sha": "d88d1eea0f64"
    },
    "音效/entity.lightning_bolt.impact.1": {
      "duration": 2.5,
      "peakDb": -0.3,
      "loudness": -12.6,
      "sha": "ec6fe52205a8"
    },
    "音效/entity.lightning_bolt.thunder.1": {
      "duration": 7,
      "peakDb": 0.4,
      "loudness": -17.5,
      "sha": "a361a1586e1c"
    },
    "音效/entity.player.attack.sweep.1": {
      "duration": 0.234667,
      "peakDb": 0.7,
      "loudness": -70,
      "sha": "595f127d896a"
    },
    "音效/entity.player.attack.sweep.2": {
      "duration": 0.215,
      "peakDb": 0.5,
      "loudness": -70,
      "sha": "aba683ef86b1"
    },
    "音效/entity.player.attack.sweep.3": {
      "duration": 0.194,
      "peakDb": 0.4,
      "loudness": -70,
      "sha": "737538a8b1f9"
    },
    "音效/entity.player.attack.sweep.4": {
      "duration": 0.158,
      "peakDb": 1,
      "loudness": -70,
      "sha": "b1c96cc6b0e9"
    },
    "音效/entity.player.attack.sweep.5": {
      "duration": 0.197333,
      "peakDb": 0.3,
      "loudness": -70,
      "sha": "4087c81ce1c5"
    },
    "音效/entity.player.attack.sweep.6": {
      "duration": 0.174333,
      "peakDb": 1.1,
      "loudness": -70,
      "sha": "cd09c71ae431"
    },
    "音效/entity.player.attack.sweep.7": {
      "duration": 0.226,
      "peakDb": 0.2,
      "loudness": -70,
      "sha": "b043e15380d6"
    },
    "音效/entity.player.hurt.1": {
      "duration": 0.5,
      "peakDb": 1,
      "loudness": -20,
      "sha": "5e190650c27c"
    },
    "音效/entity.player.hurt.2": {
      "duration": 0.437506,
      "peakDb": 1.2,
      "loudness": -19.8,
      "sha": "67ceec1f40e1"
    },
    "音效/entity.player.hurt.3": {
      "duration": 0.656281,
      "peakDb": 0.3,
      "loudness": -19.7,
      "sha": "637b73c4218d"
    },
    "音效/entity.player.hurt_freeze.1": {
      "duration": 0.988021,
      "peakDb": -4.6,
      "loudness": -26.1,
      "sha": "ac3d80eb2051"
    },
    "音效/entity.player.splash.high_speed": {
      "duration": 3.026667,
      "peakDb": 0.1,
      "loudness": -16.9,
      "sha": "23465cd6325f"
    },
    "音效/entity.warden.sonic_boom.1": {
      "duration": 4,
      "peakDb": -1,
      "loudness": -15.3,
      "sha": "4bba573e07f6"
    },
    "音效/entity.warden.sonic_charge.1": {
      "duration": 1.625011,
      "peakDb": -0.8,
      "loudness": -14.3,
      "sha": "c0bef8632826"
    },
    "音效/entity.warden.sonic_charge.2": {
      "duration": 1.625011,
      "peakDb": -0.8,
      "loudness": -13.7,
      "sha": "2171ff1e7ec7"
    },
    "音效/entity.warden.sonic_charge.3": {
      "duration": 1.625011,
      "peakDb": -0.9,
      "loudness": -13.9,
      "sha": "9153a4bc071d"
    },
    "音效/entity.warden.sonic_charge.4": {
      "duration": 1.625011,
      "peakDb": -0.9,
      "loudness": -13.7,
      "sha": "8d235cd7ac4c"
    },
    "音效/entity.wither.shoot": {
      "duration": 1,
      "peakDb": 1.9,
      "loudness": -10.7,
      "sha": "a29d10700537"
    },
    "音效/item.totem.use": {
      "duration": 3.422667,
      "peakDb": 1.7,
      "loudness": -10.7,
      "sha": "9d3a53dd9c60"
    },
    "音效/item.trident.hit.1": {
      "duration": 0.489833,
      "peakDb": -1,
      "loudness": -21.3,
      "sha": "588390abee8e"
    },
    "音效/诡厄巫法/goety.abyss_prepare_spell.1": {
      "duration": 2.67059,
      "peakDb": -0.1,
      "loudness": -16.8,
      "sha": "8b61bca2044f"
    },
    "音效/诡厄巫法/goety.abyss_prepare_spell.2": {
      "duration": 2.554739,
      "peakDb": -0.4,
      "loudness": -16.8,
      "sha": "b38a5b8e8ede"
    },
    "音效/诡厄巫法/goety.abyss_prepare_spell.3": {
      "duration": 2.59458,
      "peakDb": -0.6,
      "loudness": -16.2,
      "sha": "588824f0d732"
    },
    "音效/诡厄巫法/goety.abyss_prepare_spell.4": {
      "duration": 3.189025,
      "peakDb": -0.3,
      "loudness": -16.8,
      "sha": "bc496c00616e"
    },
    "音效/诡厄巫法/goety.apostle_cast_spell.1": {
      "duration": 1.691995,
      "peakDb": 0.1,
      "loudness": -11.9,
      "sha": "497795f7a0ac"
    },
    "音效/诡厄巫法/goety.apostle_prepare_spell.1": {
      "duration": 3.871746,
      "peakDb": 0.5,
      "loudness": -10.1,
      "sha": "29c8a8dd5c2c"
    },
    "音效/诡厄巫法/goety.apostle_prepare_spell.2": {
      "duration": 3.871746,
      "peakDb": -3.7,
      "loudness": -17.1,
      "sha": "975dcc012094"
    },
    "音效/诡厄巫法/goety.blast_fungus_throw.1": {
      "duration": 0.985918,
      "peakDb": -1.7,
      "loudness": -21,
      "sha": "c3381a703aa4"
    },
    "音效/诡厄巫法/goety.cast_spell.1": {
      "duration": 1.254603,
      "peakDb": -6.5,
      "loudness": -25,
      "sha": "0aa0cebc1535"
    },
    "音效/诡厄巫法/goety.cast_spell.2": {
      "duration": 1.101859,
      "peakDb": -8,
      "loudness": -27,
      "sha": "e824c6f59409"
    },
    "音效/诡厄巫法/goety.cast_spell.3": {
      "duration": 1.973333,
      "peakDb": -2.1,
      "loudness": -19.8,
      "sha": "34a2b826f7b0"
    },
    "音效/诡厄巫法/goety.cast_spell.4": {
      "duration": 1.604,
      "peakDb": -5.3,
      "loudness": -21.3,
      "sha": "72e699b3f7d3"
    },
    "音效/诡厄巫法/goety.flight": {
      "duration": 2.322268,
      "peakDb": -28.5,
      "loudness": -43.2,
      "sha": "78a8002d908c"
    },
    "音效/诡厄巫法/goety.frost_prepare_spell.1": {
      "duration": 2.728798,
      "peakDb": -3.4,
      "loudness": -22,
      "sha": "f739096df7cb"
    },
    "音效/诡厄巫法/goety.frost_prepare_spell.2": {
      "duration": 2.437506,
      "peakDb": -9.5,
      "loudness": -26.3,
      "sha": "758354abdcaa"
    },
    "音效/诡厄巫法/goety.frost_prepare_spell.3": {
      "duration": 2.937506,
      "peakDb": -6.5,
      "loudness": -21.4,
      "sha": "54dfd6e27cae"
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
    },
    "音效/诡厄巫法/goety.heavy_woosh.3": {
      "duration": 1.104218,
      "peakDb": -2.2,
      "loudness": -16.9,
      "sha": "8374091aead9"
    },
    "音效/诡厄巫法/goety.ice_spike_cast": {
      "duration": 1.698005,
      "peakDb": -7.7,
      "loudness": -27.7,
      "sha": "78f61627ea6c"
    },
    "音效/诡厄巫法/goety.ice_spike_hit.1": {
      "duration": 1.05941,
      "peakDb": 0.6,
      "loudness": -21.7,
      "sha": "a6fd1cbe1911"
    },
    "音效/诡厄巫法/goety.poison_quill_impact.1": {
      "duration": 0.980839,
      "peakDb": -0.1,
      "loudness": -17.7,
      "sha": "cb59c979c978"
    },
    "音效/诡厄巫法/goety.poison_quill_vine_shoot.1": {
      "duration": 1.031247,
      "peakDb": -6,
      "loudness": -27.3,
      "sha": "a9f1105e25ab"
    },
    "音效/诡厄巫法/goety.prepare_spell.1": {
      "duration": 1.573152,
      "peakDb": -3.5,
      "loudness": -20.1,
      "sha": "8c464068f6ca"
    },
    "音效/诡厄巫法/goety.prepare_spell.2": {
      "duration": 1.573152,
      "peakDb": -1.8,
      "loudness": -18.5,
      "sha": "5353f7482db7"
    },
    "音效/诡厄巫法/goety.prepare_summon.1": {
      "duration": 3.488,
      "peakDb": -4.6,
      "loudness": -22.9,
      "sha": "96e683a5590c"
    },
    "音效/诡厄巫法/goety.prepare_summon.2": {
      "duration": 3.504671,
      "peakDb": -4.3,
      "loudness": -22.6,
      "sha": "76cff7f36bb0"
    },
    "音效/诡厄巫法/goety.quick_growing_vine_burrow.1": {
      "duration": 0.766916,
      "peakDb": -3.7,
      "loudness": -20.6,
      "sha": "68dc1752d5bc"
    },
    "音效/诡厄巫法/goety.rumble.1": {
      "duration": 4.101338,
      "peakDb": -1.7,
      "loudness": -17.9,
      "sha": "f04d3af3b59d"
    },
    "音效/诡厄巫法/goety.shock_cast.1": {
      "duration": 1.214354,
      "peakDb": -3.5,
      "loudness": -18.5,
      "sha": "4709dd3fb74b"
    },
    "音效/诡厄巫法/goety.soul_bolt_cast": {
      "duration": 0.729977,
      "peakDb": -10.9,
      "loudness": -24.6,
      "sha": "daec572f8f60"
    },
    "音效/诡厄巫法/goety.teleport_orb_throw": {
      "duration": 0.595556,
      "peakDb": -23.7,
      "loudness": -39.4,
      "sha": "351cd2f48c83"
    },
    "音效/诡厄巫法/goety.thunder_strike_fast.1": {
      "duration": 4.523356,
      "peakDb": 0.5,
      "loudness": -14.9,
      "sha": "e5c5aa0ca425"
    },
    "音效/诡厄巫法/goety.thunderbolt.1": {
      "duration": 2.239433,
      "peakDb": -1.5,
      "loudness": -16.3,
      "sha": "a56afeaa1f69"
    },
    "音效/诡厄巫法/goety.tooth_spawn.1": {
      "duration": 2.242177,
      "peakDb": 0.3,
      "loudness": -15.8,
      "sha": "5965ad5b6dc7"
    },
    "音效/诡厄巫法/goety.vex_vapor.1": {
      "duration": 1.63068,
      "peakDb": -18.1,
      "loudness": -37,
      "sha": "b43e964163c7"
    },
    "音效/诡厄巫法/goety.void_prepare_spell.1": {
      "duration": 1.813583,
      "peakDb": -13.1,
      "loudness": -26.6,
      "sha": "c7e2c6012e6d"
    },
    "音效/诡厄巫法/goety.void_prepare_spell.2": {
      "duration": 1.166667,
      "peakDb": -17.7,
      "loudness": -29.4,
      "sha": "af35143d1153"
    },
    "音效/诡厄巫法/goety.void_prepare_spell.4": {
      "duration": 1.454104,
      "peakDb": -16.3,
      "loudness": -28.5,
      "sha": "42255a3d54ee"
    },
    "音效/诡厄巫法/goety.wall_erupt.1": {
      "duration": 1.239592,
      "peakDb": -3.6,
      "loudness": -19.8,
      "sha": "7cad16462e1d"
    },
    "音效/诡厄巫法/goety.wild_prepare_spell": {
      "duration": 3.25,
      "peakDb": 0.3,
      "loudness": -12.7,
      "sha": "2a8f4667f472"
    },
    "音效/诡厄巫法/goety.wind.1": {
      "duration": 1.945625,
      "peakDb": -9.7,
      "loudness": -25.9,
      "sha": "99dfe31aad93"
    },
    "音效/诡厄巫法/goety.wind_blast.1": {
      "duration": 2.75,
      "peakDb": -3,
      "loudness": -17,
      "sha": "1db08eb10c93"
    },
    "音效/诡厄巫法/goety.zap.1": {
      "duration": 1.100385,
      "peakDb": -15.7,
      "loudness": -28.9,
      "sha": "7e0bcfbb3d70"
    }
  },
  "lines": {}
};
export default soundTable;
