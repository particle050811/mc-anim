// 6-1-3 起飞：照旧 6-1/段界.ts 的截拼（scene1Shot），截表的数是 1/24 秒一格，按秒放；
// 声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import { definePicture } from '@engine/段/段画面.tsx';
import { scene1Shot } from '../../场/6-暮色森林/6-1/分段.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

export default definePicture(seg, soundUrl, scene1Shot('6-1-3').component);
