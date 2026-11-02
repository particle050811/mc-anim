// anim world 解码器：逐格预测压缩的两份生成物（都进 Git，都进用地形的段的指纹，都不手改），来源见 docs/决策/0011-地形压缩.md。
//   engine/voxel/区段解码器.生成.ts：wasm/区段解码.ts 用 AssemblyScript（版本钉在 package.json）编出的 WASM，base64。
//   engine/voxel/区段模型表.生成.ts：模型初值，从真实地形按上下文数频率学的。它是格式的一部分，换表要升格式版本、全部地形包重转，所以平时只有 --训练 才动。
// asc 只在这里用，渲染、烘焙都不要它；没装（npm ci 才有）时 --检查 报错，anim check 只比源码 sha，不要 asc。
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { 代码根 } from '../环境/路径.ts';

const sha = (b: Uint8Array | string) => crypto.createHash('sha256').update(b).digest('hex');
const 源码指纹 = (源码: string) => sha(源码.replace(/\r\n/g, '\n')); // Windows 上 git 可能把换行改成 CRLF
export const 解码器源码 = () => path.join(代码根(), 'wasm', '区段解码.ts');
export const 解码器生成文件 = () => path.join(代码根(), 'engine', 'voxel', '区段解码器.生成.ts');

/** 优化选项进 WASM 字节，改了等于换解码器 */
const asc参数 = ['--optimizeLevel', '3', '--shrinkLevel', '0', '--noAssert', '--runtime', 'stub', '--use', 'abort=', '--initialMemory', '8', '--converge'];

const 编译 = () => {
  const asc = path.join(代码根(), 'node_modules', 'assemblyscript', 'bin', 'asc.js');
  if (!fs.existsSync(asc)) throw new Error('没有 node_modules/assemblyscript：npm ci 装开发依赖');
  const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), '区段解码器-'));
  try {
    const 出 = path.join(目录, 'x.wasm');
    execFileSync(process.execPath, [asc, 解码器源码(), '-o', 出, ...asc参数], { cwd: 代码根(), stdio: ['ignore', 'pipe', 'pipe'] });
    return fs.readFileSync(出);
  } finally {
    fs.rmSync(目录, { recursive: true, force: true });
  }
};

const 解码器文件内容 = (wasm: Uint8Array, 源码sha: string) =>
  `// anim world 解码器 生成，别手改：wasm/区段解码.ts 用 assemblyscript 编出的 WASM（docs/决策/0011-地形压缩.md）。\n` +
  `export const 源码sha256 = '${源码sha}';\n` +
  `export const wasmBase64 =\n  '${Buffer.from(wasm).toString('base64')}';\n`;

/** 现在的生成文件记的源码 sha，和 wasm/区段解码.ts 对不上就是改了源码没重编（anim check 用，不要 asc） */
export const 解码器源码过期 = (文本: string, 源码: string) => {
  const m = /源码sha256 = '([0-9a-f]{64})'/.exec(文本);
  return !m || m[1] !== 源码指纹(源码);
};

/** 重编：写回；只检查时比字节，对不上抛错 */
export const 构建解码器 = (o: { 检查: boolean }) => {
  const wasm = 编译();
  const 文本 = 解码器文件内容(wasm, 源码指纹(fs.readFileSync(解码器源码(), 'utf8')));
  const f = 解码器生成文件();
  const 一样 = fs.existsSync(f) && fs.readFileSync(f, 'utf8') === 文本;
  if (!一样 && o.检查) throw new Error(`重编出的 WASM（sha256 ${sha(wasm).slice(0, 12)}）和 ${path.relative(代码根(), f)} 不一样`);
  if (!一样) fs.writeFileSync(f, 文本);
  return { 大小: wasm.length, sha256: sha(wasm), 一样 };
};
