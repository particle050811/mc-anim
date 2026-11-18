// 作品渲染时对导入地形的改动（作品/<名>/地点/地形改动.ts 汇总的挖框、整平）要落在世界声明的 [[烘焙.保真]] 盒里：
// 可见变换（docs/世界.md「可见变换」）只让这些盒碰到的区段原样，挖开别处会露出换过的石头、填实的腔。
// 登记的包版本做过可见变换的，它 包.json 记的 可见 要盖住声明（声明加了盒、换了填充，要回存档重烘）。
// 暮色地标的挖框按网格头（JSON 资产）算，所以 JSON 资产按资产锁换成数据根里真的字节打包执行；字节不在就跳过，不拿占位算。
import fs from 'node:fs';
import path from 'node:path';
import { readTerrainEdits } from '../世界/作品地形改动.ts';
import { dataRoot as configDataRoot } from '../环境/配置.ts';
import { parseDecl, type WorldDecl } from '../世界/声明.ts';
import { toRecord, recordCovers, type VisibleRecord } from '../世界/烘焙/可见.ts';
import type { CheckReport, CheckContext } from '../源码/上下文.ts';

const registryFile = (c: CheckContext) => c.workPath('地点/地形改动.ts');

const declarations = (c: CheckContext): WorldDecl[] => {
  const dir = c.absPath('sourcing/worlds');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.toml') && !f.endsWith('.编辑.toml')).map((f) => parseDecl(fs.readFileSync(path.join(dir, f), 'utf8'), f.slice(0, -5), `sourcing/worlds/${f}`));
};

const isInside = (x0: number, z0: number, x1: number, z1: number, b: readonly number[]) => x0 >= b[0]! && z0 >= b[1]! && x1 <= b[2]! && z1 <= b[3]!;

export const checkTerrainChanges = async (c: CheckContext, report: CheckReport) => {
  if (!c.exists(registryFile(c))) return;
  const dataRoot = c.dataRoot ?? configDataRoot();
  const changes = await readTerrainEdits(c.root, c.absPath(c.workDir), dataRoot);
  if (!changes) {
    report.skipped.push(`地形改动：数据根 ${dataRoot} 缺资产字节（anim assets pull），挖框、整平没核保真范围`);
    return;
  }
  const worlds = declarations(c);
  const versionTable = c.exists('assets/地形版本.json') ? (JSON.parse(c.读('assets/地形版本.json')) as { pack: Record<string, { version: string }> }).pack : {};
  let count = 0;
  for (const r of changes) {
    const w = worlds.find((x) => x.farView?.sectionPack === r.pack || x.pack.some((b) => b.name === r.pack));
    if (!w) { report.错(`地形改动「${r.name}」用的包 ${r.pack} 没有世界声明（sourcing/worlds/），核不了保真范围`, registryFile(c)); continue; }
    const keepBoxes = w.visible.faithful.map((x) => x.boxes);
    const boxes: [string, number, number, number, number][] = [
      ...r.digBoxes.map((b): [string, number, number, number, number] => [`挖框 ${JSON.stringify(b.from)}～${JSON.stringify(b.to)}`, Math.min(b.from[0]!, b.to[0]!), Math.min(b.from[2]!, b.to[2]!), Math.max(b.from[0]!, b.to[0]!), Math.max(b.from[2]!, b.to[2]!)]),
      ...r.flattenAreas.map((f): [string, number, number, number, number] => [`整平罩 x ${f.x0}、z ${f.z0}、${f.nx}×${f.nz}`, f.x0, f.z0, f.x0 + f.nx - 1, f.z0 + f.nz - 1]),
    ];
    const outOfBounds = boxes.filter(([, x0, z0, x1, z1]) => !keepBoxes.some((b) => isInside(x0, z0, x1, z1, b)));
    count += boxes.length;
    if (outOfBounds.length) report.错(`地形改动「${r.name}」有 ${outOfBounds.length} 处不在 sourcing/worlds/${w.displayName}.toml 的 [[烘焙.保真]] 盒里（可见变换会换掉那里埋着的格，挖开就露出来）：${outOfBounds.slice(0, 3).map((x) => x[0]).join('；')}。加盒以后要回存档重烘`, registryFile(c));
  }
  // 登记的包版本做过可见变换的，记的设置要盖住声明
  // 作品登记的是合并后的世界底包，保真承诺仍应核真实存档原料，而不是不做可见变换的成品。
  const packs = new Set(changes.map((r) => worlds.find((w) => w.farView?.sectionPack === r.pack)?.pack[0]?.name ?? r.pack));
  for (const packName of packs) {
    const w = worlds.find((x) => x.pack.some((b) => b.name === packName)), version = versionTable[packName]?.version;
    if (!w || !version) continue;
    const f = path.join(dataRoot, 'terrain', packName, version, '包.json');
    if (!fs.existsSync(f)) { report.skipped.push(`地形改动：${packName} 版本 ${version} 不在数据根，没核包记的可见变换`); continue; }
    const record = (JSON.parse(fs.readFileSync(f, 'utf8')) as { visible?: VisibleRecord }).visible;
    if (!record) { report.infoLines.push(`${packName}（${version}）没做可见变换`); continue; }
    if (!recordCovers(record, toRecord({ fillBlock: w.visible.fillBlock, faithful: w.visible.faithful.map((x) => x.boxes) }))) report.错(`${packName} 登记的版本 ${version} 做可见变换时的设置没盖住 sourcing/worlds/${w.displayName}.toml 现在的（填充 ${record.fill}、保真 ${record.faithful.length} 个盒）：声明改过，要回存档重烘或 anim world transcode`, 'assets/地形版本.json');
  }
  report.infoLines.push(`地形改动 ${count} 处都核了保真范围`);
};
