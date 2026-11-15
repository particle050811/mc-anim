// 代码根（这份代码所在的检出，worktree 里就是 worktree 根）和主检出（git 公共目录的上一级，预览/、anim.local.toml 放这）。
// 本文件会被 Remotion 用 esbuild 打进 remotion.config.ts 的 CJS 包里，那时 import.meta.dirname 不在，退回从当前目录往上找。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const packageName = 'mc-anim';

let codeRootCache: string | undefined;
let mainCheckoutCache: string | undefined;

const isCodeRoot = (dir: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name === packageName;
  } catch {
    return false;
  }
};

export const codeRoot = (): string => {
  if (codeRootCache) return codeRootCache;
  const startDir = (import.meta as { dirname?: string }).dirname ?? process.cwd();
  for (let dir = path.resolve(startDir); ; dir = path.dirname(dir)) {
    if (isCodeRoot(dir)) return (codeRootCache = dir);
    // 别的仓库把 mc-anim 当依赖、配置被打成 CJS 时，从它的根往上找 node_modules/mc-anim（见 docs/外部复用.md）
    const depPath = path.join(dir, 'node_modules', packageName);
    if (isCodeRoot(depPath)) return (codeRootCache = fs.realpathSync(depPath));
    if (path.dirname(dir) === dir) throw new Error(`从 ${startDir} 往上找不到 package.json 名为 ${packageName} 的目录，要在仓库里跑`);
  }
};

/** git 公共目录的上一级；不在 git 里（公开版解压包）就是代码根 */
export const mainCheckout = (): string => {
  if (mainCheckoutCache) return mainCheckoutCache;
  const root = codeRoot();
  try {
    const [top, common] = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n');
    // 代码根要正好是那个仓库的根：解压在别的仓库里面时，不能把那个仓库当成主检出
    if (common && top && fs.realpathSync(top) === fs.realpathSync(root)) return (mainCheckoutCache = path.dirname(fs.realpathSync(common)));
  } catch {
    // 没装 git、不在仓库里
  }
  return (mainCheckoutCache = root);
};

const canonicalCheckout = (p: string) => {
  const r = path.resolve(fs.realpathSync(p)).normalize('NFC');
  return process.platform === 'win32' ? r.toLowerCase() : r;
};
/** 这份代码所在检出的规范路径（比较用：和 .检出-* 记号里写的同一个写法） */
export const currentCheckout = () => canonicalCheckout(codeRoot());
/** 这份代码是不是主检出（worktree 里是 false；公开版解压包没有 git，算主检出） */
export const inMainCheckout = () => currentCheckout() === canonicalCheckout(mainCheckout());

/** 当前提交和工作区是否有未提交的改动；不在 git 里返回 null */
export const commitStatus = (): { 提交: string; 有改动: boolean } | null => {
  try {
    const root = codeRoot();
    const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const changes = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { 提交: commit, 有改动: changes.trim() !== '' };
  } catch {
    return null;
  }
};

/** 相对代码根的正斜杠路径（指纹、manifest 里用，跨平台一致） */
export const relativeToCodeRoot = (p: string) => path.relative(codeRoot(), p).split(path.sep).join('/');
