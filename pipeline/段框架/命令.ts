// anim cues：给段框架做的段（段.ts 用 窗口段）生成 声音表.生成.ts、声音地址.生成.ts（生成.ts）；--检查 只核对不写。
// anim new work <名> / new seg <段键> --场 <场键>：照模板起一部新作品、一个新段（新作品.ts）。
// 找段不经 清单/清单.ts 的 全部段：那会先执行全部 段.ts，表过期时 放() 直接抛错，正是要靠这条命令修的。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 代码根, 相对代码根 } from '../环境/路径.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { 数据根 } from '../环境/配置.ts';
import { 读作品资产锁 } from '../资产/资产锁.ts';
import { 读台词表 } from '../合成/台词落点.ts';
import type { 清单条目 } from '../../engine/段/清单条目.ts';
import type { 段定义 } from '../../engine/段/段定义.ts';
import { 声音表文件, 新鲜执行, 收集执行, 核对一段, 生成一段, type 生成环境 } from './生成.ts';
import { 是框架段 } from '../../engine/段/窗口段.ts';
import { 取音频数, 已知音频数 } from './音频数.ts';
import { 新作品, 新段 } from './新作品.ts';

type 作品清单 = { 清单: readonly 清单条目[]; 段目录: (键: string) => string; 段名: (t: 清单条目) => string; 编号: (键: string) => string | null };

/** 一眼看得出的段框架的段：段.ts 直接引了 窗口段，或目录里已经有生成的声音表。看不出的（经场里的工厂间接用 窗口段）要执行一遍才知道 */
export const 是框架段目录 = (目录: string) => {
  const 段文件 = path.join(目录, '段.ts');
  return fs.existsSync(path.join(目录, 声音表文件)) || (fs.existsSync(段文件) && /@engine\/段\/窗口段(\.ts)?['"]/.test(fs.readFileSync(段文件, 'utf8')));
};

export const 段框架命令: Record<string, 命令> = {
  cues: {
    用法: 'cues [<段键、段名、编号或章…>] [--检查]',
    说明: '给段框架的段（段.ts 用 窗口段）照 cue 生成 声音表.生成.ts（时长、峰值，锁里没有的现量）和 声音地址.生成.ts（资产 id → 地址）；--检查 只核对不写，对不上退出码 1',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 开关: ['--检查'] });
      const 根 = 代码根();
      const 作根 = 作品根();
      const m = (await import(pathToFileURL(path.join(作根, '清单.ts')).href)) as 作品清单;
      const 锁 = 读作品资产锁(作根);
      const 台词表 = 读台词表(path.join(作根, '台词.toml'));
      const 片 = m.清单.filter((t) => t.章 !== '核对');
      const 目录于 = (键: string) => path.join(作根, ...m.段目录(键).split('/'));
      const 选中 = (t: 清单条目) => !p.位置.length || p.位置.some((x) => [t.键, m.段名(t), m.编号(t.键), String(t.章), `${作品名()}/${t.键}`].includes(x));
      // 看不出的在收集模式下执行一遍判断（表过期时 放() 也不抛），老段执行完不是框架段就跳过
      const 候选: 清单条目[] = [];
      for (const t of m.清单.filter(选中)) {
        const 目录 = 目录于(t.键);
        if (是框架段目录(目录)) 候选.push(t);
        else if (fs.existsSync(path.join(目录, '段.ts'))) {
          try {
            if (是框架段((await 收集执行(path.join(目录, '段.ts'), 根)).段)) 候选.push(t);
          } catch {
            // 执行出错的老段由 anim check 的 加载 规则报，这里不管
          }
        }
      }
      if (p.位置.length && !候选.length) throw new 用法错误(`选择器没对上段框架的段：${p.位置.join('、')}（只认段键、段名、编号、章；段.ts 的默认导出要是 窗口段 做的）`);
      let 问题数 = 0;
      for (const t of 候选) {
        const 段文件 = path.join(目录于(t.键), '段.ts');
        const i = 片.findIndex((x) => x.键 === t.键);
        const 上一段 = async (): Promise<段定义 | undefined> => (i > 0 ? ((await 新鲜执行(path.join(目录于(片[i - 1]!.键), '段.ts'), 根)).default as 段定义) : undefined);
        const 环境: 生成环境 = { 锁, 台词表, 取数: (id) => 取音频数(id, 锁[id], 数据根()), 上一段 };
        try {
          if (p.开关.has('--检查')) {
            const 段 = (await 新鲜执行(段文件, 根)).default as 段定义;
            const 问题 = await 核对一段(段, path.dirname(段文件), 根, { ...环境, 取数: (id) => 已知音频数(锁[id], 数据根()) });
            问题数 += 问题.length;
            console.log(`${问题.length ? '✗' : '✓'} ${t.键}${问题.map((x) => `\n    ${x}`).join('')}`);
          } else {
            const r = await 生成一段(段文件, 根, 环境);
            for (const f of r.改了) 记录.产物.push(相对代码根(path.join(path.dirname(段文件), f)));
            const 声 = r.段.声音?.length ?? 0;
            console.log(`${r.改了.length ? '✎' : '✓'} ${t.键}：${声} 条 cue，${Object.keys(r.表.资产).length} 个声音文件${r.改了.length ? `，写了 ${r.改了.join('、')}` : '，没变'}`);
          }
        } catch (e) {
          问题数++;
          console.log(`✗ ${t.键}：${(e as Error).message}`);
        }
      }
      if (!候选.length) console.log('没有段框架的段（段.ts 的默认导出是 窗口段 做的才算）');
      return 问题数 ? 1 : 0;
    },
  },
  new: {
    用法: 'new work <作品名> | new seg <段键> [--场 <场键>] [--起 <事件>] [--止 <事件>]',
    说明: 'work：照模板起一部作品（清单.ts、注册.tsx、index.ts，带一个能渲的 核对-起步 段）；seg：在所选作品里加一个窗口段（段.ts、画面.tsx、空的声音表和地址表，场时间线没有就建一条），排进清单末尾',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 值: ['--场', '--起', '--止'] });
      const [种, 名] = p.位置;
      if (p.位置.length !== 2 || (种 !== 'work' && 种 !== 'seg')) throw new 用法错误('要 anim new work <作品名> 或 anim new seg <段键> [--场 <场键>]');
      const 写了 = 种 === 'work' ? 新作品(代码根(), 名!) : 新段(作品根(), 名!, { 场: p.值['--场'], 起: p.值['--起'], 止: p.值['--止'] });
      for (const f of 写了) {
        记录.产物.push(相对代码根(f));
        console.log(`+ ${相对代码根(f)}`);
      }
      if (种 === 'work') console.log(`\n下一步：anim --作品 ${名} cues，再 anim --作品 ${名} still 核对-起步 0 --到预览 工作-${名}起步`);
      else console.log(`\n下一步：改 段.ts 的窗口和 cue、画面.tsx，跑 anim cues ${名}`);
    },
  },
};
