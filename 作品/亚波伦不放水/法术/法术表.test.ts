// 法术表的数：总数、各类数量、注册名不重复、名字齐全。改判类（比如用户定了某个待定）时这里的数要跟着改。
import { describe, expect, it } from 'vitest';
import { 法术表, 齐放名单, type 法术类 } from './法术表.ts';

const 数 = (筛: (法: (typeof 法术表)[number]) => boolean) => 法术表.filter(筛).length;
const 各类 = (来源?: '本体' | '启示录') => {
  const 计: Record<法术类, number> = { 有画面: 0, 功能: 0, 召唤: 0, 空壳: 0, 待定: 0 };
  for (const 法 of 法术表) if (!来源 || 法.来源 === 来源) 计[法.类] += 1;
  return 计;
};

describe('法术表', () => {
  it('总数：本体 124 个聚晶，启示录 4 个有实现加 5 个空壳', () => {
    expect(法术表.length).toBe(133);
    expect(数((法) => 法.来源 === '本体')).toBe(124);
    expect(数((法) => 法.来源 === '启示录')).toBe(9);
    expect(数((法) => 法.类 !== '空壳')).toBe(128);
  });

  it('各类数量', () => {
    expect(各类()).toEqual({ 有画面: 72, 功能: 22, 召唤: 25, 空壳: 5, 待定: 9 });
    expect(各类('本体')).toEqual({ 有画面: 69, 功能: 22, 召唤: 24, 空壳: 0, 待定: 9 });
    expect(各类('启示录')).toEqual({ 有画面: 3, 功能: 0, 召唤: 1, 空壳: 5, 待定: 0 });
  });

  it('齐放名单只收有画面的，待定的不进', () => {
    expect(齐放名单.length).toBe(72);
    expect(齐放名单.every((法) => 法.类 === '有画面')).toBe(true);
  });

  it('注册名不重复', () => {
    const 名 = 法术表.map((法) => `${法.来源}:${法.注册名}`);
    expect(new Set(名).size).toBe(名.length);
    // 两个模组之间也不撞名，轮盘上可以直接拿注册名当键
    expect(new Set(法术表.map((法) => 法.注册名)).size).toBe(法术表.length);
  });

  it('每条都有中英文名、依据、画面、图标和法术类', () => {
    for (const 法 of 法术表) {
      expect(法.中文名, 法.注册名).toMatch(/聚晶$/);
      expect(法.英文名, 法.注册名).toMatch(/ Focus$/);
      for (const 字段 of [法.依据, 法.画面, 法.难度理由, 法.法术类] as const) expect(字段.length, 法.注册名).toBeGreaterThan(0);
      expect(法.图标, 法.注册名).toMatch(/^assets\/goety(_revelation)?\/textures\/item\/focus\/.+\.png$/);
    }
  });

  it('待定的写了两个候选和各自的理由，别的类不带待定', () => {
    for (const 法 of 法术表) {
      if (法.类 !== '待定') {
        expect(法.待定, 法.注册名).toBeUndefined();
        continue;
      }
      expect(法.待定, 法.注册名).toBeDefined();
      const [甲, 乙] = 法.待定!.候选;
      expect(甲).not.toBe(乙);
      expect(法.待定!.理由[甲]?.length, 法.注册名).toBeGreaterThan(0);
      expect(法.待定!.理由[乙]?.length, 法.注册名).toBeGreaterThan(0);
    }
  });

  it('施放刻：瞬发是 0，蓄力大于 0', () => {
    for (const 法 of 法术表) {
      if (法.施放 === '瞬发') expect(法.施放刻, 法.注册名).toBe(0);
      if (法.施放 === '蓄力') expect(法.施放刻, 法.注册名).toBeGreaterThan(0);
    }
  });
});
