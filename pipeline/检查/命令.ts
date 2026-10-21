// sr check [<规则…>] [--快] [--深] [--详细]：合并前必须过。规则名见 规则表；不给就全跑。
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 代码根 } from '../环境/路径.ts';
import { utc时间 } from '../运行记录/记录.ts';
import { 规则名, type 规则类 } from './上下文.ts';
import { 规则表, 跑检查, 违规数 } from './检查.ts';

export const 检查命令: Record<string, 命令> = {
  check: {
    用法: `check [${规则名.join('|')}…] [--快] [--深] [--详细]`,
    说明: '查类型、结构、清单、加载、台词、资产、规矩、平台卫生；--快 不跑类型检查，--深 逐个核对资产字节，--详细 列出全部待迁移',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 开关: ['--快', '--深', '--详细'] });
      const 不认识 = p.位置.filter((x) => !(规则名 as readonly string[]).includes(x));
      if (不认识.length) throw new 用法错误(`没有这类规则：${不认识.join('、')}（有：${规则名.join('、')}）`);
      const t0 = performance.now();
      const 结果 = await 跑检查(代码根(), { 只: p.位置 as 规则类[], 快: p.开关.has('--快'), 深: p.开关.has('--深') });
      for (const [名, r] of 结果) {
        const 状 = r.违规.length ? `✗ ${r.违规.length} 处违规` : '✓';
        console.log(`${状} ${名}：${规则表[名].说明}`);
        for (const q of r.违规) console.log(`    ${q.文件 ? `${q.文件}${q.行 ? `:${q.行}` : ''}  ` : ''}${q.文本}`);
        for (const s of r.跳过) console.log(`    跳过：${s}`);
        for (const s of r.信息) console.log(`    ${s}`);
        if (r.待迁移.length) {
          console.log(`    待迁移 ${r.待迁移.length} 项${p.开关.has('--详细') ? '' : '（--详细 列出）'}`);
          if (p.开关.has('--详细')) for (const q of r.待迁移) console.log(`      ${q.文本}`);
        }
        // 上面已经打过，事件直接进运行记录，不再经 记录.记 打一遍
        for (const q of r.违规) 记录.事件.push({ 时间: utc时间(), 级别: '错误', 文本: `${名}：${q.文件 ? `${q.文件}${q.行 ? `:${q.行}` : ''} ` : ''}${q.文本}` });
      }
      const n = 违规数(结果);
      console.log(`\n${n ? `${n} 处违规` : '全部通过'}（${((performance.now() - t0) / 1000).toFixed(1)} 秒）`);
      return n ? 1 : 0;
    },
  },
};
