// 轰击（goety:bombardment_focus）的元数据和弹道。出处见 bombardment.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 火球一发 } from '../零件/甲/火球.ts';

/** 游戏里按住就一直放；片里一次演 5 发（每 6 刻一发），每发 3 颗 */
export const 轰击发数 = 5;
export const 轰击间隔刻 = 6;
export const 轰击弹 = (起点: 点, 目标: 点, 种子: number) => Array.from({ length: 轰击发数 }, (_, k) => 火球一发(起点, 目标, k * 轰击间隔刻, { 多颗: 2, 种子: 种子 * 13 + k })).flat();

const 时长 = (起点: 点, 目标: 点) => {
  const 弹们 = 轰击弹(起点, 目标, 0);
  const 命中秒 = 弹们[0]!.飞刻 / 20;
  return { 长秒: ((轰击发数 - 1) * 轰击间隔刻) / 20 + 命中秒 + 1.5, 命中秒 };
};

export default 定义法术元({
  id: 'bombardment',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // BombardmentSpell：每发 BLAZE_SHOOT
  声音: Array.from({ length: 轰击发数 }, (_, k) => ({ 资产: '音效/entity.blaze.shoot', 秒: (k * 轰击间隔刻) / 20 })),
});
