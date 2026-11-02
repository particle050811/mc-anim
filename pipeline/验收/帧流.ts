// 从母版里按帧号抽出原始像素和整条 PCM，边读边交出去，不把整段解进内存。
// 抽样：首帧、每 24 帧、末帧。像素签名：ffmpeg 解成 rgb24 的 sha256 和 16×9 块均值（没有旧那版的像素时只能靠它比）；签名一直这么算，已有的认可记录、段签都靠它。
// 比画面用 yuv420p 原样（不经 swscale，各版本 ffmpeg 解出来逐位一样），再由 比较.ts 的 转rgb 按固定公式换。
import crypto from 'node:crypto';
import spawn from 'cross-spawn';
import { 配置 } from '../环境/配置.ts';
import { 低优先级, 跑出 } from '../环境/子进程.ts';
import { 登记收尾 } from '../闸/收尾.ts';

export const 默认间隔 = 24;
export const 块列 = 16;
export const 块行 = 9;

/** 首帧、每 间隔 帧、末帧，升序去重 */
export const 抽样帧 = (帧数: number, 间隔 = 默认间隔): number[] => {
  if (!Number.isInteger(帧数) || 帧数 <= 0) throw new Error(`帧数要是正整数：${帧数}`);
  const r = new Set<number>();
  for (let f = 0; f < 帧数; f += 间隔) r.add(f);
  r.add(帧数 - 1);
  return [...r].sort((a, b) => a - b);
};

/** 起 ffmpeg，把 stdout 按 块大小 切块交出；退出码非 0 抛错（带 stderr 末尾） */
export async function* 读流(cmd: string[], 块大小: number | null): AsyncGenerator<Buffer> {
  const child = spawn(cmd[0]!, cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
  // 被杀直接退出，不走下面的 finally：不杀的话 ffmpeg 解到管道写满才因 EPIPE 退，解到尾的那种还会多占一会儿 CPU
  const 撤 = 登记收尾(() => void child.kill());
  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (d: string) => (stderr = (stderr + d).slice(-8192)));
  const 结束 = new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  try {
    if (块大小 === null) {
      for await (const chunk of child.stdout!) yield chunk as Buffer;
    } else {
      let 缓 = Buffer.allocUnsafe(块大小);
      let 满 = 0;
      for await (const chunk of child.stdout!) {
        let c = chunk as Buffer;
        while (c.length) {
          const n = Math.min(c.length, 块大小 - 满);
          c.copy(缓, 满, 0, n);
          满 += n;
          c = c.subarray(n);
          if (满 === 块大小) {
            yield 缓;
            缓 = Buffer.allocUnsafe(块大小);
            满 = 0;
          }
        }
      }
      if (满) throw new Error(`${cmd.at(-1)}：ffmpeg 输出的最后一帧不完整（${满}/${块大小} 字节）`);
    }
    const code = await 结束;
    if (code !== 0) throw new Error(`ffmpeg 失败（退出码 ${code}）：${cmd.join(' ')}\n${stderr.trim().split('\n').slice(-5).join('\n')}`);
  } finally {
    撤();
    if (child.exitCode === null) child.kill();
  }
}

// ffmpeg 的表达式有嵌套预算：连加超过 100 项就报「Cannot allocate memory」退出 244，括号里连的项也占预算。每 10 项包一层括号，深度只随帧数的对数涨
const 每层项数 = 10;
/** select 用的表达式：n 是这些帧号之一时非 0 */
export const 选帧表达式 = (帧们: readonly number[]) => {
  let 项 = 帧们.map((f) => `eq(n,${f})`);
  while (项.length > 每层项数) {
    const 上层: string[] = [];
    for (let i = 0; i < 项.length; i += 每层项数) 上层.push(`(${项.slice(i, i + 每层项数).join('+')})`);
    项 = 上层;
  }
  return 项.join('+');
};

// 一个 ffmpeg 抽多少帧：表达式整条放在命令行上，一帧约 13 字符，Windows 命令行最长 32767 字符。超过才分批，后一批要从文件开头重新解
export const 每批帧数 = 2000;

/** 把升序的帧号切成各起一个 ffmpeg 的批 */
export const 选帧批次 = (帧们: readonly number[]) => {
  const 批们: (readonly number[])[] = [];
  for (let i = 0; i < 帧们.length; i += 每批帧数) 批们.push(帧们.slice(i, i + 每批帧数));
  return 批们;
};

export type 像素格式 = 'rgb24' | 'yuv420p';
export const 帧字节 = (宽: number, 高: number, 格式: 像素格式) => (格式 === 'rgb24' ? 宽 * 高 * 3 : (宽 * 高 * 3) / 2);

