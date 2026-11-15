// anim world 转码 的工作线程（转码.ts 起）：一次一个块文件。
//   转：旧包（格式 1、2、3）→ 现行格式，给了 可见 就先过可见变换（可见.ts）；区段在文件里的先后不变，和直接烘焙写出的字节一样。
//   比：从磁盘上两边各解一遍逐格比（状态、群系）。给了 可见 就拿旧包的格子重做一遍变换再比，改了的区段另核格和网格（可见核对.ts）。
import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
import type { SectionData, 包信息 } from '../../../engine/voxel/区段包.ts';
import { 载入体素库 } from '../体素库.ts';
import { 可见环境, type 可见设置 } from './可见.ts';
import { 核格, 核网格, 载入网格 } from './可见核对.ts';
import { 到列优先, 压并核对 } from './区段编码.ts';
import { 块号, 块里的区段, 读包模型 } from './读区段.ts';

export type 转码活 = { 动作: '转' | '比'; 旧: string; 新: string; 名: string; 可见?: 可见设置 | null };
export type 转码果 = {
  名: string; 区段: number; 旧字节: number; 新字节: number; 格: number; 非空气格: number; 解毫秒: number;
  /** 可见变换：改了的区段、保真里原样的区段、各项换掉的格、核过网格的区段 */
  改段: number; 保真段: number; 填: number; 埋: number; 邻圈: number; 核心边: number; 网格核: number;
};
export const 空果 = (名: string): 转码果 => ({ 名, 区段: 0, 旧字节: 0, 新字节: 0, 格: 0, 非空气格: 0, 解毫秒: 0, 改段: 0, 保真段: 0, 填: 0, 埋: 0, 邻圈: 0, 核心边: 0, 网格核: 0 });

const 库 = await 载入体素库();

// 一个工人从头到尾只转一个包，环境（整包索引、第 1 级区段缓存）留着复用
let 环: { 键: string; 环: 可见环境 } | null = null;
const 取环 = (旧: string, 可见: 可见设置) => {
  const 键 = `${旧}\n${JSON.stringify(可见)}`;
  if (环?.键 !== 键) { 环?.环.关(); 环 = { 键, 环: new 可见环境(库, 旧, 可见) }; }
  return 环.环;
};
let 网格: { 旧: string; 建: (d: SectionData) => ReturnType<Awaited<ReturnType<typeof 载入网格>>> } | null = null;
const 取网格 = async (旧: string) => {
  if (网格?.旧 !== 旧) 网格 = { 旧, 建: await 载入网格(库, JSON.parse(fs.readFileSync(path.join(旧, '包.json'), 'utf8')) as 包信息) };
  return 网格.建;
};
const 记变换 = (果: 转码果, 记: ReturnType<可见环境['变换']>['记']) => {
  if (!记) { 果.保真段++; return; }
  果.填 += 记.填.length; 果.埋 += 记.埋; 果.邻圈 += 记.邻圈; 果.核心边 += 记.核心边.length;
};

const 转 = ({ 旧, 新, 名, 可见 }: 转码活): 转码果 => {
  const { tileHeaderLen, tileEntryCount, encodeTileHeader } = 库.区段包;
  const 索引 = new Uint32Array(2 * tileEntryCount);
  const 段们: Uint8Array[] = [];
  let off = tileHeaderLen;
  const 果 = 空果(名), 变 = 可见 ? 取环(旧, 可见) : null;
  for (const s of 块里的区段(库, path.join(旧, 名))) {
    let d = s.取();
    if (d.L !== s.id.L || d.i !== s.id.i || d.j !== s.id.j) throw new Error(`${名} 第 ${s.slot} 项写的是区段 ${d.L}/${d.i}/${d.j}，位置算出来是 ${s.id.L}/${s.id.i}/${s.id.j}`);
    if (变) {
      const r = 变.变换(d);
      记变换(果, r.记);
      if (r.d !== d) 果.改段++;
      d = r.d;
    }
    const 压 = 压并核对(库, d, 读包模型(新));
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

const 比 = async ({ 旧, 新, 名, 可见 }: 转码活): Promise<转码果> => {
  const 果 = 空果(名), 变 = 可见 ? 取环(旧, 可见) : null, 建网格 = 变 ? await 取网格(旧) : null;
  const 新段 = new Map([...块里的区段(库, path.join(新, 名))].map((s) => [s.slot, s]));
  for (const s of 块里的区段(库, path.join(旧, 名))) {
    const b = 新段.get(s.slot);
    if (!b) throw new Error(`${名} 第 ${s.slot} 项：新包里没有这个区段`);
    新段.delete(s.slot);
    const 原 = s.取();
    const t0 = performance.now();
    const x = b.取();
    果.解毫秒 += performance.now() - t0;
    const 名字 = `${名} 区段 ${s.id.L}/${s.id.i}/${s.id.j}`;
    let a = 原;
    if (变) {
      const r = 变.变换(原);
      记变换(果, r.记);
      a = r.d;
      if (r.d !== 原) {
        果.改段++;
        const 格 = 核格(r.g0!, x, 变.罩, r.记!);
        if (格.坏) throw new Error(`${名字}：可见变换改的格有 ${格.坏} 处不合规矩，${格.说}`);
        const 网 = 核网格(建网格!(原), 建网格!(x), 原.nz, r.记!);
        if (网) throw new Error(`${名字}：可见变换后网格不对，${网}`);
        果.网格核++;
      }
    }
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

parentPort!.on('message', async (活: 转码活) => {
  try {
    parentPort!.postMessage({ 果: 活.动作 === '转' ? 转(活) : await 比(活) });
  } catch (e) {
    parentPort!.postMessage({ 错: `${活.名}：${(e as Error).message}` });
  }
});
parentPort!.postMessage({ 好了: true });
