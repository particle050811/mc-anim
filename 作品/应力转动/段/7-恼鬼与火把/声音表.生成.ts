// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "音效/block.wood.place.4": {
      "时长": 0.5,
      "峰值": -6,
      "响度": -29.3,
      "sha": "de868b3119b0"
    },
    "音效/entity.arrow.shoot": {
      "时长": 0.455102,
      "峰值": -0.1,
      "响度": -21.4,
      "sha": "9492b5233938"
    },
    "音效/entity.evoker.cast_spell.1": {
      "时长": 1.973333,
      "峰值": -2.1,
      "响度": -19.8,
      "sha": "34a2b826f7b0"
    },
    "音效/entity.evoker.prepare_summon": {
      "时长": 3.488,
      "峰值": -4.6,
      "响度": -22.9,
      "sha": "96e683a5590c"
    },
    "音效/entity.vex.charge.1": {
      "时长": 1.926667,
      "峰值": -13.3,
      "响度": -27.8,
      "sha": "8f627f058f18"
    },
    "音效/entity.vex.charge.2": {
      "时长": 2.037333,
      "峰值": -13.8,
      "响度": -29.1,
      "sha": "6df5c659a4db"
    },
    "音效/entity.warden.angry.5": {
      "时长": 4.106042,
      "峰值": -6.7,
      "响度": -21.7,
      "sha": "6d6a95c28b7c"
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
