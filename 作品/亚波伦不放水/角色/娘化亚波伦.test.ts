// 娘化亚波伦的声明：层、环境、眨眼、头发弹簧、贴图变体。字节在数据根 store（作品资产锁，anim extract 娘化亚波伦模型、娘化亚波伦动画 入的库）；没有就整组跳过。
import { describe, expect, it, vi } from 'vitest';
import { 动画姿势 } from '@engine/model/基岩实体.tsx';
import type { BedrockBone } from '@engine/model/基岩模型.tsx';
import { 定表演, 娘化亚波伦生物, 描边面, 站立, 静止环境, type 亚波伦表演 } from './娘化亚波伦.tsx';

// 娘化亚波伦.tsx 顶上的 asset: import 打包时由 webpack 内联，测试里换成 store 里的字节
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
  const 要 = ['模型/角色/娘化亚波伦', '动画/角色/娘化亚波伦/main', '动画/角色/娘化亚波伦/extra', ...['default', '2default', '3default', '4default', '5default'].map((n) => `贴图/角色/娘化亚波伦/${n}`)];
  const json = (id: string, 空: string) => ({ default: JSON.parse(读字节(id)?.toString('utf8') ?? 空) });
  // 没有字节时给一张 1×1 透明 PNG，模块能加载就行
  const 空图 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';
  const 图 = (id: string) => ({ default: `data:image/png;base64,${读字节(id)?.toString('base64') ?? 空图}` });
  return { json, 图, 有字节: 要.every((id) => 读字节(id)) };
});
vi.mock('asset:模型/角色/娘化亚波伦', () => json('模型/角色/娘化亚波伦', '{"texW":1,"texH":1,"bones":[]}'));
vi.mock('asset:动画/角色/娘化亚波伦/main', () => json('动画/角色/娘化亚波伦/main', '{"animations":{}}'));
vi.mock('asset:动画/角色/娘化亚波伦/extra', () => json('动画/角色/娘化亚波伦/extra', '{"animations":{}}'));
vi.mock('asset:贴图/角色/娘化亚波伦/default', () => 图('贴图/角色/娘化亚波伦/default'));
vi.mock('asset:贴图/角色/娘化亚波伦/2default', () => 图('贴图/角色/娘化亚波伦/2default'));
vi.mock('asset:贴图/角色/娘化亚波伦/3default', () => 图('贴图/角色/娘化亚波伦/3default'));
vi.mock('asset:贴图/角色/娘化亚波伦/4default', () => 图('贴图/角色/娘化亚波伦/4default'));
vi.mock('asset:贴图/角色/娘化亚波伦/5default', () => 图('贴图/角色/娘化亚波伦/5default'));
// 持杖挂的物品组件也带 asset: import，这组测试不看杖
vi.mock('../物品/下界魔杖.tsx', () => ({ 手持下界魔杖: () => null }));

const 姿势在 = (表演: 亚波伦表演, 秒: number, 未知?: Set<string>) => {
  const e = 表演.环境(秒);
  return 动画姿势(
    {
      文件: 娘化亚波伦生物.动画文件!,
      层们: 表演.层们(秒),
      口径: '通用',
      环境: { 查询: { ...静止环境.查询, ...e.查询 }, 外部: { ...静止环境.外部, ...e.外部 }, 函数: { 'ysm.second_order': 表演.二阶在(秒) }, 未知 },
    },
    秒,
  );
};
// 第 1 秒起水平速度从 0 跳到 20
const 前飞设定 = { 主: () => [{ 名: 'fly' }], 环境: (秒: number) => ({ 查询: { ground_speed: 秒 >= 1 ? 20 : 0 } }) };

