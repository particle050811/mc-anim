// 认指纹（用户 11-06 定，决策/0013）：指纹变了、画面其实没变（依赖升小版本、重构、和画面无关的打包规则）的段，抽几帧静帧和旧切片比，
// 都在压缩噪声以内就把新指纹登记成沿用旧切片，不重渲。这里是不碰渲染的部分：抽哪几帧、找哪份旧切片、哪些差异静帧证明不了、怎么比一帧、怎么登记。
// 比法：旧切片是 x264 CRF18 压过的，新出的帧和它逐像素不可能一样。新帧先照切片编码时一样转成 yuv420p（Remotion 自带的 ffmpeg、同一个 bt709 滤镜），
//   两边都按 比较.ts 的固定公式换 RGB，再用 verify 的块平均差和 verify/阈值.toml 的「变了」三条门槛判（看一眼档算噪声内，只列出来）。帧号是输出帧（切片的帧）。
// 只比切片（决策/0014）。旧切片要连着配的那份 wav 都在（声音不比，原样沿用）。
// 登记：在新指纹名下克隆（Mac 上 APFS clonefile，不占空间；别处退回硬链接、再不行整份复制）旧切片和 wav，段签照抄并记下 沿用；
//   之后 stale、film、verify、cache gc 都把它当这个指纹渲出来的切片，不用改它们。
import fs from 'node:fs';
import path from 'node:path';
import { 母版目录, 段签目录 } from '../环境/配置.ts';
import { 作品名 } from '../环境/作品.ts';
import { 跑出 } from '../环境/子进程.ts';
import { 能克隆 } from '../缓存/去重.ts';
import { 原子写, 历史指纹, 写指纹, 指纹文件, 记用过 } from '../渲/母版.ts';
import { 段画面路径, 段声音路径, 同档, 配对声音指纹 } from '../渲/段产物.ts';
import { 视频信息 } from '../渲/探测.ts';
import { 跑自带ffmpeg } from '../渲/自带ffmpeg.ts';
import { 出段签, 对得上切片, 读段签, 段签齐, 段签文件, 声音文件名, 签文件名, 历史文件名, type 段签, type 沿用记录 } from '../段签/段签.ts';
import { 帧流 } from '../验收/帧流.ts';
import { 判块差, 块差说明, 算块差, 换算, 转rgb, type 阈值 } from '../验收/比较.ts';
import { 稳定JSON, type 段指纹, type 指纹项 } from './指纹.ts';

/** 默认抽几帧（含首、尾）：首尾加中间均匀 10 帧。12 帧在两部作品上出帧约 10～30 秒，比整段重渲省得多；用户点名的「首、尾 + 均匀抽十来帧」 */
export const 默认抽帧数 = 12;
export const 比法名 = `新帧经 Remotion 的 ffmpeg（bt709 zscale）转 yuv420p，两边按「${换算}」换 RGB，块平均差过 verify/阈值.toml 的变了门槛算不同`;

/** 首帧、末帧，中间均匀取，共 n 帧（段比 n 短就全取）；升序去重 */
export const 抽帧 = (帧数: number, n = 默认抽帧数): number[] => {
  if (!Number.isInteger(帧数) || 帧数 <= 0) throw new Error(`帧数要是正整数：${帧数}`);
  if (!Number.isInteger(n) || n < 2) throw new Error(`至少抽 2 帧（首、尾）：${n}`);
  if (n >= 帧数) return Array.from({ length: 帧数 }, (_, i) => i);
  return [...new Set(Array.from({ length: n }, (_, i) => Math.round((i * (帧数 - 1)) / (n - 1))))];
};

/**
 * 静帧证明不了的差异：只影响编码或声音的输入变了，抽帧比得再像也不能沿用。
 * 渲染设置（编码参数、尺寸、帧数、inputProps 都在里面）、私有配乐（只是声音）、ogg 解码规则（只是声音），和新指纹记了缺字节（打进的是占位，指纹不可信）
 */
