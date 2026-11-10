import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 解析清单 } from './清单.ts';
import { 建来源表, 是错, 核对粒子帧, 列粒子, 算粒子帧, 读生成头, 解析粒子名, type 两侧锁 } from './粒子帧.ts';
import type { 资产锁 } from '../资产/资产锁.ts';

const 配方 = `
[["取材"]]
"名称" = "库粒子"
"步骤" = [["导出模型", "{jar:c}", "src/粒子", "assets/minecraft/textures/particle/generic_*.png", "assets/minecraft/textures/particle/lava.png"]]
["取材"."产物"]
"贴图/特效/粒子/*" = "src/粒子/*.png"

[["取材"]]
"名称" = "作品贴图"
"作品" = "甲"
"步骤" = [
  ["导出模型", "{jar:g}", "src/贴图/法术/goety/particle", "assets/goety/textures/particle/frost_1.png", "assets/goety/textures/particle/frost_2.png"],
  ["导出模型", "{jar:c}", "src/贴图/法术/minecraft/particle", "assets/minecraft/textures/particle/lava.png"],
  ["导出模型", "{jar:g}", "src/单张.png", "名=assets/goety/textures/particle/trail.png"],
]
["取材"."产物"]
"贴图/法术/goety/particle/*" = "src/贴图/法术/goety/particle/*.png"
"贴图/法术/minecraft/particle/*" = "src/贴图/法术/minecraft/particle/*.png"
"贴图/法术/goety/拖尾" = "src/单张.png"

[["取材"]]
"名称" = "作品定义"
"作品" = "甲"
"步骤" = [
  ["python", "{脚本}/拷jar文件.py", "{jar:g}", "assets/goety/particles/frost.json", "src/数据/法术/goety/particles/frost.json"],
  ["python", "{脚本}/拷jar文件.py", "{jar:g}", "assets/goety/particles/burning.json", "src/数据/法术/goety/particles/burning.json"],
  ["python", "{脚本}/拷jar文件.py", "{jar:g}", "assets/goety/particles/trail.json", "src/数据/法术/goety/particles/trail.json"],
  ["python", "{脚本}/拷jar文件.py", "{jar:g}", "assets/goety/particles/gone.json", "src/数据/法术/goety/particles/gone.json"],
  ["python", "{脚本}/拷jar文件.py", "{jar:c}", "assets/minecraft/particles/smoke.json", "src/数据/法术/minecraft/particles/smoke.json"],
]
["取材"."产物"]
"数据/法术/goety/particles/*" = "src/数据/法术/goety/particles/*.json"
"数据/法术/minecraft/particles/*" = "src/数据/法术/minecraft/particles/*.json"
`;

const 定义 = {
  frost: { textures: ['goety:frost_1', 'goety:frost_2', 'goety:frost_1'] },
  burning: { textures: ['minecraft:lava'] },
  trail: { textures: ['goety:trail'] },
  gone: { textures: ['goety:frost_1', 'goety:nope'] },
  smoke: { textures: ['generic_1', 'minecraft:generic_0'] },
};
const 条 = (sha: string, 后缀: string) => ({ sha256: sha.repeat(64).slice(0, 64), 大小: 1, 库: 'store' as const, 后缀 });

const 造锁 = (): 两侧锁 => {
  const 共用: 资产锁 = { '贴图/特效/粒子/generic_0': 条('0', '.png'), '贴图/特效/粒子/generic_1': 条('1', '.png'), '贴图/特效/粒子/lava': 条('l', '.png') };
  const 作品: 资产锁 = {
    '贴图/法术/goety/particle/frost_1': 条('a', '.png'),
    '贴图/法术/goety/particle/frost_2': 条('b', '.png'),
    '贴图/法术/minecraft/particle/lava': 条('l', '.png'),
    '贴图/法术/goety/拖尾': 条('t', '.png'),
  };
  for (const [名, j] of Object.entries(定义)) 作品[`数据/法术/${名 === 'smoke' ? 'minecraft' : 'goety'}/particles/${名}`] = { ...条(名, '.json'), sha256: Buffer.from(名).toString('hex').padEnd(64, 'f') };
  return { 共用, 作品 };
};
// 按 sha 反查定义名读字节
const 读 = (e: { sha256: string }) => {
  const 名 = Object.keys(定义).find((k) => Buffer.from(k).toString('hex').padEnd(64, 'f') === e.sha256);
  if (!名) throw new Error('没有');
  return JSON.stringify(定义[名 as keyof typeof 定义]);
};

