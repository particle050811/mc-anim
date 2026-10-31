// 实验工具（不接 anim）：两个地形包逐区段比渲染用的东西。走渲染那条路：importedSectionVoxels（挖框、整平、随位置变的群系色）→ buildSectionMesh，比网格的全部字节。
//   node pipeline/世界/实验/核对网格.ts <旧包> <新包> --出 <json> [--挖框 <json>] [--L0抽样 n] [--进程 3] [--只块 …] [--可差裙边] [--主世界 <远景包名>]
// 挖框 json：{ cutouts: LandmarkCutout[], flattens: FlattenArea(罩为 number[])[] }，和渲染时给 导入地形 的一样。
// --主世界 <远景包名>：再走一遍 主世界地形.ts 的真来源（buildOverworld：补水面、补水草、补草、空列按远景补），和渲染拿到的体素一样，只是不带交界修正（两边同样地不带）。
// --L0抽样 n：第 0 级每 n 个才比（粗级全比，粗级才有补丁，风险在那边）。
// 比的项：网格字节（实心、镂空、实心树叶、水、花草，各组的面、uv、贴图、颜色）；--可差裙边 时裙边四组不比（第 1 档用）。还记下面数、解开和建网格的用时。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { 载入体素库 } from '../体素库.ts';
import { 代码根 } from '../../环境/路径.ts';
import { 数据根 } from '../../环境/配置.ts';
import type { 包信息, SectionData } from '../../../engine/voxel/区段包.ts';
import type { ImportedTerrain } from '../../../engine/voxel/导入地形.ts';
import type { SectionId } from '../../../engine/voxel/区段.ts';
import type { VoxelGrid } from '../../../engine/voxel/生成.ts';
import type { FaceGroup, SectionMesh } from '../../../engine/voxel/网格.ts';

const 取值 = (名: string, 缺省?: string) => {
  const i = process.argv.indexOf(名);
  return i >= 0 ? process.argv[i + 1]! : 缺省;
};
const 旧目录 = process.argv[2]!, 新目录 = process.argv[3]!;
const 挖框文件 = 取值('--挖框');
const L0抽样 = Number(取值('--L0抽样', '1'));
const 主世界 = 取值('--主世界');
const 进程 = Number(取值('--进程', '3'));
const 只块 = 取值('--只块')?.split(',');
const 可差裙边 = process.argv.includes('--可差裙边');
const 出 = 取值('--出');
const 分片 = 取值('--分片');
const 文件们 = fs.readdirSync(新目录).filter((f) => f.endsWith('.块')).sort().filter((f) => !只块 || 只块.includes(f));

const 同 = (a: ArrayBufferView, b: ArrayBufferView) => a.byteLength === b.byteLength && Buffer.compare(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength)) === 0;
const 组名 = ['实心', '镂空', '实心树叶', '水', '花草'] as const;
const 裙边起 = 7;

// 一组面的前 7 组（非裙边）逐字节比；裙边四组看 可差裙边
const 比组 = (a: FaceGroup, b: FaceGroup): string | null => {
  if (可差裙边) {
    const na = a.段[裙边起]!, nb = b.段[裙边起]!;
    if (na !== nb) return `非裙边面数 ${na} ≠ ${nb}`;
    const sub = (g: FaceGroup, f: 'pos' | 'uv' | 'tex' | 'col', per: number, n: number) => g[f].subarray(0, n * per);
    if (!同(sub(a, 'pos', 12, na), sub(b, 'pos', 12, nb)) || !同(sub(a, 'uv', 8, na), sub(b, 'uv', 8, nb)) || !同(sub(a, 'tex', 16, na), sub(b, 'tex', 16, nb)) || !同(sub(a, 'col', 16, na), sub(b, 'col', 16, nb))) return '非裙边的面字节不同';
    return null;
  }
  if (a.n !== b.n) return `面数 ${a.n} ≠ ${b.n}`;
  if (a.段.join() !== b.段.join()) return `各组面数不同`;
  if (!同(a.pos, b.pos)) return '位置不同';
  if (!同(a.uv, b.uv)) return 'uv 不同';
  if (!同(a.tex, b.tex)) return '贴图不同';
  if (!同(a.col, b.col)) return '颜色不同';
  return null;
};
const 比网格 = (a: SectionMesh, b: SectionMesh): string | null => {
  for (const g of 组名) {
    const e = 比组(a[g], b[g]);
    if (e) return `${g}：${e}`;
  }
  return null;
};

