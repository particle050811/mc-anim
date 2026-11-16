// 检查的文件表要带上 作品/ 下被 .gitignore 挡住的私有作品（普通目录和自己是 git 仓库的都算）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { CheckContext } from '../源码/上下文.ts';

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
const writeFile = (root: string, p: string, s = 'export {};\n') => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), s);
};

describe('私有作品', () => {
  it('被忽略的 作品/<名>/ 也进文件表，嵌套仓库按它自己的 ls-files', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-私有-')));
    git(root, 'init', '-q');
    writeFile(root, '.gitignore', '/作品/私甲/\n/作品/私乙/\n');
    writeFile(root, '作品/公开/清单.ts');
    writeFile(root, '作品/私甲/清单.ts');
    writeFile(root, '作品/私乙/清单.ts');
    writeFile(root, '作品/私乙/.gitignore', '临时/\n');
    writeFile(root, '作品/私乙/临时/x.ts');
    git(path.join(root, '作品', '私乙'), 'init', '-q');
    const fileList = new CheckContext(root).文件();
    expect(fileList).toEqual(expect.arrayContaining(['作品/公开/清单.ts', '作品/私甲/清单.ts', '作品/私乙/清单.ts']));
    expect(fileList).not.toContain('作品/私乙/临时/x.ts');
    expect(fileList.filter((p) => p.includes('.git/'))).toEqual([]);
    fs.rmSync(root, { recursive: true });
  });
});
