// 7-4-3 回城报告：画面是 报告.tsx（旧 7-4-3-报告 登记的组件），声音照本段 段.ts 的 cue 放（定义画面 自动挂）。
import { 定义画面 } from '@engine/段/段画面.tsx';
import { Report } from './报告.tsx';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

export default 定义画面(段, 声音地址, Report);
