// 虚空闪（goety:void_flash_focus）的元数据和弹道。出处见 void_flash.tsx。
import { mulberry32 } from '@engine/core/数学.ts';
import { 定义法术元, type 点 } from '../接口.ts';
import { 抛射道 } from '../零件/甲/共用.ts';
import { 虚空震撞刻, type 虚空震 } from '../零件/甲/虚空震.ts';

/** VoidShockBomb（SpellThrowableProjectile）：从施法者头顶上 1 格抛出，出手 1.0 格/刻，阻力 0.99、重力 0.025；这里朝史蒂夫脚边的地面抛 */
export const 虚空闪炸弹道 = (起点: 点, 目标: 点) => 抛射道([起点[0], 起点[1], 起点[2] + 1], [目标[0] - 1.5, 目标[1], 目标[2]], 1.0, { 阻力: 0.99, 重力: 0.025 });
/** 落地生 8 颗虚空震弹：各自飘到 落点 + (−3～3, 3～6, −3～3) 的信号点，第 40 + i × 5 刻锁定 */
export const 虚空闪震 = (起点: 点, 目标: 点, 种子: number): 虚空震[] => {
  const { 道, 到刻 } = 虚空闪炸弹道(起点, 目标);
  const 落 = 道(到刻);
  const r = mulberry32(种子 * 43 + 5);
  const 整 = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  return Array.from({ length: 8 }, (_, i) => ({ 出刻: 到刻, 生位: 落, 悬位: [落[0] + 整(-3, 3), 落[1] + 整(-3, 3), 落[2] + 整(3, 6)] as const, 锁刻: 40 + i * 5 }));
};

const 时长 = (起点: 点, 目标: 点) => {
  const 震们 = 虚空闪震(起点, 目标, 1);
  const 撞 = 震们.map((震) => 震.出刻 + 虚空震撞刻(震, 目标));
  return { 长秒: Math.max(...撞) / 20 + 0.8, 命中秒: Math.min(...撞) / 20 };
};

export default 定义法术元({
  id: 'void_flash',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // VoidFlashSpell：HEAVY_WOOSH 音量 3、TELEPORT_ORB_THROW 音量 3；落地 DRAGON_FIREBALL_EXPLODE 音量 1.5、音高 0.75（落地时刻按参考距离写死）；撞上 FUNGUS_EXPLOSION
  声音: [
    { 资产: '音效/诡厄巫法/goety.heavy_woosh.1', 秒: 0, 音量: 3 },
    { 资产: '音效/诡厄巫法/goety.teleport_orb_throw', 秒: 0, 音量: 3 },
    { 资产: '音效/entity.dragon_fireball.explode.1', 秒: 虚空闪炸弹道([-10, 0, 7], [0, 0, 0]).到刻 / 20, 音量: 1.5, 音高: 0.75 },
    { 资产: '音效/诡厄巫法/goety.fungus_explosion.1', 秒: 0, 从命中: true },
  ],
});
