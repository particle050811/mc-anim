// 扫一遍母版：抽样帧算签名，声音算 sha、响度、起音；给了参照（认可记录，或旧项目基线）就逐帧下结论（一样 / 容差内 / 变了）。
// 母版不在、只有段签（pipeline/段签/）时 扫段签：签名、声音读 签.json，要看像素的帧从段签的抽样帧（无损）取，结论和扫母版逐位相同。
// 参照有像素（认可参考、认可那版的母版还在、基线 PNG）就逐像素比，只有签名就比块均值；变了的帧写 旧|新|差 的并排图进预览给人看。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from 'fast-png';
import { 视频信息, 有音轨 } from '../渲/探测.ts';
import { 帧流, 音频流, 抽样帧, 抽样流, 块均值, sha, 默认间隔 } from './帧流.ts';
import { 包络, 找起音, 响度, 比像素, 比块均值, 比起音, 并排, type 阈值 } from './比较.ts';
import type { 认可记录, 声音签名, 签名, 帧签名 } from './认可.ts';

export type 帧结论 = { 帧: number; 结论: '一样' | '容差内' | '变了'; 说明?: string };
export type 扫描结果 = {
  签名: 签名;
  帧结论: 帧结论[];
  音频结论: '一样' | '容差内' | '变了' | '没有音轨';
  音频说明?: string;
  尺寸变了?: string;
  比法: '逐像素' | '块均值';
  /** 参照的像素取自哪（认可参考 / 认可那版的母版 / 基线），只给人看 */
  像素来源?: string;
};

/** 拿来比的那一版 */
export type 参照 = {
  名: string; // 并排图文件名里用
  宽: number;
  高: number;
  帧数: number;
  帧们: number[]; // 比哪几帧
  签名: Map<number, 帧签名>; // 有就先比哈希
  像素: ((帧们: number[]) => AsyncGenerator<Buffer>) | null; // 按帧号升序交出 rgb24
  像素来源?: string;
  声音: 声音签名 | null; // null = 那一版没有音轨
};

const 写png = (file: string, rgb: Buffer, 宽: number, 高: number) => fs.writeFileSync(file, encode({ width: 宽, height: 高, data: new Uint8Array(rgb.buffer, rgb.byteOffset, rgb.length), channels: 3, depth: 8 }));

/** 母版的声音签名：PCM 的 sha、积分响度、起音 */
export const 扫声音 = async (file: string): Promise<声音签名> => {
  const h = crypto.createHash('sha256');
  const 包 = new 包络();
  for await (const c of 音频流(file)) {
    h.update(c);
    包.加(c);
  }
  return { 音频sha: h.digest('hex'), 响度: 响度(file), 起音: 找起音(包.完()) };
};

/**
 * 认可记录作参照。像素按这个顺序取：认可参考（认可那版的抽样帧，无损；解出来逐帧核对认可记录的哈希）、认可那版的母版（尺寸帧数一样才用）、都没有就只比块均值。
 * 记录里没响度、起音的从认可那版的母版补
 */
export const 认可参照 = async (认可: 认可记录, 旧母版?: string | null, 参考?: string | null): Promise<参照> => {
  let 旧 = 旧母版 && fs.existsSync(旧母版) ? 旧母版 : null;
  if (旧) {
    const v = 视频信息(旧);
    if (v.宽 !== 认可.宽 || v.高 !== 认可.高 || v.帧数 !== 认可.帧数) 旧 = null;
  }
  let 声音: 声音签名 | null = 认可.音频sha ? { 音频sha: 认可.音频sha, 响度: 认可.响度, 起音: 认可.起音 } : null;
  if (声音 && (声音.响度 === null || !声音.起音) && 旧 && 有音轨(旧)) 声音 = { ...(await 扫声音(旧)), 音频sha: 声音.音频sha };
  const 帧们 = 抽样帧(认可.帧数, 认可.间隔);
  const 签名 = new Map(认可.帧.map((f) => [f.帧, f]));
  const 参考在 = 参考 && fs.existsSync(参考) ? 参考 : null;
  const 像素 = 参考在
    ? async function* (要的: number[]) {
        let i = 0;
        for await (const rgb of 抽样流(参考在, 帧们, 要的, 认可.宽, 认可.高)) {
          const f = 要的[i++]!;
          const 记 = 签名.get(f);
          if (记 && sha(rgb) !== 记.哈希) throw new Error(`认可参考 ${参考在} 的第 ${f} 帧和认可记录的哈希对不上（参考坏了？删掉它再 anim verify 补参考）`);
          yield rgb;
        }
      }
    : 旧
      ? (要的: number[]) => 帧流(旧, 要的, 认可.宽, 认可.高)
      : null;
  return { 名: '认可', 宽: 认可.宽, 高: 认可.高, 帧数: 认可.帧数, 帧们, 签名, 像素, 像素来源: 参考在 ? '认可参考' : 旧 ? '认可那版的母版' : undefined, 声音 };
};

