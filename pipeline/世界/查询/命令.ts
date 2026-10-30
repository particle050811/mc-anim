// anim world block | heightmap | map | slice：查方块、出图。来源默认是存档（套编辑层），--原样 不套编辑，--包 <名> 读地形包（数据根 terrain/）。
// 范围里要从存档解的区域超过 2 个就过资源闸，并行读进列段缓存再画。出图默认写到 <数据根>/run/草稿/<UTC>-工作-世界/。
import fs from 'node:fs';
import path from 'node:path';
import { 用法错误, 解析参数, type 已解析 } from '../../cli/参数.ts';
import type { 命令 } from '../../cli/命令.ts';
import { 草稿根 } from '../../环境/配置.ts';
import { utc月日时分 } from '../../运行记录/记录.ts';
import { 过放行闸 } from '../../闸/闸.ts';
import { 列段缓存目录, 默认线程, 载入编辑 } from '../烘焙/流程.ts';
import { 编辑套用器 } from '../编辑/套用.ts';
import { 区域源 } from '../区域源.ts';
import { 世界种子 } from '../存档.ts';
import { 区域目录, 存档目录, 读声明, type 世界声明 } from '../声明.ts';
import { 载入体素库 } from '../体素库.ts';
import { 版本目录, 读地形表 } from '../版本.ts';
import { 画俯视, 画切面, 画高度 } from './出图.ts';
import { 列中, 包方块源, 存档方块源, 规范范围, type 方块源, type 范围 } from './源.ts';
import { 方块配色 } from './颜色.ts';

const 来源选项 = { 值: ['--包', '--版本', '--存档', '--到', '--像素', '--y', '--表'], 开关: ['--原样', '--列'] } as const;
const 来源用法 = '[--原样 | --包 <名> [--版本 <v>]] [--存档 <世界目录>]';

const 整数 = (s: string | undefined, 何: string) => {
  if (s === undefined || !/^-?\d+$/.test(s)) throw new 用法错误(`${何} 要是整数${s === undefined ? '' : `，写的是 ${s}`}`);
  return Number(s);
};

