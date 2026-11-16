// anim gamedata export [--to <目录>] [--only 群系|方块] [--blocks <通配>]：游戏开着时，用取材 mod 的 biomes、blocks 两个动作导群系色表、方块表，导完接着核对。
// anim gamedata verify <目录>：拿目录里的 群系色.json、方块表.json 和资产锁里的手写表比，写 核对.md、核对.json。
// 导出表不入库、不替换手写表（迁移期不改画面）；新章节要用，按 docs/游戏导表.md 登记成新资产。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import type { Command } from '../../cli/命令.ts';
import { UsageError, parseArgs } from '../../cli/参数.ts';
import { runForeground } from '../../环境/子进程.ts';
import { codeRoot } from '../../环境/路径.ts';
import { newPreviewDir } from '../../预览/预览.ts';
import { readAssetLock, resolveAsset } from '../../资产/资产锁.ts';
import { mcaiCommand, mcaiEnv } from '../mcai.ts';
import { reportText, checkBlocks, checkBiomes, type BlockTable, type ColorRule, type BiomeTable } from './核对.ts';

export const handWrittenBiomeColorAsset = '数据/场景/关键帧/群系色';
export const handWrittenBlockTableAsset = '数据/场景/关键帧/方块表';

const readJson = <T,>(file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

/** 现行规则 engine/voxel/群系色.ts 喂指定的群系表（它 import 的 asset: 换成这张表），打包到临时文件再 import */
export const loadCurrentColorRule = async (biomeTable: BiomeTable): Promise<ColorRule> => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-群系色-'));
  try {
    const out = path.join(tmp, '群系色.mjs');
    await build({
      entryPoints: [path.join(codeRoot(), 'engine', 'voxel', '群系色.ts')],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      outfile: out,
      logLevel: 'silent',
      plugins: [
        {
          name: '群系色表',
          setup(b) {
            b.onResolve({ filter: /^asset:/ }, (a) => {
              if (a.path !== `asset:${handWrittenBiomeColorAsset}`) throw new Error(`群系色.ts 引了别的资产 ${a.path}，这里没准备`);
              return { path: a.path, namespace: '群系色表' };
            });
            b.onLoad({ filter: /.*/, namespace: '群系色表' }, () => ({ contents: `export default ${JSON.stringify(biomeTable)};`, loader: 'js' }));
          },
        },
      ],
    });
    const m = (await import(pathToFileURL(out).href)) as { grassColor: ColorRule['grass']; foliageColor: ColorRule['foliage']; waterColor: ColorRule['水'] };
    return { grass: m.grassColor, foliage: m.foliageColor, 水: m.waterColor };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

export const checkDir = async (dir: string) => {
  const assetLock = readAssetLock();
  const biomeFile = path.join(dir, '群系色.json'), blockFile = path.join(dir, '方块表.json');
  const hasBiomes = fs.existsSync(biomeFile), hasBlockFile = fs.existsSync(blockFile);
  if (!hasBiomes && !hasBlockFile) throw new UsageError(`${dir} 里没有 群系色.json 或 方块表.json`);
  let biomeReport: ReturnType<typeof checkBiomes> | undefined, blockReport: ReturnType<typeof checkBlocks> | undefined;
  if (hasBiomes) {
    const handWritten = readJson<BiomeTable>(resolveAsset(handWrittenBiomeColorAsset, assetLock).file);
    biomeReport = checkBiomes(readJson<BiomeTable>(biomeFile), handWritten, await loadCurrentColorRule(handWritten));
  }
  if (hasBlockFile) blockReport = checkBlocks(readJson<BlockTable>(blockFile), readJson<BlockTable>(resolveAsset(handWrittenBlockTableAsset, assetLock).file));
  fs.writeFileSync(path.join(dir, '核对.md'), reportText(biomeReport, blockReport));
  fs.writeFileSync(path.join(dir, '核对.json'), JSON.stringify({ 群系: biomeReport, 方块: blockReport }, null, 1) + '\n');
  return { 群系: biomeReport, 方块: blockReport };
};

const mcai = (argv: string[]) => runForeground([...mcaiCommand(), ...argv], { env: mcaiEnv() });

export const gameExportCommands: Record<string, Command> = {
  gamedata: {
    usage: 'gamedata export [--to <目录>] [--only biome|方块] [--blocks <通配,…>]  |  gamedata verify <目录>',
    note: '游戏开着时导出群系色表、方块表（取材 mod 的 biomes、blocks），并和手写的 群系色.json、方块表.json 逐项核对；默认写到 run/草稿/<UTC>-工作-游戏导表/',
    跑: async (args, runRecord) => {
      const [subcommand, ...rest] = args;
      if (subcommand === 'verify') {
        const p = parseArgs(rest, {});
        if (p.位置.length !== 1) throw new UsageError('verify 要给一个目录');
        await checkDir(path.resolve(p.位置[0]!));
        console.log(`写了 ${path.join(path.resolve(p.位置[0]!), '核对.md')}`);
        return 0;
      }
      if (subcommand !== 'export') throw new UsageError('子命令是 export 或 verify');
      const p = parseArgs(rest, { value: ['--to', '--only', '--blocks'] });
      const onlyKind = p.value['--only'];
      if (onlyKind && onlyKind !== '群系' && onlyKind !== '方块') throw new UsageError('--only 是 群系 或 方块');
      const dir = p.value['--to'] ? path.resolve(p.value['--to']) : newPreviewDir('工作-游戏导表');
      fs.mkdirSync(dir, { recursive: true });
      if (onlyKind !== '方块') {
        const code = await mcai(['biomes', `out=${path.join(dir, '群系色')}`]);
        if (code) return code;
      }
      if (onlyKind !== '群系') {
        const code = await mcai(['blocks', `out=${path.join(dir, '方块表')}`, ...(p.value['--blocks'] ? [`only=${p.value['--blocks']}`] : [])]);
        if (code) return code;
      }
      await checkDir(dir);
      runRecord.artifacts.push(dir);
      console.log(`导出、核对写在 ${dir}（核对.md）`);
      return 0;
    },
  },
};
