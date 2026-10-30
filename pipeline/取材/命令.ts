// anim mcai <动作…>：转给 sourcing/mcai/mcai.py（开游戏、编译前过资源闸）。
// anim extract [<名称或组>…|--全部] [--只打印|--检查 [--校验]|--列出] [--登记] [--新 <id>…]：按 sourcing/extract.toml 从游戏和模组 jar 导出资产，产物和资产锁比对、入库；
//   --登记 另把锁里没有的产物登记进资产表、写锁（取材/登记.ts）。--新 把锁里还没有的 id 加进产物清单，给按锁反推要导什么的配方（音效）导新件。anim extract --许可 [--写]：资产表里待定的许可按 jar 继承补上（取材/许可.ts）。
//   anim extract --补网格配方 [--写]：锁里没有配方的场景网格按网格头反填配方，标不重导（取材/网格配方.ts）。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 前台跑 } from '../环境/子进程.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { 相对代码根 } from '../环境/路径.ts';
import { 读两侧资产表 } from '../资产/资产表.ts';
import { 作品资产锁路径, 读作品资产锁, 读资产锁 } from '../资产/资产锁.ts';
import { 登记产物, 算补许可, 写补许可 } from './登记.ts';
import { 过放行闸 } from '../闸/闸.ts';
import { mcai命令, mcai环境, 渲染中, 要过闸 } from './mcai.ts';
import { 取材目录, 读清单, 选条目 } from './清单.ts';
import { 分组, 缺配方网格, 补网格配方文本 } from './网格配方.ts';
import { jar路径, 提取一条, 新id归属, 暂存目录, 检查, 跑步骤 } from './提取.ts';

const 睡 = (ms: number) => new Promise((r) => setTimeout(r, ms));

const 等渲染让出 = async () => {
  let 说过 = false;
  for (let pid = 渲染中(); pid !== null; pid = 渲染中()) {
    if (!说过) console.error(`== 资源闸：渲染在跑（pid ${pid}），等它完了再开游戏`);
    说过 = true;
    await 睡(10_000);
  }
};

