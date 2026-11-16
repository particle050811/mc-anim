// anim [--work <名>] check [<规则…>] [--fast] [--deep] [--release] [--verbose]：合并前必须过。规则名见 规则表；不给就全跑。只查选中的那部作品（环境/作品.ts）。
// 提示不算违规、不改退出码，结尾单独数出来；--release 是发布前、推送前的严格档：发布锁对不上算违规、查 Release 上附件齐不齐（用户 11-16 定，docs/决策/0006）。
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { codeRoot } from '../环境/路径.ts';
import { workName, workRoot, WorkSelectError } from '../环境/作品.ts';
import { utcTime } from '../运行记录/记录.ts';
import { ruleNames, type RuleKind } from '../源码/上下文.ts';
import { ruleTable, runChecks, violationCount, noticeCount } from './检查.ts';

export const checkCommands: Record<string, Command> = {
  check: {
    usage: `check [${ruleNames.join('|')}…] [--fast] [--deep] [--release] [--verbose]`,
    note: '查类型、结构、分层和循环引用、清单、加载、台词、资产、规矩、平台卫生、共用函数副本、按秒写、新增中文标识符；--fast 不跑类型检查，--deep 逐个核对资产字节、tsc 不用增量缓存从头查，--release 发布前、推送前用（发布锁和当前代码对不上算违规，平时只提示；还用 gh 查 Release 上附件齐不齐），--verbose 列出全部待迁移',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { toggles: ['--fast', '--deep', '--release', '--verbose'] });
      const unknownRules = p.位置.filter((x) => !(ruleNames as readonly string[]).includes(x));
      if (unknownRules.length) throw new UsageError(`没有这类规则：${unknownRules.join('、')}（有：${ruleNames.join('、')}）`);
      const work = workName();
      if (path.relative(path.join(codeRoot(), '作品', work), workRoot()) !== '') {
        throw new WorkSelectError(`作品「${work}」不在 作品/${work}/（anim.local.toml [works] 指到了别处），anim check 暂时只查 作品/<名>/ 下的作品`);
      }
      console.log(`作品：${work}${p.toggles.has('--release') ? '（--release：发布前的严格档）' : ''}\n`);
      const t0 = performance.now();
      const reports = await runChecks(codeRoot(), { 只: p.位置 as RuleKind[], 快: p.toggles.has('--fast'), depthCheck: p.toggles.has('--deep'), release: p.toggles.has('--release'), work: work });
      for (const [ruleName, r] of reports) {
        const status = r.violations.length ? `✗ ${r.violations.length} 处违规` : '✓';
        console.log(`${status} ${ruleName}：${ruleTable[ruleName].note}`);
        for (const q of r.violations) console.log(`    ${q.file ? `${q.file}${q.行 ? `:${q.行}` : ''}  ` : ''}${q.text}`);
        for (const q of r.notices) console.log(`    提示：${q.file ? `${q.file}  ` : ''}${q.text}`);
        for (const s of r.skipped) console.log(`    跳过：${s}`);
        for (const s of r.infoLines) console.log(`    ${s}`);
        if (r.pendingMigration.length) {
          console.log(`    待迁移 ${r.pendingMigration.length} 项${p.toggles.has('--verbose') ? '' : '（--verbose 列出）'}`);
          if (p.toggles.has('--verbose')) for (const q of r.pendingMigration) console.log(`      ${q.text}`);
        }
        // 上面已经打过，事件直接进运行记录，不再经 记录.记 打一遍
        for (const q of r.violations) runRecord.events.push({ time: utcTime(), level: '错误', text: `${ruleName}：${q.file ? `${q.file}${q.行 ? `:${q.行}` : ''} ` : ''}${q.text}` });
      }
      const n = violationCount(reports);
      const noticeN = noticeCount(reports);
      console.log(`\n${n ? `${n} 处违规` : '全部通过'}（${((performance.now() - t0) / 1000).toFixed(1)} 秒）${noticeN ? `；另 ${noticeN} 条提示，不算违规，见上面「提示：」` : ''}`);
      return n ? 1 : 0;
    },
  },
};
