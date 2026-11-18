// anim wt new：开 worktree 的唯一做法（用户 11-06 定：以前各会话、子 Agent 各自 npm ci、整份克隆、软链 node_modules，缓存跟着克隆，一个 worktree 涨到 25 GB）。
// 依赖：在 worktree 里 pnpm install --frozen-lockfile（用户 11-06 定换 pnpm、三系统一个做法）。pnpm 从全机共用的 store 导进来，
//   macOS 是 APFS 克隆、Windows 和 Linux 是硬链接，store 里有的不下载，几秒装完、几乎不多占盘；各 worktree 的 node_modules 互相独立，
//   分支改了依赖也只装自己的。缓存（.cache）各检出自己生，浏览器在数据根（渲/浏览器.ts），都不跟过来。
// anim.local.toml 不拷（worktree 里没有就读主检出那份）；.venv 不拷（没有就走 uv run，uv 自己有全局缓存）；不进 Git 的 .claude/skills 复制过去。
import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from '../cli/参数.ts';
import { runCmd, runCapture } from './子进程.ts';
import { mainCheckout } from './路径.ts';
import { registerCleanup } from './收尾.ts';

/** 装依赖的命令：锁文件不许改，store 里有的不联网 */
export const installDeps = ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'] as const;
/** 不进 Git、worktree 里也要有的小目录 */
const carryDirs = [path.join('.claude', 'skills')];

export const worktreeDir = (mainCheckout: string, worktreeName: string) => path.join(path.dirname(mainCheckout), 'mc-anim-wt', worktreeName);

export const openWorktree = async (worktreeName: string, fromRef: string) => {
  const mainDir = mainCheckout();
  const targetWorktreeDir = worktreeDir(mainDir, worktreeName);
  if (fs.existsSync(targetWorktreeDir)) throw new UsageError(`${targetWorktreeDir} 已经在了`);
  runCapture(['git', '-C', mainDir, 'worktree', 'add', '-q', targetWorktreeDir, '-b', worktreeName, fromRef]);
  await runCmd([...installDeps], { cwd: targetWorktreeDir });
  const carried: string[] = [];
  for (const d of carryDirs) {
    if (!fs.existsSync(path.join(mainDir, d)) || fs.existsSync(path.join(targetWorktreeDir, d))) continue;
    fs.cpSync(path.join(mainDir, d), path.join(targetWorktreeDir, d), { recursive: true });
    carried.push(d);
  }
  return { target: targetWorktreeDir, carried };
};

/**
 * 认指纹在旧提交上出帧用的临时检出（决策/0013）：分离头指针、不建分支，依赖照 wt new 一样从 pnpm store 导进来；
 * 放在 mc-anim-wt/ 下以点开头的目录（wt 列表、分支都不留痕）。close 删检出（git worktree remove，删不掉就整删再 prune）；进程被杀也删
 */
export const openTempCheckout = async (commit: string): Promise<{ dir: string; close: () => void }> => {
  const mainDir = mainCheckout();
  const dir = worktreeDir(mainDir, `.认指纹-${commit.slice(0, 12)}-${process.pid}`);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    undo();
    try {
      runCapture(['git', '-C', mainDir, 'worktree', 'remove', '--force', dir]);
    } catch {
      fs.rmSync(dir, { recursive: true, force: true });
      try {
        runCapture(['git', '-C', mainDir, 'worktree', 'prune']);
      } catch {
        // prune 不了只是 git worktree list 里多一条死记录
      }
    }
  };
  const undo = registerCleanup(close);
  try {
    runCapture(['git', '-C', mainDir, 'worktree', 'add', '-q', '--detach', dir, commit]);
    await runCmd([...installDeps], { cwd: dir, quiet: true });
  } catch (e) {
    close();
    throw e;
  }
  return { dir, close };
};
