// 本仓库自己过 sr check（除了类型，类型由 npm run check 的 tsc 管）：零违规、没有白名单
import { expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 跑检查 } from './检查.ts';

it('仓库本身零违规', async () => {
  const 结果 = await 跑检查(代码根(), { 快: true });
  const 违规 = [...结果].flatMap(([名, 报]) => 报.违规.map((q) => `${名} ${q.文件 ?? ''}${q.行 ? `:${q.行}` : ''} ${q.文本}`));
  expect(违规).toEqual([]);
});