/** 源不是 yuv420p 时 -pix_fmt yuv420p 会经 swscale 换，就不是逐位一样了：拒 */
export const 要yuv420p = (file: string) => {
  const f = 跑出([配置('ffprobe'), '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', file]).trim();
  if (f !== 'yuv420p') throw new Error(`${file} 的像素格式是 ${f}，比画面要 yuv420p（换算公式只认它）`);
};

/**
 * 按帧号升序交出像素（rgb24：宽×高×3 字节；yuv420p：宽×高×1.5 字节，原样不换）；-frames:v 让 ffmpeg 解到这批最后一帧就退，不解到文件尾。
 * 另出：在最后一批的同一次解码里多写一路输出（出段签 拿它顺带出首尾帧小图，省一遍解码；ffmpeg 参数，接在主输出后面）
 */
export async function* 帧流(file: string, 帧们: readonly number[], 宽: number, 高: number, o: { 格式?: 像素格式; 另出?: string[] } = {}): AsyncGenerator<Buffer> {
  const 格式 = o.格式 ?? 'rgb24';
  if (格式 === 'yuv420p') 要yuv420p(file);
  const 批们 = 选帧批次(帧们);
  for (const [i, 批] of 批们.entries())
    yield* 读流(
      低优先级([
        配置('ffmpeg'), '-v', 'error', '-nostdin', '-y', '-i', file, '-map', '0:v:0',
        '-vf', `select='${选帧表达式(批)}'`, '-fps_mode', 'passthrough', '-frames:v', String(批.length),
        '-f', 'rawvideo', '-pix_fmt', 格式, 'pipe:1',
        ...(i === 批们.length - 1 ? (o.另出 ?? []) : []),
      ]),
      帧字节(宽, 高, 格式),
    );
}

/** 只留抽样帧的 select 滤镜（和 抽样帧 同一组帧；一条 mod 表达式，帧再多也不长） */
export const 抽样滤镜 = (帧数: number, 间隔 = 默认间隔) => `select='not(mod(n,${间隔}))+eq(n,${帧数 - 1})'`;

/**
 * 只存了抽样帧的文件（认可参考：第 i 帧是原片的第 文件里的帧[i] 帧）按原片帧号交出像素（格式同 帧流）。
 * 要的 必须是 文件里的帧 的子集、升序；整份解一遍（抽样只有原片的 1/24）
 */
export async function* 抽样流(file: string, 文件里的帧: readonly number[], 要的: readonly number[], 宽: number, 高: number, 格式: 像素格式 = 'rgb24'): AsyncGenerator<Buffer> {
  const 位置 = new Map(文件里的帧.map((f, i) => [f, i]));
  for (const f of 要的) if (!位置.has(f)) throw new Error(`${file} 里没有原片第 ${f} 帧（只存了 ${文件里的帧.length} 个抽样帧）`);
  if (!要的.length) return;
  const 要 = new Set(要的);
  let i = 0;
  let 交了 = 0;
  if (格式 === 'yuv420p') 要yuv420p(file);
  for await (const rgb of 读流(低优先级([配置('ffmpeg'), '-v', 'error', '-nostdin', '-i', file, '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 格式, 'pipe:1']), 帧字节(宽, 高, 格式))) {
    const f = 文件里的帧[i++];
    if (f === undefined) throw new Error(`${file} 的帧比记的 ${文件里的帧.length} 帧多`);
    if (!要.has(f)) continue;
    yield rgb;
    if (++交了 === 要.size) return;
  }
  throw new Error(`${file} 只解出 ${i} 帧，记的是 ${文件里的帧.length} 帧`);
}

/** 第一条音轨解成 48 kHz 双声道 s16le */
export const 音频流 = (file: string) =>
  读流(低优先级([配置('ffmpeg'), '-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-ac', '2', '-ar', '48000', '-f', 's16le', 'pipe:1']), null);

export const sha = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

/** 16×9 块均值：每行一个十六进制串（16 块 × RGB 各一字节） */
export const 块均值 = (rgb: Buffer, 宽: number, 高: number): string[] => {
  const 行们: string[] = [];
  for (let by = 0; by < 块行; by++) {
    const y0 = Math.floor((by * 高) / 块行);
    const y1 = Math.max(y0 + 1, Math.floor(((by + 1) * 高) / 块行));
    const 行 = Buffer.alloc(块列 * 3);
    for (let bx = 0; bx < 块列; bx++) {
      const x0 = Math.floor((bx * 宽) / 块列);
      const x1 = Math.max(x0 + 1, Math.floor(((bx + 1) * 宽) / 块列));
      let r = 0, g = 0, b = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * 宽 + x) * 3;
          r += rgb[i]!;
          g += rgb[i + 1]!;
          b += rgb[i + 2]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      行[bx * 3] = Math.round(r / n);
      行[bx * 3 + 1] = Math.round(g / n);
      行[bx * 3 + 2] = Math.round(b / n);
    }
    行们.push(行.toString('hex'));
  }
  return 行们;
};
