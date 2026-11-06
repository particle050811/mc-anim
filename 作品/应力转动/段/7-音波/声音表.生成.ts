// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "音效/entity.arrow.hit.1": {
      "时长": 0.734376,
      "峰值": -0.3,
      "响度": -27.7,
      "sha": "31e05e73edb5"
    },
    "音效/entity.creeper.hurt.3": {
      "时长": 0.461179,
      "峰值": -8.2,
      "响度": -28.3,
      "sha": "ffcc84fa087b"
    },
    "音效/entity.generic.explode.1": {
      "时长": 2.5,
      "峰值": -0.3,
      "响度": -12.6,
      "sha": "ec6fe52205a8"
    },
    "音效/entity.generic.explode.3": {
      "时长": 3.25,
      "峰值": 1.2,
      "响度": -14.7,
      "sha": "6178b31e2001"
    },
    "音效/entity.generic.explode.4": {
      "时长": 3.25,
      "峰值": -0.1,
      "响度": -16.3,
      "sha": "0524d95e0f8d"
    },
    "音效/entity.horse.gallop.3": {
      "时长": 0.500023,
      "峰值": 0.3,
      "响度": -17.5,
      "sha": "e8a26fc805b8"
    },
    "音效/entity.horse.gallop.4": {
      "时长": 0.531293,
      "峰值": 1,
      "响度": -14,
      "sha": "01704b35910c"
    },
    "音效/entity.horse.jump": {
      "时长": 0.500023,
      "峰值": -0.1,
      "响度": -21.4,
      "sha": "3f1abd7a2e21"
    },
    "音效/entity.horse.land": {
      "时长": 0.75,
      "峰值": 0.4,
      "响度": -19.2,
      "sha": "e92a4e181025"
    },
    "音效/entity.illusioner.cast_spell.1": {
      "时长": 1.973333,
      "峰值": -2.1,
      "响度": -19.8,
      "sha": "34a2b826f7b0"
    },
    "音效/entity.player.hurt.2": {
      "时长": 0.437506,
      "峰值": 1.2,
      "响度": -19.8,
      "sha": "67ceec1f40e1"
    },
    "音效/entity.warden.hurt.3": {
      "时长": 2.763063,
      "峰值": -1.8,
      "响度": -16.6,
      "sha": "8da114446a8c"
    },
    "音效/entity.warden.hurt.4": {
      "时长": 2.441104,
      "峰值": -1.7,
      "响度": -18.7,
      "sha": "3bd28143b3ad"
    },
    "音效/entity.warden.sonic_boom.4": {
      "时长": 4,
      "峰值": -1,
      "响度": -14.8,
      "sha": "0e0a886e1e78"
    },
    "音效/entity.warden.sonic_charge.4": {
      "时长": 1.625011,
      "峰值": -0.9,
      "响度": -13.7,
      "sha": "8d235cd7ac4c"
    }
  },
  "台词": {}
};
export default 表;
