// 卫射（goety:prisma_beam_focus）的元数据。出处见 卫射.tsx。
import { 定义法术元, type 法术选项, type 点 } from '../接口.ts';

/** SpellConfig.PrismaBeamDuration 默认 80 刻：激光照满这么久才结算伤害 */
export const 卫射蓄刻 = 80;
/** 这一发照多少刻：给了 施法刻 照它（晋升之环 4 倍施法速度时 80 → 20），不给照默认 80 */
export const 卫射照刻 = (选项?: 法术选项) => 选项?.施法刻 ?? 卫射蓄刻;
/** 激光指着目标半身高 */
export const 卫射落点 = (目标: 点): 点 => [目标[0], 目标[1], 目标[2] + 0.9];

export default 定义法术元({
  id: 'prisma_beam',
  // 这个法术的画面全在蓄力的 80 刻里（激光一直照着），照满的那一刻结算伤害、激光消失；所以这里的「出手」是开始照
  长秒: (卫射蓄刻 + 1) / 20,
  命中秒: 卫射蓄刻 / 20,
  时长: (_起点, _目标, 选项) => ({ 长秒: (卫射照刻(选项) + 1) / 20, 命中秒: 卫射照刻(选项) / 20 }),
  // PrismaBeamSpell 没有自己的声音（CastingSound、SpellResult 里都没放）
  声音: [],
});