type 预览选项 = { 目录: () => string; 前缀: string };

/** 一帧的结论（扫母版、扫段签共用）：哈希一样就是一样；有旧像素逐像素比；只有签名比块均值。变了的写并排图 */
const 判帧 = (帧: number, s: 帧签名, rgb: Buffer | null, 旧rgb: Buffer | null, 参: 参照, 阈: 阈值, 宽: number, 高: number, 预览?: 预览选项): 帧结论 => {
  const 认 = 参.签名.get(帧);
  const 预览文件 = (后缀: string) => path.join(预览!.目录(), `${预览!.前缀}-第${String(帧).padStart(4, '0')}帧-${后缀}.png`);
  if (认 && 认.哈希 === s.哈希) return { 帧, 结论: '一样' };
  if (旧rgb) {
    const d = 比像素(rgb!, 旧rgb, 阈.差像素门槛);
    const 结: 帧结论 = d.差像素占比 === 0 && d.最大差 === 0 ? { 帧, 结论: '一样' } : { 帧, 结论: d.差像素占比 <= 阈.差像素占比 ? '容差内' : '变了', 说明: `差 > ${阈.差像素门槛} 的像素占 ${d.差像素占比.toExponential(2)}（门槛 ${阈.差像素占比}），最大差 ${d.最大差}` };
    if (结.结论 === '变了' && 预览) 写png(预览文件(`${参.名}-现在-差`), 并排(rgb!, 旧rgb, 宽, 高, 阈.差像素门槛), 宽 * 3, 高);
    return 结;
  }
  if (认) {
    const d = 比块均值(s.块均值, 认.块均值);
    const 结: 帧结论 = { 帧, 结论: d <= 阈.块均值容差 ? '容差内' : '变了', 说明: `没有${参.名}那版的像素，只比了块均值：最大差 ${d}` };
    if (结.结论 === '变了' && 预览) 写png(预览文件('现在'), rgb!, 宽, 高);
    return 结;
  }
  return { 帧, 结论: '变了', 说明: `${参.名}里没有这一帧` };
};

/** 声音的结论：sha 一样就是没变；不一样比响度和起音 */
const 判声音 = (新声: 声音签名 | null, 参: 参照, 阈: 阈值 | undefined, fps?: number): Pick<扫描结果, '音频结论' | '音频说明'> => {
  const 旧声 = 参.声音;
  if (!新声) return 旧声 ? { 音频结论: '变了', 音频说明: `${参.名}那版有音轨，现在没有` } : { 音频结论: '没有音轨' };
  if (!旧声) return { 音频结论: '变了', 音频说明: `${参.名}那版没有音轨` };
  if (旧声.音频sha === 新声.音频sha) return { 音频结论: '一样' };
  if (旧声.响度 === null || !旧声.起音) return { 音频结论: '变了', 音频说明: `sha 不一样，${参.名}那版没记响度和起音、母版也不在，比不了` };
  const 差 = 新声.响度! - 旧声.响度;
  const 容差秒 = 阈!.起音容差帧 / (fps ?? 24);
  const o = 比起音(新声.起音!, 旧声.起音, 容差秒);
  const 毛病 = [
    Math.abs(差) > 阈!.响度容差LU ? `响度差 ${差.toFixed(2)} LU（容差 ±${阈!.响度容差LU}）` : null,
    o.旧有新没有.length ? `${参.名}那版在 ${o.旧有新没有.slice(0, 6).join('、')} 秒起的声音，现在前后 ${阈!.起音容差帧} 帧内没有` : null,
    o.新有旧没有.length ? `现在在 ${o.新有旧没有.slice(0, 6).join('、')} 秒起的声音，${参.名}那版前后 ${阈!.起音容差帧} 帧内没有` : null,
  ].filter(Boolean);
  return 毛病.length ? { 音频结论: '变了', 音频说明: 毛病.join('；') } : { 音频结论: '容差内', 音频说明: `响度差 ${差.toFixed(2)} LU，起音都对得上` };
};

