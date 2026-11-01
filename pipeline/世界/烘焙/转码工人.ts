// anim world 转码 的工作线程（转码.ts 起）：一次一个块文件。
//   转：格式 1 → 现行格式，区段在文件里的先后不变，和直接烘焙写出的字节一样。
//   比：从磁盘上两边各解一遍，逐格比（状态、群系）。转的时候已经压完就解回核对过（压并核对），这里再比一次盘上的成品。
import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
import { 载入体素库 } from '../体素库.ts';
import { 到列优先, 压并核对 } from './区段编码.ts';
import { 块号, 块里的区段 } from './读区段.ts';

export type 转码活 = { 动作: '转' | '比'; 旧: string; 新: string; 名: string };
export type 转码果 = { 名: string; 区段: number; 旧字节: number; 新字节: number; 格: number; 非空气格: number; 解毫秒: number };

const 库 = await 载入体素库();

const 转 = ({ 旧, 新, 名 }: 转码活): 转码果 => {
  const { tileHeaderLen, tileEntryCount, encodeTileHeader } = 库.区段包;
  const 索引 = new Uint32Array(2 * tileEntryCount);
  const 段们: Uint8Array[] = [];
  let off = tileHeaderLen;
  const 果: 转码果 = { 名, 区段: 0, 旧字节: 0, 新字节: 0, 格: 0, 非空气格: 0, 解毫秒: 0 };
  for (const s of 块里的区段(库, path.join(旧, 名))) {
    const d = s.取();
    if (d.L !== s.id.L || d.i !== s.id.i || d.j !== s.id.j) throw new Error(`${名} 第 ${s.slot} 项写的是区段 ${d.L}/${d.i}/${d.j}，位置算出来是 ${s.id.L}/${s.id.i}/${s.id.j}`);
    const 压 = 压并核对(库, d);
    索引[2 * s.slot] = off;
    索引[2 * s.slot + 1] = 压.length;
    off += 压.length;
    段们.push(压);
    果.区段++;
    果.旧字节 += s.字节.length;
    果.新字节 += 压.length;
  }
  const [ti, tj] = 块号(名);
  const fd = fs.openSync(path.join(新, 名), 'w');
  try {
    fs.writeSync(fd, encodeTileHeader(ti, tj, 索引));
    for (const b of 段们) fs.writeSync(fd, b);
  } finally {
    fs.closeSync(fd);
  }
  return 果;
};

const 比 = ({ 旧, 新, 名 }: 转码活): 转码果 => {
  const 果: 转码果 = { 名, 区段: 0, 旧字节: 0, 新字节: 0, 格: 0, 非空气格: 0, 解毫秒: 0 };
  const 新段 = new Map([...块里的区段(库, path.join(新, 名))].map((s) => [s.slot, s]));
  for (const s of 块里的区段(库, path.join(旧, 名))) {
    const b = 新段.get(s.slot);
    if (!b) throw new Error(`${名} 第 ${s.slot} 项：新包里没有这个区段`);
    新段.delete(s.slot);
    const a = s.取();
    const t0 = performance.now();
    const x = b.取();
    果.解毫秒 += performance.now() - t0;
    const 名字 = `${名} 区段 ${s.id.L}/${s.id.i}/${s.id.j}`;
    if (a.L !== x.L || a.i !== x.i || a.j !== x.j || a.kBottom !== x.kBottom || a.nz !== x.nz) throw new Error(`${名字}：区段头不一样`);
    const ca = 到列优先(a), cx = 到列优先(x);
    for (let k = 0; k < ca.length; k++) {
      const pa = ca[k]!, px = cx[k]!;
      if (a.palette[2 * pa] !== x.palette[2 * px] || a.palette[2 * pa + 1] !== x.palette[2 * px + 1]) throw new Error(`${名字} 第 ${k} 格不一样（状态、群系 ${a.palette[2 * pa]}、${a.palette[2 * pa + 1]} 对 ${x.palette[2 * px]}、${x.palette[2 * px + 1]}）`);
      if (pa) 果.非空气格++;
    }
    果.区段++;
    果.格 += ca.length;
    果.旧字节 += s.字节.length;
    果.新字节 += b.字节.length;
  }
  if (新段.size) throw new Error(`${名}：新包多出 ${新段.size} 个区段`);
  return 果;
};

parentPort!.on('message', (活: 转码活) => {
  try {
    parentPort!.postMessage({ 果: 活.动作 === '转' ? 转(活) : 比(活) });
  } catch (e) {
    parentPort!.postMessage({ 错: `${活.名}：${(e as Error).message}` });
  }
});
parentPort!.postMessage({ 好了: true });
