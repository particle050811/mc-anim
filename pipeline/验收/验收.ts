// 扫一遍母版（切片）：抽样帧算签名，声音算 sha、响度、起音；给了参照（认可记录）就逐帧下结论（一样 / 容差内 / 变了）。
// verify 平时用 扫段签：签名、声音读段签（pipeline/段签/，渲完从切片和 wav 派生），哈希和参照不一样的帧才解切片取像素（要是段签记的那份）。
// 参照有像素（认可参考、认可那版的切片）就比块平均差（比较.ts，用户 11-02 定），只有签名就比块均值；
// 变了的帧、要看一眼的帧（16×16 在 看一眼门槛 和 块16门槛 之间）写 旧|新|差 的并排图进预览给人看。
// 两边像素同一种换法：认可参考、切片都是 yuv420p 按固定公式换（比较.ts 的 转rgb）。
// 和旧项目基线比（verify --对基线）随 CRF1 母版一起删了（决策/0014）：基线是 1440p 24 帧的，和 4K60 切片的帧对不上。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from 'fast-png';
import { 视频信息, 有音轨 } from '../渲/探测.ts';
import { 帧流, 音频流, 抽样帧, 块均值, sha, 默认间隔 } from './帧流.ts';
import { 包络, 找起音, 响度, 算块差, 判块差, 块差说明, 要看的块, 并排, 比块均值, 比起音, 转rgb, type 阈值 } from './比较.ts';
import { 参考像素 } from './参考像素.ts';
import { 灰度滤镜 } from '../合成/接缝.ts';
import type { 认可记录, 声音签名, 签名, 帧签名 } from './认可.ts';

export { 参考对不上 } from './参考像素.ts';