export const 扫母版 = async (
  新母版: string,
  opts: { 认可?: 认可记录 | null; 旧母版?: string | null; 参考?: string | null; 参照?: 参照 | null; 阈值?: 阈值; fps?: number; 预览?: 预览选项 } = {},
): Promise<扫描结果> => {
  const { 帧数, 宽, 高 } = 视频信息(新母版);
  const 参 = opts.参照 ?? (opts.认可 ? await 认可参照(opts.认可, opts.旧母版, opts.参考) : null);
  const 阈 = opts.阈值;
  if (参 && !阈) throw new Error('和参照比要给阈值');
  const 尺寸变了 = 参 && (参.宽 !== 宽 || 参.高 !== 高 || 参.帧数 !== 帧数) ? `${参.名}的是 ${参.宽}×${参.高} ${参.帧数} 帧，现在是 ${宽}×${高} ${帧数} 帧` : undefined;
  const 签名帧们 = 抽样帧(帧数, 默认间隔);
  const 比帧们 = 参 && !尺寸变了 ? 参.帧们 : [];
  const 帧们 = [...new Set([...签名帧们, ...比帧们])].sort((a, b) => a - b);
  const 要签名 = new Set(签名帧们);
  const 要比 = new Set(比帧们);
  const 旧像素 = 参?.像素 && 比帧们.length ? 参.像素(比帧们) : null;

  const 新流 = 帧流(新母版, 帧们, 宽, 高);
  const 帧签名们: 帧签名[] = [];
  const 帧结论: 帧结论[] = [];
  try {
    for (const 帧 of 帧们) {
      const a = await 新流.next();
      if (a.done) throw new Error(`${新母版} 抽不出第 ${帧} 帧`);
      const rgb = a.value;
      const s: 帧签名 = { 帧, 哈希: sha(rgb), 块均值: 块均值(rgb, 宽, 高) };
      if (要签名.has(帧)) 帧签名们.push(s);
      if (!要比.has(帧)) continue;
      const b = 旧像素 ? await 旧像素.next() : null;
      const 旧rgb = b && !b.done ? b.value : null;
      帧结论.push(判帧(帧, s, rgb, 旧rgb, 参!, 阈!, 宽, 高, opts.预览));
    }
  } finally {
    await 新流.return(undefined);
    await 旧像素?.return(undefined);
  }

  const 新声 = 有音轨(新母版) ? await 扫声音(新母版) : null;
  const 声 = 参 && !尺寸变了 ? 判声音(新声, 参, 阈, opts.fps) : { 音频结论: '没有音轨' as const };
  return {
    签名: { 宽, 高, 帧数, 间隔: 默认间隔, 帧: 帧签名们, 音频sha: 新声?.音频sha ?? null, 响度: 新声?.响度 ?? null, 起音: 新声?.起音 ?? null },
    帧结论,
    ...声,
    尺寸变了,
    比法: 参?.像素 ? '逐像素' : '块均值',
    像素来源: 参?.像素来源,
  };
};

/** 参照要比的帧段签的抽样里没有（间隔不一样），调用方退回 扫母版 */
export class 抽样里没有 extends Error {}