describe.skipIf(!有字节)('娘化亚波伦', () => {
  it('动画文件：main 50 段加 extra 8 段', () => {
    const 名 = Object.keys(娘化亚波伦生物.动画文件!);
    expect(名.length).toBe(58);
    for (const n of ['idle', 'fly', 'attacked', 'pre_parallel0', 'parallel0', 'extra0', 'extra7']) expect(名).toContain(n);
  });

  it('站着、悬停、受击用到的查询和 ysm.* 都给了值', () => {
    const 未知 = new Set<string>();
    for (const 主 of ['idle', 'fly', 'attacked']) 姿势在(定表演({ 主: () => [{ 名: 主 }] }), 0.3, 未知);
    // 剩下的是包自己没赋值的变量（v.hv、v.hg、v.bg 全包没有一处赋值；v.bv 只有 idle、walk 这些赋），按 0 算
    expect([...未知].sort()).toEqual(['v.bg', 'v.bv', 'v.hg', 'v.hv']);
  });

  it('眨眼：0.15 秒眼皮缩没、眉毛往下，1 秒睁着', () => {
    const 闭 = 姿势在(站立, 0.15);
    // catmullrom 在两个 0 之间冲过头一点（魔法酒狐的眨眼也这样）
    expect(Math.abs((闭.LeftEyelid!.scale as number[])[1]!)).toBeLessThan(0.15);
    expect(闭.RightEyebrow!.pos![1]).toBeLessThan(-1.4);
    expect(姿势在(站立, 1).LeftEyelid!.scale).toEqual([1, 1, 1]);
  });

  it('站着不动：头发的弹簧一直是 0', () => {
    for (const 秒 of [0, 0.5, 7.3]) expect(姿势在(站立, 秒).MLongHair!.rot).toEqual([0, 0, 0]);
  });

  it('前飞：头发从 0 甩过头再停到 20 度，稳态直接到 20；取帧顺序不影响结果', () => {
    const 推 = 定表演(前飞设定);
    const 头发 = (表演: 亚波伦表演, 秒: number) => 姿势在(表演, 秒).MLongHair!.rot![0]!;
    const 后取 = 头发(推, 4);
    expect(头发(推, 0.9)).toBe(0);
    const 路上 = 头发(推, 1.1);
    expect(路上).toBeGreaterThan(0);
    expect(路上).toBeLessThan(20);
    expect(Math.max(...[1.2, 1.3, 1.4, 1.5].map((t) => 头发(推, t)))).toBeGreaterThan(20);
    expect(后取).toBeCloseTo(20, 2);
    expect(头发(推, 4)).toBe(后取);
    expect(头发(定表演(前飞设定), 1.1)).toBe(路上);
    expect(头发(定表演({ ...前飞设定, 弹簧: '稳态' }), 1.1)).toBe(20);
  });

  it('贴图变体：面纱、漩涡光环「加」只动那两块 UV', () => {
    const 原 = 娘化亚波伦生物.取模型({}).texture;
    const 加 = 娘化亚波伦生物.取模型({ 面纱: '加', 漩涡光环: '加' }).texture;
    const 透明 = (图: typeof 原, x: number, y: number) => 图.px[(y * 图.w + x) * 4 + 3] === 0;
    let 面纱 = 0;
    let 漩涡 = 0;
    for (let y = 0; y < 原.h; y++)
      for (let x = 0; x < 原.w; x++) {
        const i = (y * 原.w + x) * 4;
        const 变 = [0, 1, 2, 3].some((c) => 原.px[i + c] !== 加.px[i + c]);
        if (!变) continue;
        expect(透明(原, x, y)).toBe(true); // default 上这两块本来是空的，没盖掉原有的像素
        if (x >= 218 && x < 241 && y >= 339 && y < 372) 面纱++;
        else if (x >= 192 && x < 256 && y < 64) 漩涡++;
        else throw new Error(`块外的像素变了：${x},${y}`);
      }
    expect(面纱).toBeGreaterThan(100);
    expect(漩涡).toBeGreaterThan(100);
  });
  it('描边片（all_cutout 的面剔除）：环和浮块的零厚度片从模型里拿掉，另画的每一面都朝着芯；环是白边、浮块是黑边', () => {
    const 现 = 娘化亚波伦生物.取模型({});
    const 原骨 = (json('模型/角色/娘化亚波伦', '{}').default.bones as BedrockBone[]).filter((b) => /^ysmGlowbone(5[4-9]|6[01]|17[2-9])$/.test(b.name));
    expect(原骨.length).toBe(16);
    for (const 骨 of 原骨) {
      const 留 = 现.bones.find((b) => b.name === 骨.name)!.cubes!;
      expect(留.length).toBe(1);
      expect(留[0]!.size.every((v) => v > 0)).toBe(true);
      // 芯的中心（骨骼坐标，X 取负）
      const 芯 = 留[0]!;
      const 心 = [-(芯.origin[0] + 芯.size[0] / 2) + 骨.pivot[0], 芯.origin[1] + 芯.size[1] / 2 - 骨.pivot[1], 芯.origin[2] + 芯.size[2] / 2 - 骨.pivot[2]];
      const 面们 = 描边面(骨, 现.texture);
      const 环 = Number(骨.name.slice(11)) >= 172;
      // 环：每段四面，两个缺口端头（176、178）多一面；浮块六面
      expect(面们.length).toBe(环 ? (骨.name.endsWith('176') || 骨.name.endsWith('178') ? 5 : 4) : 6);
      for (const f of 面们) {
        expect(f.色).toEqual(环 ? [255, 255, 255] : [0, 0, 0]);
        const [a, b, , d] = f.角;
        const e1 = [d![0] - a![0], d![1] - a![1], d![2] - a![2]];
        const e2 = [b![0] - a![0], b![1] - a![1], b![2] - a![2]];
        const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        const 到心 = [心[0]! - a![0], 心[1]! - a![1], 心[2]! - a![2]];
        expect(n[0]! * 到心[0]! + n[1]! * 到心[1]! + n[2]! * 到心[2]!).toBeGreaterThan(0);
      }
    }
  });
});
