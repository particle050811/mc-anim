// 时差分屏核对：一帧一个视图（视图.ts），看第 13 句分屏那一帧（场/2-门口/时差分屏.tsx）的定稿和对比。
import { 定义段 } from '@engine/段/段定义.ts';
import { 画幅 } from '../../分镜.ts';
import { 视图们 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });
