// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "音效/entity.creeper.hurt.4": {
      "时长": 0.515782,
      "峰值": -0.5,
      "响度": -20.5,
      "sha": "72dbbc987301"
    },
    "音效/entity.generic.explode.3": {
      "时长": 3.25,
      "峰值": 1.2,
      "响度": -14.7,
      "sha": "6178b31e2001"
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
    "音效/entity.warden.hurt.3": {
      "时长": 2.763063,
      "峰值": -1.8,
      "响度": -16.6,
      "sha": "8da114446a8c"
    },
    "音效/entity.warden.sonic_charge.4": {
      "时长": 1.625011,
      "峰值": -0.9,
      "响度": -13.7,
      "sha": "8d235cd7ac4c"
    },
    "音效/item.elytra.flying": {
      "时长": 10.220333,
      "峰值": -12.3,
      "响度": -24.9,
      "sha": "0f51f0fd6647"
    }
  },
  "台词": {}
};
export default 表;
