// 作品渲染时对导入地形的改动（作品/<名>/地点/地形改动.ts 汇总的挖框、整平）要落在世界声明的 [[烘焙.保真]] 盒里：
// 可见变换（docs/世界.md「可见变换」）只让这些盒碰到的区段原样，挖开别处会露出换过的石头、填实的腔。
// 登记的包版本做过可见变换的，它 包.json 记的 可见 要盖住声明（声明加了盒、换了填充，要回存档重烘）。
// 暮色地标的挖框按网格头（JSON 资产）算，所以 JSON 资产按资产锁换成数据根里真的字节打包执行；字节不在就跳过，不拿占位算。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { esbuildAliasPlugin, nonCodeLoaders } from '../资产/esbuild插件.ts';
import { workAssetLockPath, bytesPath, readAssetLock } from '../资产/资产锁.ts';
import { dataRoot as configDataRoot } from '../环境/配置.ts';
import { parseDecl, type WorldDecl } from '../世界/声明.ts';
import { toRecord, recordCovers, type VisibleRecord } from '../世界/烘焙/可见.ts';
import type { CheckReport, CheckContext } from './上下文.ts';

type Box = { from: number[]; to: number[] };
type FlattenArea = { x0: number; z0: number; nx: number; nz: number };
type Change = { 名: string; 包: string; digBoxes: Box[]; flattenAreas: FlattenArea[] };

const registryFile = (c: CheckContext) => c.workPath('地点/地形改动.ts');

/** 打包执行登记文件：asset: 换成数据根里的 JSON；缺字节返回 null（错误照抛） */
const loadChanges = async (c: CheckContext, dataRoot: string): Promise<Change[] | null> => {
  const assetLock = { ...readAssetLock(path.join(c.根, 'assets', '资产锁')), ...readAssetLock(workAssetLockPath(c.absPath(c.workDir))) };
  let missingPath = '';
  const out = await build({
    entryPoints: [c.absPath(registryFile(c))],
    absWorkingDir: c.根,
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    loader: { ...nonCodeLoaders, '.json': 'json' },
    logLevel: 'silent',
    plugins: [
      esbuildAliasPlugin(c.根),
      {
        name: '真资产',
        setup(b) {
          b.onResolve({ filter: /^asset:/ }, (a) => ({ path: a.path.slice('asset:'.length), namespace: '真资产' }));
          b.onLoad({ filter: /.*/, namespace: '真资产' }, (a) => {
            const l = assetLock[a.path], f = l && bytesPath(l, dataRoot);
            if (!l) return { errors: [{ text: `资产锁里没有 asset:${a.path}` }] };
            // 贴图、音频同 宽松资产插件 给个字符串：挖框、整平用不到它们，真要解码会在执行时报错，不会悄悄算错
            if (l.后缀 !== '.json') return { contents: `export default ${JSON.stringify(`asset:${a.path}`)};`, loader: 'js' };
            if (!fs.existsSync(f!)) { missingPath ||= a.path; return { contents: 'export default null;', loader: 'js' }; }
            return { contents: fs.readFileSync(f!, 'utf8'), loader: 'json' };
          });
        },
      },
    ],
  });
  if (missingPath) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-地形改动-'));
  try {
    const f = path.join(dir, '登记.mjs');
    fs.writeFileSync(f, out.outputFiles[0]!.text, 'utf8');
    return ((await import(pathToFileURL(f).href)) as { terrainEdits: Change[] }).terrainEdits;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const declarations = (c: CheckContext): WorldDecl[] => {
  const dir = c.absPath('sourcing/worlds');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.toml') && !f.endsWith('.编辑.toml')).map((f) => parseDecl(fs.readFileSync(path.join(dir, f), 'utf8'), f.slice(0, -5), `sourcing/worlds/${f}`));
};

const isInside = (x0: number, z0: number, x1: number, z1: number, b: readonly number[]) => x0 >= b[0]! && z0 >= b[1]! && x1 <= b[2]! && z1 <= b[3]!;

export const checkTerrainChanges = async (c: CheckContext, report: CheckReport) => {
  if (!c.exists(registryFile(c))) return;
  const dataRoot = c.dataRoot ?? configDataRoot();
  const changes = await loadChanges(c, dataRoot);
  if (!changes) {
    report.跳过.push(`地形改动：数据根 ${dataRoot} 缺资产字节（anim assets pull），挖框、整平没核保真范围`);
    return;
  }
  const worlds = declarations(c);
  const versionTable = c.exists('assets/地形版本.json') ? (JSON.parse(c.读('assets/地形版本.json')) as { 包: Record<string, { 版本: string }> }).包 : {};
  let count = 0;
  for (const r of changes) {
    const w = worlds.find((x) => x.包.some((b) => b.名 === r.包));
    if (!w) { report.错(`地形改动「${r.名}」用的包 ${r.包} 没有世界声明（sourcing/worlds/），核不了保真范围`, registryFile(c)); continue; }
    const keepBoxes = w.visible.保真.map((x) => x.盒);
    const boxes: [string, number, number, number, number][] = [
      ...r.digBoxes.map((b): [string, number, number, number, number] => [`挖框 ${JSON.stringify(b.from)}～${JSON.stringify(b.to)}`, Math.min(b.from[0]!, b.to[0]!), Math.min(b.from[2]!, b.to[2]!), Math.max(b.from[0]!, b.to[0]!), Math.max(b.from[2]!, b.to[2]!)]),
      ...r.flattenAreas.map((f): [string, number, number, number, number] => [`整平罩 x ${f.x0}、z ${f.z0}、${f.nx}×${f.nz}`, f.x0, f.z0, f.x0 + f.nx - 1, f.z0 + f.nz - 1]),
    ];
    const outOfBounds = boxes.filter(([, x0, z0, x1, z1]) => !keepBoxes.some((b) => isInside(x0, z0, x1, z1, b)));
    count += boxes.length;
    if (outOfBounds.length) report.错(`地形改动「${r.名}」有 ${outOfBounds.length} 处不在 sourcing/worlds/${w.名称}.toml 的 [[烘焙.保真]] 盒里（可见变换会换掉那里埋着的格，挖开就露出来）：${outOfBounds.slice(0, 3).map((x) => x[0]).join('；')}。加盒以后要回存档重烘`, registryFile(c));
  }
  // 登记的包版本做过可见变换的，记的设置要盖住声明
  const packs = new Set(changes.map((r) => r.包));
  for (const packName of packs) {
    const w = worlds.find((x) => x.包.some((b) => b.名 === packName)), version = versionTable[packName]?.版本;
    if (!w || !version) continue;
    const f = path.join(dataRoot, 'terrain', packName, version, '包.json');
    if (!fs.existsSync(f)) { report.跳过.push(`地形改动：${packName} 版本 ${version} 不在数据根，没核包记的可见变换`); continue; }
    const record = (JSON.parse(fs.readFileSync(f, 'utf8')) as { 可见?: VisibleRecord }).可见;
    if (!record) { report.infoLines.push(`${packName}（${version}）没做可见变换`); continue; }
    if (!recordCovers(record, toRecord({ fillBlock: w.visible.fillBlock, 保真: w.visible.保真.map((x) => x.盒) }))) report.错(`${packName} 登记的版本 ${version} 做可见变换时的设置没盖住 sourcing/worlds/${w.名称}.toml 现在的（填充 ${record.填充}、保真 ${record.保真.length} 个盒）：声明改过，要回存档重烘或 anim world transcode`, 'assets/地形版本.json');
  }
  report.infoLines.push(`地形改动 ${count} 处都核了保真范围`);
};
