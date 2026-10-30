// anim world <子命令>：世界声明（sourcing/worlds/<世界>.toml）→ 编辑层（<世界>.编辑.toml）→ 区段包。数据流和各字段见 docs/世界.md。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 代码根 } from '../环境/路径.ts';
import { 过放行闸 } from '../闸/闸.ts';
import { 烘焙世界, 载入编辑 } from './烘焙/流程.ts';
import { 生成重放, 重放脚本 } from './编辑/重放.ts';
import { 列出世界, 读声明, 编辑文件, 存档目录 as 声明存档目录, type 世界声明, type 预生成块 } from './声明.ts';
import { 冻结 } from './冻结.ts';
import { 打印命令, csv文本, 预生成计划们 } from './预生成/计划.ts';
import { 跑一块 } from './预生成/看守.ts';
import { 服务端 } from './服务端/服务端.ts';
import { 建沙盒 } from './服务端/沙盒.ts';
import { 取jar } from '../取材/取jar.ts';
import { 配置, 数据路径 } from '../环境/配置.ts';
import { 读地形表 } from './版本.ts';
import { 世界草稿目录, 查询子命令 } from './查询/命令.ts';

const 相对 = (f: string) => path.relative(代码根(), f).split(path.sep).join('/');

/** 世界声明的 Forge 写成「MC 版本-Forge 版本」，就是 libraries 里的目录名 */
const 加载器版本 = (w: 世界声明) => w.Forge;

/** --两角 x1,z1,x2,z2 → 临时的矩形块（只跑这一块） */
const 两角块 = (s: string): 预生成块 => {
  const v = s.split(',').map(Number);
  if (v.length !== 4 || !v.every(Number.isInteger)) throw new 用法错误('--两角 写 x1,z1,x2,z2 四个整数');
  return { 名: `临时-${v.join('_')}`, 形状: '矩形', 两角: v as [number, number, number, number], 依据: '命令行 --两角' };
};

