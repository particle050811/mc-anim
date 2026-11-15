// 读认可参考（认可那版的抽样帧，FFV1 存的 yuv420p 原样）给 verify 比：按固定公式换成 RGB（比较.ts 的 转rgb），边交边核对是不是认可那版。
// 核对：参考旁边的旁记（<参考>.json，记各帧 yuv420p 的 sha，各版本 ffmpeg 解 FFV1 逐位一样）。没有旁记的是 11-02 换比法以前的老参考，
// 认的是 CRF1 时代的认可（verify 先报要重新认可，到不了这里），不再核 rgb 哈希、补旁记（11-06 删了），当对不上。
import fs from 'node:fs';
import { yuvToRgb } from './比较.ts';
import { sampleFrames, sampledStream, sha } from './帧流.ts';
import { sampleKey, type ApprovalRecord } from './认可.ts';

/** 认可参考解出来和认可记录（或旁记）对不上（文件坏了）：verify 只让这一段不过，别的段照验 */
export class RefMismatchError extends Error {}

export const sideNoteFile = (refFile: string) => `${refFile.replace(/\.mkv$/, '')}.json`;

export type Sidecar = {
  /** 哪条认可记录的参考（认可.ts 的 抽样键，和参考文件名里的一样）：参考和记录配错了核得出来 */
  抽样键: string;
  /** 参考里各帧是原片的第几帧，升序 */
  帧: number[];
  /** 各帧 yuv420p 原样的 sha256 */
  yuv: string[];
  /** 从哪份抽的（现在只有 切片） */
  来源: string;
  母版字节sha: string | null;
  记于: string;
};

export const readSidecar = (refFile: string): Sidecar | null => {
  try {
    const j = JSON.parse(fs.readFileSync(sideNoteFile(refFile), 'utf8')) as Sidecar;
    return typeof j.抽样键 === 'string' && Array.isArray(j.帧) && Array.isArray(j.yuv) && j.帧.length === j.yuv.length ? j : null;
  } catch {
    return null;
  }
};

/** 认可参考里 要的 这几帧（升序，都得是认可记录的抽样帧），按固定换算交出 rgb24；对不上抛 参考对不上 */
export async function* refPixels(refFile: string, approval: ApprovalRecord, wantedFrames: readonly number[]): AsyncGenerator<Buffer> {
  const frames = sampleFrames(approval.帧数, approval.间隔);
  const sideNote = readSidecar(refFile);
  if (!sideNote) throw new RefMismatchError(`认可参考 ${refFile} 没有旁记（换比法以前的老参考），删掉它再 anim verify backfill`);
  if ((sideNote.抽样键 !== sampleKey(approval) || sideNote.帧.join() !== frames.join())) throw new RefMismatchError(`认可参考 ${refFile} 的旁记不是这条认可记录的（删掉参考和旁记再 anim verify backfill）`);
  const sidecarHashes = new Map(sideNote.帧.map((f, i) => [f, sideNote.yuv[i]!]));
  const yuvStream = sampledStream(refFile, frames, wantedFrames, approval.宽, approval.高, 'yuv420p');
  try {
    for (const f of wantedFrames) {
      const y = await yuvStream.next();
      if (y.done) throw new RefMismatchError(`认可参考 ${refFile} 解不出第 ${f} 帧`);
      if (sha(y.value) !== sidecarHashes.get(f)) throw new RefMismatchError(`认可参考 ${refFile} 的第 ${f} 帧和旁记的 yuv 哈希对不上（参考坏了？删掉参考和旁记再 anim verify backfill）`);
      yield yuvToRgb(y.value, approval.宽, approval.高);
    }
  } finally {
    await yuvStream.return(undefined);
  }
}
