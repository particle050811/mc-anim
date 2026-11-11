// 第 4 幕的打击停顿落到真编排上（用户 11-11 定照 Linker 打戏知识库来）：索命劈中那 16 帧她的姿势、杖尖和他的样子都定住、索命的电弧也定住，
// 别的法术、盘照走。盘从第一帧就张着（第 2 幕末已张开）、连放的格一直亮着；他一直被结界钉着、死在幕末。只算位置和姿势，模型、贴图给空的。
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
const { 秒在, 演, 史蒂夫状态在, 出手表, 轮盘参, 结界设定 } = 编;
const { 停索命, 出手起, 第二幕末盘刻, 连放表, 死, 幕长 } = 拍模;
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

  it('只有索命和撕裂带自己的钟；停顿里索命定住，盘照转', () => {
    expect([...new Set(出手表.filter((x) => x.钟).map((x) => x.id))].sort()).toEqual(['killing', 'rupture']);
    const 索 = 出手表.find((x) => x.id === 'killing')!;
    const 起 = 秒在(停索命.起);
    expect(索.钟!(起 + 10 * 帧)).toBeCloseTo(起, 9);
    expect(索.钟!(起 + 20 * 帧)).toBeCloseTo(起 + 4 * 帧, 9);
    expect(轮盘参(起 + 10 * 帧).刻).not.toBe(轮盘参(起).刻);
  });
});

describe('第 4 幕开头接第 2 幕末', () => {
  it('盘第一帧就张着（第 2 幕末的转角接着转），连放的格一直亮着，每出手一发那一格闪一下', () => {
    const 参 = 轮盘参(秒在(0));
    expect(参.刻).toBeCloseTo(第二幕末盘刻, 9);
    expect(参.开合?.转起刻 ?? 0).toBe(0);
    expect(参.选中?.length ?? 0).toBeGreaterThanOrEqual(连放表.length);
    expect(Object.keys(轮盘参(秒在(出手起) + 帧).闪 ?? {}).length).toBeGreaterThan(0);
  });

  it('出手不挥杖（用户 11-11「甩法术面板的镜头很诡异」）：连放一整幕杖一帧里转不过 8 度，盘不甩', () => {
    let 最小 = 1;
    for (let t = 秒在(0); t < 秒在(幕长); t += 帧) {
      const [a, b] = [演.杖(t).轴, 演.杖(t + 帧).轴];
      最小 = Math.min(最小, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
    }
    console.log(`杖一帧最多转 ${((Math.acos(Math.min(1, 最小)) * 180) / Math.PI).toFixed(2)} 度`);
    expect(最小).toBeGreaterThan(Math.cos((8 * Math.PI) / 180));
  });

  it('结界：和第一轮一起扔出，罩到他死就没了，不收缩焚烧', () => {
    expect(结界设定.收缩焚烧秒).toBe(0);
    expect(编.扔).toBeCloseTo(秒在(出手起), 9);
    expect(史蒂夫状态在(秒在(死) - 帧).死后秒).toBeUndefined();
    expect(史蒂夫状态在(秒在(死) + 帧).死后秒).toBeCloseTo(帧, 9);
  });
});