export const 取材命令: Record<string, 命令> = {
  mcai: {
    用法: 'mcai <动作…>',
    说明: '取材 mod 的命令行（sourcing/mcai/mcai.py，anim mcai --help 看全部）；game start、build 先过资源闸，开游戏还要等渲染让出',
    跑: async (args, 记录) => {
      const argv = args.length ? [...args] : ['--help'];
      const 跑一下 = () => 前台跑([...mcai命令(), ...argv], { env: mcai环境() });
      if (!要过闸(argv)) return 跑一下();
      if (argv[0] === 'game') await 等渲染让出();
      const code = await 过放行闸(跑一下);
      记录.记('信息', `mcai ${argv.join(' ')} 退出码 ${code}`);
      return code;
    },
  },
  extract: {
    用法: 'extract [<名称或组>…] [--全部] [--只打印 | --检查 [--校验] | --列出] [--登记] [--新 <id>…] | extract --许可 [--写] | extract --补网格配方 [--写]',
    说明:
      '按 sourcing/extract.toml 从 jar 导出资产，产物 sha 和资产锁一样的放进库（PNG 像素一样也算一样），不一样的报出来；--全部 = 有步骤、不用开游戏、不待迁移的条目；--登记 把锁里没有的产物登记进资产表、写锁，许可按 jar 继承（脚本写了产物来源的按件记用到的 jar）；--新 <id> 把锁里还没有的 id 加进产物清单（按锁反推的配方如 音效 照它导新件），可写多次；--许可 列出资产表里能按 jar 补上的待定许可，--写 写回；--补网格配方 给锁里没有配方的场景网格按网格头反填配方（标不重导），--写 追加进 extract.toml',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 开关: ['--全部', '--只打印', '--检查', '--校验', '--列出', '--登记', '--许可', '--写', '--补网格配方'], 多值: ['--新'] });
      const 新ids = p.多值['--新'] ?? [];
      if (新ids.length && ['--补网格配方', '--许可', '--检查', '--列出', '--只打印'].some((k) => p.开关.has(k))) throw new 用法错误('--新 只配跑条目（可加 --登记）');
      const q = 读清单();
      if (p.开关.has('--补网格配方')) {
        if (p.位置.length || [...p.开关].some((k) => k !== '--补网格配方' && k !== '--写')) throw new 用法错误('--补网格配方 只配 --写');
        const 根 = 作品根();
        const { 网格, 读不到 } = 缺配方网格(q, [[读资产锁(), undefined], [读资产锁(作品资产锁路径(根)), 作品名()]], 读两侧资产表(根).条目);
        for (const id of 读不到) console.log(`读不到网格头（字节不在库里？先 anim assets pull）：${id}`);
        if (!网格.length) {
          console.log('锁里的场景网格都有配方');
          return 读不到.length ? 1 : 0;
        }
        const 文本 = 补网格配方文本(分组(网格, new Set(q.条目.keys())));
        if (!p.开关.has('--写')) {
          console.log(文本);
          console.log(`${网格.length} 块网格没有配方；追加进 sourcing/extract.toml：anim extract --补网格配方 --写`);
          return 0;
        }
        const f = path.join(取材目录(), 'extract.toml');
        fs.appendFileSync(f, 文本, 'utf8');
        读清单();
        记录.产物.push(f);
        console.log(`给 ${网格.length} 块网格补了配方 → ${相对代码根(f)}`);
        return 读不到.length ? 1 : 0;
      }
      if (p.开关.has('--许可')) {
        if (p.位置.length || [...p.开关].some((k) => k !== '--许可' && k !== '--写')) throw new 用法错误('--许可 只配 --写');
        const r = 算补许可(q, 读两侧资产表(作品根()).条目.values(), (i) => jar路径(q, i));
        const 按许可 = new Map<string, number>();
        for (const x of r.能补) 按许可.set(x.许可, (按许可.get(x.许可) ?? 0) + 1);
        console.log(`能按 jar 补上的待定许可 ${r.能补.length} 件：`);
        for (const [l, n] of [...按许可].sort((a, b) => b[1] - a[1])) console.log(`  ${n} 件 → ${l}`);
        const 按缺 = new Map<string, string[]>();
        for (const x of r.仍待定) for (const k of x.缺) 按缺.set(k, [...(按缺.get(k) ?? []), x.e.id]);
        if (r.仍待定.length) console.log(`仍待定 ${r.仍待定.length} 件（jars.toml 里这些定了就能补）：`);
        for (const [k, ids] of [...按缺].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${ids.length} 件卡在 ${k}（如 ${ids[0]}）`);
        if (!p.开关.has('--写')) {
          if (r.能补.length) console.log('写回资产表：anim extract --许可 --写');
          return 0;
        }
        const 改 = 写补许可(r.能补, 作品根());
        记录.产物.push(...改);
        console.log(`改了 ${改.map(相对代码根).join('、') || '（没有）'}`);
        return 0;
      }
      if (p.开关.has('--列出')) {
        for (const e of q.条目.values()) {
          const 标 = e.待迁移 ? '（待迁移）' : e.不重导 ? '（不重导）' : e.要开游戏 ? '（要开游戏）' : !e.步骤.length ? '（没有自己的步骤）' : '';
          console.log(`${e.名称}${标}  需要 ${e.需要.join('、') || '无'}`);
        }
        for (const [g, ms] of Object.entries(q.组)) console.log(`组 ${g}：${ms.join('、')}`);
        return 0;
      }
      if (p.开关.has('--检查')) {
        const es = p.位置.length || p.开关.has('--全部') ? 选条目(q, p.位置, p.开关.has('--全部'), 作品名()) : [...q.条目.values()];
        const { 问题, 待迁移, 不重导, 别的作品 } = 检查(q, es, p.开关.has('--校验'));
        for (const x of 问题) console.log(x);
        if (待迁移.length) console.log(`\n待迁移、跑不了的 ${待迁移.length} 条：\n  ${待迁移.join('\n  ')}`);
        if (不重导.length) console.log(`\n不重导、只查了产物的 ${不重导.length} 条：${不重导.join('、')}`);
        if (别的作品.length) console.log(`\n属于别的作品、没查的 ${别的作品.length} 条：\n  ${别的作品.join('\n  ')}`);
        console.log(`查了 ${es.length} 条：${问题.length ? `有 ${问题.length} 处缺` : '都齐'}`);
        return 问题.length ? 1 : 0;
      }
      if (!p.位置.length && !p.开关.has('--全部')) throw new 用法错误('要给条目名、组名或 --全部（--列出 看有哪些）');
      const es = 选条目(q, p.位置, p.开关.has('--全部'), 作品名());
      if (p.开关.has('--只打印')) {
        for (const e of es) await 跑步骤(q, e, 暂存目录(e.名称), true).catch((err: Error) => console.log(`（${err.message}）`));
        return 0;
      }
      // 不重导的在进资源闸之前就拒：闸可能要排几分钟队
      const 不跑 = es.filter((e) => e.不重导);
      if (不跑.length) throw new Error(`${不跑.map((e) => `「${e.名称}」`).join('')}不重导（步骤只是记录）：--只打印 看步骤；真要重导，先删掉配方里的「不重导」`);
      // --新 的 id 分给产物表对得上的条目；哪条都对不上的也在进闸前拒
      const 新归 = new Map(es.map((e) => [e.名称, 新id归属(e, 新ids).对.map(([id]) => id)]));
      const 没归 = 新ids.filter((id) => ![...新归.values()].some((xs) => xs.includes(id)));
      if (没归.length) throw new 用法错误(`--新 的 ${没归.join('、')} 不是所选条目的产物（对不上产物表的哪一项）`);
      return 过放行闸(async () => {
        let 坏 = 0;
        const 登记 = p.开关.has('--登记');
        for (const e of es) {
          const { dir, 结果: r, 产物来源 } = await 提取一条(q, e, 新归.get(e.名称));
          const 行 = `${e.名称}：${r.一致.length + r.像素一致.length} 件和资产锁一样（新入库 ${r.入库.length}${r.像素一致.length ? `，其中 ${r.像素一致.length} 件 PNG 字节不同、像素一样，锁里留原来那份` : ''}）`;
          console.log(`${行}${r.不一致.length ? `，${r.不一致.length} 件不一样` : ''}${r.缺文件.length ? `，缺 ${r.缺文件.length} 件` : ''}`);
          if (登记 && r.新产物.length) {
            const g = 登记产物(q, e, dir, r.新产物, { 作品根: 作品根(), 已登记: 读两侧资产表(作品根()).条目, 锁: 读作品资产锁(作品根()), jar路径: (i) => jar路径(q, i), 产物来源 });
            console.log(`  登记 ${g.新登记.length} 件进 ${g.表文件.map(相对代码根).join('、') || '（都已登记过）'}，写锁 ${g.入锁.length} 件`);
            for (const x of g.仍待定) console.log(`  许可待定：${x.id}（${x.缺.join('；')}）`);
            记录.产物.push(...g.表文件, ...g.入锁.map((id) => `入库 ${id}`));
          } else if (r.新产物.length) console.log(`  锁里没有的产物 ${r.新产物.length} 件（加 --登记 登记、入库）`);
          for (const x of r.不一致) console.log(`  不一样：${x.id}（${x.文件}）锁 ${x.锁.slice(0, 12)}，这次 ${x.新.slice(0, 12)}`);
          for (const x of r.缺文件) console.log(`  缺：${x.id}（${x.文件}）`);
          for (const x of r.空模式) console.log(`  资产锁里一个也没有：${x}`);
          if (r.未登记.length) console.log(`  暂存目录里另有 ${r.未登记.length} 个没登记成产物的文件（不入库）：${r.未登记.slice(0, 5).join('、')}${r.未登记.length > 5 ? '…' : ''}`);
          console.log(`  暂存目录：${dir}`);
          记录.产物.push(...r.入库.map((id) => `入库 ${id}`));
          记录.记(r.不一致.length || r.缺文件.length ? '警告' : '信息', 行);
          if (r.不一致.length || r.缺文件.length || r.空模式.length) 坏++;
        }
        return 坏 ? 1 : 0;
      });
    },
  },
};
