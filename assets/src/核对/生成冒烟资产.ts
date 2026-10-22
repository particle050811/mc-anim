// 生成冒烟 Composition 用的两件测试资产（不含任何受许可内容）：8×8 的 RGBA 色块 png、1 秒 440 Hz 的正弦 ogg。
// 用法：node assets/src/核对/生成冒烟资产.ts <输出目录>，再 anim assets add 核对/冒烟色块 <输出目录>/冒烟色块.png、anim assets add 核对/冒烟音 <输出目录>/冒烟音.ogg
// ogg 用 ffmpeg 自带的 vorbis 编码器（不依赖 libvorbis），编出来的字节不保证逐位可重现，以入库的 sha 为准。
import fs from 'node:fs';
import path from 'node:path';
import { encode } from 'fast-png';
import { 配置 } from '../../../pipeline/环境/配置.ts';
import { 跑出 } from '../../../pipeline/环境/子进程.ts';

const out = process.argv[2];
if (!out) throw new Error('用法：node assets/src/核对/生成冒烟资产.ts <输出目录>');
fs.mkdirSync(out, { recursive: true });

const px = new Uint8Array(8 * 8 * 4);
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    const i = (y * 8 + x) * 4;
    px.set([x * 32 + 16, y * 32 + 16, (x + y) % 2 ? 224 : 32, 255], i);
  }
}
fs.writeFileSync(path.join(out, '冒烟色块.png'), encode({ width: 8, height: 8, data: px, channels: 4, depth: 8 }));

跑出([配置('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-ac', '2', '-c:a', 'vorbis', '-strict', '-2', '-q:a', '5', path.join(out, '冒烟音.ogg')]);
console.log(`写在 ${out}`);
