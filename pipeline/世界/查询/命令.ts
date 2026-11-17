// anim world block | heightmap | map | slice：查方块、出图。来源默认是存档（套编辑层），--raw 不套编辑，--pack <名> 读地形包（数据根 terrain/）。
// 范围里要从存档解的区域超过 2 个就过资源闸，并行读进列段缓存再画。出图默认写到 <数据根>/run/草稿/<UTC>-工作-世界/。
import fs from 'node:fs';
import path from 'node:path';
import { UsageError, parseArgs, type ParsedArgs } from '../../cli/参数.ts';
import type { Command } from '../../cli/命令.ts';
import { draftRoot } from '../../环境/配置.ts';
import { utcMonthDayTime } from '../../运行记录/记录.ts';
import { passGate } from '../../闸/闸.ts';
import { columnSegmentCacheDir, defaultThreads, loadEdits } from '../烘焙/流程.ts';
import { EditApplier } from '../编辑/套用.ts';
import { RegionSource } from '../区域源.ts';
import { worldSeed } from '../存档.ts';
import { saveFormat } from '../存档格式.ts';
import { regionDir, saveDir, readDecl, type WorldDecl } from '../声明.ts';
import { loadVoxelLib } from '../体素库.ts';
import { versionDir, readTerrainTable } from '../版本.ts';
import { drawTopView, drawCrossSection, drawHeight } from './出图.ts';
import { segmentAt, PackBlockSource, SaveBlockSource, normalizeRange, type BlockSource, type QueryRect } from './源.ts';
import { BlockPalette } from './颜色.ts';

const sourceOptions = { value: ['--pack', '--version', '--save-dir', '--to', '--pixels', '--y', '--table'], toggles: ['--raw', '--column'] } as const;
const sourceUsage = '[--raw | --pack <名> [--version <v>]] [--save-dir <世界目录>]';

const toInt = (s: string | undefined, fieldName: string) => {
  if (s === undefined || !/^-?\d+$/.test(s)) throw new UsageError(`${fieldName} 要是整数${s === undefined ? '' : `，写的是 ${s}`}`);
  return Number(s);
};

