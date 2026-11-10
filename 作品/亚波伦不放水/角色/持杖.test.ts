// 持杖的默认摆法「斜举」（用户 11-10 定）：不给姿势时杖在身体右侧、杖头朝斜上前方；显式给姿势的不受影响。
// 坐标：pose 取原点、yaw 0，她面朝 +Y、右手边是 +X、上是 +Z（单位格）。字节在数据根 store，没有就整组跳过。
import { describe, expect, it, vi } from 'vitest';
import { 右手心, 悬停, 持杖位姿, 斜举, 站立 } from './娘化亚波伦.tsx';

const { json, 图, 有字节 } = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { 字节路径, 读资产锁 } = await import('../../../pipeline/资产/资产锁.ts');
  const 锁 = 读资产锁(path.join(import.meta.dirname, '..', '资产锁'));
  const 读字节 = (id: string): Buffer | undefined => {
    const e = 锁[id];
    const f = e && 字节路径(e);
    return f && fs.existsSync(f) ? fs.readFileSync(f) : undefined;
  };
  const 要 = ['模型/角色/娘化亚波伦', '动画/角色/娘化亚波伦/main', '动画/角色/娘化亚波伦/extra'];
  const json = (id: string, 空: string) => ({ default: JSON.parse(读字节(id)?.toString('utf8') ?? 空) });
  // 这组只算骨骼，贴图给一张 1×1 透明 PNG
  const 图 = () => ({ default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==' });
  return { json, 图, 有字节: 要.every((id) => 读字节(id)) };
});
vi.mock('asset:模型/角色/娘化亚波伦', () => json('模型/角色/娘化亚波伦', '{"texW":1,"texH":1,"bones":[]}'));
vi.mock('asset:动画/角色/娘化亚波伦/main', () => json('动画/角色/娘化亚波伦/main', '{"animations":{}}'));
vi.mock('asset:动画/角色/娘化亚波伦/extra', () => json('动画/角色/娘化亚波伦/extra', '{"animations":{}}'));
vi.mock('asset:贴图/角色/娘化亚波伦/default', 图);
vi.mock('asset:贴图/角色/娘化亚波伦/2default', 图);
vi.mock('asset:贴图/角色/娘化亚波伦/3default', 图);
vi.mock('asset:贴图/角色/娘化亚波伦/4default', 图);
vi.mock('asset:贴图/角色/娘化亚波伦/5default', 图);
vi.mock('asset:模型/物品/下界魔杖', () => ({ default: {} }));
vi.mock('asset:贴图/物品/下界魔杖', 图);

const 原点 = { loc: [0, 0, 0], yaw: 0 };
const 离竖直 = (轴: readonly number[]) => (Math.acos(轴[2]!) * 180) / Math.PI;

describe.skipIf(!有字节)('持杖的默认摆法（斜举）', () => {
  it('站立：不给姿势，杖头朝斜上、往外、往前，和竖直 30～45 度；杖头在头的右侧外面、不低于头，杖尾也在身体右侧', () => {
    for (const 秒 of [0, 0.5, 1.5, 2.6]) {
      const 杖 = 持杖位姿({ pose: 原点, 秒, 表演: 站立 });
      expect(离竖直(杖.轴)).toBeGreaterThan(30);
      expect(离竖直(杖.轴)).toBeLessThan(45);
      expect(杖.轴[0]).toBeGreaterThan(0.2);
      expect(杖.轴[1]).toBeGreaterThan(0.2);
      // 头宽 ±0.15 格、帽檐 ±0.35 格，头的轴心高 1.45 格
      expect(杖.尖[0]).toBeGreaterThan(0.7);
      expect(杖.尖[2]).toBeGreaterThan(1.6);
      expect(杖.尾[0]).toBeGreaterThan(0.25);
    }
  });

  it('悬停（fly）：不给姿势用 斜举.飞，杖头朝上、朝她右边、朝前，整根杖在身体右侧；原动作（右手合在胸前）不是这样', () => {
    for (const 秒 of [0, 0.75, 1.4, 2.4]) {
      const 杖 = 持杖位姿({ pose: 原点, 秒, 表演: 悬停 });
      expect(离竖直(杖.轴)).toBeGreaterThan(45);
      expect(离竖直(杖.轴)).toBeLessThan(65);
      expect(杖.轴[0]).toBeGreaterThan(0.6);
      expect(杖.轴[1]).toBeGreaterThan(0.1);
      // fly 里头偏到右边 0.42 格、帽顶到 0.85 格上下；握杖改成杖身垂直小臂后手往里收了约 0.19 格，杖尖最里到 1.23
      expect(杖.尖[0]).toBeGreaterThan(1.15);
      expect(杖.尾[0]).toBeGreaterThan(0.2);
    }
    expect(持杖位姿({ pose: 原点, 秒: 0.75, 表演: 悬停, 姿势: {} }).尖[0]).toBeLessThan(0.8);
  });

  it('显式给姿势的不受默认影响：给空姿势就是动画原样（idle 垂手，杖头朝正前），给 斜举.站 和不给一样', () => {
    const 垂手 = 持杖位姿({ pose: 原点, 秒: 0, 表演: 站立, 姿势: {} });
    expect(垂手.轴[1]).toBeCloseTo(1, 3);
    expect(持杖位姿({ pose: 原点, 秒: 0.5, 表演: 站立, 姿势: 斜举.站 })).toEqual(持杖位姿({ pose: 原点, 秒: 0.5, 表演: 站立 }));
  });

  it('杖握在手里（用户 11-10）：杖身的中轴穿过手心，站立斜举、飞行斜举、手腕另转的姿势都是；旧握法（不修正）离手心半个像素以上', () => {
    const 离轴 = (杖: { 尖: readonly number[]; 轴: readonly number[] }, 点: readonly number[]) => {
      // 杖尖比杖身中轴偏 0.5 个物品像素（杖头居中、杖身不居中），换成格是 0.5 × 0.7 / 16 ≈ 0.022
      const d = 点.map((v, i) => v - 杖.尖[i]!);
      const 沿 = d.reduce((和, v, i) => 和 + v * 杖.轴[i]!, 0);
      return Math.hypot(...d.map((v, i) => v - 沿 * 杖.轴[i]!));
    };
    const 一像素 = 0.7 / 16;
    for (const 设 of [
      { 表演: 站立, 秒: 0.5 },
      { 表演: 悬停, 秒: 1.4 },
      { 表演: 站立, 秒: 0.5, 姿势: { RightArm: { rot: [-20, 0, -60] }, RightHand: { rot: [90, 0, 0] } } },
      { 表演: 站立, 秒: 0.5, 姿势: { RightArm: { rot: [-60, 0, 30] }, RightHand: { rot: [30, -50, 20] } } },
    ]) {
      const 参 = { pose: 原点, ...设 };
      expect(离轴(持杖位姿(参), 右手心(参))).toBeLessThan(0.6 * 一像素);
      expect(离轴(持杖位姿({ ...参, 旧握法: true }), 右手心(参))).toBeGreaterThan(0.6 * 一像素);
    }
  });
});
