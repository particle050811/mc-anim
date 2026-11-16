// 环境核对：<环境> 的暮色、主世界预设和现有组件（TwilightLighting、FlightSky + FlightFog）同场景同机位比，再看按时刻、天气变的新能力。一帧一个视图（视图.ts）。
import { defineSeg } from '@engine/段/段定义.ts';
import { viewFps, views, pageWidth, pageHeight } from './视图.ts';

export default defineSeg({ scene: '核对', sec: views.length / viewFps, width: pageWidth, height: pageHeight, terrain: [] });
