// anim stale [<选择器…>] [--级别 …] [--详细]：每段现在的指纹、有没有对得上的母版；过期的和最近一次渲过的指纹比，说明是哪项变了。
import fs from 'node:fs';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 全部段, 选段 } from '../清单/清单.ts';
import { 母版路径, 历史指纹 } from '../渲/母版.ts';
import { 渲染参数 } from '../渲/设置.ts';
import { 渲染标签 } from '../渲/渲.ts';
import { 预计耗时 } from '../运行记录/记录.ts';
import { 渲染级别取值, type 渲染级别 } from '../../engine/段/设置值.ts';
import { 算全部段指纹, 指纹差异, 稳定JSON } from './指纹.ts';

export const 指纹命令: Record<string, 命令> = {
  stale: {
    用法: 'stale [<选择器…>] [--级别 视频|预览] [--详细]',
    说明: '列出各段指纹和母版是否最新，过期的说明哪项输入变了、预计重渲多久',
    跑: async (args) => {
      const p = 解析参数(args, { 值: ['--级别'], 开关: ['--详细'] });
      const 级别 = (p.值['--级别'] ?? '视频') as 渲染级别;
      if (!渲染级别取值.includes(级别)) throw new 用法错误(`--级别 只能是 ${渲染级别取值.join('、')}`);
      const 段们 = p.位置.length ? await 选段(p.位置) : await 全部段();
      let 过期数 = 0;
      let 预计 = 0;
      let 没记录 = 0;
      const 指纹们 = await 算全部段指纹(段们.map((s) => ({ 段: s, 渲染设置: 渲染参数(级别) })));
      for (const [i, s] of 段们.entries()) {
        const fp = 指纹们[i]!;
        const 有 = fs.existsSync(母版路径(s.键, fp.指纹));
        console.log(`${有 ? '✓' : '✗'} ${(s.编号 ?? '').padEnd(5)} ${s.键}  ${fp.指纹.slice(0, 16)}${有 ? '' : '  过期'}`);
        if (p.开关.has('--详细')) console.log(JSON.stringify(fp.项, null, 2).replace(/^/gm, '    '));
        if (有) continue;
        过期数++;
        const 估 = 预计耗时(渲染标签(s.键, 级别));
        if (估 === null) 没记录++;
        else 预计 += 估;
        // 和同一级别最近渲过的那份比
        const 上次 = 历史指纹(s.键).find((h) => 稳定JSON(h.项.渲染设置.inputProps) === 稳定JSON(fp.项.渲染设置.inputProps));
        if (!上次) console.log('    没渲过');
        else for (const d of 指纹差异(上次, fp).slice(0, 20)) console.log(`    ${d}`);
      }
      console.log(`\n${段们.length} 段，过期 ${过期数} 段${过期数 > 没记录 ? `；按耗时表预计重渲约 ${Math.round(预计)} 秒` : ''}${没记录 ? `；${没记录} 段耗时表里没有记录` : ''}`);
    },
  },
};
