// 隐世之境重逢核对：第 15 句 49.96 你站在门口往屋里看（封面帧）的布景、她的站位、门光，按视图表一帧一个视图。
import { 定义段 } from '@engine/段/段定义.ts';
import { 画幅 } from '../../分镜.ts';
import { 视图们 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });
