// anim gamedata 导出 [--到 <目录>] [--只 群系|方块] [--方块 <通配>]：游戏开着时，用取材 mod 的 biomes、blocks 两个动作导群系色表、方块表，导完接着核对。
// anim gamedata 核对 <目录>：拿目录里的 群系色.json、方块表.json 和资产锁里的手写表比，写 核对.md、核对.json。
// 导出表不入库、不替换手写表（迁移期不改画面）；新章节要用，按 docs/游戏导表.md 登记成新资产。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import type { 命令 } from '../../cli/命令.ts';
import { 用法错误, 解析参数 } from '../../cli/参数.ts';
import { 前台跑 } from '../../环境/子进程.ts';
import { 代码根 } from '../../环境/路径.ts';
import { 新建预览目录 } from '../../预览/预览.ts';
import { 读资产锁, 解析资产 } from '../../资产/资产锁.ts';
import { mcai命令, mcai环境 } from '../mcai.ts';
import { 报告文本, 核对方块, 核对群系, type 方块表, type 求色, type 群系表 } from './核对.ts';

export const 手写群系色 = '数据/场景/关键帧/群系色';
export const 手写方块表 = '数据/场景/关键帧/方块表';

const 读json = <T,>(file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

/** 现行规则 engine/voxel/群系色.ts 喂指定的群系表（它 import 的 asset: 换成这张表），打包到临时文件再 import */
export const 载入现行规则 = async (表: 群系表): Promise<求色> => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-群系色-'));
  try {
    const out = path.join(tmp, '群系色.mjs');
    await build({
      entryPoints: [path.join(代码根(), 'engine', 'voxel', '群系色.ts')],
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
              if (a.path !== `asset:${手写群系色}`) throw new Error(`群系色.ts 引了别的资产 ${a.path}，这里没准备`);
              return { path: a.path, namespace: '群系色表' };
            });
            b.onLoad({ filter: /.*/, namespace: '群系色表' }, () => ({ contents: `export default ${JSON.stringify(表)};`, loader: 'js' }));
          },
        },
      ],
    });
    const m = (await import(pathToFileURL(out).href)) as { grassColor: 求色['草']; foliageColor: 求色['叶']; waterColor: 求色['水'] };
    return { 草: m.grassColor, 叶: m.foliageColor, 水: m.waterColor };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

export const 核对目录 = async (dir: string) => {
  const 锁 = 读资产锁();
  const 群系文件 = path.join(dir, '群系色.json'), 方块文件 = path.join(dir, '方块表.json');
  const 有群系 = fs.existsSync(群系文件), 有方块 = fs.existsSync(方块文件);
  if (!有群系 && !有方块) throw new 用法错误(`${dir} 里没有 群系色.json 或 方块表.json`);
  let 群系: ReturnType<typeof 核对群系> | undefined, 方块: ReturnType<typeof 核对方块> | undefined;
  if (有群系) {
    const 手写 = 读json<群系表>(解析资产(手写群系色, 锁).文件);
    群系 = 核对群系(读json<群系表>(群系文件), 手写, await 载入现行规则(手写));
  }
  if (有方块) 方块 = 核对方块(读json<方块表>(方块文件), 读json<方块表>(解析资产(手写方块表, 锁).文件));
  fs.writeFileSync(path.join(dir, '核对.md'), 报告文本(群系, 方块));
  fs.writeFileSync(path.join(dir, '核对.json'), JSON.stringify({ 群系, 方块 }, null, 1) + '\n');
  return { 群系, 方块 };
};

const mcai = (argv: string[]) => 前台跑([...mcai命令(), ...argv], { env: mcai环境() });

export const 游戏导表命令: Record<string, 命令> = {
  gamedata: {
    用法: 'gamedata 导出 [--到 <目录>] [--只 群系|方块] [--方块 <通配,…>]  |  gamedata 核对 <目录>',
    说明: '游戏开着时导出群系色表、方块表（取材 mod 的 biomes、blocks），并和手写的 群系色.json、方块表.json 逐项核对；默认写到 run/草稿/<UTC>-工作-游戏导表/',
    跑: async (args, 记录) => {
      const [子, ...rest] = args;
      if (子 === '核对') {
        const p = 解析参数(rest, {});
        if (p.位置.length !== 1) throw new 用法错误('核对要给一个目录');
        await 核对目录(path.resolve(p.位置[0]!));
        console.log(`写了 ${path.join(path.resolve(p.位置[0]!), '核对.md')}`);
        return 0;
      }
      if (子 !== '导出') throw new 用法错误('子命令是 导出 或 核对');
      const p = 解析参数(rest, { 值: ['--到', '--只', '--方块'] });
      const 只 = p.值['--只'];
      if (只 && 只 !== '群系' && 只 !== '方块') throw new 用法错误('--只 是 群系 或 方块');
      const dir = p.值['--到'] ? path.resolve(p.值['--到']) : 新建预览目录('工作-游戏导表');
      fs.mkdirSync(dir, { recursive: true });
      if (只 !== '方块') {
        const code = await mcai(['biomes', `out=${path.join(dir, '群系色')}`]);
        if (code) return code;
      }
      if (只 !== '群系') {
        const code = await mcai(['blocks', `out=${path.join(dir, '方块表')}`, ...(p.值['--方块'] ? [`only=${p.值['--方块']}`] : [])]);
        if (code) return code;
      }
      await 核对目录(dir);
      记录.产物.push(dir);
      console.log(`导出、核对写在 ${dir}（核对.md）`);
      return 0;
    },
  },
};
