// 认指纹的旧那一边（用户 11-17 定「新的单帧对比旧的单帧，旧的单帧用旧代码单独渲一次」，决策/0013）：
// 找出旧切片的像素是哪个提交渲的，在那个提交上开临时检出，用它自己的 anim verify frames --save 出同样的抽样帧（同页按帧号升序连出、切片参数），读回 PNG 和它算出的指纹。
// 只调旧提交早就有的命令（11-15 起参数是英文），不 import 旧代码：旧提交里的函数名、签名都可能不一样。
// 旧代码今天算出的指纹必须就是切片那份（沿用来的切片是 原渲 那份）：数据（地形、私有资产）变过，旧代码重渲出来的就不是切片的画面，不能拿来比。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runLogDir, isWindows } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { runTee } from '../环境/子进程.ts';
import { fingerprintFile, type RenderCommit } from '../渲/母版.ts';
import { stillFile } from '../渲/渲.ts';
import { masterDir } from '../环境/作品数据.ts';
import { ancestorLockEnv } from '../闸/闸.ts';
import { readCheckRecord } from './逐帧校验.ts';
import type { OldVersion } from './认指纹.ts';

/** commit：渲出这份像素的提交；fingerprint：那次渲的指纹（沿用来的切片是 原渲）；via：从哪查到的 */
export type RenderSource = { commit: string; fingerprint: string; via: string };

const runRecordName = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(film|render)-\d+\.json$/;

/**
 * 运行记录里最后一次写出这份切片的出片：产物里有 <作品>/<段键>/<指纹前 16 位>.mp4、开始时刻不晚于 before 的 film（早先叫 render）里最晚的一条。
 * 段签是渲完在闸里当场派生的，before 给段签的 派生于，就落在写出切片的那次里
 */
export const findRunRecordCommit = (work: string, segKey: string, fingerprint: string, before: string, dir = runLogDir()): { commit: string; dirty: boolean; file: string } | null => {
  if (!fs.existsSync(dir)) return null;
  const suffix = ['', work, segKey, `${fingerprint.slice(0, 16)}.mp4`].join('/');
  const candidates = fs
    .readdirSync(dir)
    .map((n) => ({ n, m: runRecordName.exec(n) }))
    .filter((x) => x.m && `${x.m[1]}-${x.m[2]}-${x.m[3]}T${x.m[4]}:${x.m[5]}:${x.m[6]}Z` <= before)
    .map((x) => x.n)
    .sort()
    .reverse();
  for (const n of candidates) {
    let r: { artifacts?: string[]; code?: { commit: string; dirty: boolean } | null };
    try {
      r = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
    } catch {
      continue;
    }
    if (!r.artifacts?.some((a) => a.split(path.sep).join('/').endsWith(suffix))) continue;
    return r.code ? { ...r.code, file: n } : null;
  }
  return null;
};

const readRenderCommit = (segKey: string, fingerprint: string, work: string): RenderCommit | null => {
  const f = fingerprintFile(segKey, fingerprint, masterDir(segKey, work));
  try {
    return (JSON.parse(fs.readFileSync(f, 'utf8')) as { renderCommit?: RenderCommit }).renderCommit ?? null;
  } catch {
    return null;
  }
};

/**
 * 旧切片的像素是哪个提交渲的：先看 .指纹.json 记的 renderCommit（出切片、认指纹时记），没有再翻运行记录。
 * 沿用来的切片找 原渲 那份（连着认几次也指到头）。工作区有未提交改动时渲的不能当基准
 */
export const findRenderSource = (segKey: string, oldVersion: Pick<OldVersion, 'fingerprint' | 'segStamp'>, work: string, runDir = runLogDir()): { source: RenderSource | null; why?: string } => {
  const fingerprint = oldVersion.segStamp.reuse?.origRender ?? oldVersion.fingerprint;
  const recorded = readRenderCommit(segKey, oldVersion.fingerprint, work) ?? (fingerprint === oldVersion.fingerprint ? null : readRenderCommit(segKey, fingerprint, work));
  const found = recorded ? { ...recorded, via: '指纹记录' } : (() => {
    const r = findRunRecordCommit(work, segKey, fingerprint, oldVersion.segStamp.derivedAt, runDir);
    return r ? { commit: r.commit, dirty: r.dirty, via: `运行记录 ${r.file}` } : null;
  })();
  const which = fingerprint === oldVersion.fingerprint ? '' : `（沿用自 ${fingerprint.slice(0, 16)}）`;
  if (!found) return { source: null, why: `查不到旧切片${which}是哪个提交渲的（.指纹.json 没记，运行记录里也没有写出它的 film）` };
  if (found.dirty) return { source: null, why: `旧切片${which}是 ${found.commit.slice(0, 12)} 带着未提交改动渲的（${found.via}），旧代码重渲不出来` };
  return { source: { commit: found.commit, fingerprint, via: found.via } };
};

/** 提交还在仓库里（没被 gc、不是别的仓库的） */
export const commitExists = (commit: string) => {
  try {
    execFileSync('git', ['-C', codeRoot(), 'cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

export type OldFrames = { fingerprint: string; commitText: string; png: Map<number, string> };

/**
 * 在旧检出里跑它的 anim verify frames <段…> --frames <帧> --save <名> --keep-images <目录>，一次打包出这几段的同一批帧。
 * 返回每段旧代码算出的指纹和 PNG 路径；基准记录（run/逐帧校验/<作品>/<名>/）读完就删。旧代码的过闸、低优先、运行记录都照它自己的
 */
export const renderOldFrames = async (checkoutDir: string, work: string, segKeys: readonly string[], frames: readonly number[], imageDir: string): Promise<Map<string, OldFrames>> => {
  const checkName = `认指纹-${process.pid}-${path.basename(imageDir)}`;
  const anim = path.join(checkoutDir, isWindows ? 'anim.cmd' : 'anim');
  const cmd = [anim, '--work', work, 'verify', 'frames', ...segKeys, '--frames', frames.join(','), '--save', checkName, '--keep-images', imageDir];
  console.log(`== 旧代码出帧：${cmd.slice(1).join(' ')}`);
  const env: NodeJS.ProcessEnv = { ...process.env, ANIM_PURPOSE: '认指纹' };
  delete env[ancestorLockEnv];
  const r = await runTee(cmd, { cwd: checkoutDir, env });
  const records = new Map([...r.stdout.matchAll(/^✓ (.+?)：\d+ 帧 → (.+\.tsv)$/gm)].map((m) => [m[1]!, m[2]!.trim()]));
  try {
    if (r.exitCode !== 0) throw new Error(`旧代码的 verify frames 失败（退出码 ${r.exitCode}），见上面的输出`);
    const out = new Map<string, OldFrames>();
    for (const segKey of segKeys) {
      const file = records.get(segKey);
      if (!file || !fs.existsSync(file)) throw new Error(`旧代码的 verify frames 没打出 ${segKey} 的基准记录`);
      const rec = readCheckRecord(file);
      const png = new Map(frames.map((f) => [f, stillFile(imageDir, segKey, f)]));
      const missing = frames.filter((f) => !rec.frame.has(f) || !fs.existsSync(png.get(f)!));
      if (missing.length) throw new Error(`旧代码只出了 ${segKey} 的 ${frames.length - missing.length}/${frames.length} 帧（缺 ${missing.join('、')}）`);
      out.set(segKey, { fingerprint: rec.fingerprint, commitText: rec.commit, png });
    }
    return out;
  } finally {
    for (const file of new Set(records.values())) if (path.basename(path.dirname(file)) === checkName) fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
};
