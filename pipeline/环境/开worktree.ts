// anim wt new：开 worktree 的唯一做法（用户 11-06 定：以前各会话、子 Agent 各自 npm ci、整份克隆、软链 node_modules，缓存跟着克隆，一个 worktree 涨到 25 GB）。
// 依赖：锁文件和主检出一样，就在 macOS 上用 cp -c 克隆主检出的 node_modules（APFS 写时复制，实测 2 秒、多占几 MB，各 worktree 互相隔离），
//   跳过 .cache（webpack 缓存名含检出路径，别的检出用不上，留在各自检出里、删 worktree 一起删）和 .remotion（浏览器在数据根，见 渲/浏览器.ts）；
//   锁文件不一样或不是 macOS，就在 worktree 里 npm ci。不软链：分支改了依赖就对不上，在 worktree 里重装还会动到主检出。
// anim.local.toml 不拷（worktree 里没有就读主检出那份）；.venv 不拷（没有就走 uv run，uv 自己有全局缓存）；不进 Git 的 .claude/skills 克隆过去。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 跑, 跑出 } from './子进程.ts';
import { 主检出 } from './路径.ts';

/** node_modules 里不跟着克隆的：缓存和下载的浏览器 */
export const 不克隆 = ['.cache', '.remotion'];
/** 不进 Git、worktree 里也要有的小目录 */
const 带过去 = [path.join('.claude', 'skills')];

export const worktree目录 = (主: string, 名: string) => path.join(path.dirname(主), 'mc-anim-wt', 名);

const 读 = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

/** 依赖怎么来：主检出有 node_modules、锁文件一字不差、是 macOS（cp -c 是 APFS 克隆）才克隆 */
export const 依赖做法 = (主: string, 目标: string, 平台 = process.platform): '克隆' | 'npm ci' => {
  const 锁 = 读(path.join(主, 'package-lock.json'));
  const 同 = 锁 !== null && 锁 === 读(path.join(目标, 'package-lock.json'));
  return 同 && 平台 === 'darwin' && fs.existsSync(path.join(主, 'node_modules')) ? '克隆' : 'npm ci';
};

const 克隆 = (从: string, 到: string) => 跑出(['cp', '-cR', 从, 到]);

export const 开worktree = async (名: string, 从: string) => {
  const 主 = 主检出();
  const 目标 = worktree目录(主, 名);
  if (fs.existsSync(目标)) throw new 用法错误(`${目标} 已经在了`);
  跑出(['git', '-C', 主, 'worktree', 'add', '-q', 目标, '-b', 名, 从]);
  const 做法 = 依赖做法(主, 目标);
  if (做法 === '克隆') {
    fs.mkdirSync(path.join(目标, 'node_modules'));
    for (const e of fs.readdirSync(path.join(主, 'node_modules'))) {
      if (!不克隆.includes(e)) 克隆(path.join(主, 'node_modules', e), path.join(目标, 'node_modules', e));
    }
  } else {
    await 跑(['npm', 'ci', '--no-audit', '--no-fund'], { cwd: 目标 });
  }
  const 带了: string[] = [];
  for (const d of 带过去) {
    if (!fs.existsSync(path.join(主, d)) || fs.existsSync(path.join(目标, d))) continue;
    fs.mkdirSync(path.dirname(path.join(目标, d)), { recursive: true });
    克隆(path.join(主, d), path.join(目标, d));
    带了.push(d);
  }
  return { 目标, 做法, 带了 };
};

export const worktree命令: Record<string, 命令> = {
  wt: {
    用法: 'wt new <名> [--从 <分支>]',
    说明: '开 worktree（../mc-anim-wt/<名>，新分支 <名>，默认从 main）并备好依赖：锁文件和主检出一样就克隆主检出的 node_modules（不带 .cache、.remotion），不一样就 npm ci；不进 Git 的 .claude/skills 克隆过去。并行任务、子 Agent 开 worktree 都用它',
    跑: async (args) => {
      const p = 解析参数(args, { 值: ['--从'] });
      if (p.位置[0] !== 'new' || p.位置.length !== 2) throw new 用法错误('用法：anim wt new <名> [--从 <分支>]');
      const r = await 开worktree(p.位置[1]!, p.值['--从'] ?? 'main');
      console.log(`${r.目标}\n依赖：${r.做法 === '克隆' ? '克隆主检出的 node_modules（不带 .cache、.remotion）' : 'npm ci'}${r.带了.length ? `；带过去：${r.带了.join('、')}` : ''}`);
    },
  },
};
