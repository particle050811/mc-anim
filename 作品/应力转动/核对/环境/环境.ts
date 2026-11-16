// 段.ts 之外声明环境的样子：纯数据（只引 engine/light/环境.ts、维度.ts），画面.tsx 里 <环境 描述={环境轨} 镜头 />。
// 这里是核对第 6～13 帧（一帧一个视图）：主世界、同一套灯和云，按关键帧阶跃换时刻和天气（正式段一般用线性或平滑，或 按游戏流速 算时刻）。第 12 帧是第 4 天（月相 3）。
import { defineEnvTrack } from '@engine/light/环境.ts';
import { overworld } from '@engine/light/维度.ts';
import { visibility } from './视图.ts';

export default defineEnvTrack(
  {
    base: {
      维度: overworld,
      画法: '主世界',
      gameTime: 1000,
      lightSpec: { tier: '主世界' },
      fog: { 种类: '指数平方', visibility },
      cloud: { 种类: 'photon', 海平面: -1 },
      shadow: { far: 1024 },
    },
    keyframes: [
      { 帧: 6, 时刻: 1000, 雨: 0, 雷: 0, easing: '阶跃' },
      { 帧: 7, 时刻: 6000, easing: '阶跃' },
      { 帧: 8, 时刻: 12600, easing: '阶跃' },
      { 帧: 9, 时刻: 18000, 雨: 0, 雷: 0, easing: '阶跃' },
      { 帧: 10, 时刻: 30000, 雨: 1, 雷: 1, easing: '阶跃' },
      { 帧: 11, 时刻: 18000, 雨: 0, 雷: 0, easing: '阶跃' },
      { 帧: 12, 时刻: 90000, easing: '阶跃' },
      { 帧: 13, 时刻: 22500 },
    ],
  },
  '核对-环境',
);
