// webpack loader：ogg 打包时解成 16 位 PCM 的 wav 交给 Remotion 放（pipeline/资产/webpack.ts 挂在 ogg 上），库里存的还是 ogg。照搬旧项目 工具/打包/ogg解码.cjs。
// 为什么：@remotion/media 用 mediabunny 从文件中间（离开头超过 1.5 秒）接着放 ogg 时，Vorbis 解码器第一包不出声，
// 但时间戳仍对到第一包上，声音整体早约 46 毫秒（2048 样本）。PCM 没有解码器状态，从哪接着放都准，所以一律换 wav。
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

module.exports = function oggDecode() {
  const ffmpeg = (this.getOptions && this.getOptions().ffmpeg) || 'ffmpeg';
  // 写进临时文件再读：ffmpeg 往管道里写 wav 回填不了头里的长度
  const tmp = path.join(os.tmpdir(), `ogg解码-${process.pid}-${Math.random().toString(36).slice(2)}.wav`);
  try {
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', this.resourcePath, '-map', '0:a:0', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]);
    return fs.readFileSync(tmp);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
};
module.exports.raw = true;
