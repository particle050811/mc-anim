// 合照核对：15 尾（场/2-隐世之境/合照.tsx）几帧静帧，第 0 帧是片尾 PCL 新图标要的新合照（干净帧）。按视图表一帧一个视图，不带声音、歌词。
import { 定义段 } from '@engine/段/段定义.ts';
import { 画幅 } from '../../分镜.ts';
import { 视图们 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });
