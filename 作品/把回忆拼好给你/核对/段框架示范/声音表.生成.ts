// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "配乐/把回忆拼好给你-抖音原声": {
      "时长": 56.005011,
      "峰值": 0.5,
      "响度": -9.3,
      "sha": "cf59eff8cbfa"
    },
    "音效/把回忆拼好给你/entity.firework_rocket.blast": {
      "时长": 1,
      "峰值": 1.1,
      "响度": -25.1,
      "sha": "9377171cf33d"
    },
    "音效/把回忆拼好给你/entity.firework_rocket.large_blast": {
      "时长": 2,
      "峰值": 0.5,
      "响度": -21.7,
      "sha": "f54e5fc9a082"
    },
    "音效/把回忆拼好给你/entity.firework_rocket.launch": {
      "时长": 1.625011,
      "峰值": -7.4,
      "响度": -24.6,
      "sha": "1505700bf51d"
    },
    "音效/把回忆拼好给你/entity.firework_rocket.twinkle": {
      "时长": 1.333878,
      "峰值": 1.4,
      "响度": -18.9,
      "sha": "0c2eaff9130e"
    }
  },
  "台词": {}
};
export default 表;
