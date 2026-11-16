// anim world decoder：逐格预测压缩的两份生成物（都进 Git，都进用地形的段的指纹，都不手改），来源见 docs/决策/0011-地形压缩.md。
//   engine/voxel/区段解码器.生成.ts：wasm/区段解码.ts 用 AssemblyScript（版本钉在 package.json）编出的 WASM，base64。
//   engine/voxel/区段模型表.生成.ts：模型初值，从真实地形按上下文数频率学的。它是格式的一部分，换表要升格式版本、全部地形包重转，所以平时只有 --训练 才动。
// asc 只在这里用，渲染、烘焙都不要它；没装（pnpm install 装开发依赖才有）时 --check 报错，anim check 只比源码 sha，不要 asc。
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codeRoot } from '../环境/路径.ts';

const sha = (b: Uint8Array | string) => crypto.createHash('sha256').update(b).digest('hex');
const sourceFingerprint = (source: string) => sha(source.replace(/\r\n/g, '\n')); // Windows 上 git 可能把换行改成 CRLF
export const decoderSource = () => path.join(codeRoot(), 'wasm', '区段解码.ts');
export const decoderGeneratedFile = () => path.join(codeRoot(), 'engine', 'voxel', '区段解码器.生成.ts');

/** 优化选项进 WASM 字节，改了等于换解码器 */
const ascArgs = ['--optimizeLevel', '3', '--shrinkLevel', '0', '--noAssert', '--runtime', 'stub', '--use', 'abort=', '--initialMemory', '8', '--converge'];

const compileWasm = () => {
  const asc = path.join(codeRoot(), 'node_modules', 'assemblyscript', 'bin', 'asc.js');
  if (!fs.existsSync(asc)) throw new Error('没有 node_modules/assemblyscript：pnpm install 装开发依赖');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), '区段解码器-'));
  try {
    const outPath = path.join(workDir, 'x.wasm');
    execFileSync(process.execPath, [asc, decoderSource(), '-o', outPath, ...ascArgs], { cwd: codeRoot(), stdio: ['ignore', 'pipe', 'pipe'] });
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
};

const decoderFileText = (wasm: Uint8Array, sourceSha: string) =>
  `// anim world decoder 生成，别手改：wasm/区段解码.ts 用 assemblyscript 编出的 WASM（docs/决策/0011-地形压缩.md）。\n` +
  `export const sourceSha256 = '${sourceSha}';\n` +
  `export const wasmBase64 =\n  '${Buffer.from(wasm).toString('base64')}';\n`;

/** 现在的生成文件记的源码 sha，和 wasm/区段解码.ts 对不上就是改了源码没重编（anim check 用，不要 asc） */
export const decoderSourceStale = (text: string, source: string) => {
  const m = /sourceSha256 = '([0-9a-f]{64})'/.exec(text);
  return !m || m[1] !== sourceFingerprint(source);
};

/** 重编：写回；只检查时比字节，对不上抛错 */
export const buildDecoder = (o: { check: boolean }) => {
  const wasm = compileWasm();
  const text = decoderFileText(wasm, sourceFingerprint(fs.readFileSync(decoderSource(), 'utf8')));
  const f = decoderGeneratedFile();
  const same = fs.existsSync(f) && fs.readFileSync(f, 'utf8') === text;
  if (!same && o.check) throw new Error(`重编出的 WASM（sha256 ${sha(wasm).slice(0, 12)}）和 ${path.relative(codeRoot(), f)} 不一样`);
  if (!same) fs.writeFileSync(f, text);
  return { size: wasm.length, sha256: sha(wasm), same };
};
