// anim still … --vs <检出|分支|main>：同一批帧先在对方检出用它自己的 anim 出一遍，再在这边出一遍，然后 anim diff 两边（用户 11-17 同意做）。
// 对方用它自己的代码和 anim（main 上可能还没有 diff、--vs），所以只调它早就有的 anim still … --to-preview，从输出里「静帧在 <目录>」取目录。
// 两边各过各的资源闸：对方是另一个进程、自己排票；这边等它退出后才渲，不会同时占着 GPU。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isWindows } from '../环境/配置.ts';
import { codeRoot, currentCheckout } from '../环境/路径.ts';
import { runTee } from '../环境/子进程.ts';
import { ancestorLockEnv } from '../闸/闸.ts';

export type Checkout = { dir: string; label: string };

/** git worktree list --porcelain 拆成 目录、分支（分离头指针的没有分支） */
export const parseWorktreeList = (text: string): { dir: string; branch: string | null }[] =>
  text
    .split(/\n\s*\n/)
    .map((block) => {
      const dir = /^worktree (.+)$/m.exec(block)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;
      return dir ? { dir, branch } : null;
    })
    .filter((x): x is { dir: string; branch: string | null } => x !== null);

const isAnimCheckout = (dir: string) => fs.existsSync(path.join(dir, 'pipeline', 'cli', 'main.ts')) && fs.existsSync(path.join(dir, isWindows ? 'anim.cmd' : 'anim'));

const sameDir = (a: string, b: string) => fs.realpathSync(a).normalize('NFC') === fs.realpathSync(b).normalize('NFC');

/** 文件夹名里用的叫法：分支名（/ 换成 _），没有分支用目录名 */
export const checkoutLabel = (branch: string | null, dir: string) => (branch ?? path.basename(dir)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');

/** --vs 的值：一个检出的路径，或 git worktree list 里的分支名、目录名（main 就是主检出） */
export const resolveCheckout = (target: string): Checkout => {
  const list = parseWorktreeList(execFileSync('git', ['-C', codeRoot(), 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }));
  const asPath = path.resolve(target);
  const hit = fs.existsSync(asPath) && fs.statSync(asPath).isDirectory() ? (list.find((w) => sameDir(w.dir, asPath)) ?? { dir: asPath, branch: null }) : (list.find((w) => w.branch === target) ?? list.find((w) => path.basename(w.dir) === target));
  if (!hit) throw new Error(`--vs ${target}：不是检出的路径，git worktree list 里也没有这个分支或目录名（有：${list.map((w) => w.branch ?? path.basename(w.dir)).join('、')}）`);
  if (!isAnimCheckout(hit.dir)) throw new Error(`--vs ${target}：${hit.dir} 不是 mc-anim 的检出（没有 anim 和 pipeline/cli/main.ts）`);
  if (sameDir(hit.dir, currentCheckout())) throw new Error(`--vs ${target} 就是这个检出（${hit.dir}），要和别的检出比`);
  return { dir: hit.dir, label: checkoutLabel(hit.branch, hit.dir) };
};

/** 这个检出的叫法（分支名，没有就目录名） */
export const selfLabel = () => {
  let branch: string | null = null;
  try {
    branch = execFileSync('git', ['-C', codeRoot(), 'branch', '--show-current'], { encoding: 'utf8' }).trim() || null;
  } catch {
    // 不在 git 里
  }
  return checkoutLabel(branch, codeRoot());
};

/** 在对方检出跑 anim still <参数…>，返回它出的静帧目录 */
export const runStillThere = async (c: Checkout, work: string, args: string[]): Promise<string> => {
  const anim = path.join(c.dir, isWindows ? 'anim.cmd' : 'anim');
  const cmd = [anim, '--work', work, 'still', ...args];
  console.log(`== --vs：先在 ${c.dir} 出（${c.label} 的代码）：${cmd.slice(1).join(' ')}`);
  const env = { ...process.env };
  delete env[ancestorLockEnv];
  const r = await runTee(cmd, { cwd: c.dir, env });
  if (r.exitCode !== 0) throw new Error(`${c.label} 那边的 anim still 失败（退出码 ${r.exitCode}），见上面的输出`);
  const dir = [...r.stdout.matchAll(/^静帧在 (.+)$/gm)].at(-1)?.[1]?.trim();
  if (!dir || !fs.existsSync(dir)) throw new Error(`${c.label} 那边的 anim still 没打出「静帧在 <目录>」，找不到它出的图`);
  return dir;
};
