// 本仓库自己过 anim check（除了类型，类型由 npm run check 的 tsc 管）：作品/ 下每部作品都零违规、没有白名单
import { expect, it } from 'vitest';
import { codeRoot } from '../环境/路径.ts';
import { listWorks } from '../环境/作品.ts';
import { runChecks } from './检查.ts';

it.each([...listWorks(codeRoot(), {}).keys()])('作品 %s 零违规', async (work) => {
  const reports = await runChecks(codeRoot(), { 快: true, 作品: work });
  const violations = [...reports].flatMap(([ruleName, report]) => report.violations.map((q) => `${ruleName} ${q.文件 ?? ''}${q.行 ? `:${q.行}` : ''} ${q.文本}`));
  expect(violations).toEqual([]);
  // 一部作品一次 --快 检查：单跑十几秒，和整套测试一起跑、机器忙时会过默认的 30 秒
}, 120_000);