/** anim world server 的命令：普通命令发出去；sleep:秒 只等；wait:话 一直等到日志出现；expect:话 30 秒内没出现就停服报错 */
const 跑服务端命令 = async (目录: string, 存档: string, 版本: string | undefined, 堆: string | undefined, 命令们: string[]) => {
  const s = await 服务端.起({ 目录, 存档, 加载器版本: 版本, 堆, 每行: (l) => console.log(l) });
  try {
    for (const c of 命令们) {
      if (c.startsWith('sleep:')) await new Promise((r) => setTimeout(r, Number(c.slice(6)) * 1000));
      else if (c.startsWith('wait:')) {
        if (!(await s.等(c.slice(5), Infinity))) throw s.出错 ?? new Error(`等到「${c.slice(5)}」之前服务端退出了`);
      } else if (c.startsWith('expect:')) {
        if (!(await s.等(c.slice(7), 30))) throw new Error(`上一条命令以后 30 秒内日志里没有「${c.slice(7)}」，停服（后面的命令不发）`);
      } else {
        console.log(`== > ${c}`);
        s.发(c);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  } finally {
    await s.停();
  }
  return 0;
};

type 子命令 = { 用法: string; 跑: (args: string[], 记录: Parameters<命令['跑']>[1]) => Promise<number | void> };

const 子命令们: Record<string, 子命令> = {
  list: {
    用法: 'list',
    跑: async () => {
      const 表 = 读地形表().包;
      for (const 名 of 列出世界()) {
        const w = 读声明(名);
        const 编 = fs.existsSync(编辑文件(名)) ? `，编辑 ${相对(编辑文件(名))}` : '';
        console.log(`${名}：${w.服务端}/${w.存档} ${w.维度}${编}`);
        for (const b of w.包) console.log(`  包 ${b.名}：${b.区域 ? `RX ${b.区域.RX.join('～')}、RZ ${b.区域.RZ.join('～')}` : '全部区域文件'}，原点 ${b.原点.join(', ')}，登记版本 ${表[b.名]?.版本 ?? '（没登记）'}`);
        for (const k of w.预生成.块) console.log(`  预生成 ${k.名}（${k.形状}）`);
      }
    },
  },
  bake: {
    用法: 'bake <世界> [--包 <名>] [--存档 <世界目录>] [--不套编辑] [--不登记] [--线程 <n>]',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 值: ['--包', '--存档', '--线程'], 开关: ['--不套编辑', '--不登记'] });
      if (p.位置.length !== 1) throw new 用法错误('要给一个世界名（anim world list 看有哪些）');
      const w = 读声明(p.位置[0]!);
      const 线程 = p.值['--线程'] ? Number(p.值['--线程']) : undefined;
      if (线程 !== undefined && !(Number.isInteger(线程) && 线程 > 0)) throw new 用法错误('--线程 要是正整数');
      const 编辑 = p.开关.has('--不套编辑') ? null : await 载入编辑(w); // 编辑文件写错了，排队前就报
      if (编辑) console.log(`编辑层 ${相对(编辑.文件)}：${编辑.步.length} 条命令`);
      const 结果 = await 过放行闸(() =>
        烘焙世界(w, { 包: p.值['--包'], 存档: p.值['--存档'], 不套编辑: p.开关.has('--不套编辑'), 不登记: p.开关.has('--不登记'), 线程, 日志: (s) => console.log(s) }),
      );
      for (const r of 结果) {
        记录.产物.push(r.目录);
        记录.记('信息', `${r.包} 版本 ${r.版本}${r.已登记 ? '' : '（没登记）'}`);
      }
    },
  },
  edit: {
    用法: 'edit check|replay <世界> [--到 <目录>]',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 值: ['--到'] });
      const [动作, 名] = p.位置;
      if ((动作 !== 'check' && 动作 !== 'replay') || !名 || p.位置.length !== 2) throw new 用法错误('写 edit check <世界> 或 edit replay <世界>');
      const w = 读声明(名);
      const e = await 载入编辑(w);
      if (!e) {
        console.log(`${名} 没有编辑文件（${相对(编辑文件(名))}）`);
        return 动作 === 'check' ? 0 : 1;
      }
      if (动作 === 'check') {
        console.log(`${相对(e.文件)}：${e.步.length} 条命令，都过了方块表校验；sha256 ${e.sha256.slice(0, 12)}`);
        for (const s of e.步) console.log(`  ${s.出处}：${s.原文}`);
        for (const [k, v] of Object.entries(e.结构缺状态)) console.log(`  注意：结构 ${k} 里 ${v.length} 种状态方块表没有（烘焙时进 缺失.tsv，画不出来）：${v.slice(0, 8).join('、')}${v.length > 8 ? '…' : ''}`);
        return 0;
      }
      const r = 生成重放(e, w.维度);
      const dir = p.值['--到'] ? path.resolve(p.值['--到']) : 世界草稿目录();
      fs.mkdirSync(dir, { recursive: true });
      const 前 = path.join(dir, `${名}.重放`);
      fs.writeFileSync(`${前}.mcfunction`, [...r.加载, ...r.命令, ...r.卸载].join('\n') + '\n');
      fs.writeFileSync(`${前}.sh`, 重放脚本(r, `anim world edit replay ${名} 生成：在游戏里重放 ${相对(e.文件)}（${e.步.length} 条命令，sha256 ${e.sha256.slice(0, 12)}）`), { mode: 0o755 });
      for (const x of r.警告) console.log(`注意：${x}`);
      console.log(`${r.命令.length} 条命令（另 ${r.加载.length} 条 forceload），只生成不执行：\n  ${前}.sh（anim mcai batch，游戏要开着）\n  ${前}.mcfunction（放进数据包 /function 跑也行）`);
      记录.产物.push(`${前}.sh`, `${前}.mcfunction`);
    },
  },
  pregen: {
    用法: 'pregen <世界> [--块 <名> | --两角 <x1,z1,x2,z2>] [--执行 [--沙盒] [--存档 <世界目录>] [--服务端 <服务端目录>] [--堆 12G] [--生成线程 <n>] [--卡住分钟 10] [--老年代上限 90] [--不补洞] [--重来]]',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 值: ['--块', '--两角', '--存档', '--服务端', '--堆', '--生成线程', '--卡住分钟', '--老年代上限'], 开关: ['--执行', '--沙盒', '--不补洞', '--重来'] });
      if (p.位置.length !== 1) throw new 用法错误('要给一个世界名');
      const w = 读声明(p.位置[0]!);
      if (p.值['--块'] && p.值['--两角']) throw new 用法错误('--块 和 --两角 只给一个');
      const 临时 = p.值['--两角'] ? [两角块(p.值['--两角'])] : [];
      const 计划 = 预生成计划们(w, p.值['--块'], 临时);
      if (!计划.length) {
        console.log(`${w.名称} 没写 [[预生成.块]]`);
        return 0;
      }
      if (!p.开关.has('--执行')) {
        console.log(`只打印、不执行（--执行 才开服跑，过资源闸；--沙盒 先把服务端和存档克隆到数据根 run/沙盒/ 再跑）：`);
        for (const k of 计划) {
          console.log(`\n# ${k.块.名}：${k.块.形状 === '走廊' ? `走廊 ${k.块.折线!.map((x) => x.join(',')).join(' → ')}，半宽 ${k.块.半宽}` : `中心 ${k.选区.中心.join(', ')}，半边 ${k.选区.半边.join(' × ')}`}，${k.区块数} 个区块${k.块.依据 ? `（${k.块.依据}）` : ''}`);
          if (k.图案 === 'csv') {
            const f = path.join(世界草稿目录(), `${k.csv名}.csv`);
            fs.writeFileSync(f, csv文本(k.区块!));
            console.log(`# 区块列表写到 ${f}，执行时拷进 <服务端>/config/chunky/${k.csv名}.csv`);
          }
          for (const c of 打印命令(k)) console.log(c);
        }
        if (w.预生成.区块数) console.log(`\n声明里记的存档区块数：${w.预生成.区块数}`);
        return 0;
      }
      const 数 = (k: string, 默认?: number) => {
        const v = p.值[k];
        if (v === undefined) return 默认;
        const n = Number(v);
        if (!(n > 0)) throw new 用法错误(`${k} 要是正数`);
        return n;
      };
      const 生成线程 = 数('--生成线程');
      if (生成线程 !== undefined && !Number.isInteger(生成线程)) throw new 用法错误('--生成线程 要是正整数');
      let 服务端目录 = p.值['--服务端'] ? path.resolve(p.值['--服务端']) : path.join(配置('游戏'), w.服务端);
      let 存档 = 声明存档目录(w, p.值['--存档']);
      let 日志目录 = 数据路径('run', '预生成', w.名称);
      const chunky = await 取jar('chunky', { 说: (s) => console.log(s) });
      if (p.开关.has('--沙盒')) {
        const b = 建沙盒(服务端目录, 存档, w.名称);
        console.log(`沙盒 ${b.根}：服务端、存档都是克隆，原来的不动`);
        [服务端目录, 存档, 日志目录] = [b.服务端, b.存档, path.join(b.根, '预生成')];
        记录.产物.push(b.根);
      }
      for (const k of 计划) {
        const st = await 跑一块(k, {
          世界: w.名称,
          维度: w.维度,
          服务端目录,
          存档,
          加载器版本: 加载器版本(w),
          chunky,
          日志目录,
          堆: p.值['--堆'],
          生成线程,
          卡住分钟: 数('--卡住分钟'),
          老年代上限: 数('--老年代上限'),
          不补洞: p.开关.has('--不补洞'),
          重来: p.开关.has('--重来'),
          说: (s) => console.log(s),
        });
        记录.记('信息', `${k.块.名}：${Object.entries(st.完成).map(([a, b]) => `${a} ${b!.区块} 区块 ${b!.用时}`).join('，')}，起服 ${st.起服.length} 次`);
      }
      记录.产物.push(日志目录);
    },
  },
  server: {
    用法: 'server <世界> [--存档 <世界目录>] [--服务端 <服务端目录>] [--沙盒] [--堆 <G>] -- <命令…>（sleep:<秒>、wait:<一句话>、expect:<一句话>）',
    跑: async (args) => {
      const 分 = args.indexOf('--');
      const p = 解析参数(分 < 0 ? args : args.slice(0, 分), { 值: ['--存档', '--服务端', '--堆'], 开关: ['--沙盒'] });
      const 命令们 = 分 < 0 ? [] : args.slice(分 + 1);
      if (p.位置.length !== 1) throw new 用法错误('要给一个世界名，命令写在 -- 后面');
      const w = 读声明(p.位置[0]!);
      let 目录 = p.值['--服务端'] ? path.resolve(p.值['--服务端']) : path.join(配置('游戏'), w.服务端);
      let 存档 = 声明存档目录(w, p.值['--存档']);
      if (p.开关.has('--沙盒')) ({ 服务端: 目录, 存档 } = 建沙盒(目录, 存档, w.名称));
      return 过放行闸(() => 跑服务端命令(目录, 存档, 加载器版本(w), p.值['--堆'], 命令们));
    },
  },
  freeze: {
    用法: 'freeze [<包…>] [--写]',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 开关: ['--写'] });
      let 要写 = 0;
      for (const r of await 冻结(p.位置, { 写: p.开关.has('--写') })) {
        const 文 = 相对(r.文件);
        if (r.一样) console.log(`${r.包}：版本 ${r.版本}，粗高度指纹 ${r.指纹}，和 ${文} 一样`);
        else {
          要写++;
          console.log(`${r.包}：版本 ${r.版本}，粗高度指纹 ${r.指纹}；${r.原 ? `冻结的是 ${r.原.版本}（${r.原.指纹}）` : '还没冻结'}${r.写了 ? `，已写 ${文}：用它编排的段都过期，航线、巡航高度跟着变，出静帧核对、重看配乐卡点` : '（加 --写 才写）'}`);
          if (r.写了) 记录.产物.push(r.文件);
        }
      }
      return 要写 && !p.开关.has('--写') ? 1 : 0;
    },
  },
  ...查询子命令,
};

export const 世界命令: Record<string, 命令> = {
  world: {
    用法: `world ${Object.values(子命令们)
      .map((c) => c.用法.split(' ')[0])
      .join('|')} …`,
    说明: '世界：list 列声明；bake 从存档烘区段包（套编辑层，过资源闸）；edit check|replay 校验编辑、生成游戏里重放的命令；block、heightmap、map、slice 查方块、出图；pregen 打印或执行预生成（起专用服务端跑 Chunky）；server 起服务端发命令；freeze 冻结粗高度。anim world help 看各子命令',
    跑: async (args, 记录) => {
      const [子, ...rest] = args;
      if (!子 || 子 === 'help' || 子 === '--help') {
        for (const c of Object.values(子命令们)) console.log(`  anim world ${c.用法}`);
        return 子 ? 0 : 1;
      }
      const c = 子命令们[子];
      if (!c) throw new 用法错误(`world 没有 ${子} 这个子命令（${Object.keys(子命令们).join('、')}）`);
      return c.跑(rest, 记录);
    },
  },
};
