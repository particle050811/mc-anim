// 实验工具（不接 anim）：把作品里渲染时给导入地形的挖框、整平导出来，给 瘦身包.ts（--保留盒）和 核对网格.ts（--挖框）用。
//   node pipeline/世界/实验/导出挖框.ts <出目录>
// 写 <包>.<用处>.挖框.json（核对用）和 <包>.保留盒.json（同一个包各用处的并集，场景坐标水平框）。
// 基地小岛的 digBoxes 没导出（基地小岛.tsx 第 36 行），这里抄一份；要是接进正式烘焙，得把这些声明挪到 tsx 外面。
import fs from 'node:fs';
import { register } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { esbuild别名插件, 非代码loader } from '../../资产/esbuild插件.ts';
import { 资产json表 } from '../../资产/node资产.ts';
import { 代码根 } from '../../环境/路径.ts';
import { 数据路径 } from '../../环境/配置.ts';
import { 注册资产钩子 } from '../体素库.ts';
import 地形版本 from '../../../assets/地形版本.json' with { type: 'json' };

type 挖 = { from: number[]; to: number[]; 留?: string[] };
type 平 = { x0: number; z0: number; nx: number; nz: number; 罩: Uint8Array; 地面y: number; fillBlocks: string[] };

const 出 = process.argv[2]!;
fs.mkdirSync(出, { recursive: true });
注册资产钩子();
register('./json钩子.ts', import.meta.url);

const 入口 = `
export { allCutouts, allFlattens } from '${代码根()}/作品/应力转动/地点/暮色新世界/摆放.ts';
export { borderTownFlatten, shaftCutouts } from '${代码根()}/作品/应力转动/地点/边城地基.ts';
export { shaftCellCenter, shaftHalfWidth } from '${代码根()}/作品/应力转动/地点/边城/6-3-下坠/编排.ts';
export { twilightPackName } from '${代码根()}/作品/应力转动/地点/暮色新世界/地标表.ts';
`;
const 临时 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '导出挖框-')), '入口.mjs');
await build({
  stdin: { contents: 入口, resolveDir: 代码根(), loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 临时,
  packages: 'external',
  loader: 非代码loader,
  plugins: [
    esbuild别名插件(代码根()),
    {
      // JSON 资产交给 Node 的钩子，贴图这些只会在渲染时用到，给个空串
      name: '非JSON资产当空',
      setup(b) {
        b.onResolve({ filter: /^asset:/ }, (a) => (资产json表()[a.path.slice('asset:'.length)] ? { path: a.path, external: true } : { path: a.path, namespace: '空资产' }));
        b.onLoad({ filter: /.*/, namespace: '空资产' }, () => ({ contents: 'export default "";', loader: 'js' }));
        // 模块顶层有解 png 的（模型贴图），和挖框无关
        b.onResolve({ filter: /^fast-png$/ }, (a) => ({ path: a.path, namespace: '空png' }));
        b.onLoad({ filter: /.*/, namespace: '空png' }, () => ({ contents: 'export const decode = () => ({ width: 1, height: 1, channels: 4, depth: 8, data: new Uint8Array(4) });', loader: 'js' }));
      },
    },
  ],
  logLevel: 'error',
});
// 打包出来的文件在临时目录，npm 包从那里解析不到，所以 import 前把 node_modules 链过去
fs.symlinkSync(path.join(代码根(), 'node_modules'), path.join(path.dirname(临时), 'node_modules'));
const m = await import(pathToFileURL(临时).href);

const poolBlock = { x: 39675, z: -1332 };
const digTop = 319;
const 基地小岛: 挖[] = [
  { from: [39733, 68, -1139], to: [39746, digTop, -1123] },
  { from: [39732, 69, -1140], to: [39747, digTop, -1122] },
  { from: [39731, 69, -1126], to: [39731, digTop, -1125] },
  { from: [poolBlock.x, 64, poolBlock.z], to: [poolBlock.x + 1, digTop, poolBlock.z + 1] },
  { from: [poolBlock.x - 3, 65, poolBlock.z - 3], to: [poolBlock.x + 6, 66, poolBlock.z + 6], 留: ['grass_block', 'dirt', 'sand', 'stone', 'gravel'] },
];
const 边城挖: 挖[] = m.shaftCutouts(m.shaftCellCenter(), m.shaftHalfWidth - 0.5);
const 边城平: 平[] = m.borderTownFlatten();

const 用处: { 包: string; 名: string; cutouts: 挖[]; flattens: 平[] }[] = [
  { 包: m.twilightPackName, 名: '暮色新世界', cutouts: m.allCutouts, flattens: m.allFlattens },
  { 包: '主世界-116', 名: '基地小岛', cutouts: 基地小岛, flattens: [] },
  { 包: '主世界-116', 名: '边城', cutouts: 边城挖, flattens: 边城平 },
];
const 盒们 = new Map<string, number[][]>();
for (const u of 用处) {
  const 版本 = (地形版本.包 as Record<string, { 版本: string }>)[u.包]!.版本;
  const 信息 = JSON.parse(fs.readFileSync(数据路径('terrain', u.包, 版本, '包.json'), 'utf8')) as { 原点: [number, number, number] };
  const [ox, , oz] = 信息.原点;
  fs.writeFileSync(path.join(出, `${u.包}.${u.名}.挖框.json`), JSON.stringify({ cutouts: u.cutouts, flattens: u.flattens.map((f) => ({ ...f, 罩: [...f.罩] })) }));
  const 盒 = 盒们.get(u.包) ?? [];
  for (const c of u.cutouts) 盒.push([c.from[0]! - ox, oz - 1 - c.to[2]!, c.to[0]! + 1 - ox, oz - c.from[2]!]);
  for (const f of u.flattens) 盒.push([f.x0 - ox, oz - f.z0 - f.nz, f.x0 + f.nx - ox, oz - f.z0]);
  盒们.set(u.包, 盒);
  console.log(`${u.包} ${u.名}：挖框 ${u.cutouts.length} 个，整平 ${u.flattens.length} 个`);
}
for (const [包, 盒] of 盒们) fs.writeFileSync(path.join(出, `${包}.保留盒.json`), JSON.stringify(盒));
