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
    "音效/item.book.page_turn.2": {
      "duration": 0.699773,
      "peakDb": -20.9,
      "loudness": -36.7,
      "sha": "d16bd1c1a420"
    },
    "音效/万法皆通/wind_seeking_bell": {
      "duration": 2.069313,
      "peakDb": -4.3,
      "loudness": -11.9,
      "sha": "a43ff1f9b22e"
    },
    "音效/把回忆拼好给你/entity.glow_item_frame.remove_item.1": {
      "duration": 0.068333,
      "peakDb": -0.3,
      "loudness": -70,
      "sha": "8dac5bc8df9d"
    }
  },
  "lines": {}
};
export default soundTable;
