// 取段签：verify、accept、认指纹 要段签时用。切片（mp4）和 wav 都在就看它们：段签是这一对派生的直接用，缺了或对不上当场从它们派生（派生 '补'）；
// 切片不在的，有齐全的段签就用（同一指纹的另一次渲染，字节对不上也只能用它），没有返回 null。
// 派生要解码切片，调用方传「等放行」（懒放行闸），真要派生时才过闸、一条命令只过一次。
import fs from 'node:fs';
import type { RunRecord } from '../运行记录/记录.ts';
import { sameVersion, type Signature } from './认可.ts';
import { deriveSegStamp, matchesSlice, readSegStamp, segStampComplete, type SegStamp, type SelfCheck } from './段签.ts';

export const driftHint = (segKey: string, check: SelfCheck) => `重渲漂移：${segKey} 同一指纹重渲出来和上次派生的段签不一样（${check.note}），对这段跑 anim verify ${segKey}`;

/**
 * verify 碰上指纹和认可版一样的段：只读 签.json、stat 切片（不解码、不过闸），看同一指纹是不是重渲过。
 * 段签的签名和认可记录不一样，或切片大小改于和段签记的不一样（重渲了、段签还没跟上），返回原因，要真比一次；没有段签、都一样返回 null
 */
export const sameFingerprintRerender = (segStamp: SegStamp | null, approvedSig: Signature, pictureMp4: string): string | null => {
  if (!segStampComplete(segStamp)) return null;
  if (fs.existsSync(pictureMp4)) {
    const st = fs.statSync(pictureMp4);
    if (st.size !== segStamp.master.size || st.mtimeMs !== segStamp.master.modifiedAt) return '切片和段签记的不是同一份';
  }
  return sameVersion(segStamp.signature, approvedSig) ? null : '段签的签名和认可记录不一样';
};

type SegSlice = Parameters<typeof deriveSegStamp>[0];

/** 这一段切片的段签（见文件头） */
export const fetchSegStamp = async (r: SegSlice, opts: { waitGate: () => Promise<void>; runRecord?: RunRecord }): Promise<SegStamp | null> => {
  const segStamp = readSegStamp(r.segment.key, r.pictureFingerprint.fingerprint);
  if (!fs.existsSync(r.画面) || !fs.existsSync(r.sound)) return segStampComplete(segStamp) ? segStamp : null;
  if (segStampComplete(segStamp) && (await matchesSlice(segStamp, r.画面, r.sound))) return segStamp;
  await opts.waitGate();
  console.log(`== 补段签 ${r.segment.key}（${r.pictureFingerprint.fingerprint.slice(0, 16)}）`);
  const x = await deriveSegStamp(r, { derive: '补' });
  if (x.自查?.verdict === '漂移') opts.runRecord?.log('警告', driftHint(r.segment.key, x.自查));
  return x.segStamp;
};
