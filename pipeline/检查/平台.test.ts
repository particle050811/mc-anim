import { describe, expect, it } from 'vitest';
import { base, runRule, makeRepo } from './测试夹具.ts';
import { nameProblem, caseConflict, structNonAscii } from './规则/平台.ts';

describe('平台', () => {
  it('合规样例放行：实体名用中文、shell: false、Python 用列表参数', async () => {
    const root = makeRepo(base(), {
      'pipeline/环境/起.ts': "import { spawnSync } from 'node:child_process';\nexport const 起 = () => spawnSync('git', ['status'], { shell: false });\n",
      'py/srpy/起.py': "import subprocess\n# 别写 shell=True\nsubprocess.run(['git', 'status'], shell=False, encoding='utf-8')\n",
      'pipeline/指纹/说明.ts': "import spawn from 'cross-spawn';\nimport { execFileSync } from 'node:child_process';\nexport const x = (a: string[]) => [spawn('git', a), execFileSync('git', ['status']), /x/.exec('x')];\n",
      '作品/应力转动/认可/darwin-arm64/核对-冒烟.toml': '',
    });
    expect((await runRule('平台', root)).violations).toEqual([]);
  });

  it('Windows 不许的名字、结构层中文、开 shell、fcntl 都拦', async () => {
    const root = makeRepo(base(), {
      '作品/应力转动/段/7-甲/a:b.ts': '',
      '作品/应力转动/段/7-甲/con.ts': '',
      '作品/应力转动/段/7-甲/尾点.': '',
      '作品/应力转动/段/7-甲/é.ts': '',
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
    const v = (await runRule('平台', root)).violations.join('\n');
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
    for (const lineNo of [5, 6, 7, 8]) expect(v).toMatch(new RegExp(`py/srpy/坏.py:${lineNo} 不开 shell：os.system`));
    for (const lineNo of [4, 5, 6, 7, 8, 9, 10]) expect(v).toMatch(new RegExp(`pipeline/坏.ts:${lineNo} 不开 shell`));
    expect(v).not.toMatch(/pipeline\/坏.ts:1[12] /);
    expect(v).toMatch(/pipeline\/坏.cjs:2 不开 shell：execSync/);
  });

  it('只差大小写的文件和目录（Mac 上造不出来，查纯函数）', () => {
    expect(caseConflict(['a/Readme.md', 'a/readme.md', 'b/X/1.ts', 'b/x/2.ts', 'c/1.ts', 'c/2.ts'])).toEqual([
      { 文件: 'a/readme.md', existing: 'a/Readme.md', isFile: true },
      { 文件: 'b/x/2.ts', existing: 'b/X', isFile: false },
    ]);
    expect(caseConflict(['作品/应力转动/段/6-斩娜迦/段.ts', '作品/应力转动/段/6-斩娜迦/画面.tsx'])).toEqual([]);
  });

  it('名字和结构层判断', () => {
    expect(nameProblem('6-斩娜迦')).toBeNull();
    expect(nameProblem('LPT1.txt')).toMatch(/保留设备名/);
    expect(nameProblem('a ')).toMatch(/以点或空格结尾/);
    expect(structNonAscii('作品/应力转动/段/6-斩娜迦/段.ts')).toBeNull();
    expect(structNonAscii('说明.md')).toBe('说明.md');
    expect(structNonAscii('作品/甲/认可/达尔文/x.toml')).toBe('达尔文');
  });
});
