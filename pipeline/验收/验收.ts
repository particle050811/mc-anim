// 扫一遍母版：抽样帧算签名，声音算 sha、响度、起音；给了参照（认可记录，或旧项目基线）就逐帧下结论（一样 / 容差内 / 变了）。
// 参照有像素（认可那版的母版还在、基线 PNG）就逐像素比，只有签名就比块均值；变了的帧写 旧|新|差 的并排图进预览给人看。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from 'fast-png';
import { 视频信息, 有音轨 } from '../渲/探测.ts';
import { 帧流, 音频流, 抽样帧, 块均值, sha, 默认间隔 } from './帧流.ts';
import { 包络, 找起音, 响度, 比像素, 比块均值, 比起音, 并排, type 阈值 } from './比较.ts';
import type { 认可记录, 声音签名, 签名, 帧签名 } from './认可.ts';

export type 帧结论 = { 帧: number; 结论: '一样' | '容差内' | '变了'; 说明?: string };
export type 扫描结果 = { 签名: 签名; 帧结论: 帧结论[]; 音频结论: '一样' | '容差内' | '变了' | '没有音轨'; 音频说明?: string; 尺寸变了?: string; 比法: '逐像素' | '块均值' };

/** 拿来比的那一版 */
export type 参照 = {
  名: string; // 并排图文件名里用
  宽: number;
  高: number;
  帧数: number;
  帧们: number[]; // 比哪几帧
  签名: Map<number, 帧签名>; // 有就先比哈希
  像素: ((帧们: number[]) => AsyncGenerator<Buffer>) | null; // 按帧号升序交出 rgb24
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

/** 认可记录作参照；认可那版的母版还在（尺寸帧数一样）就用它的像素，记录里没响度、起音的从它补 */
export const 认可参照 = async (认可: 认可记录, 旧母版?: string | null): Promise<参照> => {
  let 旧 = 旧母版 && fs.existsSync(旧母版) ? 旧母版 : null;
  if (旧) {
    const v = 视频信息(旧);
    if (v.宽 !== 认可.宽 || v.高 !== 认可.高 || v.帧数 !== 认可.帧数) 旧 = null;
  }
  let 声音: 声音签名 | null = 认可.音频sha ? { 音频sha: 认可.音频sha, 响度: 认可.响度, 起音: 认可.起音 } : null;
  if (声音 && (声音.响度 === null || !声音.起音) && 旧 && 有音轨(旧)) 声音 = { ...(await 扫声音(旧)), 音频sha: 声音.音频sha };
  return {
    名: '认可',
    宽: 认可.宽,
    高: 认可.高,
    帧数: 认可.帧数,
    帧们: 抽样帧(认可.帧数, 认可.间隔),
    签名: new Map(认可.帧.map((f) => [f.帧, f])),
    像素: 旧 ? (帧们) => 帧流(旧, 帧们, 认可.宽, 认可.高) : null,
    声音,
  };
};

export const 扫母版 = async (
  新母版: string,
  opts: { 认可?: 认可记录 | null; 旧母版?: string | null; 参照?: 参照 | null; 阈值?: 阈值; fps?: number; 预览?: { 目录: () => string; 前缀: string } } = {},
): Promise<扫描结果> => {
  const { 帧数, 宽, 高 } = 视频信息(新母版);
  const 参 = opts.参照 ?? (opts.认可 ? await 认可参照(opts.认可, opts.旧母版) : null);
  const 阈 = opts.阈值;
  if (参 && !阈) throw new Error('和参照比要给阈值');
  const 尺寸变了 = 参 && (参.宽 !== 宽 || 参.高 !== 高 || 参.帧数 !== 帧数) ? `${参.名}的是 ${参.宽}×${参.高} ${参.帧数} 帧，现在是 ${宽}×${高} ${帧数} 帧` : undefined;
  const 签名帧们 = 抽样帧(帧数, 默认间隔);
  const 比帧们 = 参 && !尺寸变了 ? 参.帧们 : [];
  const 帧们 = [...new Set([...签名帧们, ...比帧们])].sort((a, b) => a - b);
  const 要签名 = new Set(签名帧们);
  const 要比 = new Set(比帧们);
  const 旧像素 = 参?.像素 && 比帧们.length ? 参.像素(比帧们) : null;
  const 预览文件 = (帧: number, 后缀: string) => path.join(opts.预览!.目录(), `${opts.预览!.前缀}-第${String(帧).padStart(4, '0')}帧-${后缀}.png`);

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
      const 认 = 参!.签名.get(帧);
      let 结: 帧结论;
      if (认 && 认.哈希 === s.哈希) 结 = { 帧, 结论: '一样' };
      else if (旧rgb) {
        const d = 比像素(rgb, 旧rgb, 阈!.差像素门槛);
        结 = d.差像素占比 === 0 && d.最大差 === 0 ? { 帧, 结论: '一样' } : { 帧, 结论: d.差像素占比 <= 阈!.差像素占比 ? '容差内' : '变了', 说明: `差 > ${阈!.差像素门槛} 的像素占 ${d.差像素占比.toExponential(2)}（门槛 ${阈!.差像素占比}），最大差 ${d.最大差}` };
        if (结.结论 === '变了' && opts.预览) 写png(预览文件(帧, `${参!.名}-现在-差`), 并排(rgb, 旧rgb, 宽, 高, 阈!.差像素门槛), 宽 * 3, 高);
      } else if (认) {
        const d = 比块均值(s.块均值, 认.块均值);
        结 = { 帧, 结论: d <= 阈!.块均值容差 ? '容差内' : '变了', 说明: `没有${参!.名}那版的像素，只比了块均值：最大差 ${d}` };
        if (结.结论 === '变了' && opts.预览) 写png(预览文件(帧, '现在'), rgb, 宽, 高);
      } else 结 = { 帧, 结论: '变了', 说明: `${参!.名}里没有这一帧` };
      帧结论.push(结);
    }
  } finally {
    await 新流.return(undefined);
    await 旧像素?.return(undefined);
  }

  // 声音：sha 一样就是没变；不一样比响度和起音
  const 新声 = 有音轨(新母版) ? await 扫声音(新母版) : null;
  let 音频结论: 扫描结果['音频结论'] = '没有音轨';
  let 音频说明: string | undefined;
  if (参 && !尺寸变了) {
    const 旧声 = 参.声音;
    if (!新声) {
      if (旧声) [音频结论, 音频说明] = ['变了', `${参.名}那版有音轨，现在没有`];
    } else if (!旧声) [音频结论, 音频说明] = ['变了', `${参.名}那版没有音轨`];
    else if (旧声.音频sha === 新声.音频sha) 音频结论 = '一样';
    else if (旧声.响度 === null || !旧声.起音) [音频结论, 音频说明] = ['变了', `sha 不一样，${参.名}那版没记响度和起音、母版也不在，比不了`];
    else {
      const 差 = 新声.响度! - 旧声.响度;
      const 容差秒 = 阈!.起音容差帧 / (opts.fps ?? 24);
      const o = 比起音(新声.起音!, 旧声.起音, 容差秒);
      const 毛病 = [
        Math.abs(差) > 阈!.响度容差LU ? `响度差 ${差.toFixed(2)} LU（容差 ±${阈!.响度容差LU}）` : null,
        o.旧有新没有.length ? `${参.名}那版在 ${o.旧有新没有.slice(0, 6).join('、')} 秒起的声音，现在前后 ${阈!.起音容差帧} 帧内没有` : null,
        o.新有旧没有.length ? `现在在 ${o.新有旧没有.slice(0, 6).join('、')} 秒起的声音，${参.名}那版前后 ${阈!.起音容差帧} 帧内没有` : null,
      ].filter(Boolean);
      音频结论 = 毛病.length ? '变了' : '容差内';
      音频说明 = 毛病.length ? 毛病.join('；') : `响度差 ${差.toFixed(2)} LU，起音都对得上`;
    }
  }

  return {
    签名: { 宽, 高, 帧数, 间隔: 默认间隔, 帧: 帧签名们, 音频sha: 新声?.音频sha ?? null, 响度: 新声?.响度 ?? null, 起音: 新声?.起音 ?? null },
    帧结论,
    音频结论,
    音频说明,
    尺寸变了,
    比法: 参?.像素 ? '逐像素' : '块均值',
  };
};

/** 整段结论：有一项变了就要 accept */
export const 变了 = (r: 扫描结果) => !!r.尺寸变了 || r.帧结论.some((f) => f.结论 === '变了') || r.音频结论 === '变了';
