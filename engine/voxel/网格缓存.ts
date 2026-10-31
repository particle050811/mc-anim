// 实验（不合并）：区段网格的硬盘缓存。ANIM_MC=fill 边建边写，ANIM_MC=read 有缓存的区段不取区段包、不建网格，直接拿字节。
// 只影响「网格从哪来」：命中的区段走 世界.tsx 原来的 `kept` 分支，three 物体还是按 qs 的先后建，所以深度一样时谁盖谁不变。
// 服务在 pipeline/渲/网格缓存服务.ts（bench 里开，缓存目录 ANIM_MC_DIR）。键 = 世界键（带区段包版本和挖法后缀）|L|i|j；网格代码的版本这里靠换目录（正式做要进键）。
// 一条记录：头（魔数、面数、nz、原点、格、五类各 n 和 段[12]）后面接五类的 pos、uv、tex、col，都是原样的数组。
import type { FaceGroup, SectionMesh } from './网格.ts';
import type { VoxelGrid } from './生成.ts';
import { 桩, 环境 } from './桩.ts';

export type 缓存体素 = Pick<VoxelGrid, '原点' | '格' | 'nz'>;
export const 缓存模式 = 环境.ANIM_MC as 'fill' | 'read' | undefined;
const 址 = 环境.ANIM_MC_URL;
const 类名 = ['实心', '镂空', '实心树叶', '水', '花草'] as const;
const 魔数 = 0x3130434d;
const 头字节 = 16 + 32 + 5 * 13 * 4;

const 索引 = new Map<string, [number, number]>();
if (缓存模式 === 'read') {
  const x = new XMLHttpRequest();
  x.open('GET', `${址}/idx`, false);
  x.send();
  for (const [k, v] of Object.entries(JSON.parse(x.responseText) as Record<string, [number, number]>)) 索引.set(k, v);
}
export const 有缓存 = (k: string) => 索引.has(k);

const 写过 = new Set<string>();
const 序列化 = (mesh: SectionMesh, V: 缓存体素) => {
  const faces = 类名.reduce((a, c) => a + mesh[c].n, 0);
  const buf = new ArrayBuffer(头字节 + faces * 88);
  const u = new Uint32Array(buf, 0, 4);
  u[0] = 魔数;
  u[1] = faces;
  u[2] = V.nz;
  const d = new Float64Array(buf, 16, 4);
  d[0] = V.原点[0];
  d[1] = V.原点[1];
  d[2] = V.原点[2];
  d[3] = V.格;
  const m = new Uint32Array(buf, 48, 65);
  const bytes = new Uint8Array(buf);
  let at = 头字节;
  类名.forEach((c, i) => {
    const g = mesh[c];
    m[i * 13] = g.n;
    for (let s = 0; s < 12; s++) m[i * 13 + 1 + s] = g.段[s] ?? g.n;
    for (const arr of [g.pos, g.uv, g.tex, g.col]) {
      bytes.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), at);
      at += arr.byteLength;
    }
  });
  return buf;
};
const 解 = (buf: ArrayBuffer): { mesh: SectionMesh; V: 缓存体素 } => {
  const u = new Uint32Array(buf, 0, 4);
  if (u[0] !== 魔数) throw new Error('网格缓存：魔数不对');
  const d = new Float64Array(buf, 16, 4);
  const m = new Uint32Array(buf, 48, 65);
  let at = 头字节;
  const mesh = { 面数: u[1] } as SectionMesh;
  类名.forEach((c, i) => {
    const n = m[i * 13];
    const g: FaceGroup = { n, pos: new Int16Array(buf, at, n * 12), uv: new Int16Array(buf, at + n * 24, n * 8), tex: new Uint16Array(buf, at + n * 40, n * 16), col: new Uint8Array(buf, at + n * 72, n * 16), 段: Array.from(m.subarray(i * 13 + 1, i * 13 + 13)) };
    at += n * 88;
    mesh[c] = g;
  });
  return { mesh, V: { 原点: [d[0], d[1], d[2]], 格: d[3], nz: u[2] } };
};

export const 存网格 = async (k: string, mesh: SectionMesh | null, V: 缓存体素 | null) => {
  if (写过.has(k)) return;
  写过.add(k);
  const t = performance.now();
  const body = mesh && V ? 序列化(mesh, V) : new ArrayBuffer(0);
  const res = await fetch(`${址}/put?k=${encodeURIComponent(k)}`, { method: 'POST', body });
  if (!res.ok) throw new Error(`网格缓存：写 ${k} 回 ${res.status}`);
  桩.加('写缓存ms', performance.now() - t);
  桩.加('写缓存字节', body.byteLength);
};

// 挨着的并成一次 Range（缝不超过 64 KB，一次不超过 16 MB），同时最多 6 个请求（HTTP/1.1 对同一主机的上限）
export const 取网格 = async (keys: string[]) => {
  const out = new Map<string, { mesh: SectionMesh | null; V: 缓存体素 | null }>();
  const items: { k: string; off: number; len: number }[] = [];
  for (const k of keys) {
    const [off, len] = 索引.get(k)!;
    if (!len) out.set(k, { mesh: null, V: null });
    else items.push({ k, off, len });
  }
  items.sort((a, b) => a.off - b.off);
  const jobs: { start: number; end: number; parts: typeof items }[] = [];
  for (const it of items) {
    const j = jobs[jobs.length - 1];
    if (j && it.off - j.end <= 65536 && it.off + it.len - j.start <= 16 << 20) {
      j.end = it.off + it.len;
      j.parts.push(it);
    } else jobs.push({ start: it.off, end: it.off + it.len, parts: [it] });
  }
  const t0 = performance.now();
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        const res = await fetch(`${址}/bin`, { headers: { Range: `bytes=${j.start}-${j.end - 1}` } });
        if (res.status !== 206) throw new Error(`网格缓存：取 ${j.start}～${j.end} 回 ${res.status}`);
        const buf = await res.arrayBuffer();
        for (const p of j.parts) out.set(p.k, 解(buf.slice(p.off - j.start, p.off - j.start + p.len)));
        桩.加('取缓存字节', j.end - j.start);
        桩.加('取缓存请求n', 1);
      }
    }),
  );
  桩.加('取缓存ms', performance.now() - t0);
  桩.加('取缓存区段n', keys.length);
  return out;
};
