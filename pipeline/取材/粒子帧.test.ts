import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseManifest } from './清单.ts';
import { buildSourceTable, isError, checkParticleFrames, listParticles, computeParticleFrames, readGeneratedHeader, parseParticleName, type SideLocks } from './粒子帧.ts';
import type { AssetLock } from '../资产/资产锁.ts';

const recipeText = `
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

const particleDefs = {
  frost: { textures: ['goety:frost_1', 'goety:frost_2', 'goety:frost_1'] },
  burning: { textures: ['minecraft:lava'] },
  trail: { textures: ['goety:trail'] },
  gone: { textures: ['goety:frost_1', 'goety:nope'] },
  smoke: { textures: ['generic_1', 'minecraft:generic_0'] },
};
const lockEntry = (sha: string, suffix: string) => ({ sha256: sha.repeat(64).slice(0, 64), size: 1, lib: 'store' as const, suffix: suffix });

const makeLocks = (): SideLocks => {
  const sharedLock: AssetLock = { '贴图/特效/粒子/generic_0': lockEntry('0', '.png'), '贴图/特效/粒子/generic_1': lockEntry('1', '.png'), '贴图/特效/粒子/lava': lockEntry('l', '.png') };
  const work: AssetLock = {
    '贴图/法术/goety/particle/frost_1': lockEntry('a', '.png'),
    '贴图/法术/goety/particle/frost_2': lockEntry('b', '.png'),
    '贴图/法术/minecraft/particle/lava': lockEntry('l', '.png'),
    '贴图/法术/goety/拖尾': lockEntry('t', '.png'),
  };
  for (const [particleName, j] of Object.entries(particleDefs)) work[`数据/法术/${particleName === 'smoke' ? 'minecraft' : 'goety'}/particles/${particleName}`] = { ...lockEntry(particleName, '.json'), sha256: Buffer.from(particleName).toString('hex').padEnd(64, 'f') };
  return { 共用: sharedLock, 作品: work };
};
// 按 sha 反查定义名读字节
const readText = (e: { sha256: string }) => {
  const defName = Object.keys(particleDefs).find((k) => Buffer.from(k).toString('hex').padEnd(64, 'f') === e.sha256);
  if (!defName) throw new Error('没有');
  return JSON.stringify(particleDefs[defName as keyof typeof particleDefs]);
};

describe('粒子帧', () => {
  const q = parseManifest(recipeText, '');
  const assetLock = makeLocks();
  const sourceTable = buildSourceTable(q, { ...assetLock.共用, ...assetLock.作品 });

  it('从配方反查 jar 路径 → id：通配、单张、拷jar文件都认，几条配方导过同一张都记', () => {
    expect(sourceTable.get('assets/minecraft/textures/particle/generic_0.png')).toEqual(['贴图/特效/粒子/generic_0']);
    expect(sourceTable.get('assets/minecraft/textures/particle/lava.png')).toEqual(['贴图/法术/minecraft/particle/lava', '贴图/特效/粒子/lava']);
    expect(sourceTable.get('assets/goety/textures/particle/trail.png')).toEqual(['贴图/法术/goety/拖尾']);
    expect(sourceTable.get('assets/goety/particles/frost.json')).toEqual(['数据/法术/goety/particles/frost']);
    expect(listParticles(sourceTable)).toEqual(['goety:burning', 'goety:frost', 'goety:gone', 'goety:trail', 'minecraft:smoke']);
  });

  it('照 textures 顺序出帧，重复的贴图只 import 一次；同组优先；不写命名空间是 minecraft', () => {
    const r = computeParticleFrames('goety:frost', assetLock, sourceTable, '/代码', '/作品/甲', readText);
    if (isError(r)) throw new Error(r.错);
    expect(r.frame).toEqual(['贴图/法术/goety/particle/frost_1', '贴图/法术/goety/particle/frost_2', '贴图/法术/goety/particle/frost_1']);
    expect(r.text).toContain('[frame0, frame1, frame0].map(png)');
    expect(r.text.match(/^import frame/gm)).toHaveLength(2);
    expect(r.file).toBe(path.join('/作品/甲', '粒子帧', 'goety', 'frost.ts'));
    expect(readGeneratedHeader(r.text)?.definition).toBe('数据/法术/goety/particles/frost');
    const b = computeParticleFrames('goety:burning', assetLock, sourceTable, '/代码', '/作品/甲', readText);
    expect(!isError(b) && b.frame).toEqual(['贴图/法术/minecraft/particle/lava']);
    const s = computeParticleFrames('minecraft:smoke', assetLock, sourceTable, '/代码', '/作品/甲', readText);
    expect(!isError(s) && s.frame).toEqual(['贴图/特效/粒子/generic_1', '贴图/特效/粒子/generic_0']);
    expect(parseParticleName('frost')).toEqual({ namespaceName: 'minecraft', name: 'frost' });
  });

  it('贴图没登记、定义没登记、同一张对上字节不同的几件都报错', () => {
    const r = computeParticleFrames('goety:gone', assetLock, sourceTable, '/代码', '/作品/甲', readText);
    expect(isError(r) && r.missingTextures).toEqual(['goety:nope']);
    expect(isError(r) && r.错).toContain('assets/goety/textures/particle/nope.png');
    const n = computeParticleFrames('goety:none', assetLock, sourceTable, '/代码', '/作品/甲', readText);
    expect(isError(n) && n.错).toContain('定义没登记');
    const badLock = { ...assetLock, 共用: { ...assetLock.共用, '贴图/特效/粒子/lava': lockEntry('x', '.png') } };
    const badResult = computeParticleFrames('goety:burning', badLock, buildSourceTable(q, { ...badLock.共用, ...badLock.作品 }), '/代码', '/作品/甲', readText);
    expect(isError(badResult) && badResult.错).toContain('字节不同');
  });

  it('核对：生成的不改不报，手改、定义换了字节都报；字节不在本机只核头', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-粒子帧-'));
    const workRoot = path.join(root, '作品', '甲');
    const r = computeParticleFrames('goety:frost', assetLock, sourceTable, root, workRoot, readText);
    if (isError(r)) throw new Error(r.错);
    fs.mkdirSync(path.dirname(r.file), { recursive: true });
    fs.writeFileSync(r.file, r.text);
    expect(checkParticleFrames(root, workRoot, assetLock, sourceTable, readText)).toEqual([]);
    expect(checkParticleFrames(root, workRoot, assetLock, sourceTable, () => { throw new Error('不在'); })).toEqual([]);
    fs.writeFileSync(r.file, r.text.replace('[frame0, frame1, frame0]', '[frame0, frame1]'));
    expect(checkParticleFrames(root, workRoot, assetLock, sourceTable, readText)[0]?.[1]).toContain('不一样');
    fs.writeFileSync(r.file, r.text);
    const changedLock = { ...assetLock, 作品: { ...assetLock.作品, '数据/法术/goety/particles/frost': lockEntry('c', '.json') } };
    expect(checkParticleFrames(root, workRoot, changedLock, sourceTable, readText)[0]?.[1]).toContain('换了字节');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
