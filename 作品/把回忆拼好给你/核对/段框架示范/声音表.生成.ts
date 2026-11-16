// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。
import type { SoundTable } from '@engine/段/声音助手.ts';

const soundTable: SoundTable = {
  "asset": {
    "配乐/把回忆拼好给你-无男声DJ": {
      "duration": 56.005011,
      "peakDb": -1.1,
      "loudness": -9.3,
      "sha": "c31621fc073a"
    },
    "音效/把回忆拼好给你/entity.firework_rocket.blast": {
      "duration": 1,
      "peakDb": 1.1,
      "loudness": -25.1,
      "sha": "9377171cf33d"
    },
    "音效/把回忆拼好给你/entity.firework_rocket.large_blast": {
      "duration": 2,
      "peakDb": 0.5,
      "loudness": -21.7,
      "sha": "f54e5fc9a082"
    },
    "音效/把回忆拼好给你/entity.firework_rocket.launch": {
      "duration": 1.625011,
      "peakDb": -7.4,
      "loudness": -24.6,
      "sha": "1505700bf51d"
    },
    "音效/把回忆拼好给你/entity.firework_rocket.twinkle": {
      "duration": 1.333878,
      "peakDb": 1.4,
      "loudness": -18.9,
      "sha": "0c2eaff9130e"
    }
  },
  "lines": {}
};
export default soundTable;
