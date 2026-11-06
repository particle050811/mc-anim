// anim wt new：开 worktree 的唯一做法（用户 11-06 定：以前各会话、子 Agent 各自 npm ci、整份克隆、软链 node_modules，缓存跟着克隆，一个 worktree 涨到 25 GB）。
// 依赖：在 worktree 里 pnpm install --frozen-lockfile（用户 11-06 定换 pnpm、三系统一个做法）。pnpm 从全机共用的 store 导进来，
//   macOS 是 APFS 克隆、Windows 和 Linux 是硬链接，store 里有的不下载，几秒装完、几乎不多占盘；各 worktree 的 node_modules 互相独立，
//   分支改了依赖也只装自己的。缓存（.cache）各检出自己生，浏览器在数据根（渲/浏览器.ts），都不跟过来。
// anim.local.toml 不拷（worktree 里没有就读主检出那份）；.venv 不拷（没有就走 uv run，uv 自己有全局缓存）；不进 Git 的 .claude/skills 复制过去。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 跑, 跑出 } from './子进程.ts';
import { 主检出 } from './路径.ts';

/** 装依赖的命令：锁文件不许改，store 里有的不联网 */
export const 装依赖 = ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'] as const;
/** 不进 Git、worktree 里也要有的小目录 */
const 带过去 = [path.join('.claude', 'skills')];

export const worktree目录 = (主: string, 名: string) => path.join(path.dirname(主), 'mc-anim-wt', 名);

export const 开worktree = async (名: string, 从: string) => {
  const 主 = 主检出();
  const 目标 = worktree目录(主, 名);
  if (fs.existsSync(目标)) throw new 用法错误(`${目标} 已经在了`);
  跑出(['git', '-C', 主, 'worktree', 'add', '-q', 目标, '-b', 名, 从]);
  await 跑([...装依赖], { cwd: 目标 });
  const 带了: string[] = [];
  for (const d of 带过去) {
    if (!fs.existsSync(path.join(主, d)) || fs.existsSync(path.join(目标, d))) continue;
    fs.cpSync(path.join(主, d), path.join(目标, d), { recursive: true });
    带了.push(d);
  }
  return { 目标, 带了 };
};

export const worktree命令: Record<string, 命令> = {
  wt: {
    用法: 'wt new <名> [--从 <分支>]',
    说明: '开 worktree（../mc-anim-wt/<名>，新分支 <名>，默认从 main）并备好依赖：pnpm install --frozen-lockfile（从全机共用的 store 克隆或硬链接，几秒）；不进 Git 的 .claude/skills 复制过去。并行任务、子 Agent 开 worktree 都用它',
    跑: async (args) => {
      const p = 解析参数(args, { 值: ['--从'] });
      if (p.位置[0] !== 'new' || p.位置.length !== 2) throw new 用法错误('用法：anim wt new <名> [--从 <分支>]');
      const r = await 开worktree(p.位置[1]!, p.值['--从'] ?? 'main');
      console.log(`${r.目标}\n依赖：${装依赖.join(' ')}${r.带了.length ? `；带过去：${r.带了.join('、')}` : ''}`);
    },
  },
};
