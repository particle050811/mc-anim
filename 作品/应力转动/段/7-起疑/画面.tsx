// 7-4-4 起疑：画面是 起疑.tsx（旧 7-4-4-起疑 登记的组件），声音照本段 段.ts 的 cue 放（definePicture 自动挂）。
import { definePicture } from '@engine/段/段画面.tsx';
import { Suspicion } from './起疑.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

export default definePicture(seg, soundUrl, Suspicion);
