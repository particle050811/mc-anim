// 合成用的声音小工具：ffmpeg 读成 48k 单声道 float。
import { 配置 } from '../环境/配置.ts';
import { 跑出字节 } from '../环境/子进程.ts';

export const 转float = (buf: Buffer) => new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4)));

export const 读单声道 = (file: string, 额外滤镜: string[] = []): Float32Array =>
  转float(跑出字节([配置('ffmpeg'), '-v', 'error', '-i', file, '-vn', ...额外滤镜, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']));
