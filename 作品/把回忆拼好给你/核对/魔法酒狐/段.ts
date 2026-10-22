// 魔法酒狐核对：模型挂上来，按视图表一帧一个视图出静帧，和 jar 里的贴图、游戏截图比。
import { 定义段 } from '@engine/段/段定义.ts';
import { 视图们, 页宽, 页高 } from './视图.ts';

export default 定义段({ 场: '核对', 帧数: 视图们.length, fps: 1, 宽: 页宽, 高: 页高, 地形: [] });