export type 帧结论 = { 帧: number; 结论: '一样' | '容差内' | '变了'; 看一眼?: true; 说明?: string };
export type 扫描结果 = {
  签名: 签名;
  帧结论: 帧结论[];
  音频结论: '一样' | '容差内' | '变了' | '没有音轨';
  音频说明?: string;
  尺寸变了?: string;
  比法: '块差' | '块均值';
  /** 参照的像素取自哪（认可参考 / 认可那版的母版），只给人看 */
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
  像素: ((帧们: number[]) => AsyncGenerator<Buffer>) | null; // 按帧号升序交出 rgb24（yuv420p 按 转rgb 换）
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

/** 母版解成 yuv420p、按固定公式交出这几帧的 rgb24（升序） */
export async function* 母版像素(file: string, 帧们: readonly number[], 宽: number, 高: number): AsyncGenerator<Buffer> {
  for await (const yuv of 帧流(file, 帧们, 宽, 高, { 格式: 'yuv420p' })) yield 转rgb(yuv, 宽, 高);
}

/**
 * 认可记录作参照。像素按这个顺序取：认可参考（认可那版的抽样帧；边解边核对，见 参考像素.ts）、认可那版的母版（调用方确认过是认可那版，尺寸帧数一样才用）、都没有就只比块均值。
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
  const 像素 = 参考在 ? (要的: number[]) => 参考像素(参考在, 认可, 要的) : 旧 ? (要的: number[]) => 母版像素(旧, 要的, 认可.宽, 认可.高) : null;
  return { 名: '认可', 宽: 认可.宽, 高: 认可.高, 帧数: 认可.帧数, 帧们, 签名, 像素, 像素来源: 参考在 ? '认可参考' : 旧 ? '认可那版的母版' : undefined, 声音 };
};

type 预览选项 = { 目录: () => string; 前缀: string };

/**
 * 一帧的结论（扫母版、扫段签共用）：哈希一样就是一样；两边都有像素比块平均差；只有签名比块均值。
 * 变了、要看一眼的写并排图（文件名带「变了」「看一眼」）
 */
const 判帧 = (帧: number, s: 帧签名, 新rgb: Buffer | null, 旧rgb: Buffer | null, 参: 参照, 阈: 阈值, 宽: number, 高: number, 预览?: 预览选项): 帧结论 => {
  const 认 = 参.签名.get(帧);
  const 预览文件 = (后缀: string) => path.join(预览!.目录(), `${预览!.前缀}-第${String(帧).padStart(4, '0')}帧-${后缀}.png`);
  if (认 && 认.哈希 === s.哈希) return { 帧, 结论: '一样' };
  if (新rgb && 旧rgb) {
    if (新rgb.equals(旧rgb)) return { 帧, 结论: '一样' };
    const d = 算块差(新rgb, 旧rgb, 宽, 高);
    const 判 = 判块差(d, 阈);
    const 结: 帧结论 = { 帧, 结论: 判 === '变了' ? '变了' : '容差内', ...(判 === '看一眼' ? { 看一眼: true as const } : {}), 说明: 块差说明(d, 阈) };
    if (判 !== '容差内' && 预览) {
      const w = 要看的块(d, 阈);
      写png(预览文件(`${判}-${参.名}-现在-差`), 并排(新rgb, 旧rgb, 宽, 高, { x: d[w].x, y: d[w].y, 边: w }), 宽 * 3, 高 * 2);
    }
    return 结;
  }
  if (认) {
    const d = 比块均值(s.块均值, 认.块均值);
    const 结: 帧结论 = { 帧, 结论: d <= 阈.块均值容差 ? '容差内' : '变了', 说明: `没有${参.名}那版的像素，只比了块均值：最大差 ${d}` };
    if (结.结论 === '变了' && 预览 && 新rgb) 写png(预览文件('变了-现在'), 新rgb, 宽, 高);
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

type 比选项 = { 认可?: 认可记录 | null; 旧母版?: string | null; 参考?: string | null; 参照?: 参照 | null; 阈值?: 阈值; fps?: number; 预览?: 预览选项 };

/** 要比的帧逐帧下结论：哈希和参照一样的不取像素，别的两边各取一次像素（升序） */
const 比帧 = async (比帧们: readonly number[], 签们: Map<number, 帧签名>, 新像素: ((帧们: number[]) => AsyncGenerator<Buffer>) | null, 参: 参照, 阈: 阈值, 宽: number, 高: number, 预览?: 预览选项) => {
  const 要像素 = 比帧们.filter((f) => 参.签名.get(f)?.哈希 !== 签们.get(f)!.哈希);
  const 新流 = 新像素 && 要像素.length ? 新像素(要像素) : null;
  const 旧流 = 参.像素 && 新流 ? 参.像素(要像素) : null;
  const 帧结论: 帧结论[] = [];
  try {
    for (const 帧 of 比帧们) {
      const s = 签们.get(帧)!;
      if (!要像素.includes(帧) || !新流) {
        帧结论.push(判帧(帧, s, null, null, 参, 阈, 宽, 高, 预览));
        continue;
      }
      const a = await 新流.next();
      if (a.done) throw new Error(`新这一版抽不出第 ${帧} 帧`);
      const b = 旧流 ? await 旧流.next() : null;
      帧结论.push(判帧(帧, s, a.value, b && !b.done ? b.value : null, 参, 阈, 宽, 高, 预览));
    }
  } finally {
    await 新流?.return(undefined);
    await 旧流?.return(undefined);
  }
  return 帧结论;
};

const 尺寸说明 = (参: 参照 | null, 宽: number, 高: number, 帧数: number) =>
  参 && (参.宽 !== 宽 || 参.高 !== 高 || 参.帧数 !== 帧数) ? `${参.名}的是 ${参.宽}×${参.高} ${参.帧数} 帧，现在是 ${宽}×${高} ${帧数} 帧` : undefined;

/**
 * 解一遍母版（切片）算签名（ffmpeg rgb24：sha、16×9 块均值；声音），给了参照就再比（像素另解一次要的帧，yuv420p 按固定公式换）。
 * 首尾小图：给了文件名，就在算签名的那次解码里顺带把首帧、末帧缩成 160×90 灰度写进去（出段签 用，和 接缝.ts 的 灰度帧 逐位一样）
 */
export const 扫母版 = async (新母版: string, opts: 比选项 & { 首尾小图?: string; 声音?: string | null } = {}): Promise<扫描结果> => {
  const { 帧数, 宽, 高 } = 视频信息(新母版);
  const 参 = opts.参照 ?? (opts.认可 ? await 认可参照(opts.认可, opts.旧母版, opts.参考) : null);
  const 阈 = opts.阈值;
  if (参 && !阈) throw new Error('和参照比要给阈值');
  const 尺寸变了 = 尺寸说明(参, 宽, 高, 帧数);
  const 签名帧们 = 抽样帧(帧数, 默认间隔);
  const 比帧们 = 参 && !尺寸变了 ? 参.帧们 : [];
  const 帧们 = [...new Set([...签名帧们, ...比帧们])].sort((a, b) => a - b);
  const 另出 = opts.首尾小图 ? ['-map', '0:v:0', '-vf', `select='eq(n,0)+eq(n,${帧数 - 1})',${灰度滤镜}`, '-fps_mode', 'passthrough', '-frames:v', String(帧数 > 1 ? 2 : 1), '-f', 'rawvideo', opts.首尾小图] : undefined;

  const 签们 = new Map<number, 帧签名>();
  for await (const rgb of 帧流(新母版, 帧们, 宽, 高, { 另出 })) {
    const 帧 = 帧们[签们.size]!;
    签们.set(帧, { 帧, 哈希: sha(rgb), 块均值: 块均值(rgb, 宽, 高) });
  }
  if (签们.size !== 帧们.length) throw new Error(`${新母版} 只抽出 ${签们.size}/${帧们.length} 帧`);
  const 帧结论 = 参 ? await 比帧(比帧们, 签们, (要的) => 母版像素(新母版, 要的, 宽, 高), 参, 阈!, 宽, 高, opts.预览) : [];

  // 切片不带声音，声音在旁边的 wav（段产物.ts）：给了 声音 就从它算
  const 声源 = opts.声音 ?? (有音轨(新母版) ? 新母版 : null);
  const 新声 = 声源 && 有音轨(声源) ? await 扫声音(声源) : null;
  const 声 = 参 && !尺寸变了 ? 判声音(新声, 参, 阈, opts.fps) : { 音频结论: '没有音轨' as const };
  return {
    签名: { 宽, 高, 帧数, 间隔: 默认间隔, 帧: 签名帧们.map((f) => 签们.get(f)!), 音频sha: 新声?.音频sha ?? null, 响度: 新声?.响度 ?? null, 起音: 新声?.起音 ?? null },
    帧结论,
    ...声,
    尺寸变了,
    比法: 参?.像素 ? '块差' : '块均值',
    像素来源: 参?.像素来源,
  };
};

/** 参照要比的帧段签的签名里没有（间隔不一样），调用方退回 扫母版 */
export class 签名里没有 extends Error {}
/** 有帧哈希和参照不一样、要看像素，可新这一版的母版不在（或不是段签记的那份） */
export class 缺母版 extends Error {}

/** 段签里存的新这一版：签名（扫母版 算的那份），和段签记的那份切片（不在是 null） */
export type 段签来源 = { 签名: 签名; 母版: string | null };

/**
 * 和 扫母版 同样下结论，但签名、声音读段签，哈希和参照不一样的帧才解母版取像素。
 * 参照要比的帧不全在签名里（参照的间隔不一样）抛 签名里没有，调用方退回 扫母版；要像素却没有母版抛 缺母版
 */
export const 扫段签 = async (新: 段签来源, opts: 比选项 = {}): Promise<扫描结果> => {
  const { 宽, 高, 帧数 } = 新.签名;
  const 参 = opts.参照 ?? (opts.认可 ? await 认可参照(opts.认可, opts.旧母版, opts.参考) : null);
  const 阈 = opts.阈值;
  if (参 && !阈) throw new Error('和参照比要给阈值');
  const 尺寸变了 = 尺寸说明(参, 宽, 高, 帧数);
  const 签们 = new Map(新.签名.帧.map((f) => [f.帧, f]));
  const 比帧们 = 参 && !尺寸变了 ? 参.帧们 : [];
  const 缺 = 比帧们.filter((f) => !签们.has(f));
  if (缺.length) throw new 签名里没有(`段签的签名里没有第 ${缺.slice(0, 5).join('、')} 帧（参照的抽样间隔不一样），要解母版比`);
  // 旧那版没像素、也不出预览：块均值只看签名，不用解母版
  const 要新像素 = !!参 && (!!参.像素 || !!opts.预览) && 比帧们.some((f) => 参.签名.get(f)?.哈希 !== 签们.get(f)!.哈希);
  if (要新像素 && !新.母版) throw new 缺母版('有抽样帧和认可版的哈希不一样，要看像素，可现在这个指纹的母版不在（或不是段签记的那份）');
  const 帧结论 = 参 ? await 比帧(比帧们, 签们, 要新像素 ? (要的) => 母版像素(新.母版!, 要的, 宽, 高) : null, 参, 阈!, 宽, 高, opts.预览) : [];
  const 新声: 声音签名 | null = 新.签名.音频sha ? { 音频sha: 新.签名.音频sha, 响度: 新.签名.响度, 起音: 新.签名.起音 } : null;
  const 声 = 参 && !尺寸变了 ? 判声音(新声, 参, 阈, opts.fps) : { 音频结论: '没有音轨' as const };
  return { 签名: 新.签名, 帧结论, ...声, 尺寸变了, 比法: 参?.像素 ? '块差' : '块均值', 像素来源: 参?.像素来源 };
};

/** 整段结论：有一项变了就要 accept */
export const 变了 = (r: 扫描结果) => !!r.尺寸变了 || r.帧结论.some((f) => f.结论 === '变了') || r.音频结论 === '变了';