export const 静帧证明不了 = (旧: 指纹项, 新: 指纹项): string[] => {
  const 拦: string[] = [];
  if (稳定JSON(旧.渲染设置) !== 稳定JSON(新.渲染设置)) {
    const 键们 = [...new Set([...Object.keys(旧.渲染设置 ?? {}), ...Object.keys(新.渲染设置)])].filter((k) => 稳定JSON(旧.渲染设置?.[k]) !== 稳定JSON(新.渲染设置[k]));
    拦.push(`渲染设置变了（${键们.join('、')}）：编码参数、尺寸、帧数这些静帧看不出`);
  }
  if (稳定JSON(旧.私有配乐 ?? {}) !== 稳定JSON(新.私有配乐 ?? {})) 拦.push('私有配乐变了：只影响声音，静帧证明不了');
  const ogg = 'pipeline/资产/ogg解码.cjs';
  if (旧.打包规则?.[ogg] !== 新.打包规则?.[ogg]) 拦.push(`打包规则 ${ogg} 变了：只影响声音，静帧证明不了`);
  if (新.缺字节?.length) 拦.push(`新指纹里记了缺字节 ${新.缺字节.length} 件（打进的是占位，先 anim assets seed / pull）`);
  return 拦;
};

/** 记录：这个指纹的 .指纹.json（stale 比差异用的那份，含算法、明细）；母版、声音：旧切片和配的 wav */
export type 旧版 = { 指纹: string; 项: 指纹项; 记录: 段指纹; 签: 段签; 母版: string; 声音: string; 声音指纹: string };

/** 新指纹这边已经有东西了（渲过、认过）：不是过期的段，不用认。认到一半断掉的（段签有 沿用、切片还没改名过来）不算，可以重认 */
export const 新指纹已有 = (键: string, 新: { 画面: string; 声音: string; 画面指纹: { 指纹: string } }, 作品 = 作品名()): string | null => {
  if (fs.existsSync(新.画面) && fs.existsSync(新.声音)) return '切片在';
  const 签 = 读段签(键, 新.画面指纹.指纹, 作品);
  if (签 && !签.沿用) return '渲过（有段签），切片不在：要用时重渲';
  if (!签 && fs.existsSync(指纹文件(键, 新.画面指纹.指纹, 母版目录(键, 作品)))) return '渲过（有 .指纹.json），切片不在：要用时重渲';
  return null;
};

/**
 * 拿来比的旧版：同一档（渲染级别、输出帧率一样）渲过的画面指纹里最近一份（和 anim stale 比差异的是同一串，新的在前），
 * 切片和配的 wav 都在、切片帧数和这段现在的输出帧数一样。段签缺了、不是这一对派生的，过放行闸当场补。
 * 都不行返回 null 和每份为什么不行（最多几条）
 */
export const 找旧版 = async (键: string, 新: 段指纹, o: { 帧数: number; 等放行: () => Promise<void>; 作品?: string }): Promise<{ 旧: 旧版 | null; 没用的: string[] }> => {
  const 作品 = o.作品 ?? 作品名();
  const 没用的: string[] = [];
  for (const h of 历史指纹(键, 母版目录(键, 作品)).filter((h) => h.指纹 !== 新.指纹 && 同档(h, 新))) {
    const 名 = h.指纹.slice(0, 16);
    const 母版 = 段画面路径(键, h.指纹, 作品);
    if (!fs.existsSync(母版)) continue;
    const 声音指纹 = 配对声音指纹(h);
    if (!声音指纹) {
      没用的.push(`${名}：11-06 以前另出声音的旧切片，不沿用`);
      continue;
    }
    const 声音 = 段声音路径(键, 声音指纹, 作品);
    if (!fs.existsSync(声音)) {
      没用的.push(`${名}：切片在，配的声音 ${声音指纹.slice(0, 16)}.wav 不在`);
      continue;
    }
    const 帧数 = 视频信息(母版).帧数;
    if (帧数 !== o.帧数) {
      没用的.push(`${名}：切片 ${帧数} 帧，段现在 ${o.帧数} 帧`);
      continue;
    }
    let 签 = 读段签(键, h.指纹, 作品);
    if (!段签齐(签) || !(await 对得上切片(签, 母版, 声音))) {
      await o.等放行();
      console.log(`== 补段签 ${键}（${名}）`);
      签 = (await 出段签(母版, 声音, { 段键: 键, 指纹: h.指纹, 声音指纹, 级别: (h.项.渲染设置.inputProps as { 级别?: string } | undefined)?.级别 ?? null, 派生: '补', 作品 })).签;
    }
    return { 旧: { 指纹: h.指纹, 项: h.项, 记录: h, 签, 母版, 声音, 声音指纹 }, 没用的 };
  }
  return { 旧: null, 没用的 };
};

