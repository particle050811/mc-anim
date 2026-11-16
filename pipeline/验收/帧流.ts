// 从母版里按帧号抽出原始像素和整条 PCM，边读边交出去，不把整段解进内存。
// 抽样：首帧、每 24 帧、末帧。像素签名：ffmpeg 解成 rgb24 的 sha256 和 16×9 块均值（没有旧那版的像素时只能靠它比）；签名一直这么算，已有的认可记录、段签都靠它。
// 比画面用 yuv420p 原样（不经 swscale，各版本 ffmpeg 解出来逐位一样），再由 比较.ts 的 转rgb 按固定公式换。
import crypto from 'node:crypto';
import spawn from 'cross-spawn';
import { config } from '../环境/配置.ts';
import { lowPriority, runCapture } from '../环境/子进程.ts';
import { registerCleanup } from '../环境/收尾.ts';

export const defaultFrameStep = 24;
export const blockCols = 16;
export const blockRows = 9;

/** 首帧、每 间隔 帧、末帧，升序去重 */
export const sampleFrames = (frameCount: number, frameStep = defaultFrameStep): number[] => {
  if (!Number.isInteger(frameCount) || frameCount <= 0) throw new Error(`帧数要是正整数：${frameCount}`);
  const r = new Set<number>();
  for (let f = 0; f < frameCount; f += frameStep) r.add(f);
  r.add(frameCount - 1);
  return [...r].sort((a, b) => a - b);
};

/** 起 ffmpeg，把 stdout 按 块大小 切块交出；退出码非 0 抛错（带 stderr 末尾） */
export async function* readStream(cmd: string[], chunkSize: number | null): AsyncGenerator<Buffer> {
  const child = spawn(cmd[0]!, cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
  // 被杀直接退出，不走下面的 finally：不杀的话 ffmpeg 解到管道写满才因 EPIPE 退，解到尾的那种还会多占一会儿 CPU
  const undo = registerCleanup(() => void child.kill());
  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (d: string) => (stderr = (stderr + d).slice(-8192)));
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  try {
    if (chunkSize === null) {
      for await (const chunk of child.stdout!) yield chunk as Buffer;
    } else {
      let buffer = Buffer.allocUnsafe(chunkSize);
      let filled = 0;
      for await (const chunk of child.stdout!) {
        let c = chunk as Buffer;
        while (c.length) {
          const n = Math.min(c.length, chunkSize - filled);
          c.copy(buffer, filled, 0, n);
          filled += n;
          c = c.subarray(n);
          if (filled === chunkSize) {
            yield buffer;
            buffer = Buffer.allocUnsafe(chunkSize);
            filled = 0;
          }
        }
      }
      if (filled) throw new Error(`${cmd.at(-1)}：ffmpeg 输出的最后一帧不完整（${filled}/${chunkSize} 字节）`);
    }
    const code = await exited;
    if (code !== 0) throw new Error(`ffmpeg 失败（退出码 ${code}）：${cmd.join(' ')}\n${stderr.trim().split('\n').slice(-5).join('\n')}`);
  } finally {
    undo();
    if (child.exitCode === null) child.kill();
  }
}

// ffmpeg 的表达式有嵌套预算：连加超过 100 项就报「Cannot allocate memory」退出 244，括号里连的项也占预算。每 10 项包一层括号，深度只随帧数的对数涨
const itemsPerLevel = 10;
/** select 用的表达式：n 是这些帧号之一时非 0 */
export const frameSelectExpr = (frames: readonly number[]) => {
  let itemExprs = frames.map((f) => `eq(n,${f})`);
  while (itemExprs.length > itemsPerLevel) {
    const upperLevel: string[] = [];
    for (let i = 0; i < itemExprs.length; i += itemsPerLevel) upperLevel.push(`(${itemExprs.slice(i, i + itemsPerLevel).join('+')})`);
    itemExprs = upperLevel;
  }
  return itemExprs.join('+');
};

// 一个 ffmpeg 抽多少帧：表达式整条放在命令行上，一帧约 13 字符，Windows 命令行最长 32767 字符。超过才分批，后一批要从文件开头重新解
export const framesPerBatch = 2000;

/** 把升序的帧号切成各起一个 ffmpeg 的批 */
export const pickFrameBatch = (frames: readonly number[]) => {
  const frameBatches: (readonly number[])[] = [];
  for (let i = 0; i < frames.length; i += framesPerBatch) frameBatches.push(frames.slice(i, i + framesPerBatch));
  return frameBatches;
};

export type PixelFormat = 'rgb24' | 'yuv420p';
export const frameBytes = (width: number, height: number, pixelFormat: PixelFormat) => (pixelFormat === 'rgb24' ? width * height * 3 : (width * height * 3) / 2);

