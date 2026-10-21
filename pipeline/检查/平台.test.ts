import { describe, expect, it } from 'vitest';
import { 基础, 跑, 造仓库 } from './测试夹具.ts';
import { 名字毛病, 大小写冲突, 结构层非ASCII } from './规则/平台.ts';

describe('平台', () => {
  it('合规样例放行：实体名用中文、shell: false、Python 用列表参数', async () => {
    const 根 = 造仓库(基础(), {
      'pipeline/环境/起.ts': "import { spawnSync } from 'node:child_process';\nexport const 起 = () => spawnSync('git', ['status'], { shell: false });\n",
      'py/srpy/起.py': "import subprocess\n# 别写 shell=True\nsubprocess.run(['git', 'status'], shell=False, encoding='utf-8')\n",
      'pipeline/指纹/说明.ts': "import spawn from 'cross-spawn';\nimport { execFileSync } from 'node:child_process';\nexport const x = (a: string[]) => [spawn('git', a), execFileSync('git', ['status']), /x/.exec('x')];\n",
      'verify/accepted/darwin-arm64/核对-冒烟.toml': '',
    });
    expect((await 跑('平台', 根)).违规).toEqual([]);
  });

  it('Windows 不许的名字、结构层中文、开 shell、fcntl 都拦', async () => {
    const 根 = 造仓库(基础(), {
      'content/段/7-甲/a:b.ts': '',
      'content/段/7-甲/con.ts': '',
      'content/段/7-甲/尾点.': '',
      'content/段/7-甲/é.ts': '',
      '工具/x.ts': '',
      'py/中文包/x.py': '',
      'sourcing/mod/src/取材.java': '',
      'pipeline/起.ts': "import { spawn } from 'node:child_process';\nconst shell = true;\nspawn('ls', [], { shell });\nspawn('ls', [], { shell: true });\n",
      'py/srpy/坏.py': "import os, fcntl\nfrom fcntl import flock\nimport subprocess\nsubprocess.run('ls', shell=True)\nos.system('ls | wc')\nos.popen('ls')\nsubprocess.getoutput('ls')\nfrom os import system\n",
      'pipeline/坏.ts': [
        "import { exec, execSync, execSync as 同步, spawnSync, execFile } from 'node:child_process';",
        "import * as cp from 'child_process';",
        "import 起 from 'cross-spawn';",
        "execSync('ls -la | wc -l');",
        "exec('rm -rf x');",
        "同步('ls');",
        "cp.exec('ls');",
        "spawnSync('ls -la');",
        "execFile('ls', { cwd: '.' });",
        "起('ls -la');",
        "/x/.exec('y');",
        "spawnSync('ls', []);",
        '',
      ].join('\n'),
      'pipeline/坏.cjs': "const { execSync } = require('node:child_process');\nexecSync('ls');\n",
    });
    const v = (await 跑('平台', 根)).违规.join('\n');
    expect(v).toMatch(/a:b.ts 路径里的「a:b.ts」有 Windows 不许的字符/);
    expect(v).toMatch(/con.ts 路径里的「con.ts」是 Windows 的保留设备名/);
    expect(v).toMatch(/尾点. 路径里的「尾点.」以点或空格结尾/);
    expect(v).toMatch(/不是 NFC/);
    expect(v).toMatch(/工具\/x.ts 结构层路径要用英文 ASCII：「工具」/);
    expect(v).toMatch(/py\/中文包\/x.py 结构层路径要用英文 ASCII：「中文包」/);
    expect(v).toMatch(/sourcing\/mod\/src\/取材.java 结构层路径要用英文 ASCII：「取材.java」/);
    expect(v).toMatch(/pipeline\/起.ts:3 不开 shell/);
    expect(v).toMatch(/pipeline\/起.ts:4 不开 shell/);
    expect(v).toMatch(/py\/srpy\/坏.py:1 不用 fcntl/);
    expect(v).toMatch(/py\/srpy\/坏.py:2 不用 fcntl/);
    expect(v).toMatch(/py\/srpy\/坏.py:4 不开 shell/);
    for (const 行 of [5, 6, 7, 8]) expect(v).toMatch(new RegExp(`py/srpy/坏.py:${行} 不开 shell：os.system`));
    for (const 行 of [4, 5, 6, 7, 8, 9, 10]) expect(v).toMatch(new RegExp(`pipeline/坏.ts:${行} 不开 shell`));
    expect(v).not.toMatch(/pipeline\/坏.ts:1[12] /);
    expect(v).toMatch(/pipeline\/坏.cjs:2 不开 shell：execSync/);
  });

  it('只差大小写的文件和目录（Mac 上造不出来，查纯函数）', () => {
    expect(大小写冲突(['a/Readme.md', 'a/readme.md', 'b/X/1.ts', 'b/x/2.ts', 'c/1.ts', 'c/2.ts'])).toEqual([
      { 文件: 'a/readme.md', 已有: 'a/Readme.md', 是文件: true },
      { 文件: 'b/x/2.ts', 已有: 'b/X', 是文件: false },
    ]);
    expect(大小写冲突(['content/段/6-斩娜迦/段.ts', 'content/段/6-斩娜迦/画面.tsx'])).toEqual([]);
  });

  it('名字和结构层判断', () => {
    expect(名字毛病('6-斩娜迦')).toBeNull();
    expect(名字毛病('LPT1.txt')).toMatch(/保留设备名/);
    expect(名字毛病('a ')).toMatch(/以点或空格结尾/);
    expect(结构层非ASCII('content/段/6-斩娜迦/段.ts')).toBeNull();
    expect(结构层非ASCII('说明.md')).toBe('说明.md');
    expect(结构层非ASCII('verify/accepted/达尔文/x.toml')).toBe('达尔文');
  });
});