/**
 * Remotion 压切片时 PNG 转 yuv420p 用的滤镜（colorSpace bt709，见 node_modules/@remotion/renderer/dist/ffmpeg-args.js）。
 * 不加它 ffmpeg 默认按 bt601 转，和切片差一截色；brew 的 ffmpeg 没编 zscale，所以用 Remotion 自带的那个
 */
export const 切片转yuv滤镜 = 'zscale=matrix=709:range=limited:primariesin=709:primaries=709:transferin=709:transfer=709';

/** 新这一帧（PNG，预览级是 JPEG）照切片编码时一样转成 yuv420p */
export const 帧转yuv = async (图: Buffer, 宽: number, 高: number): Promise<Buffer> => {
  // 和 Remotion 喂帧时一样点明解码器（prespawn-ffmpeg.js）
  const 解码器 = 图.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'png' : 'mjpeg';
  const y = await 跑自带ffmpeg(['-v', 'error', '-nostdin', '-f', 'image2pipe', '-vcodec', 解码器, '-i', '-', '-vf', 切片转yuv滤镜, '-pix_fmt', 'yuv420p', '-f', 'image2pipe', '-c:v', 'rawvideo', '-'], 图);
  if (y.length !== (宽 * 高 * 3) / 2) throw new Error(`新出的帧转 yuv420p 是 ${y.length} 字节，切片的一帧是 ${宽}×${高}（${(宽 * 高 * 3) / 2} 字节）：尺寸对不上`);
  return y;
};

export type 帧比 = { 帧: number; 结论: '一样' | '噪声内' | '不同'; 看一眼?: true; 说明?: string };

/** 一帧：yuv 逐字节一样是一样；不然两边换 RGB 比块平均差，verify 的变了门槛（16×16、64×64、8×8 任一条）超了是不同，看一眼档也算噪声内 */
export const 比一帧 = (帧: number, 新yuv: Buffer, 旧yuv: Buffer, 宽: number, 高: number, 阈: Pick<阈值, '块8门槛' | '块16门槛' | '块64门槛' | '看一眼门槛'>): 帧比 => {
  if (新yuv.equals(旧yuv)) return { 帧, 结论: '一样' };
  const d = 算块差(转rgb(新yuv, 宽, 高), 转rgb(旧yuv, 宽, 高), 宽, 高);
  const 判 = 判块差(d, 阈);
  return { 帧, 结论: 判 === '变了' ? '不同' : '噪声内', ...(判 === '看一眼' ? { 看一眼: true as const } : {}), 说明: 块差说明(d, 阈) };
};

/** 旧切片的这几帧（升序），yuv420p 原样 */
export const 旧帧们 = async (旧: 旧版, 帧们: readonly number[]): Promise<Map<number, Buffer>> => {
  const 出 = new Map<number, Buffer>();
  const { 宽, 高 } = 旧.签.签名;
  for await (const y of 帧流(旧.母版, 帧们, 宽, 高, { 格式: 'yuv420p' })) 出.set(帧们[出.size]!, Buffer.from(y));
  if (出.size !== 帧们.length) throw new Error(`${旧.母版} 只解出 ${出.size}/${帧们.length} 帧`);
  return 出;
};

/** 大文件复制：Mac 上 cp -c（APFS clonefile，不占空间；和 缓存/去重.ts 同一种克隆），不行退回硬链接，再不行整份复制。到 已经在就抛 */
export const 克隆 = (从: string, 到: string): '克隆' | '硬链接' | '复制' => {
  if (fs.existsSync(到)) throw new Error(`${到} 已经在了，不覆盖`);
  if (能克隆()) {
    try {
      跑出(['cp', '-c', 从, 到]);
      return '克隆';
    } catch {
      fs.rmSync(到, { force: true });
    }
  }
  try {
    fs.linkSync(从, 到);
    return '硬链接';
  } catch {
    fs.copyFileSync(从, 到, fs.constants.COPYFILE_EXCL);
    return '复制';
  }
};

