// 合成用的声音小工具：ffmpeg 读成 48k 单声道 float，互相关（FFT 算，结果和 numpy correlate 'valid' 一样）。
import { 配置 } from '../环境/配置.ts';
import { 跑出字节 } from '../环境/子进程.ts';

export const 转float = (buf: Buffer) => new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4)));

export const 读单声道 = (file: string, 额外滤镜: string[] = []): Float32Array =>
  转float(跑出字节([配置('ffmpeg'), '-v', 'error', '-i', file, '-vn', ...额外滤镜, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']));

const fft = (re: Float64Array, im: Float64Array, 逆: boolean) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((逆 ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (逆) for (let i = 0; i < n; i++) (re[i] = re[i]! / n), (im[i] = im[i]! / n);
};

/** c[k] = Σ_j w[k+j]·v[j]，k = 0 … len(w) − len(v)（numpy correlate(w, v, 'valid')） */
export const 互相关 = (w: Float32Array, v: Float32Array): Float64Array => {
  const 步数 = w.length - v.length + 1;
  if (步数 <= 0) return new Float64Array(0);
  let n = 1;
  while (n < w.length + v.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(w);
  br.set(v);
  fft(ar, ai, false);
  fft(br, bi, false);
  for (let i = 0; i < n; i++) {
    const r = ar[i]! * br[i]! + ai[i]! * bi[i]!;
    const m = ai[i]! * br[i]! - ar[i]! * bi[i]!;
    ar[i] = r;
    ai[i] = m;
  }
  fft(ar, ai, true);
  return ar.slice(0, 步数);
};