/** 草稿输出目录：<数据根>/run/草稿/<UTC 月日-时分>-工作-世界/（同一分钟的放一起，文件名带参数不重名） */
export const 世界草稿目录 = () => {
  const d = path.join(草稿根(), `${utc月日时分(Date.now())}-工作-世界`);
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const 输出到 = (p: 已解析, 文件名: string) => {
  const f = p.值['--到'] ? path.resolve(p.值['--到']) : path.join(世界草稿目录(), 文件名);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  return f;
};

/** 按选项建方块源；存档源另返回区域源（批量预读用） */
export const 建源 = async (w: 世界声明, p: 已解析): Promise<{ 源: 方块源; 存档?: 存档方块源; 区域?: 区域源; 标: string }> => {
  if (p.值['--包']) {
    const 名 = p.值['--包'];
    const 版本 = p.值['--版本'] ?? 读地形表().包[名]?.版本;
    if (!版本) throw new 用法错误(`assets/地形版本.json 没登记包 ${名}，要写 --版本`);
    const dir = 版本目录(名, 版本);
    if (!fs.existsSync(path.join(dir, '包.json'))) throw new Error(`没有 ${dir}：anim assets pull 拉地形包，或 anim world bake 烘`);
    return { 源: new 包方块源(dir, await 载入体素库(), `地形包 ${名} 版本 ${版本}`), 标: `包${名}` };
  }
  const 目录 = 区域目录(w, p.值['--存档']);
  const 种子 = 世界种子(存档目录(w, p.值['--存档']));
  const 编辑 = p.开关.has('--原样') ? null : await 载入编辑(w);
  const 器 = 编辑 ? new 编辑套用器(编辑, new 区域源(目录, 种子, 列段缓存目录())) : null;
  const 区域 = new 区域源(目录, 种子, 列段缓存目录(), 器 ? (r) => 器.套(r) : null);
  const 存档 = new 存档方块源(区域, `存档 ${目录}${编辑 ? `，套编辑 ${编辑.步.length} 步` : p.开关.has('--原样') ? '，不套编辑' : ''}`);
  return { 源: 存档, 存档, 区域, 标: 编辑 ? '编辑后' : '原样' };
};

/** 范围要解的区域多就过资源闸并行预读进缓存，少就只解要的区块 */
const 备好 = async <T>(s: Awaited<ReturnType<typeof 建源>>, r: 范围, fn: () => Promise<T> | T): Promise<T> => {
  if (!s.存档 || !s.区域) return fn();
  const 待 = s.存档.没缓存的区域(r);
  if (待.length <= 2) {
    s.存档.载入(r);
    return fn();
  }
  return 过放行闸(async () => {
    await s.区域!.预读(待, 默认线程(), (x) => console.log(x));
    return fn();
  });
};

const 世界参数 = (args: string[], 个数: number, 用法: string) => {
  const p = 解析参数(args, 来源选项);
  if (p.位置.length !== 个数) throw new 用法错误(`用法：anim world ${用法}`);
  return { p, w: 读声明(p.位置[0]!) };
};

const 像素选项 = (p: 已解析) => (p.值['--像素'] ? 整数(p.值['--像素'], '--像素') : undefined);

type 子命令 = { 用法: string; 跑: (args: string[], 记录: Parameters<命令['跑']>[1]) => Promise<number | void> };

export const 查询子命令: Record<string, 子命令> = {
  block: {
    用法: `block <世界> <x> <y> <z> [--列] ${来源用法}`,
    跑: async (args) => {
      const 用法 = 查询子命令.block!.用法;
      const { p, w } = 世界参数(args, 4, 用法);
      const [x, y, z] = [1, 2, 3].map((i) => 整数(p.位置[i], ['x', 'y', 'z'][i - 1]!));
      const s = await 建源(w, p);
      return 备好(s, { x1: x!, z1: z!, x2: x!, z2: z! }, () => {
        console.log(`来源：${s.源.描述}`);
        const c = s.源.列(x!, z!);
        if (!c) {
          console.log(`(${x}, ${z}) 这一列没数据（区块没生成或包里没有）`);
          return 1;
        }
        const b = 列中(c, y!);
        const t = s.源.顶(x!, z!);
        console.log(`(${x}, ${y}, ${z})：${b ? `${b.状态 ?? '没数据'}，群系 ${b.群系 ?? '（不记）'}` : y! < c.y底 ? `低于存的范围（${c.y底} 以下${s.存档 ? '' : '，包里没存、渲染当实心'}）` : 'minecraft:air（高于这一列）'}`);
        console.log(`这一列最高的方块：${t ? `y ${t.y} ${t.状态}` : '没有（全是空气）'}`);
        if (p.开关.has('--列')) for (const g of c.段) console.log(`  y ${g.底}～${g.顶}：${g.状态 ?? '没数据'}${g.群系 ? `  ${g.群系}` : ''}`);
        return 0;
      });
    },
  },
  heightmap: {
    用法: `heightmap <世界> <x1> <z1> <x2> <z2> [--到 <png>] [--表 <tsv>] [--像素 <n>] ${来源用法}`,
    跑: async (args, 记录) => {
      const { p, w } = 世界参数(args, 5, 查询子命令.heightmap!.用法);
      const r = 规范范围(...([1, 2, 3, 4].map((i) => 整数(p.位置[i], '范围')) as [number, number, number, number]));
      const s = await 建源(w, p);
      const g = await 备好(s, r, () => 画高度(s.源, r, 像素选项(p)));
      const f = 输出到(p, `${w.名称}-高度-${r.x1}_${r.z1}_${r.x2}_${r.z2}-${s.标}.png`);
      fs.writeFileSync(f, g.png);
      if (p.值['--表']) fs.writeFileSync(path.resolve(p.值['--表']), g.表.map((行) => 行.map((h) => h ?? '').join('\t')).join('\n') + '\n');
      console.log(`来源：${s.源.描述}\n${f}（${g.宽}×${g.高}，${g.步 > 1 ? `每 ${g.步} 格取一格` : `一格 ${g.像素} 像素`}）；最高的非空气方块 y ${g.最低 ?? '-'}～${g.最高 ?? '-'}，有数据 ${g.有数据}/${g.总数}`);
      记录.产物.push(f);
    },
  },
  map: {
    用法: `map <世界> <x1> <z1> <x2> <z2> [--到 <png>] [--像素 <n>] ${来源用法}`,
    跑: async (args, 记录) => {
      const { p, w } = 世界参数(args, 5, 查询子命令.map!.用法);
      const r = 规范范围(...([1, 2, 3, 4].map((i) => 整数(p.位置[i], '范围')) as [number, number, number, number]));
      const s = await 建源(w, p);
      const 配色 = new 方块配色(await 载入体素库());
      const g = await 备好(s, r, () => 画俯视(s.源, r, 配色, 像素选项(p)));
      const f = 输出到(p, `${w.名称}-俯视-${r.x1}_${r.z1}_${r.x2}_${r.z2}-${s.标}.png`);
      fs.writeFileSync(f, g.png);
      console.log(`来源：${s.源.描述}\n${f}（${g.宽}×${g.高}，${g.步 > 1 ? `每 ${g.步} 格取一格` : `一格 ${g.像素} 像素`}，北在上）；地表 y ${g.最低 ?? '-'}～${g.最高 ?? '-'}，有数据 ${g.有数据}/${g.总数}`);
      记录.产物.push(f);
    },
  },
  slice: {
    用法: `slice <世界> x|z <位置> <起> <止> [--y <y1>..<y2>] [--到 <png>] [--像素 <n>] ${来源用法}`,
    跑: async (args, 记录) => {
      const { p, w } = 世界参数(args, 5, 查询子命令.slice!.用法);
      const 轴 = p.位置[1];
      if (轴 !== 'x' && 轴 !== 'z') throw new 用法错误('轴写 x（切 x = 位置 的面，横轴是 z）或 z（横轴是 x）');
      const [位置, a1, a2] = [2, 3, 4].map((i) => 整数(p.位置[i], '位置和起止')) as [number, number, number];
      let y1: number | undefined, y2: number | undefined;
      if (p.值['--y']) {
        const m = /^(-?\d+)\.\.(-?\d+)$/.exec(p.值['--y']);
        if (!m) throw new 用法错误('--y 写成 <y1>..<y2>，比如 40..120');
        [y1, y2] = [Math.min(+m[1]!, +m[2]!), Math.max(+m[1]!, +m[2]!)];
      }
      const r: 范围 = 轴 === 'x' ? 规范范围(位置, a1, 位置, a2) : 规范范围(a1, 位置, a2, 位置);
      const s = await 建源(w, p);
      const 配色 = new 方块配色(await 载入体素库());
      const g = await 备好(s, r, () => 画切面(s.源, 轴, 位置, a1, a2, 配色, { y1, y2, 像素: 像素选项(p) }));
      const f = 输出到(p, `${w.名称}-切面-${轴}${位置}-${Math.min(a1, a2)}_${Math.max(a1, a2)}-y${g.y1}_${g.y2}-${s.标}.png`);
      fs.writeFileSync(f, g.png);
      console.log(`来源：${s.源.描述}\n${f}（${g.宽}×${g.高}，一格 ${g.像素} 像素，${轴 === 'x' ? '从西往东看，右边是南' : '从南往北看，右边是东'}；y ${g.y1}～${g.y2}）`);
      记录.产物.push(f);
    },
  },
};
