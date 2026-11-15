// anim [--作品 <名>] check [<规则…>] [--快] [--深] [--详细]：合并前必须过。规则名见 规则表；不给就全跑。只查选中的那部作品（环境/作品.ts）。
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { codeRoot } from '../环境/路径.ts';
import { workName, workRoot, WorkSelectError } from '../环境/作品.ts';
import { utcTime } from '../运行记录/记录.ts';
import { ruleNames, type RuleKind } from './上下文.ts';
import { ruleTable, runChecks, violationCount } from './检查.ts';

export const checkCommands: Record<string, Command> = {
  check: {
    用法: `check [${ruleNames.join('|')}…] [--快] [--深] [--详细]`,
    说明: '查类型、结构、清单、加载、台词、资产、规矩、平台卫生、共用函数副本；--快 不跑类型检查，--深 逐个核对资产字节、tsc 不用增量缓存从头查，--详细 列出全部待迁移',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { toggles: ['--快', '--深', '--详细'] });
      const unknownRules = p.位置.filter((x) => !(ruleNames as readonly string[]).includes(x));
      if (unknownRules.length) throw new UsageError(`没有这类规则：${unknownRules.join('、')}（有：${ruleNames.join('、')}）`);
      const work = workName();
      if (path.relative(path.join(codeRoot(), '作品', work), workRoot()) !== '') {
        throw new WorkSelectError(`作品「${work}」不在 作品/${work}/（anim.local.toml [works] 指到了别处），anim check 暂时只查 作品/<名>/ 下的作品`);
      }
      console.log(`作品：${work}\n`);
      const t0 = performance.now();
      const reports = await runChecks(codeRoot(), { 只: p.位置 as RuleKind[], 快: p.toggles.has('--快'), depthCheck: p.toggles.has('--深'), 作品: work });
      for (const [ruleName, r] of reports) {
        const status = r.violations.length ? `✗ ${r.violations.length} 处违规` : '✓';
        console.log(`${status} ${ruleName}：${ruleTable[ruleName].说明}`);
        for (const q of r.violations) console.log(`    ${q.文件 ? `${q.文件}${q.行 ? `:${q.行}` : ''}  ` : ''}${q.文本}`);
        for (const s of r.跳过) console.log(`    跳过：${s}`);
        for (const s of r.infoLines) console.log(`    ${s}`);
        if (r.待迁移.length) {
          console.log(`    待迁移 ${r.待迁移.length} 项${p.toggles.has('--详细') ? '' : '（--详细 列出）'}`);
          if (p.toggles.has('--详细')) for (const q of r.待迁移) console.log(`      ${q.文本}`);
        }
        // 上面已经打过，事件直接进运行记录，不再经 记录.记 打一遍
        for (const q of r.violations) runRecord.事件.push({ 时间: utcTime(), 级别: '错误', 文本: `${ruleName}：${q.文件 ? `${q.文件}${q.行 ? `:${q.行}` : ''} ` : ''}${q.文本}` });
      }
      const n = violationCount(reports);
      console.log(`\n${n ? `${n} 处违规` : '全部通过'}（${((performance.now() - t0) / 1000).toFixed(1)} 秒）`);
      return n ? 1 : 0;
    },
  },
};
