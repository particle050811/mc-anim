// 母版缓存的小件：<数据根>/cache/母版/<作品>/<段键>/ 下按指纹前 16 位起名。切片本身叫什么见 段产物.ts（<画面指纹>.mp4、<声音指纹>.wav，决策/0014）。
//   <指纹>.指纹.json  逐项展开（画面、声音各一份）；<指纹>.用过 修改时间是最后一次被 film、verify 用的时间（不是账本，各文件各记各的）
//   <指纹>.检出-<哈希> 哪个检出用过这个指纹，内容是检出路径（各 worktree 共用数据根，这边算不出别的检出的当前指纹，缓存/钉.ts 靠它不删人家的）
import crypto from 'node:crypto';
import fs from 'node:fs';
import { masterDir } from '../环境/作品数据.ts';
import path from 'node:path';
import { currentCheckout } from '../环境/路径.ts';
import type { SegFingerprint } from '../指纹/指纹.ts';

export const fingerprintFile = (segKey: string, fingerprint: string, dir = masterDir(segKey)) => path.join(dir, `${fingerprint.slice(0, 16)}.指纹.json`);

/** 删旧时，近这么久被用过的不删（film、verify 正在用的） */
export const recentUseMs = 2 * 3600 * 1000;
export const usedMarkFile = (masterDir: string, fingerprint: string) => path.join(masterDir, `${fingerprint.slice(0, 16)}.用过`);
export const checkoutMarkFile = (masterDir: string, fingerprint: string, checkout = currentCheckout()) => path.join(masterDir, `${fingerprint.slice(0, 16)}.检出-${crypto.createHash('sha256').update(checkout).digest('hex').slice(0, 8)}`);
/** 记一笔「刚用过」：改这一个小文件的修改时间，再留一个这个检出用过的记号；写不了（只读数据根）就算了，不影响出片 */
export const markUsed = (masterDir: string, fingerprint: string) => {
  try {
    fs.mkdirSync(masterDir, { recursive: true });
    fs.writeFileSync(usedMarkFile(masterDir, fingerprint), `${new Date().toISOString()}\n`, 'utf8');
    fs.writeFileSync(checkoutMarkFile(masterDir, fingerprint), `${currentCheckout()}\n`, 'utf8');
  } catch {
    // 记不上只是少一层保护
  }
};

/** 先写临时名再原子改名，中途失败不留半截文件 */
export const atomicWrite = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
};

export const writeFingerprint = (fp: SegFingerprint, dir = masterDir(fp.段)) => atomicWrite(fingerprintFile(fp.段, fp.指纹, dir), JSON.stringify({ ...fp, 算于: new Date().toISOString() }, null, 2) + '\n');

/** 这段之前渲过的指纹（新的在前），anim stale 拿最近一份比差异 */
export const fingerprintHistory = (segKey: string, dir = masterDir(segKey)): (SegFingerprint & { 算于?: string })[] => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.指纹.json'))
    .map((n) => path.join(dir, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
};