/** 草稿输出目录：<数据根>/run/草稿/<UTC 月日-时分>-工作-世界/（同一分钟的放一起，文件名带参数不重名） */
export const worldDraftDir = () => {
  const d = path.join(draftRoot(), `${utcMonthDayTime(Date.now())}-工作-世界`);
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const outputPath = (p: ParsedArgs, fileName: string) => {
  const f = p.value['--to'] ? path.resolve(p.value['--to']) : path.join(worldDraftDir(), fileName);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  return f;
};

/** 按选项建方块源；存档源另返回区域源（批量预读用） */
export const buildSource = async (w: WorldDecl, p: ParsedArgs): Promise<{ 源: BlockSource; save?: SaveBlockSource; region?: RegionSource; 标: string }> => {
  if (p.value['--pack']) {
    const packName = p.value['--pack'];
    const version = p.value['--version'] ?? readTerrainTable().pack[packName]?.version;
    if (!version) throw new UsageError(`assets/地形版本.json 没登记包 ${packName}，要写 --version`);
    const dir = versionDir(packName, version);
    if (!fs.existsSync(path.join(dir, '包.json'))) throw new Error(`没有 ${dir}：anim assets pull 拉地形包，或 anim world bake 烘`);
    return { 源: new PackBlockSource(dir, await loadVoxelLib(), `地形包 ${packName} 版本 ${version}`), 标: `包${packName}` };
  }
  const dir = regionDir(w, p.value['--save-dir']);
  const seed = worldSeed(saveDir(w, p.value['--save-dir']));
  const editSet = p.toggles.has('--raw') ? null : await loadEdits(w);
  const format = saveFormat(w.saveFormat);
  const editApplier = editSet ? new EditApplier(editSet, new RegionSource(dir, seed, columnSegmentCacheDir(), null, format)) : null;
  const regionSource = new RegionSource(dir, seed, columnSegmentCacheDir(), editApplier ? (r) => editApplier.applyEdits(r) : null, format);
  const saveSource = new SaveBlockSource(regionSource, `存档 ${dir}${editSet ? `，套编辑 ${editSet.step.length} 条命令` : p.toggles.has('--raw') ? '，不套编辑' : ''}`);
  return { 源: saveSource, save: saveSource, region: regionSource, 标: editSet ? '编辑后' : '原样' };
};

const regionsInRange = (r: QueryRect) => {
  const out: [number, number][] = [];
  for (let rz = r.z1 >> 9; rz <= r.z2 >> 9; rz++) for (let rx = r.x1 >> 9; rx <= r.x2 >> 9; rx++) out.push([rx, rz]);
  return out;
};

/** 范围要解的区域多就过资源闸并行预读进缓存，少就只解要的区块 */
const prepare = async <T>(s: Awaited<ReturnType<typeof buildSource>>, r: QueryRect, fn: () => Promise<T> | T): Promise<T> => {
  if (!s.save || !s.region) return fn();
  await s.region.computeKeys(regionsInRange(r), defaultThreads());
  const pending = s.save.uncachedRegions(r);
  if (pending.length <= 2) {
    s.save.load(r);
    return fn();
  }
  return passGate(async () => {
    await s.region!.preRead(pending, defaultThreads(), (x) => console.log(x));
    return fn();
  });
};

const worldArgs = (args: string[], argCount: number, usage: string) => {
  const p = parseArgs(args, sourceOptions);
  if (p.位置.length !== argCount) throw new UsageError(`用法：anim world ${usage}`);
  return { p, w: readDecl(p.位置[0]!) };
};

const pixelOption = (p: ParsedArgs) => (p.value['--pixels'] ? toInt(p.value['--pixels'], '--pixels') : undefined);

type SubCommand = { usage: string; 跑: (args: string[], runRecord: Parameters<Command['跑']>[1]) => Promise<number | void> };

export const QUERY_COMMANDS: Record<string, SubCommand> = {
  block: {
    usage: `block <世界> <x> <y> <z> [--column] ${sourceUsage}`,
    跑: async (args) => {
      const usage = QUERY_COMMANDS.block!.usage;
      const { p, w } = worldArgs(args, 4, usage);
      const [x, y, z] = [1, 2, 3].map((i) => toInt(p.位置[i], ['x', 'y', 'z'][i - 1]!));
      const s = await buildSource(w, p);
      return prepare(s, { x1: x!, z1: z!, x2: x!, z2: z! }, () => {
        console.log(`来源：${s.源.description}`);
        const c = s.源.列(x!, z!);
        if (!c) {
          console.log(`(${x}, ${z}) 这一列没数据（区块没生成或包里没有）`);
          return 1;
        }
        const b = segmentAt(c, y!);
        const t = s.源.topBlockAt(x!, z!);
        console.log(`(${x}, ${y}, ${z})：${b ? `${b.state ?? '没数据'}，群系 ${b.biome ?? '（不记）'}` : y! < c.yBottom ? `低于存的范围（${c.yBottom} 以下${s.save ? '' : '，包里没存、渲染当实心'}）` : 'minecraft:air（高于这一列）'}`);
        console.log(`这一列最高的方块：${t ? `y ${t.y} ${t.state}` : '没有（全是空气）'}`);
        if (p.toggles.has('--column')) for (const g of c.segment) console.log(`  y ${g.bottom}～${g.topY}：${g.state ?? '没数据'}${g.biome ? `  ${g.biome}` : ''}`);
        return 0;
      });
    },
  },
  heightmap: {
    usage: `heightmap <世界> <x1> <z1> <x2> <z2> [--to <png>] [--table <tsv>] [--pixels <n>] ${sourceUsage}`,
    跑: async (args, runRecord) => {
      const { p, w } = worldArgs(args, 5, QUERY_COMMANDS.heightmap!.usage);
      const r = normalizeRange(...([1, 2, 3, 4].map((i) => toInt(p.位置[i], '范围')) as [number, number, number, number]));
      const s = await buildSource(w, p);
      const g = await prepare(s, r, () => drawHeight(s.源, r, pixelOption(p)));
      const f = outputPath(p, `${w.displayName}-高度-${r.x1}_${r.z1}_${r.x2}_${r.z2}-${s.标}.png`);
      fs.writeFileSync(f, g.png);
      if (p.value['--table']) fs.writeFileSync(path.resolve(p.value['--table']), g.表.map((row) => row.map((h) => h ?? '').join('\t')).join('\n') + '\n');
      console.log(`来源：${s.源.description}\n${f}（${g.width}×${g.height}，${g.step > 1 ? `每 ${g.step} 格取一格` : `一格 ${g.pixel} 像素`}）；最高的非空气方块 y ${g.minY ?? '-'}～${g.maxY ?? '-'}，有数据 ${g.withData}/${g.total}`);
      runRecord.artifacts.push(f);
    },
  },
  map: {
    usage: `map <世界> <x1> <z1> <x2> <z2> [--to <png>] [--pixels <n>] ${sourceUsage}`,
    跑: async (args, runRecord) => {
      const { p, w } = worldArgs(args, 5, QUERY_COMMANDS.map!.usage);
      const r = normalizeRange(...([1, 2, 3, 4].map((i) => toInt(p.位置[i], '范围')) as [number, number, number, number]));
      const s = await buildSource(w, p);
      const palette = new BlockPalette(await loadVoxelLib());
      const g = await prepare(s, r, () => drawTopView(s.源, r, palette, pixelOption(p)));
      const f = outputPath(p, `${w.displayName}-俯视-${r.x1}_${r.z1}_${r.x2}_${r.z2}-${s.标}.png`);
      fs.writeFileSync(f, g.png);
      console.log(`来源：${s.源.description}\n${f}（${g.width}×${g.height}，${g.step > 1 ? `每 ${g.step} 格取一格` : `一格 ${g.pixel} 像素`}，北在上）；地表 y ${g.minY ?? '-'}～${g.maxY ?? '-'}，有数据 ${g.withData}/${g.total}`);
      runRecord.artifacts.push(f);
    },
  },
  slice: {
    usage: `slice <世界> x|z <位置> <起> <止> [--y <y1>..<y2>] [--to <png>] [--pixels <n>] ${sourceUsage}`,
    跑: async (args, runRecord) => {
      const { p, w } = worldArgs(args, 5, QUERY_COMMANDS.slice!.usage);
      const axis = p.位置[1];
      if (axis !== 'x' && axis !== 'z') throw new UsageError('轴写 x（切 x = 位置 的面，横轴是 z）或 z（横轴是 x）');
      const [planePos, a1, a2] = [2, 3, 4].map((i) => toInt(p.位置[i], '位置和起止')) as [number, number, number];
      let y1: number | undefined, y2: number | undefined;
      if (p.value['--y']) {
        const m = /^(-?\d+)\.\.(-?\d+)$/.exec(p.value['--y']);
        if (!m) throw new UsageError('--y 写成 <y1>..<y2>，比如 40..120');
        [y1, y2] = [Math.min(+m[1]!, +m[2]!), Math.max(+m[1]!, +m[2]!)];
      }
      const r: QueryRect = axis === 'x' ? normalizeRange(planePos, a1, planePos, a2) : normalizeRange(a1, planePos, a2, planePos);
      const s = await buildSource(w, p);
      const palette = new BlockPalette(await loadVoxelLib());
      const g = await prepare(s, r, () => drawCrossSection(s.源, axis, planePos, a1, a2, palette, { y1, y2, pixel: pixelOption(p) }));
      const f = outputPath(p, `${w.displayName}-切面-${axis}${planePos}-${Math.min(a1, a2)}_${Math.max(a1, a2)}-y${g.y1}_${g.y2}-${s.标}.png`);
      fs.writeFileSync(f, g.png);
      console.log(`来源：${s.源.description}\n${f}（${g.width}×${g.height}，一格 ${g.pixel} 像素，${axis === 'x' ? '从西往东看，右边是南' : '从南往北看，右边是东'}；y ${g.y1}～${g.y2}）`);
      runRecord.artifacts.push(f);
    },
  },
};
