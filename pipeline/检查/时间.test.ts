import { describe, expect, it } from 'vitest';
import { base, runRule, makeRepo } from './测试夹具.ts';
import { findFrameCallLines } from './规则/时间.ts';

describe('时间', () => {
  it('合规：按秒写的、时间工具自己、注释和字符串里的不算', async () => {
    const root = makeRepo(base(), {
      '作品/应力转动/段/7-甲/新.tsx': "import { useCurrentSec } from '@engine/段/时间.tsx';\n// 以前是 useCurrentFrame()\nexport const 新 = () => <div>{useCurrentSec() + 'useCurrentFrame()'}</div>;\n",
      'engine/段/时间.tsx': "import { useCurrentFrame } from 'remotion';\nexport const useCurrentSec = () => useCurrentFrame() / 24;\n",
    });
    const { violations } = await runRule('time', root);
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('直接调用就报，没有例外', async () => {
    const root = makeRepo(base(), { '库/新/动.tsx': "import { useCurrentFrame } from 'remotion';\nexport const 动 = () => useCurrentFrame();\n" });
    expect((await runRule('time', root)).violations.join('\n')).toMatch(/库\/新\/动.tsx:2 直接调 useCurrentFrame\(\) 1 处（第 2 行）：按秒写/);
  });

  it('查文件：只认调用（标识符），不认属性和别名对象上的同名方法', () => {
    expect(findFrameCallLines('a.tsx', 'const a = useCurrentFrame();\nconst b = x.useCurrentFrame();\nconst c = useCurrentFrame();\n')).toEqual([1, 3]);
  });
});
