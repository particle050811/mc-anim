// 环境核对：<环境> 的暮色、主世界预设和现有组件（TwilightLighting、FlightSky + FlightFog）同场景同机位比，再看按时刻、天气变的新能力。一个视图 1/24 秒（视图.ts）。
import { 定义段 } from '@engine/段/段定义.ts';
import { 每秒视图, 视图们, 页宽, 页高 } from './视图.ts';

export default 定义段({ 场: '核对', 秒: Math.ceil((视图们.length / 每秒视图) * 60) / 60, 宽: 页宽, 高: 页高, 地形: [] });
