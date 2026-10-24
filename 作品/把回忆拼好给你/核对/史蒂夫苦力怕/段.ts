// 史蒂夫、苦力怕核对：一帧一个视图，看模型、贴图、几种原版姿势和第一人称的空手（库/角色/史蒂夫.tsx、库/角色/史蒂夫第一人称.tsx、库/生物/苦力怕.tsx）。
import { 定义段 } from '@engine/段/段定义.ts';
import { 画幅 } from '../../分镜.ts';
import { 视图们 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 画幅.宽, 高: 画幅.高, 地形: [] });
