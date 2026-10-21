// 扫一遍母版：抽样帧算签名；给了认可记录就逐帧下结论（一样 / 容差内 / 变了），旧母版还在就逐像素比，不在就比块均值；
// 声音同理（旧母版在就算残差，不在只能比 sha）。变了的帧可以写 PNG 进预览。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from 'fast-png';
import { 视频信息, 有音轨 } from '../渲/探测.ts';
import { 帧流, 音频流, 抽样帧, 块均值, sha, 默认间隔 } from './帧流.ts';
import { 比像素, 比块均值, 残差, type 阈值 } from './比较.ts';
import type { 认可记录, 签名, 帧签名 } from './认可.ts';

export type 帧结论 = { 帧: number; 结论: '一样' | '容差内' | '变了'; 说明?: string };
export type 扫描结果 = { 签名: 签名; 帧结论: 帧结论[]; 音频结论: '一样' | '容差内' | '变了' | '没有音轨'; 音频说明?: string; 尺寸变了?: string; 比法: '逐像素' | '块均值' };

const 写png = (file: string, rgb: Buffer, 宽: number, 高: number) => fs.writeFileSync(file, encode({ width: 宽, height: 高, data: new Uint8Array(rgb.buffer, rgb.byteOffset, rgb.length), channels: 3, depth: 8 }));

export const 扫母版 = async (
  新母版: string,
  opts: { 认可?: 认可记录 | null; 旧母版?: string | null; 阈值?: 阈值; 预览?: { 目录: string; 前缀: string } } = {},
): Promise<扫描结果> => {
  const { 帧数, 宽, 高 } = 视频信息(新母版);
  const 认可 = opts.认可 ?? null;
  const 间隔 = 认可?.间隔 ?? 默认间隔;
  const 帧们 = 抽样帧(帧数, 间隔);
  const 尺寸变了 = 认可 && (认可.宽 !== 宽 || 认可.高 !== 高 || 认可.帧数 !== 帧数) ? `认可的是 ${认可.宽}×${认可.高} ${认可.帧数} 帧，现在是 ${宽}×${高} ${帧数} 帧` : undefined;
  let 旧 = 认可 && !尺寸变了 && opts.旧母版 && fs.existsSync(opts.旧母版) ? opts.旧母版 : null;
  if (旧) {
    const v = 视频信息(旧);
    if (v.宽 !== 宽 || v.高 !== 高 || v.帧数 !== 帧数) 旧 = null;
  }
  const 认可帧 = new Map((认可?.帧 ?? []).map((f) => [f.帧, f]));
  const 阈 = opts.阈值;
  if (认可 && !阈) throw new Error('和认可记录比要给阈值');

  const 新流 = 帧流(新母版, 帧们, 宽, 高);
  const 旧流 = 旧 ? 帧流(旧, 帧们, 宽, 高) : null;
  const 帧签名们: 帧签名[] = [];
  const 帧结论: 帧结论[] = [];
  try {
    for (const 帧 of 帧们) {
      const [a, b] = await Promise.all([新流.next(), 旧流?.next()]);
      if (a.done) throw new Error(`${新母版} 抽不出第 ${帧} 帧`);
      const rgb = a.value;
      const s: 帧签名 = { 帧, 哈希: sha(rgb), 块均值: 块均值(rgb, 宽, 高) };
      帧签名们.push(s);
      if (!认可 || 尺寸变了) continue;
      const 认 = 认可帧.get(帧);
      let 结: 帧结论;
      if (!认) 结 = { 帧, 结论: '变了', 说明: '认可记录里没有这一帧' };
      else if (认.哈希 === s.哈希) 结 = { 帧, 结论: '一样' };
      else if (b && !b.done) {
        const d = 比像素(rgb, b.value, 阈!.像素容差);
        const 说明 = `${(d.差像素占比 * 100).toFixed(3)}% 像素差超过 ${阈!.像素容差}，最大差 ${d.最大差}`;
        结 = { 帧, 结论: d.差像素占比 <= 阈!.差像素占比 ? '容差内' : '变了', 说明 };
        if (结.结论 === '变了' && opts.预览) 写png(path.join(opts.预览.目录, `${opts.预览.前缀}-第${String(帧).padStart(4, '0')}帧-认可.png`), b.value, 宽, 高);
      } else {
        const d = 比块均值(s.块均值, 认.块均值);
        结 = { 帧, 结论: d <= 阈!.块均值容差 ? '容差内' : '变了', 说明: `没有认可那版的母版，只比了块均值：最大差 ${d}` };
      }
      if (结.结论 === '变了' && opts.预览) 写png(path.join(opts.预览.目录, `${opts.预览.前缀}-第${String(帧).padStart(4, '0')}帧-现在.png`), rgb, 宽, 高);
      帧结论.push(结);
    }
  } finally {
    await 新流.return(undefined);
    await 旧流?.return(undefined);
  }

  // 声音
  let 音频sha: string | null = null;
  let 音频结论: 扫描结果['音频结论'] = '没有音轨';
  let 音频说明: string | undefined;
  if (有音轨(新母版)) {
    const h = crypto.createHash('sha256');
    const 新音 = 音频流(新母版);
    for await (const c of 新音) h.update(c);
    音频sha = h.digest('hex');
    if (认可 && !尺寸变了) {
      if (认可.音频sha === 音频sha) 音频结论 = '一样';
      else if (!认可.音频sha) [音频结论, 音频说明] = ['变了', '认可的那版没有音轨'];
      else if (旧 && 有音轨(旧)) {
        const db = await 算残差(新母版, 旧);
        音频结论 = db <= 阈!.音频残差dBFS ? '容差内' : '变了';
        音频说明 = `残差 ${Number.isFinite(db) ? db.toFixed(1) : db} dBFS（阈值 ${阈!.音频残差dBFS}）`;
      } else [音频结论, 音频说明] = ['变了', 'sha 不一样，没有认可那版的母版算不了残差'];
    }
  } else if (认可?.音频sha) [音频结论, 音频说明] = ['变了', '认可的那版有音轨，现在没有'];

  return { 签名: { 宽, 高, 帧数, 间隔, 帧: 帧签名们, 音频sha }, 帧结论, 音频结论, 音频说明, 尺寸变了: 尺寸变了 ?? undefined, 比法: 旧 ? '逐像素' : '块均值' };
};

