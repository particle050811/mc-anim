// 实验工具（不接 anim）：把一帧要的区段清单（渲染日志里的 [地形量时清单]）在 Node 单线程里按格式取、解压、解码一遍，报 CPU 时间；浏览器里 DecompressionStream 的 CPU 量不到，拿这个对照。各包交替跑。
//   node pipeline/世界/实验/回放解码.ts <清单文件> <轮数> <名=包目录>…
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { 载入体素库 } from '../体素库.ts';
import { 摊开 } from '../烘焙/瘦身.ts';
import { 列间魔数, 算术标记, 解列间区段, 解算术区段 } from '../../../engine/voxel/区段编码.ts';

const [清单文件, 轮数串, ...包们] = process.argv.slice(2);
const 轮数 = Number(轮数串);
const 库 = await 载入体素库();
const P = 库.区段包;
const 清单 = fs.readFileSync(清单文件!, 'utf8').trim().split(',').map((s) => {
  const [L, i, j] = s.split('/').map(Number) as [number, number, number];
  return { L, i, j };
});
const 中位 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const cpu毫秒 = (f: () => void) => {
  const c = process.cpuUsage();
  f();
  const d = process.cpuUsage(c);
  return (d.user + d.system) / 1000;
};
type 记 = { 读: number[]; 解压: number[]; 解码: number[]; 摊: number[]; 字节: number };
const 结果 = new Map<string, 记>();
for (const 项 of 包们) 结果.set(项.split('=')[0]!, { 读: [], 解压: [], 解码: [], 摊: [], 字节: 0 });
for (let 轮 = 0; 轮 < 轮数; 轮++) {
  for (const 项 of 包们) {
    const [名, 目录] = 项.split('=') as [string, string];
    const r = 结果.get(名)!;
    const fds = new Map<string, number>();
    const 头们 = new Map<string, Uint32Array>();
    const 位 = 清单.map((q) => {
      const { ti, tj, slot } = P.sectionInTile(q);
      const f = P.tileFileName(ti, tj);
      if (!fds.has(f)) {
        const fd = fs.openSync(path.join(目录, f), 'r');
        fds.set(f, fd);
        const h = Buffer.alloc(P.tileHeaderLen);
        fs.readSync(fd, h, 0, h.length, 0);
        头们.set(f, P.decodeTileHeader(new Uint8Array(h)));
      }
      const 头 = 头们.get(f)!;
      return { fd: fds.get(f)!, off: 头[2 * slot]!, len: 头[2 * slot + 1]! };
    });
    const 取回: Uint8Array[] = [];
    r.读.push(cpu毫秒(() => {
      for (const x of 位) {
        const b = new Uint8Array(x.len);
        fs.readSync(x.fd, b, 0, x.len, x.off);
        取回.push(b);
      }
    }));
    r.字节 = 取回.reduce((s, b) => s + b.length, 0);
    for (const fd of fds.values()) fs.closeSync(fd);
    const gz: (Uint8Array | null)[] = [];
    r.解压.push(cpu毫秒(() => {
      for (const b of 取回) gz.push(b[0] === 算术标记 ? null : new Uint8Array(zlib.gunzipSync(b)));
    }));
    const 数据: Parameters<typeof 摊开>[0][] = [];
    r.解码.push(cpu毫秒(() => {
      取回.forEach((b, n) => {
        const un = gz[n];
        if (!un) 数据.push(解算术区段(b, 清单[n]!).data);
        else 数据.push(new DataView(un.buffer, un.byteOffset, 4).getUint32(0, true) === 列间魔数 ? 解列间区段(un, 清单[n]!) : P.decodeSection(un));
      });
    }));
    r.摊.push(cpu毫秒(() => {
      for (const d of 数据) 摊开(d);
    }));
  }
}
console.log(`${清单.length} 个区段，${轮数} 轮交替，单线程 CPU 毫秒中位（第一轮含 JIT 预热）`);
for (const [名, r] of 结果) console.log(`${名}：字节 ${(r.字节 / 1e6).toFixed(2)} MB；读文件 ${中位(r.读).toFixed(1)}；解压 ${中位(r.解压).toFixed(1)}；解码 ${中位(r.解码).toFixed(1)}；摊开 ${中位(r.摊).toFixed(1)}；解压 + 解码 ${(中位(r.解压) + 中位(r.解码)).toFixed(1)}`);