/** 段签里存的新这一版：签名（扫母版 算的那份）和抽样帧文件（第 i 帧是原片的 签名.帧[i].帧） */
export type 段签来源 = { 签名: 签名; 抽样: string };

/**
 * 和 扫母版 同样下结论，但新这一版不解母版：签名、声音读段签，哈希和参照不一样的帧才从抽样帧取像素。
 * 参照要比的帧不全在抽样帧里（参照的间隔不一样）就抛错，调用方退回 扫母版
 */
export const 扫段签 = async (新: 段签来源, opts: { 认可?: 认可记录 | null; 旧母版?: string | null; 参考?: string | null; 参照?: 参照 | null; 阈值?: 阈值; fps?: number; 预览?: 预览选项 } = {}): Promise<扫描结果> => {
  const { 宽, 高, 帧数 } = 新.签名;
  const 参 = opts.参照 ?? (opts.认可 ? await 认可参照(opts.认可, opts.旧母版, opts.参考) : null);
  const 阈 = opts.阈值;
  if (参 && !阈) throw new Error('和参照比要给阈值');
  const 尺寸变了 = 参 && (参.宽 !== 宽 || 参.高 !== 高 || 参.帧数 !== 帧数) ? `${参.名}的是 ${参.宽}×${参.高} ${参.帧数} 帧，现在是 ${宽}×${高} ${帧数} 帧` : undefined;
  const 签们 = new Map(新.签名.帧.map((f) => [f.帧, f]));
  const 比帧们 = 参 && !尺寸变了 ? 参.帧们 : [];
  const 缺 = 比帧们.filter((f) => !签们.has(f));
  if (缺.length) throw new 抽样里没有(`段签的抽样帧里没有第 ${缺.slice(0, 5).join('、')} 帧（参照的抽样间隔不一样），要解母版比`);
  const 要像素 = 比帧们.filter((f) => 参!.签名.get(f)?.哈希 !== 签们.get(f)!.哈希);
  const 新像素 = 要像素.length ? 抽样流(新.抽样, 新.签名.帧.map((f) => f.帧), 要像素, 宽, 高) : null;
  const 旧像素 = 参?.像素 && 要像素.length ? 参.像素(要像素) : null;
  const 帧结论: 帧结论[] = [];
  try {
    for (const 帧 of 比帧们) {
      const s = 签们.get(帧)!;
      if (!要像素.includes(帧)) {
        帧结论.push(判帧(帧, s, null, null, 参!, 阈!, 宽, 高, opts.预览));
        continue;
      }
      const a = await 新像素!.next();
      if (a.done) throw new Error(`${新.抽样} 抽不出第 ${帧} 帧`);
      if (sha(a.value) !== s.哈希) throw new Error(`段签抽样 ${新.抽样} 的第 ${帧} 帧和签名对不上（抽样坏了？anim render <段> --只派生 --重做 重做段签）`);
      const b = 旧像素 ? await 旧像素.next() : null;
      帧结论.push(判帧(帧, s, a.value, b && !b.done ? b.value : null, 参!, 阈!, 宽, 高, opts.预览));
    }
  } finally {
    await 新像素?.return(undefined);
    await 旧像素?.return(undefined);
  }
  const 新声: 声音签名 | null = 新.签名.音频sha ? { 音频sha: 新.签名.音频sha, 响度: 新.签名.响度, 起音: 新.签名.起音 } : null;
  const 声 = 参 && !尺寸变了 ? 判声音(新声, 参, 阈, opts.fps) : { 音频结论: '没有音轨' as const };
  return { 签名: 新.签名, 帧结论, ...声, 尺寸变了, 比法: 参?.像素 ? '逐像素' : '块均值', 像素来源: 参?.像素来源 };
};

/** 整段结论：有一项变了就要 accept */
export const 变了 = (r: 扫描结果) => !!r.尺寸变了 || r.帧结论.some((f) => f.结论 === '变了') || r.音频结论 === '变了';
