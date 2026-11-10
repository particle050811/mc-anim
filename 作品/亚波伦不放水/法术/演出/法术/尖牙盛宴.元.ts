// 尖牙盛宴（goety:feast_focus → FeastSpell）的元数据。出处见 尖牙盛宴.tsx。
import { 定义法术元 } from '../接口.ts';

/** 按住期间隔几刻咬一轮（SpellConfig.FeastDuration 默认 20）；片里演三轮 */
export const 盛宴间隔刻 = 20;
export const 盛宴轮数 = 3;
/** 每轮那颗牙 warmup 1：轮开始后第 2 刻开咬，再 8 刻结算 */
export const 盛宴开咬刻 = (轮: number) => 轮 * 盛宴间隔刻 + 2;

export default 定义法术元({
  id: 'feast',
  长秒: ((盛宴轮数 - 1) * 盛宴间隔刻 + 2 + 22 + 12) / 20,
  命中秒: (盛宴开咬刻(0) + 8) / 20,
  // 起手 CastingSound = EVOKER_PREPARE_ATTACK；每颗牙开咬 EVOKER_FANGS_ATTACK
  声音: [
    { 资产: '音效/entity.evoker.prepare_attack.1', 秒: 0 },
    ...Array.from({ length: 盛宴轮数 }, (_, k) => ({ 资产: '音效/entity.evoker_fangs.attack', 秒: 盛宴开咬刻(k) / 20, 音高: 0.95 })),
  ],
});