describe('粒子帧', () => {
  const q = 解析清单(配方, '');
  const 锁 = 造锁();
  const 表 = 建来源表(q, { ...锁.共用, ...锁.作品 });

  it('从配方反查 jar 路径 → id：通配、单张、拷jar文件都认，几条配方导过同一张都记', () => {
    expect(表.get('assets/minecraft/textures/particle/generic_0.png')).toEqual(['贴图/特效/粒子/generic_0']);
    expect(表.get('assets/minecraft/textures/particle/lava.png')).toEqual(['贴图/法术/minecraft/particle/lava', '贴图/特效/粒子/lava']);
    expect(表.get('assets/goety/textures/particle/trail.png')).toEqual(['贴图/法术/goety/拖尾']);
    expect(表.get('assets/goety/particles/frost.json')).toEqual(['数据/法术/goety/particles/frost']);
    expect(列粒子(表)).toEqual(['goety:burning', 'goety:frost', 'goety:gone', 'goety:trail', 'minecraft:smoke']);
  });

  it('照 textures 顺序出帧，重复的贴图只 import 一次；同组优先；不写命名空间是 minecraft', () => {
    const r = 算粒子帧('goety:frost', 锁, 表, '/代码', '/作品/甲', 读);
    if (是错(r)) throw new Error(r.错);
    expect(r.帧).toEqual(['贴图/法术/goety/particle/frost_1', '贴图/法术/goety/particle/frost_2', '贴图/法术/goety/particle/frost_1']);
    expect(r.文本).toContain('[图0, 图1, 图0].map(png)');
    expect(r.文本.match(/^import 图/gm)).toHaveLength(2);
    expect(r.文件).toBe(path.join('/作品/甲', '粒子帧', 'goety', 'frost.ts'));
    expect(读生成头(r.文本)?.定义).toBe('数据/法术/goety/particles/frost');
    const b = 算粒子帧('goety:burning', 锁, 表, '/代码', '/作品/甲', 读);
    expect(!是错(b) && b.帧).toEqual(['贴图/法术/minecraft/particle/lava']);
    const s = 算粒子帧('minecraft:smoke', 锁, 表, '/代码', '/作品/甲', 读);
    expect(!是错(s) && s.帧).toEqual(['贴图/特效/粒子/generic_1', '贴图/特效/粒子/generic_0']);
    expect(解析粒子名('frost')).toEqual({ 命名空间: 'minecraft', 名: 'frost' });
  });

  it('贴图没登记、定义没登记、同一张对上字节不同的几件都报错', () => {
    const r = 算粒子帧('goety:gone', 锁, 表, '/代码', '/作品/甲', 读);
    expect(是错(r) && r.缺贴图).toEqual(['goety:nope']);
    expect(是错(r) && r.错).toContain('assets/goety/textures/particle/nope.png');
    const n = 算粒子帧('goety:none', 锁, 表, '/代码', '/作品/甲', 读);
    expect(是错(n) && n.错).toContain('定义没登记');
    const 坏锁 = { ...锁, 共用: { ...锁.共用, '贴图/特效/粒子/lava': 条('x', '.png') } };
    const 坏 = 算粒子帧('goety:burning', 坏锁, 建来源表(q, { ...坏锁.共用, ...坏锁.作品 }), '/代码', '/作品/甲', 读);
    expect(是错(坏) && 坏.错).toContain('字节不同');
  });

  it('核对：生成的不改不报，手改、定义换了字节都报；字节不在本机只核头', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-粒子帧-'));
    const 作品根 = path.join(根, '作品', '甲');
    const r = 算粒子帧('goety:frost', 锁, 表, 根, 作品根, 读);
    if (是错(r)) throw new Error(r.错);
    fs.mkdirSync(path.dirname(r.文件), { recursive: true });
    fs.writeFileSync(r.文件, r.文本);
    expect(核对粒子帧(根, 作品根, 锁, 表, 读)).toEqual([]);
    expect(核对粒子帧(根, 作品根, 锁, 表, () => { throw new Error('不在'); })).toEqual([]);
    fs.writeFileSync(r.文件, r.文本.replace('[图0, 图1, 图0]', '[图0, 图1]'));
    expect(核对粒子帧(根, 作品根, 锁, 表, 读)[0]?.[1]).toContain('不一样');
    fs.writeFileSync(r.文件, r.文本);
    const 换锁 = { ...锁, 作品: { ...锁.作品, '数据/法术/goety/particles/frost': 条('c', '.json') } };
    expect(核对粒子帧(根, 作品根, 换锁, 表, 读)[0]?.[1]).toContain('换了字节');
    fs.rmSync(根, { recursive: true, force: true });
  });
});
