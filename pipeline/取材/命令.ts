// sr mcai <动作…>：转给 sourcing/mcai/mcai.py（开游戏、编译前过资源闸）。
// sr extract [<名称或组>…|--全部] [--只打印|--检查 [--校验]|--列出]：按 sourcing/extract.toml 从游戏和模组 jar 导出资产，产物和资产锁比对、入库。
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 前台跑 } from '../环境/子进程.ts';
import { 过放行闸 } from '../闸/闸.ts';
import { mcai命令, mcai环境, 渲染中, 要过闸 } from './mcai.ts';
import { 读清单, 选条目 } from './清单.ts';
import { 提取一条, 暂存目录, 检查, 跑步骤 } from './提取.ts';

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
    说明: '取材 mod 的命令行（sourcing/mcai/mcai.py，sr mcai --help 看全部）；game start、build 先过资源闸，开游戏还要等渲染让出',
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
    用法: 'extract [<名称或组>…] [--全部] [--只打印 | --检查 [--校验] | --列出]',
    说明: '按 sourcing/extract.toml 从 jar 导出资产，产物 sha 和资产锁一样的放进库，不一样的报出来；--全部 = 有步骤、不用开游戏、不待迁移的条目',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 开关: ['--全部', '--只打印', '--检查', '--校验', '--列出'] });
      const q = 读清单();
      if (p.开关.has('--列出')) {
        for (const e of q.条目.values()) {
          const 标 = e.待迁移 ? '（待迁移）' : e.要开游戏 ? '（要开游戏）' : !e.步骤.length ? '（没有自己的步骤）' : '';
          console.log(`${e.名称}${标}  需要 ${e.需要.join('、') || '无'}`);
        }
        for (const [g, ms] of Object.entries(q.组)) console.log(`组 ${g}：${ms.join('、')}`);
        return 0;
      }
      if (p.开关.has('--检查')) {
        const es = p.位置.length || p.开关.has('--全部') ? 选条目(q, p.位置, p.开关.has('--全部')) : [...q.条目.values()];
        const { 问题, 待迁移 } = 检查(q, es, p.开关.has('--校验'));
        for (const x of 问题) console.log(x);
        if (待迁移.length) console.log(`\n待迁移、跑不了的 ${待迁移.length} 条：\n  ${待迁移.join('\n  ')}`);
        console.log(`查了 ${es.length} 条：${问题.length ? `有 ${问题.length} 处缺` : '都齐'}`);
        return 问题.length ? 1 : 0;
      }
      if (!p.位置.length && !p.开关.has('--全部')) throw new 用法错误('要给条目名、组名或 --全部（--列出 看有哪些）');
      const es = 选条目(q, p.位置, p.开关.has('--全部'));
      if (p.开关.has('--只打印')) {
        for (const e of es) await 跑步骤(q, e, 暂存目录(e.名称), true).catch((err: Error) => console.log(`（${err.message}）`));
        return 0;
      }
      return 过放行闸(async () => {
        let 坏 = 0;
        for (const e of es) {
          const { dir, 结果: r } = await 提取一条(q, e);
          const 行 = `${e.名称}：${r.一致.length} 件和资产锁一样（新入库 ${r.入库.length}）`;
          console.log(`${行}${r.不一致.length ? `，${r.不一致.length} 件不一样` : ''}${r.缺文件.length ? `，缺 ${r.缺文件.length} 件` : ''}`);
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
