// 史蒂夫关节核对（用户 11-10 定史蒂夫改绑骨骼、加关节）：中性底上摆本片的史蒂夫，先是一排肘、膝从 0 到 120 度的静姿势（各个角度看折得露不露缝），
// 再是用上关节的动作的连拍（跑、倒退、跳劈、后跳、挥剑、挣扎、挨打各切成几格排成一排）。视图表在 视图.ts。没有声音。
import { defineSeg } from '@engine/段/段定义.ts';
import { aspect, totalSec } from './视图.ts';

export default defineSeg({ 场: '核对', 秒: totalSec, 宽: aspect.宽, 高: aspect.高, 地形: [] });
