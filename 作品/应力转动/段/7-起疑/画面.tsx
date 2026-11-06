// 7-4-4 起疑：画面是 起疑.tsx（旧 7-4-4-起疑 登记的组件），声音照本段 段.ts 的 cue 放（定义画面 自动挂）。
import { 定义画面 } from '@engine/段/段画面.tsx';
import { Suspicion } from './起疑.tsx';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

export default 定义画面(段, 声音地址, Suspicion);
