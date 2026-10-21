// 从母版里按帧号抽出原始像素（rgb24）和整条 PCM，边读边交出去，不把整段解进内存。
// 抽样：首帧、每 24 帧、末帧。像素签名：原始像素的 sha256 和 16×9 块均值（没有旧母版时只能靠它比）。
import crypto from 'node:crypto';
import spawn from 'cross-spawn';
import { 配置 } from '../环境/配置.ts';
import { 低优先级 } from '../环境/子进程.ts';

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
async function* 读流(cmd: string[], 块大小: number | null): AsyncGenerator<Buffer> {
  const child = spawn(cmd[0]!, cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
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
    if (child.exitCode === null) child.kill();
  }
}

// ffmpeg 的表达式一层最多连 100 项，select 超过就报「Cannot allocate memory」退出 244，所以分批各起一个 ffmpeg
export const 每批帧数 = 90;

/** 按帧号升序交出 rgb24 像素（宽×高×3 字节） */
export async function* 帧流(file: string, 帧们: readonly number[], 宽: number, 高: number): AsyncGenerator<Buffer> {
  for (let i = 0; i < 帧们.length; i += 每批帧数)
    yield* 读流(
      低优先级([
        配置('ffmpeg'), '-v', 'error', '-nostdin', '-i', file, '-map', '0:v:0',
        '-vf', `select='${帧们.slice(i, i + 每批帧数).map((f) => `eq(n,${f})`).join('+')}'`, '-fps_mode', 'passthrough',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
      ]),
      宽 * 高 * 3,
    );
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