/** 源不是 yuv420p 时 -pix_fmt yuv420p 会经 swscale 换，就不是逐位一样了：拒 */
export const needsYuv420p = (file: string) => {
  const f = runCapture([config('ffprobe'), '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', file]).trim();
  if (f !== 'yuv420p') throw new Error(`${file} 的像素格式是 ${f}，比画面要 yuv420p（换算公式只认它）`);
};

/**
 * 按帧号升序交出像素（rgb24：宽×高×3 字节；yuv420p：宽×高×1.5 字节，原样不换）；-frames:v 让 ffmpeg 解到这批最后一帧就退，不解到文件尾。
 * 另出：在最后一批的同一次解码里多写一路输出（出段签 拿它顺带出首尾帧小图，省一遍解码；ffmpeg 参数，接在主输出后面）
 */
export async function* frameStream(file: string, frames: readonly number[], width: number, height: number, o: { 格式?: PixelFormat; extraOutputs?: string[] } = {}): AsyncGenerator<Buffer> {
  const pixelFormat = o.格式 ?? 'rgb24';
  if (pixelFormat === 'yuv420p') needsYuv420p(file);
  const frameBatches = pickFrameBatch(frames);
  for (const [i, batch] of frameBatches.entries())
    yield* readStream(
      lowPriority([
        config('ffmpeg'), '-v', 'error', '-nostdin', '-y', '-i', file, '-map', '0:v:0',
        '-vf', `select='${frameSelectExpr(batch)}'`, '-fps_mode', 'passthrough', '-frames:v', String(batch.length),
        '-f', 'rawvideo', '-pix_fmt', pixelFormat, 'pipe:1',
        ...(i === frameBatches.length - 1 ? (o.extraOutputs ?? []) : []),
      ]),
      frameBytes(width, height, pixelFormat),
    );
}

/** 只留抽样帧的 select 滤镜（和 抽样帧 同一组帧；一条 mod 表达式，帧再多也不长） */
export const sampleFilter = (frameCount: number, frameStep = defaultFrameStep) => `select='not(mod(n,${frameStep}))+eq(n,${frameCount - 1})'`;

/**
 * 只存了抽样帧的文件（认可参考：第 i 帧是原片的第 文件里的帧[i] 帧）按原片帧号交出像素（格式同 帧流）。
 * 要的 必须是 文件里的帧 的子集、升序；整份解一遍（抽样只有原片的 1/24）
 */
export async function* sampledStream(file: string, fileFrames: readonly number[], wantedFrames: readonly number[], width: number, height: number, pixelFormat: PixelFormat = 'rgb24'): AsyncGenerator<Buffer> {
  const framePos = new Map(fileFrames.map((f, i) => [f, i]));
  for (const f of wantedFrames) if (!framePos.has(f)) throw new Error(`${file} 里没有原片第 ${f} 帧（只存了 ${fileFrames.length} 个抽样帧）`);
  if (!wantedFrames.length) return;
  const wantSet = new Set(wantedFrames);
  let i = 0;
  let delivered = 0;
  if (pixelFormat === 'yuv420p') needsYuv420p(file);
  for await (const rgb of readStream(lowPriority([config('ffmpeg'), '-v', 'error', '-nostdin', '-i', file, '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', pixelFormat, 'pipe:1']), frameBytes(width, height, pixelFormat))) {
    const f = fileFrames[i++];
    if (f === undefined) throw new Error(`${file} 的帧比记的 ${fileFrames.length} 帧多`);
    if (!wantSet.has(f)) continue;
    yield rgb;
    if (++delivered === wantSet.size) return;
  }
  throw new Error(`${file} 只解出 ${i} 帧，记的是 ${fileFrames.length} 帧`);
}

/** 第一条音轨解成 48 kHz 双声道 s16le */
export const audioStream = (file: string) =>
  readStream(lowPriority([config('ffmpeg'), '-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-ac', '2', '-ar', '48000', '-f', 's16le', 'pipe:1']), null);

export const sha = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

/** 16×9 块均值：每行一个十六进制串（16 块 × RGB 各一字节） */
export const blockMeans = (rgb: Buffer, width: number, height: number): string[] => {
  const hexLines: string[] = [];
  for (let by = 0; by < blockRows; by++) {
    const y0 = Math.floor((by * height) / blockRows);
    const y1 = Math.max(y0 + 1, Math.floor(((by + 1) * height) / blockRows));
    const rowBuf = Buffer.alloc(blockCols * 3);
    for (let bx = 0; bx < blockCols; bx++) {
      const x0 = Math.floor((bx * width) / blockCols);
      const x1 = Math.max(x0 + 1, Math.floor(((bx + 1) * width) / blockCols));
      let r = 0, g = 0, b = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 3;
          r += rgb[i]!;
          g += rgb[i + 1]!;
          b += rgb[i + 2]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      rowBuf[bx * 3] = Math.round(r / n);
      rowBuf[bx * 3 + 1] = Math.round(g / n);
      rowBuf[bx * 3 + 2] = Math.round(b / n);
    }
    hexLines.push(rowBuf.toString('hex'));
  }
  return hexLines;
};
