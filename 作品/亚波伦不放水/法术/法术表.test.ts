// 法术表的数：总数、各类数量、注册名不重复、名字齐全。改判类（比如用户定了某个待定）时这里的数要跟着改。
import { describe, expect, it } from 'vitest';
import { spellTable, volleyList, type SpellKind } from './法术表.ts';

const countWhere = (predicate: (spell: (typeof spellTable)[number]) => boolean) => spellTable.filter(predicate).length;
const countByKind = (source?: '本体' | '启示录') => {
  const counts: Record<SpellKind, number> = { 有画面: 0, 功能: 0, 召唤: 0, 空壳: 0, 待定: 0 };
  for (const spell of spellTable) if (!source || spell.来源 === source) counts[spell.类] += 1;
  return counts;
};

describe('法术表', () => {
  it('总数：本体 124 个聚晶，启示录 4 个有实现加 5 个空壳', () => {
    expect(spellTable.length).toBe(133);
    expect(countWhere((spell) => spell.来源 === '本体')).toBe(124);
    expect(countWhere((spell) => spell.来源 === '启示录')).toBe(9);
    expect(countWhere((spell) => spell.类 !== '空壳')).toBe(128);
  });

  it('各类数量', () => {
    expect(countByKind()).toEqual({ 有画面: 71, 功能: 19, 召唤: 25, 空壳: 5, 待定: 13 });
    expect(countByKind('本体')).toEqual({ 有画面: 68, 功能: 19, 召唤: 24, 空壳: 0, 待定: 13 });
    expect(countByKind('启示录')).toEqual({ 有画面: 3, 功能: 0, 召唤: 1, 空壳: 5, 待定: 0 });
  });

  it('齐放名单只收有画面的，待定的不进', () => {
    expect(volleyList.length).toBe(71);
    expect(volleyList.every((spell) => spell.类 === '有画面')).toBe(true);
  });

  it('配下界魔杖变样的 20 个，齐放名单里 10 个', () => {
    expect(countWhere((spell) => spell.netherWand !== undefined)).toBe(20);
    expect(volleyList.filter((spell) => spell.netherWand !== undefined).map((spell) => spell.registryName).sort()).toEqual(
      ['bombardment', 'fire_blast', 'fire_breath', 'fireball', 'flame_strike', 'lavaball', 'meteor_shower', 'surging', 'wind_blast', 'wither_skull'],
    );
  });

  it('注册名不重复', () => {
    const spellNames = spellTable.map((spell) => `${spell.来源}:${spell.registryName}`);
    expect(new Set(spellNames).size).toBe(spellNames.length);
    // 两个模组之间也不撞名，轮盘上可以直接拿注册名当键
    expect(new Set(spellTable.map((spell) => spell.registryName)).size).toBe(spellTable.length);
  });

  it('每条都有中英文名、依据、画面、图标和法术类', () => {
    for (const spell of spellTable) {
      expect(spell.chineseName, spell.registryName).toMatch(/聚晶$/);
      expect(spell.englishName, spell.registryName).toMatch(/ Focus$/);
      for (const field of [spell.basis, spell.画面, spell.difficultyReason, spell.spellJavaClass] as const) expect(field.length, spell.registryName).toBeGreaterThan(0);
      expect(spell.icon, spell.registryName).toMatch(/^assets\/goety(_revelation)?\/textures\/item\/focus\/.+\.png$/);
    }
  });

  it('待定的写了两个候选和各自的理由，别的类不带待定', () => {
    for (const spell of spellTable) {
      if (spell.类 !== '待定') {
        expect(spell.pending, spell.registryName).toBeUndefined();
        continue;
      }
      expect(spell.pending, spell.registryName).toBeDefined();
      const [firstCandidate, second] = spell.pending!.候选;
      expect(firstCandidate).not.toBe(second);
      expect(spell.pending!.reason[firstCandidate]?.length, spell.registryName).toBeGreaterThan(0);
      expect(spell.pending!.reason[second]?.length, spell.registryName).toBeGreaterThan(0);
    }
  });

  it('施放刻：瞬发是 0，蓄力大于 0', () => {
    for (const spell of spellTable) {
      if (spell.castMode === '瞬发') expect(spell.castTick, spell.registryName).toBe(0);
      if (spell.castMode === '蓄力') expect(spell.castTick, spell.registryName).toBeGreaterThan(0);
    }
  });
});
