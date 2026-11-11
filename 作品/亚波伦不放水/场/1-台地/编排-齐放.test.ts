// 第 4 幕的打击停顿落到真编排上（用户 11-11 定照 Linker 打戏知识库来）：索命劈中那 16 帧她的姿势、杖尖和他的样子都定住、索命的电弧也定住，
// 别的法术、盘照走；冰川砸中那 10 帧只有他和冰块定住。只算位置和姿势，模型、贴图给空的。
import { describe, expect, it, vi } from 'vitest';

const 空图 = { default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==' };
vi.mock('asset:模型/角色/巨人', () => ({ default: { models: { 宽: { texW: 64, texH: 64, parts: [] } } } }));
vi.mock('asset:贴图/角色/巨人/史蒂夫', () => 空图);
// 杖挂在 RightHandLocator 上：给一根右臂、一个手的定位骨，杖尖位置只要停顿前后可比
vi.mock('asset:模型/角色/娘化亚波伦', () => ({
  default: { texW: 1, texH: 1, bones: [{ name: 'MAllBody', pivot: [0, 12, 0] }, { name: 'RightArm', parent: 'MAllBody', pivot: [-5, 22, 0] }, { name: 'RightForeArm', parent: 'RightArm', pivot: [-6, 17, 0] }, { name: 'RightHandLocator', parent: 'RightForeArm', pivot: [-6, 12, 0] }] },
}));
// 她的姿势要取动画：用到的几段给空的（只比停顿前后一样不一样，不看具体转角）
vi.mock('asset:动画/角色/娘化亚波伦/main', () => ({
  default: { animations: Object.fromEntries(['pre_parallel0', 'pre_parallel1', 'pre_parallel2', 'parallel0', 'parallel1', 'idle', 'fly'].map((名) => [名, { loop: true, bones: {} }])) },
}));
vi.mock('asset:动画/角色/娘化亚波伦/extra', () => ({ default: { animations: {} } }));
vi.mock('asset:模型/物品/下界魔杖', () => ({ default: {} }));
// 多圈轮盘一 import 就要上百张聚晶图标；这里只用它算盘的外半径
vi.mock('../../界面/多圈轮盘.tsx', () => ({ 轮盘外半径: () => 100 }));
vi.mock('asset:贴图/角色/娘化亚波伦/default', () => 空图);
vi.mock('asset:贴图/角色/娘化亚波伦/5default', () => 空图);
vi.mock('asset:贴图/角色/娘化亚波伦/4default', () => 空图);
vi.mock('asset:贴图/角色/娘化亚波伦/3default', () => 空图);
vi.mock('asset:贴图/角色/娘化亚波伦/2default', () => 空图);
vi.mock('asset:贴图/特效/晋升之环/halo', () => 空图);
vi.mock('asset:贴图/物品/下界魔杖', () => 空图);

const 编 = await import('./编排-齐放.ts');
const 拍模 = await import('./齐放拍.ts');
const { 秒在, 拍, 演, 史蒂夫状态在, 出手表, 轮盘参 } = 编;
const { 停索命, 停冰砸 } = 拍模;
const 帧 = 1 / 60;
/** 数取到 1e-9（停顿里的钟是减出来的，差在 1e-15 上） */
const 印 = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 + 0 : v));
/** 他这一刻的样子里会动的几样 */
const 他样 = (t: number) => {
  const s = 史蒂夫状态在(t);
  return 印([s.位置, s.朝向, s.看, s.秒, s.挥剑秒, s.受击秒, s.蓄力, s.死后秒, s.左手]);
};
const 她样 = (t: number) => 印([演.在(t).属性.pose, 演.在(t).属性.姿势, 演.杖(t).尖]);

describe('第 4 幕打击停顿', () => {
  it('索命劈中：16 帧里她、他定住，过了停顿接着动', () => {
    const 起 = 秒在(停索命.起);
    for (let f = 1; f <= 16; f++) {
      expect(她样(起 + f * 帧)).toBe(她样(起));
      expect(他样(起 + f * 帧)).toBe(他样(起));
    }
    expect(她样(起 + 18 * 帧)).not.toBe(她样(起));
    expect(他样(起 + 18 * 帧)).not.toBe(他样(起));
  });

  it('冰川砸中：10 帧里他定住、她照飞', () => {
    const 起 = 秒在(停冰砸.起);
    for (let f = 1; f <= 10; f++) expect(他样(起 + f * 帧)).toBe(他样(起));
    expect(她样(起 + 5 * 帧)).not.toBe(她样(起));
  });

  it('只有索命、冰川两发带自己的钟；停顿里它们定住，盘照转', () => {
    expect(出手表.filter((x) => x.钟).map((x) => x.id).sort()).toEqual(['iceology', 'killing']);
    const 索 = 出手表.find((x) => x.id === 'killing')!;
    const 起 = 秒在(停索命.起);
    expect(索.钟!(起 + 10 * 帧)).toBeCloseTo(起, 9);
    expect(索.钟!(起 + 20 * 帧)).toBeCloseTo(起 + 4 * 帧, 9);
    expect(轮盘参(起 + 10 * 帧)!.刻).not.toBe(轮盘参(起)!.刻);
  });

  it('施法一招：挥到位那一帧之前 5 帧线性挥、再之前蓄势', () => {
    const 到 = 秒在(拍.放);
    expect(演.在(到).过渡).toMatchObject({ 到: '开盘', 比: 1 });
    expect(演.在(到 - 2.5 * 帧).过渡.比).toBeCloseTo(0.5, 9);
    expect(演.在(到 - 6 * 帧).过渡.到).toBe('蓄势');
  });
});
