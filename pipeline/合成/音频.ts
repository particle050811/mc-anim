// 合成用的声音小工具：ffmpeg 读成 48k 单声道 float。
import { config } from '../环境/配置.ts';
import { runCaptureBytes } from '../环境/子进程.ts';

export const toFloat32 = (buf: Buffer) => new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4)));

export const readMono = (file: string, extraFilters: string[] = []): Float32Array =>
  toFloat32(runCaptureBytes([config('ffmpeg'), '-v', 'error', '-i', file, '-vn', ...extraFilters, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']));
