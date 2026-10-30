// 本仓库自己过 anim check（除了类型，类型由 npm run check 的 tsc 管）：作品/ 下每部作品都零违规、没有白名单
import { expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 作品们 } from '../环境/作品.ts';
import { 跑检查 } from './检查.ts';

it.each([...作品们(代码根(), {}).keys()])('作品 %s 零违规', async (作品) => {
  const 结果 = await 跑检查(代码根(), { 快: true, 作品 });
  const 违规 = [...结果].flatMap(([名, 报]) => 报.违规.map((q) => `${名} ${q.文件 ?? ''}${q.行 ? `:${q.行}` : ''} ${q.文本}`));
  expect(违规).toEqual([]);
  // 一部作品一次 --快 检查：单跑十几秒，和整套测试一起跑、机器忙时会过默认的 30 秒
}, 120_000);
