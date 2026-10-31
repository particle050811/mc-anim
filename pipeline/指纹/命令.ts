// anim stale [<选择器…>] [--级别 …] [--详细] [--严格]：每段现在的指纹分三态：✓ 渲过、母版在；◐ 渲过（有 .指纹.json 或段签）、母版不在，要用时重渲；
// ✗ 过期（这个指纹没渲过），和最近一次渲过的指纹比，说明是哪项变了。母版在、段签缺的另标「缺段签」（anim render --只派生 补）。
// 所有段一次建图算指纹（指纹.ts 的 算全部段指纹）。默认退出码总是 0；--严格 时有过期段（✗）退出码 1（给脚本、CI 用），◐ 不算过期。
import fs from 'node:fs';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 全部段, 选段 } from '../清单/清单.ts';
import { 压缩母版路径, 有母版, 历史指纹, 指纹文件 } from '../渲/母版.ts';
import { 读段签, 段签齐 } from '../段签/段签.ts';
import { 渲染参数 } from '../渲/设置.ts';
import { 渲染标签 } from '../渲/渲.ts';
import { 预计耗时 } from '../运行记录/记录.ts';
import { 渲染级别取值, type 渲染级别 } from '../../engine/段/设置值.ts';
import { 算全部段指纹, 指纹差异, 稳定JSON } from './指纹.ts';

export const 指纹命令: Record<string, 命令> = {
  stale: {
    用法: 'stale [<选择器…>] [--级别 视频|预览] [--详细] [--严格]',
    说明: '列出各段指纹和母版是否最新，过期的说明哪项输入变了、预计重渲多久；--严格 有过期段时退出码 1',
    跑: async (args) => {
      const p = 解析参数(args, { 值: ['--级别'], 开关: ['--详细', '--严格'] });
      const 级别 = (p.值['--级别'] ?? '视频') as 渲染级别;
      if (!渲染级别取值.includes(级别)) throw new 用法错误(`--级别 只能是 ${渲染级别取值.join('、')}`);
      const 段们 = p.位置.length ? await 选段(p.位置) : await 全部段();
      let 过期数 = 0;
      let 母版不在 = 0;
      let 预计 = 0;
      let 没记录 = 0;
      const 加预计 = (键: string) => {
        const 估 = 预计耗时(渲染标签(键, 级别));
        if (估 === null) 没记录++;
        else 预计 += 估;
        return 估;
      };
      const 指纹们 = await 算全部段指纹(段们.map((s) => ({ 段: s, 渲染设置: 渲染参数(级别) })));
      for (const [i, s] of 段们.entries()) {
        const fp = 指纹们[i]!;
        const 有 = 有母版(s.键, fp.指纹);
        const 签 = 读段签(s.键, fp.指纹);
        const 渲过 = 有 || !!签 || fs.existsSync(指纹文件(s.键, fp.指纹));
        const 头 = `${(s.编号 ?? '').padEnd(5)} ${s.键}  ${fp.指纹.slice(0, 16)}`;
        if (有) console.log(`✓ ${头}${段签齐(签) ? '' : '  缺段签'}${fs.existsSync(压缩母版路径(s.键, fp.指纹)) ? '' : '  未转存 CRF12'}`);
        else if (渲过) {
          母版不在++;
          const 估 = 加预计(s.键);
          console.log(`◐ ${头}  渲过，母版不在${估 === null ? '' : `（要用时重渲约 ${Math.round(估)} 秒）`}`);
        } else console.log(`✗ ${头}  过期`);
        if (p.开关.has('--详细')) console.log(JSON.stringify(fp.项, null, 2).replace(/^/gm, '    '));
        if (渲过) continue;
        过期数++;
        加预计(s.键);
        // 和同一级别最近渲过的那份比
        const 上次 = 历史指纹(s.键).find((h) => 稳定JSON(h.项.渲染设置.inputProps) === 稳定JSON(fp.项.渲染设置.inputProps));
        if (!上次) console.log('    没渲过');
        else for (const d of 指纹差异(上次, fp).slice(0, 20)) console.log(`    ${d}`);
      }
      const 要渲 = 过期数 + 母版不在;
      console.log(
        `\n${段们.length} 段，过期 ${过期数} 段${母版不在 ? `，渲过但母版不在 ${母版不在} 段` : ''}` +
          `${要渲 > 没记录 ? `；按耗时表预计重渲约 ${Math.round(预计)} 秒` : ''}${没记录 ? `；${没记录} 段耗时表里没有记录` : ''}`,
      );
      return p.开关.has('--严格') && 过期数 ? 1 : 0;
    },
  },
};
