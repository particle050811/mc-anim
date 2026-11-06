// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "音效/block.stone.step.2": {
      "时长": 0.484376,
      "峰值": -7,
      "响度": -33.9,
      "sha": "2cfbf8787436"
    },
    "音效/block.stone.step.5": {
      "时长": 0.562517,
      "峰值": -9.1,
      "响度": -31.3,
      "sha": "67b1e50426b2"
    },
    "音效/block.wood.step.1": {
      "时长": 0.492208,
      "峰值": -6.5,
      "响度": -27.5,
      "sha": "9f6425b71baa"
    },
    "音效/block.wood.step.3": {
      "时长": 0.562521,
      "峰值": -5.6,
      "响度": -30.6,
      "sha": "dc6f1450bd37"
    },
    "音效/block.wood.step.5": {
      "时长": 0.689958,
      "峰值": -6.4,
      "响度": -28.4,
      "sha": "f950e9c56383"
    },
    "音效/entity.villager.work_cartographer.1": {
      "时长": 0.716395,
      "峰值": -19.3,
      "响度": -33,
      "sha": "9c04646035a3"
    },
    "音效/entity.villager.work_cartographer.2": {
      "时长": 0.624989,
      "峰值": -17.9,
      "响度": -31.3,
      "sha": "2d08fc179561"
    },
    "音效/entity.villager.work_cartographer.3": {
      "时长": 0.75,
      "峰值": -16.1,
      "响度": -29.3,
      "sha": "b033cd33b977"
    },
    "音效/item.book.page_turn.3": {
      "时长": 0.537483,
      "峰值": -15.6,
      "响度": -36.3,
      "sha": "4715e14e54c5"
    },
    "音效/item.book.put.1": {
      "时长": 0.306984,
      "峰值": -15.4,
      "响度": -70,
      "sha": "c91d829d8e7b"
    }
  },
  "台词": {}
};
export default 表;