if (分片) {
  const [me, n] = 分片.split('/').map(Number) as [number, number];
  const 库 = await 载入体素库();
  const P = 库.区段包;
  const 载 = (名: string) => import(pathToFileURL(path.join(代码根(), 'engine', 'voxel', 名)).href);
  const { buildSectionMesh } = (await 载('网格.ts')) as typeof import('../../../engine/voxel/网格.ts');
  const 导入 = (await 载('导入区段.ts')) as typeof import('../../../engine/voxel/导入区段.ts');
  const { variesByPos } = 库.群系色;
  const 信息 = JSON.parse(fs.readFileSync(path.join(旧目录, '包.json'), 'utf8')) as 包信息;
  const 表们 = P.buildPackTables(信息);
  const [ox, oy, oz] = 信息.原点;
  const 挖 = 挖框文件 ? (JSON.parse(fs.readFileSync(挖框文件, 'utf8')) as { cutouts: { from: number[]; to: number[]; 留?: string[] }[]; flattens: any[] }) : { cutouts: [], flattens: [] };
  const toSceneBox = (m: { from: number[]; to: number[] }) => [m.from[0]! - ox, oz - 1 - m.to[2]!, m.from[1]! - oy, m.to[0]! + 1 - ox, oz - m.from[2]!, m.to[1]! + 1 - oy];
  const ctx = {
    info: 信息,
    tables: 表们,
    variesByPos: 信息.群系.map(variesByPos),
    cutBoxes: 挖.cutouts.map((m) => ({ 盒: toSceneBox(m), 留: m.留 ? 导入.globRegex(m.留) : null })),
    flattenAreas: 挖.flattens.map((f) => ({ ...f, 罩: Uint8Array.from(f.罩) })),
  };
  // 主世界的真来源：buildOverworld 拿一个假的「导入地形」，区段 就返回手上这份数据换出来的体素
  let 当前: SectionData;
  let 主世界区段: ((id: SectionId) => VoxelGrid | null) | null = null;
  if (主世界) {
    register('./json钩子.ts', import.meta.url);
    const 真取 = globalThis.fetch;
    globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
      const s = String(u);
      if (/^https?:/.test(s)) return 真取(u as string, init);
      const f = path.join(数据根(), decodeURIComponent(s.replace(/^\//, '')));
      return fs.existsSync(f) ? new Response(fs.readFileSync(f)) : new Response(null, { status: 404 });
    }) as typeof fetch;
    const { buildOverworld } = (await 载('主世界地形.ts')) as typeof import('../../../engine/voxel/主世界地形.ts');
    const { loadDistantGrid } = (await 载('远景网格.ts')) as typeof import('../../../engine/voxel/远景网格.ts');
    const { packDir } = (await 载('区段包位置.ts')) as typeof import('../../../engine/voxel/区段包位置.ts');
    const grid = await loadDistantGrid(packDir(主世界), 主世界);
    const 假: ImportedTerrain = {
      键: '',
      来源: { 采样: () => {}, 区段: () => 导入.importedSectionVoxels(当前, ctx) },
      高度: [0, 0],
      位置: (g) => [g[0]! - ox, oz - g[2]!, g[1]! - oy],
      原点: 信息.原点,
      粗: P.decodeCoarseHeight(信息),
    };
    const 来源 = buildOverworld(假, grid, null).来源;
    主世界区段 = (id) => 来源.区段!(id);
  }
  const 累: Record<string, Record<string, number>> = {};
  const 差: string[] = [];
  let 序 = 0;
  for (let fi = 0; fi < 文件们.length; fi++) {
    if (fi % n !== me) continue;
    const 名 = 文件们[fi]!;
    const 旧 = fs.readFileSync(path.join(旧目录, 名)), 新 = fs.readFileSync(path.join(新目录, 名));
    const 头旧 = P.decodeTileHeader(new Uint8Array(旧.subarray(0, P.tileHeaderLen)));
    const 头新 = P.decodeTileHeader(new Uint8Array(新.subarray(0, P.tileHeaderLen)));
    const [ti, tj] = 名.split('.').map(Number) as [number, number];
    for (let slot = 0; slot < P.tileEntryCount; slot++) {
      const lo = 头旧[2 * slot + 1]!, ln = 头新[2 * slot + 1]!;
      if (!lo !== !ln) {
        差.push(`${名} 项 ${slot}：一边有一边没有`);
        continue;
      }
      if (!lo) continue;
      const id = P.sectionAtIndex(ti, tj, slot);
      if (id.L === 0 && ++序 % L0抽样) continue;
      const a = (累[id.L] ??= {});
      const 加 = (k: string, v: number) => (a[k] = (a[k] ?? 0) + v);
      const go = 旧.subarray(头旧[2 * slot]!, 头旧[2 * slot]! + lo), gn = 新.subarray(头新[2 * slot]!, 头新[2 * slot]! + ln);
      const 解 = (g: Uint8Array) => {
        const t0 = performance.now();
        const d = P.decodeSection(zlib.gunzipSync(g));
        const v = 导入.importedSectionVoxels(d, ctx);
        const t1 = performance.now();
        const m = buildSectionMesh(v, id.L >= 1);
        const t2 = performance.now();
        return { d, v, m, 解: t1 - t0, 建: t2 - t1 };
      };
      const A = 解(go), B = 解(gn);
      加('区段', 1);
      加('旧字节', lo);
      加('新字节', ln);
      加('旧面', A.m.面数);
      加('新面', B.m.面数);
      加('旧解ms', A.解);
      加('新解ms', B.解);
      加('旧建ms', A.建);
      加('新建ms', B.建);
      if (Buffer.compare(go, gn) === 0) 加('字节相同', 1);
      const e = 比网格(A.m, B.m);
      if (e) {
        加('网格不同', 1);
        if (差.length < 40) 差.push(`L${id.L} (${id.i},${id.j})：${e}`);
      }
      if (主世界区段) {
        const 真网格 = (d: SectionData) => {
          当前 = d;
          return buildSectionMesh(主世界区段!(id)!, id.L >= 1);
        };
        const e2 = 比网格(真网格(A.d), 真网格(B.d));
        加('主世界比过', 1);
        if (e2) {
          加('主世界网格不同', 1);
          if (差.length < 40) 差.push(`主世界 L${id.L} (${id.i},${id.j})：${e2}`);
        }
      }
    }
  }
  fs.writeFileSync(`${出}.${me}`, JSON.stringify({ 累, 差 }));
} else {
  const t0 = Date.now();
  const 参数 = [...(挖框文件 ? ['--挖框', 挖框文件] : []), '--L0抽样', String(L0抽样), ...(只块 ? ['--只块', 只块.join(',')] : []), ...(可差裙边 ? ['--可差裙边'] : []), ...(主世界 ? ['--主世界', 主世界] : []), '--出', 出!];
  await Promise.all(
    Array.from({ length: 进程 }, (_, me) =>
      new Promise<void>((ok, no) => {
        const p = spawn('nice', ['-n', '15', process.execPath, fileURLToPath(import.meta.url), 旧目录, 新目录, ...参数, '--分片', `${me}/${进程}`], { stdio: 'inherit' });
        p.on('exit', (c) => (c ? no(new Error(`分片 ${me} 退出码 ${c}`)) : ok()));
      }),
    ),
  );
  const 累: Record<string, Record<string, number>> = {};
  const 差: string[] = [];
  for (let me = 0; me < 进程; me++) {
    const r = JSON.parse(fs.readFileSync(`${出}.${me}`, 'utf8'));
    fs.rmSync(`${出}.${me}`);
    差.push(...r.差);
    for (const L of Object.keys(r.累)) for (const k of Object.keys(r.累[L])) ((累[L] ??= {})[k] = (累[L]![k] ?? 0) + r.累[L][k]);
  }
  fs.writeFileSync(出!, JSON.stringify({ 累, 差 }, null, 1));
  for (const L of Object.keys(累).sort()) {
    const a = 累[L]!;
    const f = (k: string) => a[k] ?? 0;
    console.log(`L${L}：${f('区段')} 区段，网格不同 ${f('网格不同')}，主世界比过 ${f('主世界比过')}、不同 ${f('主世界网格不同')}；字节 ${(f('旧字节') / 1e6).toFixed(2)} → ${(f('新字节') / 1e6).toFixed(2)} MB；面 ${f('旧面')} → ${f('新面')}；解 ${(f('旧解ms') / f('区段')).toFixed(2)} → ${(f('新解ms') / f('区段')).toFixed(2)} ms/区段；建网格 ${(f('旧建ms') / f('区段')).toFixed(2)} → ${(f('新建ms') / f('区段')).toFixed(2)} ms/区段`);
  }
  console.log(`差异 ${差.length} 条（最多记 40 条每分片）：`);
  for (const x of 差.slice(0, 20)) console.log('  ' + x);
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
}
