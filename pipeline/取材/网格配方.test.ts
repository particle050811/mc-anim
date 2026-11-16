import { describe, expect, it } from 'vitest';
import type { AssetLock } from '../资产/资产锁.ts';
import { check } from './提取.ts';
import { groupMeshes, meshSteps, meshOutput, missingMeshRecipes, fillMeshRecipeText, type MeshHeader } from './网格配方.ts';
import { canRunDirectly, parseManifest } from './清单.ts';

const lockEntry = (sha: string) => ({ sha256: sha.repeat(64), size: 1, lib: 'store' as const, suffix: '.json' });
const existingRecipe = `
[["sourcing"]]
"displayName" = "小屋"
"requires" = []
"needsGame" = true
"publicVersion" = "不提取"
"steps" = [["mcai", "mesh", "from=0,0,0", "to=1,1,1", "out=src/模型/场景/小屋.网格"]]
["sourcing"."artifacts"]
"网格/小屋/头" = "src/模型/场景/小屋.网格.json"
`;
const meshHeaders: Record<string, MeshHeader> = {
  a: { dim: 'minecraft:overworld', from: [-10, -60, 0], to: [9, 4, 19], origin: [0, -50, 10], markers: { 'minecraft:chest': [], 'quark:ancient_chest': [] } },
  b: { dim: 'twilightforest:twilight_forest', from: [0, 0, 0], to: [1, 1, 1], origin: [0.5, 0, 0.5] },
  c: { dim: 'minecraft:overworld', from: [0, 0, 0], to: [3, 3, 3], origin: [0, 0, 0], 取材: { 参数: { structure: 'minecraft:village_plains', entities: 'all' } } },
};
const assetLock: AssetLock = {
  '网格/小屋/头': lockEntry('0'),
  '网格/城/东1/头': lockEntry('a'),
  '网格/城/东1/顶点': lockEntry('1'),
  '网格/城/东1/图集': lockEntry('2'),
  '网格/塔/头': lockEntry('b'),
  '网格/塔/顶点': lockEntry('3'),
  '贴图/别的': lockEntry('4'),
};
const readHead = (e: AssetLock[string]) => {
  const h = meshHeaders[e.sha256[0]!];
  if (!h) throw new Error('不在库里');
  return h;
};

describe('地标网格配方反填', () => {
  const q = parseManifest(existingRecipe, '');

  it('只挑锁里有头、没有配方产出的；out 照资产表旧路径，产物只列锁里有的', () => {
    const oldPathMap = new Map([['网格/城/东1/头', { oldPath: '参考模型库/src/模型/场景/城-东1.网格.json' }]]);
    const { grid: meshes, unreadable } = missingMeshRecipes(q, [[assetLock, undefined]], oldPathMap, readHead);
    expect(unreadable).toEqual([]);
    expect(meshes.map((g) => g.meshName)).toEqual(['网格/城/东1', '网格/塔']);
    expect(meshes[0]!.artifacts).toEqual({ '网格/城/东1/图集': 'src/模型/场景/城-东1.网格.png', '网格/城/东1/头': 'src/模型/场景/城-东1.网格.json', '网格/城/东1/顶点': 'src/模型/场景/城-东1.网格.bin' });
    expect(meshes[1]!.artifacts).toEqual({ '网格/塔/头': 'src/模型/场景/塔.网格.json', '网格/塔/顶点': 'src/模型/场景/塔.网格.bin' });
    expect(meshOutput('网格/城/西/2')).toBe('src/模型/场景/城-西-2.网格');
  });

  it('steps：镜头切到维度、挪到范围上方，mesh 带 from/to/origin 和找到的标记；头里记了原样参数就照抄', () => {
    const g = { meshName: '网格/城/东1', 头: meshHeaders.a!, artifacts: { '网格/城/东1/头': 'src/x.网格.json' } };
    expect(meshSteps(g)).toEqual([
      ['mcai', 'cam', 'pos=0,34,10', 'pitch=90', 'yaw=180', 'dim=minecraft:overworld'],
      ['mcai', 'mesh', 'from=-10,-60,0', 'to=9,4,19', 'origin=0,-50,10', 'mark=minecraft:chest,quark:ancient_chest', 'out=src/x.网格'],
    ]);
    expect(meshSteps({ ...g, 头: meshHeaders.c! })[1]).toEqual(['mcai', 'mesh', 'structure=minecraft:village_plains', 'entities=all', 'out=src/x.网格']);
  });

  it('按第一段分组成配方，文本能解析回来：不重导、要开游戏，--all 不选，--check 只查产物', () => {
    const { grid: meshes } = missingMeshRecipes(q, [[assetLock, undefined]], new Map(), readHead);
    const groups = groupMeshes(meshes, new Set(q.entryMap.keys()));
    expect([...groups.keys()]).toEqual(['城网格', '塔网格']);
    expect([...groupMeshes(meshes, new Set(['塔网格'])).keys()]).toEqual(['城网格', '塔网格（反填）']);
    const q2 = parseManifest(existingRecipe + fillMeshRecipeText(groups), '');
    const e = q2.entryMap.get('城网格')!;
    expect(e.noReExtract).toMatch(/旧网格不重导/);
    expect(e.needsGame).toBe(true);
    expect(e.steps).toHaveLength(2);
    expect(canRunDirectly(e)).toBe(false);
    // 反填之后都有配方了
    expect(missingMeshRecipes(q2, [[assetLock, undefined]], new Map(), readHead).grid).toEqual([]);
    const r = check(q2, [e], false, assetLock, '示例');
    expect(r.noReExtract).toEqual(['城网格']);
    expect(r.issues.filter((x) => !/字节不在库里/.test(x))).toEqual([]);
  });

  it('作品锁里的网格配方写「作品」；字节不在库里的报读不到', () => {
    const workLock: AssetLock = { '网格/院/头': lockEntry('b'), '网格/坏/头': lockEntry('9') };
    const { grid: meshes, unreadable } = missingMeshRecipes(q, [[{}, undefined], [workLock, '示例']], new Map(), readHead);
    expect(unreadable).toEqual(['网格/坏/头']);
    const q2 = parseManifest(fillMeshRecipeText(groupMeshes(meshes, new Set())), '');
    expect(q2.entryMap.get('院网格')?.work).toBe('示例');
  });
});
