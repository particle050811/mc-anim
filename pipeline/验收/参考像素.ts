// 读认可参考（认可那版的抽样帧，FFV1 存的 yuv420p 原样）给 verify 比：按固定公式换成 RGB（比较.ts 的 转rgb），边交边核对是不是认可那版。
// 核对：参考旁边有旁记（<参考>.json，记各帧 yuv420p 的 sha，各版本 ffmpeg 解 FFV1 逐位一样）就核它；
// 没有旁记的是 11-02 换比法以前从段签无损抽样克隆的，核 ffmpeg 解成 rgb24 的 sha 等于认可记录（和签名同一种算法，换了 ffmpeg 版本可能对不上，补参考 会给它补旁记）。
import fs from 'node:fs';
import { 转rgb } from './比较.ts';
import { 抽样帧, 抽样流, sha } from './帧流.ts';
import { 抽样键, type 认可记录 } from './认可.ts';

/** 认可参考解出来和认可记录（或旁记）对不上（文件坏了）：verify 只让这一段不过，别的段照验 */
export class 参考对不上 extends Error {}

export const 旁记文件 = (参考: string) => `${参考.replace(/\.mkv$/, '')}.json`;

export type 旁记 = {
  /** 哪条认可记录的参考（认可.ts 的 抽样键，和参考文件名里的一样）：参考和记录配错了核得出来 */
  抽样键: string;
  /** 参考里各帧是原片的第几帧，升序 */
  帧: number[];
  /** 各帧 yuv420p 原样的 sha256 */
  yuv: string[];
  /** 从哪份母版抽的：压缩母版 / CRF1 / 段签抽样（11-02 以前的参考，补旁记时核过认可记录的 rgb 哈希） */
  来源: string;
  母版字节sha: string | null;
  记于: string;
};

export const 读旁记 = (参考: string): 旁记 | null => {
  try {
    const j = JSON.parse(fs.readFileSync(旁记文件(参考), 'utf8')) as 旁记;
    return typeof j.抽样键 === 'string' && Array.isArray(j.帧) && Array.isArray(j.yuv) && j.帧.length === j.yuv.length ? j : null;
  } catch {
    return null;
  }
};

/** 认可参考里 要的 这几帧（升序，都得是认可记录的抽样帧），按固定换算交出 rgb24；对不上抛 参考对不上 */
export async function* 参考像素(参考: string, 认可: 认可记录, 要的: readonly number[]): AsyncGenerator<Buffer> {
  const 帧们 = 抽样帧(认可.帧数, 认可.间隔);
  const 记 = 读旁记(参考);
  if (记 && (记.抽样键 !== 抽样键(认可) || 记.帧.join() !== 帧们.join())) throw new 参考对不上(`认可参考 ${参考} 的旁记不是这条认可记录的（删掉参考和旁记再 anim verify 补参考）`);
  const 旁记哈希 = new Map(记?.帧.map((f, i) => [f, 记.yuv[i]!]));
  const 记录哈希 = new Map(认可.帧.map((f) => [f.帧, f.哈希]));
  const yuv流 = 抽样流(参考, 帧们, 要的, 认可.宽, 认可.高, 'yuv420p');
  // 没有旁记的老参考：同一份再解一路 rgb24 核认可记录的哈希
  const rgb流 = 记 ? null : 抽样流(参考, 帧们, 要的, 认可.宽, 认可.高, 'rgb24');
  try {
    for (const f of 要的) {
      const y = await yuv流.next();
      if (y.done) throw new 参考对不上(`认可参考 ${参考} 解不出第 ${f} 帧`);
      if (记) {
        if (sha(y.value) !== 旁记哈希.get(f)) throw new 参考对不上(`认可参考 ${参考} 的第 ${f} 帧和旁记的 yuv 哈希对不上（参考坏了？删掉参考和旁记再 anim verify 补参考）`);
      } else {
        const r = await rgb流!.next();
        const 应 = 记录哈希.get(f);
        if (r.done || (应 !== undefined && sha(r.value) !== 应)) throw new 参考对不上(`认可参考 ${参考} 的第 ${f} 帧和认可记录的哈希对不上（参考坏了，或换了 ffmpeg 版本 rgb24 解得不一样？删掉它再 anim verify 补参考）`);
      }
      yield 转rgb(y.value, 认可.宽, 认可.高);
    }
  } finally {
    await yuv流.return(undefined);
    await rgb流?.return(undefined);
  }
}
