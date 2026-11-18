// debug 规则（规则/调试开关.ts）：从语法树数 trialParams、trialOff、trialKey 的名字和 REMOTION_ANIM_ 环境变量，和登记表两头对
import { describe, expect, it } from 'vitest';
import { makeRepo, runRule } from './测试夹具.ts';
import { findSwitchUses } from './规则/调试开关.ts';

describe('调试开关', () => {
  it('数调用的字面量名字、字符串和 process.env 里的环境变量名；注释不算，非字面量记下来', () => {
    const src = [
      "// trialParams('注释里的') 不算",
      "const a = trialParams<{ 起?: number }>('雾曲线')?.起;",
      "const b = trialOff('云');",
      "const k = trialKey('地形');",
      'const n = name; trialParams(n);',
      "const e = process.env.REMOTION_ANIM_TELE ?? env['REMOTION_ANIM_LIGHTING'];",
    ].join('\n');
    const r = findSwitchUses('a.ts', src);
    expect(r.uses.map((u) => `${u.kind}:${u.name}:${u.line}`)).toEqual(['trial:雾曲线:2', 'off:云:3', 'trial:地形:4', 'channel:REMOTION_ANIM_TELE:6', 'channel:REMOTION_ANIM_LIGHTING:6']);
    expect(r.bad.map((b) => b.line)).toEqual([5]);
  });

  it('没登记的名字、项、环境变量都报；登记了没人用的也报', async () => {
    const root = makeRepo({
      'engine/a.ts': "export const x = trialParams('乱写') ?? trialOff('乱关');\nexport const y = 'REMOTION_ANIM_NEW';\n",
    });
    const v = (await runRule('debug', root)).violations.join('\n');
    expect(v).toMatch(/engine\/a\.ts:1 试看名「乱写」没登记/);
    expect(v).toMatch(/engine\/a\.ts:1 「关」的项「乱关」没登记/);
    expect(v).toMatch(/engine\/a\.ts:2 环境变量「REMOTION_ANIM_NEW」没登记/);
    expect(v).toMatch(/登记了 trial「雾曲线」，代码里没人用/);
    // 占位行没人用不报
    expect(v).not.toMatch(/「台阶并色」，代码里没人用/);
  });
});
