// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "音效/block.deepslate.fall.6": {
      "时长": 0.784458,
      "峰值": -4.5,
      "响度": -28.3,
      "sha": "2e71fb598007"
    },
    "音效/block.sculk.step.3": {
      "时长": 0.977104,
      "峰值": -12.6,
      "响度": -38,
      "sha": "ed2e94ae19c9"
    },
    "音效/block.sculk.step.5": {
      "时长": 1.390292,
      "峰值": -18.1,
      "响度": -38.3,
      "sha": "724cd274985c"
    },
    "音效/entity.arrow.hit.1": {
      "时长": 0.734376,
      "峰值": -0.3,
      "响度": -27.7,
      "sha": "31e05e73edb5"
    },
    "音效/entity.arrow.hit.2": {
      "时长": 0.75,
      "峰值": -0.1,
      "响度": -26.2,
      "sha": "fa7acce9893c"
    },
    "音效/entity.arrow.shoot": {
      "时长": 0.455102,
      "峰值": -0.1,
      "响度": -21.4,
      "sha": "9492b5233938"
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
    "音效/entity.illusioner.mirror_move.2": {
      "时长": 3.314667,
      "峰值": -0.4,
      "响度": -20.7,
      "sha": "6fdf13659e6f"
    },
    "音效/entity.illusioner.prepare_mirror": {
      "时长": 2.794667,
      "峰值": -11.5,
      "响度": -25.5,
      "sha": "0c5191a18513"
    },
    "音效/entity.warden.hurt.2": {
      "时长": 2.534958,
      "峰值": -1.3,
      "响度": -17.4,
      "sha": "3626ff733503"
    },
    "音效/entity.warden.hurt.4": {
      "时长": 2.441104,
      "峰值": -1.7,
      "响度": -18.7,
      "sha": "3bd28143b3ad"
    },
    "音效/entity.warden.tendril_clicks.4": {
      "时长": 1.791625,
      "峰值": -0.5,
      "响度": -17.9,
      "sha": "1cc999aeaa9f"
    },
    "音效/entity.warden.tendril_clicks.6": {
      "时长": 1.024104,
      "峰值": -2,
      "响度": -24.9,
      "sha": "f568609506ab"
    },
    "音效/irons_spellbooks.force_impact": {
      "时长": 0.894694,
      "峰值": -8.4,
      "响度": -22.9,
      "sha": "13d2bda18ea9"
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
