// 分组和注册表的自查（演出表引了 asset:，单测里装不进来，所以按源码文字对）：名单不重不漏；各组只登记自己名下的；元表和演出表一一对应；每个 法术/*.tsx 都进了表。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { volleyList } from '../法术表.ts';
import { spellGroups, type SpellGroupName } from './分组.ts';
import { groupMeta, spellMetas } from './元表.ts';
import { spellSoundAt, spellDuration } from './接口.ts';

const thisDir = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname));
const groupNames = Object.keys(spellGroups) as SpellGroupName[];

describe('法术分组', () => {
  it('五份名单互不重叠，合起来正好是齐放名单的 71 个', () => {
    const allSpells = groupNames.flatMap((groupName) => [...spellGroups[groupName]]);
    expect(new Set(allSpells).size).toBe(allSpells.length);
    expect([...allSpells].sort()).toEqual(volleyList.map((spell) => spell.registryName).sort());
  });
});

describe('法术演出注册表', () => {
  // 组表的数组里按顺序写了哪些名字：数组字面量里的标识符，对回 import 的文件名
  const tableEntries = (fileName: string, suffix: string): string[] => {
    const source = fs.readFileSync(path.join(thisDir, '组', fileName), 'utf8');
    const importSources = new Map([...source.matchAll(/^import (\S+) from '\.\.\/法术\/(.+)';$/gm)].map((m) => [m[1]!, m[2]!]));
    const arrayBody = /=\s*\[([^\]]*)\];/.exec(source)?.[1] ?? '';
    const names = arrayBody.split(',').map((x) => x.trim()).filter(Boolean);
    expect([...importSources.keys()].sort(), `${fileName} 里 import 的和数组里的要一样`).toEqual([...names].sort());
    return names.map((refName) => {
      const refPath = importSources.get(refName)!;
      expect(refPath.endsWith(suffix), `${fileName} 要引 法术/<名>${suffix}，写的是 ${refPath}`).toBe(true);
      return refPath.slice(0, -suffix.length);
    });
  };

  it('各组只登记自己名下的法术，元表（组/<组>.元.ts）和演出表（组/<组>.tsx）一一对应、顺序一样', () => {
    for (const groupName of groupNames) {
      const listedIds = new Set<string>(spellGroups[groupName]);
      for (const meta of groupMeta[groupName]) expect(listedIds.has(meta.id), `${groupName}组登记了不在名下的 ${meta.id}`).toBe(true);
      const metaFiles = tableEntries(`${groupName}.元.ts`, '.元.ts');
      expect(metaFiles.length).toBe(groupMeta[groupName].length);
      expect(tableEntries(`${groupName}.tsx`, '.tsx')).toEqual(metaFiles);
    }
  });

  it('id 不重复；法术/ 下每个 .元.ts 都配一个同名 .tsx，都进了表', () => {
    const ids = spellMetas.map((meta) => meta.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fileNames = fs.readdirSync(path.join(thisDir, '法术'));
    const metaFiles = fileNames.filter((f) => f.endsWith('.元.ts')).map((f) => f.replace('.元.ts', '')).sort();
    const drawFiles = fileNames.filter((f) => f.endsWith('.tsx')).map((f) => f.replace('.tsx', '')).sort();
    expect(drawFiles).toEqual(metaFiles);
    expect(groupNames.flatMap((groupName) => tableEntries(`${groupName}.元.ts`, '.元.ts')).sort()).toEqual(metaFiles);
  });

  it('每个法术的长秒是正数，命中秒在里面，声音时刻算得出来', () => {
    for (const meta of spellMetas) {
      const spellTiming = spellDuration(meta, [-10, 0, 7], [0, 0, 0]);
      expect(spellTiming.长秒).toBeGreaterThan(0);
      if (spellTiming.hitSec !== undefined) expect(spellTiming.hitSec).toBeLessThan(spellTiming.长秒);
      for (const spellSound of spellSoundAt(meta, [-10, 0, 7], [0, 0, 0])) expect(spellSound.秒).toBeGreaterThanOrEqual(0);
    }
  });
});
