// 检查的文件表要带上 作品/ 下被 .gitignore 挡住的私有作品（普通目录和自己是 git 仓库的都算）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { 检查上下文 } from './上下文.ts';

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
const 写 = (根: string, p: string, s = 'export {};\n') => {
  fs.mkdirSync(path.dirname(path.join(根, p)), { recursive: true });
  fs.writeFileSync(path.join(根, p), s);
};

describe('私有作品', () => {
  it('被忽略的 作品/<名>/ 也进文件表，嵌套仓库按它自己的 ls-files', () => {
    const 根 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-私有-')));
    git(根, 'init', '-q');
    写(根, '.gitignore', '/作品/私甲/\n/作品/私乙/\n');
    写(根, '作品/公开/清单.ts');
    写(根, '作品/私甲/清单.ts');
    写(根, '作品/私乙/清单.ts');
    写(根, '作品/私乙/.gitignore', '临时/\n');
    写(根, '作品/私乙/临时/x.ts');
    git(path.join(根, '作品', '私乙'), 'init', '-q');
    const 表 = new 检查上下文(根).文件();
    expect(表).toEqual(expect.arrayContaining(['作品/公开/清单.ts', '作品/私甲/清单.ts', '作品/私乙/清单.ts']));
    expect(表).not.toContain('作品/私乙/临时/x.ts');
    expect(表.filter((p) => p.includes('.git/'))).toEqual([]);
    fs.rmSync(根, { recursive: true });
  });
});
