// 代码根（这份代码所在的检出，worktree 里就是 worktree 根）和主检出（git 公共目录的上一级，预览/、anim.local.toml 放这）。
// 本文件会被 Remotion 用 esbuild 打进 remotion.config.ts 的 CJS 包里，那时 import.meta.dirname 不在，退回从当前目录往上找。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const 包名 = 'mc-anim';

let 代码根缓存: string | undefined;
let 主检出缓存: string | undefined;

const 是代码根 = (dir: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name === 包名;
  } catch {
    return false;
  }
};

export const 代码根 = (): string => {
  if (代码根缓存) return 代码根缓存;
  const 起点 = (import.meta as { dirname?: string }).dirname ?? process.cwd();
  for (let dir = path.resolve(起点); ; dir = path.dirname(dir)) {
    if (是代码根(dir)) return (代码根缓存 = dir);
    if (path.dirname(dir) === dir) throw new Error(`从 ${起点} 往上找不到 package.json 名为 ${包名} 的目录，要在仓库里跑`);
  }
};

/** git 公共目录的上一级；不在 git 里（公开版解压包）就是代码根 */
export const 主检出 = (): string => {
  if (主检出缓存) return 主检出缓存;
  const root = 代码根();
  try {
    const [top, common] = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n');
    // 代码根要正好是那个仓库的根：解压在别的仓库里面时，不能把那个仓库当成主检出
    if (common && top && fs.realpathSync(top) === fs.realpathSync(root)) return (主检出缓存 = path.dirname(fs.realpathSync(common)));
  } catch {
    // 没装 git、不在仓库里
  }
  return (主检出缓存 = root);
};

/** 当前提交和工作区是否有未提交的改动；不在 git 里返回 null */
export const 提交状态 = (): { 提交: string; 有改动: boolean } | null => {
  try {
    const root = 代码根();
    const 提交 = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const 改动 = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { 提交, 有改动: 改动.trim() !== '' };
  } catch {
    return null;
  }
};

/** 相对代码根的正斜杠路径（指纹、manifest 里用，跨平台一致） */
export const 相对代码根 = (p: string) => path.relative(代码根(), p).split(path.sep).join('/');
