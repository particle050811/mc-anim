// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。
// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。
import type { SoundUrl } from '@engine/段/段画面.tsx';
import { privateMusic } from '@engine/audio/私有配乐.ts';
import soundTable from './声音表.生成.ts';

const soundUrl: SoundUrl = {
  urls: {
    "配乐/结算舞/DreamFunk忘情牛肉面": privateMusic("配乐/结算舞/DreamFunk忘情牛肉面"),
  },
  表: soundTable,
};
export default soundUrl;
