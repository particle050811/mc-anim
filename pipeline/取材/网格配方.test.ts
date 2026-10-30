import { describe, expect, it } from 'vitest';
import type { 资产锁 } from '../资产/资产锁.ts';
import { 检查 } from './提取.ts';
import { 分组, 网格步骤, 网格输出, 缺配方网格, 补网格配方文本, type 网格头 } from './网格配方.ts';
import { 可直接跑, 解析清单 } from './清单.ts';

const 条 = (sha: string) => ({ sha256: sha.repeat(64), 大小: 1, 库: 'store' as const, 后缀: '.json' });
const 已有配方 = `
[["取材"]]
"名称" = "小屋"
"需要" = []
"要开游戏" = true
"公开版" = "不提取"
"步骤" = [["mcai", "mesh", "from=0,0,0", "to=1,1,1", "out=src/模型/场景/小屋.网格"]]
["取材"."产物"]
"网格/小屋/头" = "src/模型/场景/小屋.网格.json"
`;
const 头们: Record<string, 网格头> = {
  a: { dim: 'minecraft:overworld', from: [-10, -60, 0], to: [9, 4, 19], origin: [0, -50, 10], markers: { 'minecraft:chest': [], 'quark:ancient_chest': [] } },
  b: { dim: 'twilightforest:twilight_forest', from: [0, 0, 0], to: [1, 1, 1], origin: [0.5, 0, 0.5] },
  c: { dim: 'minecraft:overworld', from: [0, 0, 0], to: [3, 3, 3], origin: [0, 0, 0], 取材: { 参数: { structure: 'minecraft:village_plains', entities: 'all' } } },
};
const 锁: 资产锁 = {
  '网格/小屋/头': 条('0'),
  '网格/城/东1/头': 条('a'),
  '网格/城/东1/顶点': 条('1'),
  '网格/城/东1/图集': 条('2'),
  '网格/塔/头': 条('b'),
  '网格/塔/顶点': 条('3'),
  '贴图/别的': 条('4'),
};
const 读头 = (e: 资产锁[string]) => {
  const h = 头们[e.sha256[0]!];
  if (!h) throw new Error('不在库里');
  return h;
};

describe('地标网格配方反填', () => {
  const q = 解析清单(已有配方, '');

  it('只挑锁里有头、没有配方产出的；out 照资产表旧路径，产物只列锁里有的', () => {
    const 表 = new Map([['网格/城/东1/头', { 旧路径: '参考模型库/src/模型/场景/城-东1.网格.json' }]]);
    const { 网格, 读不到 } = 缺配方网格(q, [[锁, undefined]], 表, 读头);
    expect(读不到).toEqual([]);
    expect(网格.map((g) => g.基)).toEqual(['网格/城/东1', '网格/塔']);
    expect(网格[0]!.产物).toEqual({ '网格/城/东1/图集': 'src/模型/场景/城-东1.网格.png', '网格/城/东1/头': 'src/模型/场景/城-东1.网格.json', '网格/城/东1/顶点': 'src/模型/场景/城-东1.网格.bin' });
    expect(网格[1]!.产物).toEqual({ '网格/塔/头': 'src/模型/场景/塔.网格.json', '网格/塔/顶点': 'src/模型/场景/塔.网格.bin' });
    expect(网格输出('网格/城/西/2')).toBe('src/模型/场景/城-西-2.网格');
  });

  it('步骤：镜头切到维度、挪到范围上方，mesh 带 from/to/origin 和找到的标记；头里记了原样参数就照抄', () => {
    const g = { 基: '网格/城/东1', 头: 头们.a!, 产物: { '网格/城/东1/头': 'src/x.网格.json' } };
    expect(网格步骤(g)).toEqual([
      ['mcai', 'cam', 'pos=0,34,10', 'pitch=90', 'yaw=180', 'dim=minecraft:overworld'],
      ['mcai', 'mesh', 'from=-10,-60,0', 'to=9,4,19', 'origin=0,-50,10', 'mark=minecraft:chest,quark:ancient_chest', 'out=src/x.网格'],
    ]);
    expect(网格步骤({ ...g, 头: 头们.c! })[1]).toEqual(['mcai', 'mesh', 'structure=minecraft:village_plains', 'entities=all', 'out=src/x.网格']);
  });

  it('按第一段分组成配方，文本能解析回来：不重导、要开游戏，--全部 不选，--检查 只查产物', () => {
    const { 网格 } = 缺配方网格(q, [[锁, undefined]], new Map(), 读头);
    const 组 = 分组(网格, new Set(q.条目.keys()));
    expect([...组.keys()]).toEqual(['城网格', '塔网格']);
    expect([...分组(网格, new Set(['塔网格'])).keys()]).toEqual(['城网格', '塔网格（反填）']);
    const q2 = 解析清单(已有配方 + 补网格配方文本(组), '');
    const e = q2.条目.get('城网格')!;
    expect(e.不重导).toMatch(/旧网格不重导/);
    expect(e.要开游戏).toBe(true);
    expect(e.步骤).toHaveLength(2);
    expect(可直接跑(e)).toBe(false);
    // 反填之后都有配方了
    expect(缺配方网格(q2, [[锁, undefined]], new Map(), 读头).网格).toEqual([]);
    const r = 检查(q2, [e], false, 锁, '示例');
    expect(r.不重导).toEqual(['城网格']);
    expect(r.问题.filter((x) => !/字节不在库里/.test(x))).toEqual([]);
  });

  it('作品锁里的网格配方写「作品」；字节不在库里的报读不到', () => {
    const 作品锁: 资产锁 = { '网格/院/头': 条('b'), '网格/坏/头': 条('9') };
    const { 网格, 读不到 } = 缺配方网格(q, [[{}, undefined], [作品锁, '示例']], new Map(), 读头);
    expect(读不到).toEqual(['网格/坏/头']);
    const q2 = 解析清单(补网格配方文本(分组(网格, new Set())), '');
    expect(q2.条目.get('院网格')?.作品).toBe('示例');
  });
});
