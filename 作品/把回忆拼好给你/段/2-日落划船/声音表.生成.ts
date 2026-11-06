// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { 声音表 } from '@engine/段/声音助手.ts';

const 表: 声音表 = {
  "资产": {
    "配乐/把回忆拼好给你-无男声DJ": {
      "时长": 56.005011,
      "峰值": -1.1,
      "响度": -9.3,
      "sha": "c31621fc073a"
    },
    "音效/entity.player.splash.high_speed": {
      "时长": 3.026667,
      "峰值": 0.1,
      "响度": -16.9,
      "sha": "23465cd6325f"
    },
    "音效/把回忆拼好给你/entity.boat.paddle_water.1": {
      "时长": 0.901333,
      "峰值": -21.9,
      "响度": -40.7,
      "sha": "bad9396e5d3c"
    },
    "音效/把回忆拼好给你/entity.boat.paddle_water.2": {
      "时长": 0.850667,
      "峰值": -23.1,
      "响度": -38.7,
      "sha": "9c9dcd0edb8f"
    },
    "音效/把回忆拼好给你/entity.boat.paddle_water.3": {
      "时长": 1.001333,
      "峰值": -19.4,
      "响度": -36.1,
      "sha": "9190aec97afa"
    },
    "音效/把回忆拼好给你/entity.boat.paddle_water.4": {
      "时长": 1.037333,
      "峰值": -26.7,
      "响度": -41.8,
      "sha": "0c785a74ee0b"
    }
  },
  "台词": {}
};
export default 表;
