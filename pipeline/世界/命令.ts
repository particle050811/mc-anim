// anim world <子命令>：世界声明（sourcing/worlds/<世界>.toml）→ 编辑层（<世界>.编辑.toml）→ 区段包。数据流和各字段见 docs/世界.md。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 代码根 } from '../环境/路径.ts';
import { 过放行闸 } from '../闸/闸.ts';
import { 烘焙世界, 载入编辑 } from './烘焙/流程.ts';
import { 生成重放, 重放脚本 } from './编辑/重放.ts';
import { 列出世界, 读声明, 编辑文件 } from './声明.ts';
import { 预生成计划们 } from './预生成.ts';
import { 读地形表 } from './版本.ts';
import { 世界草稿目录, 查询子命令 } from './查询/命令.ts';

const 相对 = (f: string) => path.relative(代码根(), f).split(path.sep).join('/');

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
        for (const k of w.预生成.块) console.log(`  预生成 ${k.名}`);
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
      if (编辑) console.log(`编辑层 ${相对(编辑.文件)}：${编辑.步.length} 步`);
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
        console.log(`${相对(e.文件)}：${e.步.length} 步，都过了方块表校验；sha256 ${e.sha256.slice(0, 12)}`);
        for (const s of e.步) console.log(`  ${s.出处}：${s.原文}`);
        for (const [k, v] of Object.entries(e.结构缺状态)) console.log(`  注意：结构 ${k} 里 ${v.length} 种状态方块表没有（烘焙时进 缺失.tsv，画不出来）：${v.slice(0, 8).join('、')}${v.length > 8 ? '…' : ''}`);
        return 0;
      }
      const r = 生成重放(e, w.维度);
      const dir = p.值['--到'] ? path.resolve(p.值['--到']) : 世界草稿目录();
      fs.mkdirSync(dir, { recursive: true });
      const 前 = path.join(dir, `${名}.重放`);
      fs.writeFileSync(`${前}.mcfunction`, [...r.加载, ...r.命令, ...r.卸载].join('\n') + '\n');
      fs.writeFileSync(`${前}.sh`, 重放脚本(r, `anim world edit replay ${名} 生成：在游戏里重放 ${相对(e.文件)}（${e.步.length} 步，sha256 ${e.sha256.slice(0, 12)}）`), { mode: 0o755 });
      for (const x of r.警告) console.log(`注意：${x}`);
      console.log(`${r.命令.length} 条命令（另 ${r.加载.length} 条 forceload），只生成不执行：\n  ${前}.sh（anim mcai batch，游戏要开着）\n  ${前}.mcfunction（放进数据包 /function 跑也行）`);
      记录.产物.push(`${前}.sh`, `${前}.mcfunction`);
    },
  },
  pregen: {
    用法: 'pregen <世界> [--块 <名>]',
    跑: async (args) => {
      const p = 解析参数(args, { 值: ['--块'] });
      if (p.位置.length !== 1) throw new 用法错误('要给一个世界名');
      const w = 读声明(p.位置[0]!);
      const 计划 = 预生成计划们(w, p.值['--块']);
      if (!计划.length) {
        console.log(`${w.名称} 没写 [[预生成.块]]`);
        return 0;
      }
      console.log(`只打印、不执行（预生成要开取材服务端 ${w.服务端}，开之前过资源闸；进度看守还没搬，见 docs/待办.md）：`);
      for (const k of 计划) {
        console.log(`\n# ${k.块.名}：中心 ${k.中心.join(', ')}，半边 ${k.半边.join(' × ')}，约 ${k.区块数} 个区块${k.块.依据 ? `（${k.块.依据}）` : ''}`);
        for (const c of k.命令) console.log(c);
      }
      if (w.预生成.区块数) console.log(`\n声明里记的存档区块数：${w.预生成.区块数}`);
    },
  },
  ...查询子命令,
};

export const 世界命令: Record<string, 命令> = {
  world: {
    用法: `world ${Object.values(子命令们)
      .map((c) => c.用法.split(' ')[0])
      .join('|')} …`,
    说明: '世界：list 列声明；bake 从存档烘区段包（套编辑层，过资源闸）；edit check|replay 校验编辑、生成游戏里重放的命令；block、heightmap、map、slice 查方块、出图；pregen 打印预生成命令。anim world help 看各子命令',
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
