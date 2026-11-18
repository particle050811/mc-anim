// 试看表的核对（试看表.ts）、still --trial 的分组（试看组.ts）
import { describe, expect, it } from 'vitest';
import { checkTrialTable, trialShortName, formatSwitchTable } from './试看表.ts';
import { parseTrialGroups, trialSuffix } from './试看组.ts';

describe('试看表', () => {
  it('不认识的键、子键、「关」的项当场报错；占位名只提醒', () => {
    expect(checkTrialTable({ '雾曲线': { '起': 0.8 }, '关': ['高度雾'], '地形': ['包'] }, 'X')).toEqual([]);
    expect(() => checkTrialTable({ '雾取线': 1 }, 'X')).toThrow(/「雾取线」没登记/);
    // 11-15 改名后照旧注释写的英文键：报出认的是哪几个
    expect(() => checkTrialTable({ '暮色远景': { fogFar: 6000 } }, 'X')).toThrow(/fogFar 没人读：认的是 雾远、高度雾/);
    expect(() => checkTrialTable({ '关': ['乱关'] }, 'X')).toThrow(/「乱关」没登记/);
    expect(() => checkTrialTable({ '关': '云' }, 'X')).toThrow(/项名数组/);
    expect(() => checkTrialTable([1], 'X')).toThrow(/JSON 对象/);
    expect(checkTrialTable({ '台阶并色': { off: true } }, 'X').join()).toMatch(/还在 标签 实验\/台阶并色分级 上/);
    expect(checkTrialTable({ '关': ['阴影'] }, 'X').join()).toMatch(/还没接/);
  });

  it('短名能当文件名、太长截断带哈希', () => {
    expect(trialShortName({})).toBe('基准');
    expect(trialShortName({ '雾曲线': { '起': 0.8, '远': 12000 } })).toBe('雾曲线.起=0.8,雾曲线.远=12000');
    expect(trialShortName({ '关': ['高度雾', '云'] })).toBe('关=高度雾+云');
    expect(trialShortName({ '地形': ['a/b c'] })).toBe('地形=a_b_c');
    const long = trialShortName({ '地形': ['暮色放大-1752-远景', '暮色放大-1752-远地标', '暮色放大-1752-扩展', '另一个很长的包名', '再来一个很长的包名'] });
    expect(long.length).toBeLessThanOrEqual(58);
    expect(long).toMatch(/…[0-9a-f]{6}$/);
  });

  it('anim trial list 三块都列、占位标出来', () => {
    const t = formatSwitchTable();
    expect(t).toMatch(/== 试看参数/);
    expect(t).toMatch(/== 「关」能关的项/);
    expect(t).toMatch(/REMOTION_ANIM_TELE/);
    expect(t).toMatch(/阴影 {2}\[占位：还没做\]/);
  });
});

describe('still --trial 分组', () => {
  it('每组并上 shell 那份；--baseline 是序号 0、只带 shell 那份；数组 = 几组', () => {
    const base = { '地形': ['远景包'] };
    const g = parseTrialGroups(['{"雾曲线": {"起": 0.8}}', '[{"关": ["云"]}, {"雾曲线": {"远": 12000}}]'], true, base);
    expect(g.map((x) => trialSuffix(x))).toEqual(['-试看0-基准', '-试看1-雾曲线.起=0.8', '-试看2-关=云', '-试看3-雾曲线.远=12000']);
    expect(g[0]!.env).toEqual({ REMOTION_ANIM_TRIAL: '{"地形":["远景包"]}' });
    expect(JSON.parse(g[1]!.env.REMOTION_ANIM_TRIAL!)).toEqual({ '地形': ['远景包'], '雾曲线': { '起': 0.8 } });
    expect(g.every((x) => x.terrain.join() === '远景包')).toBe(true);
  });

  it('shell 没设时基准不传环境变量；参数一样的两组、坏 JSON 报错', () => {
    expect(parseTrialGroups(['{"关": ["云"]}'], true, {})[0]!.env).toEqual({});
    expect(() => parseTrialGroups(['{"关": ["云"]}', '{"关": ["云"]}'], false, {})).toThrow(/参数一样/);
    expect(() => parseTrialGroups(['{雾曲线'], false, {})).toThrow(/JSON/);
    expect(() => parseTrialGroups(['{"terrain": ["x"]}'], false, {})).toThrow(/没登记/);
  });
});
