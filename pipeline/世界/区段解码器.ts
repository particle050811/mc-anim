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
import { 走模型, 到列优先, 表布局, type 记号器 } from './烘焙/区段编码.ts';
import { 遍历区段 } from './烘焙/读区段.ts';
import type { 体素库 } from './体素库.ts';

const sha = (b: Uint8Array | string) => crypto.createHash('sha256').update(b).digest('hex');
const 源码指纹 = (源码: string) => sha(源码.replace(/\r\n/g, '\n')); // Windows 上 git 可能把换行改成 CRLF
export const 解码器源码 = () => path.join(代码根(), 'wasm', '区段解码.ts');
export const 解码器生成文件 = () => path.join(代码根(), 'engine', 'voxel', '区段解码器.生成.ts');
export const 模型表生成文件 = () => path.join(代码根(), 'engine', 'voxel', '区段模型表.生成.ts');

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

class 数频率 implements 记号器 {
  n: Float64Array;
  private 表: Uint16Array;
  constructor(表: Uint16Array) {
    this.表 = 表;
    this.n = new Float64Array(2 * 表.length);
  }
  bit(ps: Uint16Array, i: number, b: number) {
    if (ps === this.表) this.n[2 * i + b]!++; // 色板号的概率每区段含义不同，不学
    return b;
  }
}

/** 每个包抽一部分区段（按文件名、索引顺序每 抽 个取一个）数频率，出初值；同样的包、同样的 抽 出同样的表 */
export const 训练模型表 = (库: 体素库, 包目录们: string[], 抽: number) => {
  const 表 = new Uint16Array(表布局.总).fill(1024);
  const 计 = new 数频率(表);
  let 区段 = 0;
  for (const dir of 包目录们) {
    let 见 = 0;
    for (const { 取 } of 遍历区段(库, dir)) {
      if (见++ % 抽) continue;
      const d = 取();
      走模型(计, 到列优先(d), d.nz, d.palette.length / 2, d.L, 表);
      区段++;
    }
  }
  const 初 = new Uint16Array(表布局.总).fill(1024);
  for (let i = 0; i < 初.length; i++) {
    const n0 = 计.n[2 * i]!, n1 = 计.n[2 * i + 1]!;
    if (n0 + n1) 初[i] = Math.min(2017, Math.max(31, Math.round(((n0 + 0.4) / (n0 + n1 + 0.8)) * 2048)));
  }
  return { 初, 区段 };
};

export const 模型表文件内容 = (初: Uint16Array, 依据: string) =>
  `// anim world 解码器 --训练 生成，别手改：区段模型的初值（docs/决策/0011-地形压缩.md）。它是地形包格式的一部分，换表要升格式版本、全部地形包重转。\n` +
  `// ${依据}\n` +
  `// 布局（下标）：p1 0、p2 384、p3 768 各 128 × 3 级，跳 1152 是 64 × 3 级，整列 1344 是 9 × 3 级；值是「这一位是 0」的概率 × 2048。\n` +
  `export const 初值表 = Uint16Array.of(${[...初].join(',')});\n`;
