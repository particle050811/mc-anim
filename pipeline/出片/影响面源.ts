// anim impact 的两边：本检出，和 --vs 给的对方（检出的工作区，或 git 提交解出来的临时目录）。各自按自己的代码根打包加载作品源（作品源.ts），
// 再用本检出的 时间轴.ts 算全片快照：对方没有 impact、没有声音接缝判断也能比，比出来的只是作品数据（段、cue、场时间线、动作）的差别。
// 不在对方检出起它自己的 anim：旧提交根本没有这些命令（见 docs/时间轴.md「anim impact」的取舍）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { dataRoot } from '../环境/配置.ts';
import { codeRoot, commitStatus } from '../环境/路径.ts';
import { filmProfile } from '../渲/设置.ts';
import { resolveCheckout, selfLabel } from '../验收/对方检出.ts';
import { computeTimeline, type TimelineBody } from './时间轴.ts';
import { loadWorkSource, type MotionFrames } from './作品源.ts';

export type Snapshot = { label: string; body: TimelineBody; motion: MotionFrames | null; motionError?: string };
export type OtherSide = { dir: string; label: string; cleanup: () => void };

const git = (root: string, args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** 检出的叫法带上提交和脏没脏 */
const describeDir = (dir: string, name: string) => {
  try {
    const commit = git(dir, ['rev-parse', '--short=8', 'HEAD']);
    const dirty = git(dir, ['status', '--porcelain', '--untracked-files=no']) !== '';
    return `${name}（${commit}${dirty ? '，有没提交的改动' : ''}）`;
  } catch {
    return name;
  }
};

export const selfSideLabel = () => {
  const c = commitStatus();
  return `${selfLabel()}（${c ? `${c.commit.slice(0, 8)}${c.dirty ? '，有没提交的改动' : ''}` : '不在 git 里'}）`;
};

/** --vs：先当检出（路径、分支、目录名；用它工作区的文件），认不出再当 git 提交（git archive 解到本检出 node_modules/.cache/ 下，用完删） */
export const resolveOther = (target: string): OtherSide => {
  try {
    const c = resolveCheckout(target);
    return { dir: c.dir, label: describeDir(c.dir, c.label), cleanup: () => {} };
  } catch (e) {
    if (/就是这个检出/.test((e as Error).message)) throw e;
    let sha: string;
    try {
      sha = git(codeRoot(), ['rev-parse', '--verify', '--quiet', `${target}^{commit}`]);
    } catch {
      throw new Error(`--vs ${target}：不是检出，也不是 git 提交（${(e as Error).message}）`);
    }
    const dir = path.join(codeRoot(), 'node_modules', '.cache', `impact-${sha.slice(0, 12)}-${process.pid}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const tar = execFileSync('git', ['-C', codeRoot(), 'archive', '--format=tar', sha], { maxBuffer: 1 << 30 });
    execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 1 << 30 });
    return { dir, label: `${target}（${sha.slice(0, 8)}）`, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }
};

/** 作品在对方代码根里的位置：作品在仓库里的跟着换根；anim.local.toml [works] 登记在仓库外的不随检出走，两边是同一份 */
export const workRootIn = (root: string, selfWorkRoot: string) => {
  const rel = path.relative(codeRoot(), selfWorkRoot);
  return rel.startsWith('..') || path.isAbsolute(rel) ? selfWorkRoot : path.join(root, rel);
};

/** 一份代码根上整部作品正片的快照 */
export const loadSnapshot = async (o: { root: string; workRoot: string; work: string; label: string }): Promise<Snapshot> => {
  if (!fs.existsSync(path.join(o.workRoot, '清单.ts'))) throw new Error(`${o.label} 里没有作品 ${o.work}（${o.workRoot}）`);
  const src = await loadWorkSource({ codeRoot: o.root, workRoot: o.workRoot, work: o.work, dataRoot: dataRoot() });
  const body = computeTimeline(src, src.segments.map((s) => s.key), filmProfile().fps);
  return { label: o.label, body, motion: src.motion, ...(src.motionError ? { motionError: src.motionError } : {}) };
};
