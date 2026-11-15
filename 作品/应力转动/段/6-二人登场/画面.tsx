// 6-3-8 二人登场：画面按秒放，台词、音效照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出。
import { definePicture } from '@engine/段/段画面.tsx';
import { TwoArrive } from './二人登场.tsx';
import segment from './段.ts';
import soundUrl from './声音地址.生成.ts';

export default definePicture(segment, soundUrl, TwoArrive);
