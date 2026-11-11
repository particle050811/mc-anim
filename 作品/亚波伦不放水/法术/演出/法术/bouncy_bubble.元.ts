// 弹跳泡泡（goety:bouncy_bubble_focus）的元数据和弹道。出处见 bouncy_bubble.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 减, 加, 乘, 单位, 长, type 弹道 } from '../零件/弹道.ts';
import { 瞄点 } from '../零件/甲/共用.ts';

/**
 * BouncyBubble（SpellHurtingProjectile）：出手速度 = 视线 × 0.82；BouncyBubble.travel 覆写成每刻只 位 += 速、再减 getGravity()（返回 0），
 * 没有惯性和推力，所以一直是 0.82 格/刻匀速；
 * 碰到方块或人就反弹（这里照镜面反射算），弹满 6 次或活到 100 刻就爆。返回弹道、各次反弹的刻、爆的刻。
 */
export const 泡泡道 = (起点: 点, 目标: 点): { 道: 弹道; 弹刻: number[]; 爆刻: number } => {
  const 向 = 单位(减(瞄点(目标), 起点));
  const 表: 点[] = [起点];
  const 弹刻: number[] = [];
  let 速: 点 = 乘(向, 0.82);
  let 爆刻 = 100;
  for (let n = 0; n < 100; n++) {
    let 位 = 加(表[n]!, 速);
    const 碰人 = 长(减(位, 瞄点(目标))) < 0.75 && 速[0] * (目标[0] - 位[0]) + 速[1] * (目标[1] - 位[1]) > 0;
    const 碰地 = 位[2] <= 目标[2];
    if (碰人 || 碰地) {
      if (弹刻.length >= 6) {
        表.push(位);
        爆刻 = n + 1;
        break;
      }
      弹刻.push(n + 1);
      if (碰地) {
        位 = [位[0], 位[1], 目标[2]];
        速 = [速[0], 速[1], Math.abs(速[2])];
      } else {
        速 = [-速[0], -速[1], 速[2]];
      }
    }
    表.push(位);
  }
  return { 道: (n) => 表[Math.min(表.length - 1, Math.max(0, Math.floor(n)))]!, 弹刻, 爆刻 };
};

const 时长 = (起点: 点, 目标: 点) => {
  const { 弹刻, 爆刻 } = 泡泡道(起点, 目标);
  return { 长秒: 爆刻 / 20 + 1, 命中秒: (弹刻[0] ?? 爆刻) / 20 };
};

export default 定义法术元({
  id: 'bouncy_bubble',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // BouncyBubbleSpell：GENERIC_SPLASH；爆 BUBBLE_COLUMN_BUBBLE_POP、GENERIC_SPLASH（爆的时刻随距离变，这里按参考距离写死在 时长 之外，段里要准的用 泡泡道().爆刻）
  声音: [{ 资产: '音效/entity.generic.splash.1', 秒: 0 }],
});
