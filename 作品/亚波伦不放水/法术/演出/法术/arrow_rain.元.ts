// 箭雨（goety:arrow_rain_focus）的元数据和弹的摆法。出处见 arrow_rain.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 落雨 } from '../零件/甲/落雨.ts';

/** 游戏里按住每刻落一支；片里一次演 2 秒共 40 支 */
export const 箭雨颗数 = 40;
export const 箭雨弹 = (目标: 点, 种子: number) => 落雨(目标, 箭雨颗数, 种子);

const 时长 = (_起点: 点, 目标: 点) => {
  const 落 = 箭雨弹(目标, 1).map((弹) => 弹.出刻 + 弹.飞刻);
  return { 长秒: Math.max(...落) / 20 + 1, 命中秒: Math.min(...落) / 20 };
};

export default 定义法术元({
  id: 'arrow_rain',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // ArrowRainSpell：每支一声 ARROW_SHOOT（音量 2），这里每 5 刻记一声
  声音: Array.from({ length: 箭雨颗数 / 5 }, (_, k) => ({ 资产: '音效/entity.arrow.shoot', 秒: (k * 5) / 20, 音量: 2 })),
});
