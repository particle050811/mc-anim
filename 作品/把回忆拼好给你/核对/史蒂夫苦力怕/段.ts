// 史蒂夫、苦力怕核对：一秒一个视图，看模型、贴图、几种原版姿势和第一人称的空手（库/角色/史蒂夫.tsx、库/角色/史蒂夫第一人称.tsx、库/生物/苦力怕.tsx）。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect } from '../../分镜/时间.ts';
import { views } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: views.length, 宽: aspect.宽, 高: aspect.高, 地形: [] });