export type 登记信息 = { 理由: string; 帧: number[]; 提交: string; 级别: string | null; 现在?: Date };

/** 克隆到临时名，返回临时名和怎么复制的；目标已经在就抛 */
const 克隆到临时 = (从: string, 去: string) => {
  if (fs.existsSync(去)) throw new Error(`${去} 已经在了，不覆盖`);
  const 临时 = 去.replace(/(\.\w+)$/, `.写入中-${process.pid}$1`);
  fs.rmSync(临时, { force: true });
  return { 临时, 怎么复制: 克隆(从, 临时) };
};

/**
 * 把新指纹登记成沿用旧版：段签（声音.flac 克隆过来、签.json 照抄并记 沿用）、两份 .指纹.json 先写，切片和 wav 克隆到临时名、最后改名成新指纹的名字。
 * 中途断了：切片没改名过来，stale 看到的是「渲过、切片不在」，重跑 认指纹 会接着认。
 * 不删旧指纹的任何东西（主检出的 anim film、cache gc 照常按钉清；克隆的块不跟着删）
 */
export const 登记沿用 = (键: string, 旧: 旧版, 新: { 画面指纹: 段指纹; 声音指纹: 段指纹 }, 记: 登记信息, 作品 = 作品名()): { 签: 段签; 母版: string; 声音: string; 怎么复制: string } => {
  const 于 = (记.现在 ?? new Date()).toISOString();
  const 指纹 = 新.画面指纹.指纹;
  const 目录 = 段签目录(键, 指纹, 作品);
  fs.mkdirSync(目录, { recursive: true });
  const 去 = 段画面路径(键, 指纹, 作品);
  const 声去 = 段声音路径(键, 新.声音指纹.指纹, 作品);
  const 画 = 克隆到临时(旧.母版, 去);
  // 声音指纹没变（只改了画面代码）时 wav 本来就在，不用克隆
  const 声 = fs.existsSync(声去) ? null : 克隆到临时(旧.声音, 声去);
  try {
    let 声音: 段签['声音'] = null;
    if (旧.签.声音) {
      const 到 = path.join(目录, 声音文件名);
      fs.rmSync(到, { force: true });
      克隆(段签文件(旧.签, 旧.签.声音.文件), 到);
      声音 = { ...旧.签.声音, 文件: 声音文件名 };
    }
    const 沿用: 沿用记录 = { 自: 旧.指纹, 原渲: 旧.签.沿用?.原渲 ?? 旧.指纹, 理由: 记.理由, 帧: [...记.帧], 比法: 比法名, 于, 提交: 记.提交 };
    const 声音源 = 声 ? { ...旧.签.声音源!, 改于: fs.statSync(声.临时).mtimeMs } : { ...旧.签.声音源!, 改于: fs.statSync(声去).mtimeMs };
    const 签: 段签 = { ...旧.签, 版本: 3, 作品, 段: 键, 指纹, 声音指纹: 新.声音指纹.指纹, 级别: 记.级别, 母版: { ...旧.签.母版, 改于: fs.statSync(画.临时).mtimeMs }, 声音源, 声音, 沿用 };
    fs.appendFileSync(path.join(目录, 历史文件名), JSON.stringify({ 记于: 于, 沿用: true, 自: 旧.指纹, 原渲: 沿用.原渲, 字节sha: 签.母版.字节sha, 帧: 沿用.帧, 理由: 记.理由, 怎么复制: 画.怎么复制 }) + '\n', 'utf8');
    原子写(path.join(目录, 签文件名), JSON.stringify(签, null, 1) + '\n');
    写指纹(新.画面指纹, 母版目录(键, 作品));
    写指纹(新.声音指纹, 母版目录(键, 作品));
    if (声) fs.renameSync(声.临时, 声去);
    fs.renameSync(画.临时, 去);
    记用过(母版目录(键, 作品), 指纹);
    记用过(母版目录(键, 作品), 新.声音指纹.指纹);
    return { 签, 母版: 去, 声音: 声去, 怎么复制: 画.怎么复制 };
  } finally {
    fs.rmSync(画.临时, { force: true });
    if (声) fs.rmSync(声.临时, { force: true });
  }
};