/** 两条音轨逐采样相减；长度不一样直接算变了（+Infinity） */
const 算残差 = async (新: string, 旧: string) => {
  const r = new 残差();
  const a = 音频流(新);
  const b = 音频流(旧);
  let 余a = Buffer.alloc(0);
  let 余b = Buffer.alloc(0);
  let 完a = false;
  let 完b = false;
  try {
    while (!完a || !完b || 余a.length || 余b.length) {
      if (!完a && 余a.length < 65536) {
        const x = await a.next();
        if (x.done) 完a = true;
        else 余a = Buffer.concat([余a, x.value]);
      }
      if (!完b && 余b.length < 65536) {
        const x = await b.next();
        if (x.done) 完b = true;
        else 余b = Buffer.concat([余b, x.value]);
      }
      const n = Math.min(余a.length, 余b.length) & ~1;
      if (n) {
        r.加(余a.subarray(0, n), 余b.subarray(0, n));
        余a = 余a.subarray(n);
        余b = 余b.subarray(n);
      } else if ((完a && 余b.length) || (完b && 余a.length)) return Infinity;
    }
  } finally {
    await a.return(undefined);
    await b.return(undefined);
  }
  return r.dBFS;
};

/** 整段结论：有一项变了就要 accept */
export const 变了 = (r: 扫描结果) => !!r.尺寸变了 || r.帧结论.some((f) => f.结论 === '变了') || r.音频结论 === '变了';
