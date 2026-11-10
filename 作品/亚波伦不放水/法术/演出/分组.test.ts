// 分组和注册表的自查（演出表引了 asset:，单测里装不进来，所以按源码文字对）：名单不重不漏；各组只登记自己名下的；元表和演出表一一对应；每个 法术/*.tsx 都进了表。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 齐放名单 } from '../法术表.ts';
import { 法术分组, type 法术组名 } from './分组.ts';
import { 分组元, 法术元表 } from './元表.ts';
import { 法术声音时刻, 法术时长 } from './接口.ts';

const 这里 = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname));
const 组名们 = Object.keys(法术分组) as 法术组名[];

describe('法术分组', () => {
  it('五份名单互不重叠，合起来正好是齐放名单的 71 个', () => {
    const 全 = 组名们.flatMap((组) => [...法术分组[组]]);
    expect(new Set(全).size).toBe(全.length);
    expect([...全].sort()).toEqual(齐放名单.map((法) => 法.注册名).sort());
  });
});

describe('法术演出注册表', () => {
  // 组表的数组里按顺序写了哪些名字：数组字面量里的标识符，对回 import 的文件名
  const 表里 = (文件: string, 后缀: string): string[] => {
    const 文 = fs.readFileSync(path.join(这里, '组', 文件), 'utf8');
    const 引 = new Map([...文.matchAll(/^import (\S+) from '\.\.\/法术\/(.+)';$/gm)].map((m) => [m[1]!, m[2]!]));
    const 数组 = /=\s*\[([^\]]*)\];/.exec(文)?.[1] ?? '';
    const 名们 = 数组.split(',').map((x) => x.trim()).filter(Boolean);
    expect([...引.keys()].sort(), `${文件} 里 import 的和数组里的要一样`).toEqual([...名们].sort());
    return 名们.map((名) => {
      const 路 = 引.get(名)!;
      expect(路.endsWith(后缀), `${文件} 要引 法术/<名>${后缀}，写的是 ${路}`).toBe(true);
      return 路.slice(0, -后缀.length);
    });
  };

  it('各组只登记自己名下的法术，元表（组/<组>.ts）和演出表（组/<组>.tsx）一一对应、顺序一样', () => {
    for (const 组 of 组名们) {
      const 名下 = new Set<string>(法术分组[组]);
      for (const 元 of 分组元[组]) expect(名下.has(元.id), `${组}组登记了不在名下的 ${元.id}`).toBe(true);
      const 元文件 = 表里(`${组}.ts`, '.元.ts');
      expect(元文件.length).toBe(分组元[组].length);
      expect(表里(`${组}.tsx`, '.tsx')).toEqual(元文件);
    }
  });

  it('id 不重复；法术/ 下每个 .元.ts 都配一个同名 .tsx，都进了表', () => {
    const ids = 法术元表.map((元) => 元.id);
    expect(new Set(ids).size).toBe(ids.length);
    const 文件 = fs.readdirSync(path.join(这里, '法术'));
    const 元文件 = 文件.filter((f) => f.endsWith('.元.ts')).map((f) => f.replace('.元.ts', '')).sort();
    const 画文件 = 文件.filter((f) => f.endsWith('.tsx')).map((f) => f.replace('.tsx', '')).sort();
    expect(画文件).toEqual(元文件);
    expect(组名们.flatMap((组) => 表里(`${组}.ts`, '.元.ts')).sort()).toEqual(元文件);
  });

  it('每个法术的长秒是正数，命中秒在里面，声音时刻算得出来', () => {
    for (const 元 of 法术元表) {
      const 时 = 法术时长(元, [-10, 0, 7], [0, 0, 0]);
      expect(时.长秒).toBeGreaterThan(0);
      if (时.命中秒 !== undefined) expect(时.命中秒).toBeLessThan(时.长秒);
      for (const 声 of 法术声音时刻(元, [-10, 0, 7], [0, 0, 0])) expect(声.秒).toBeGreaterThanOrEqual(0);
    }
  });
});
