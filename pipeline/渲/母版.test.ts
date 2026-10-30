import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 指纹级别, 最近同级别 } from './母版.ts';

const 记 = (指纹: string, 级别?: string) => ({ 指纹, 项: { 渲染设置: 级别 === undefined ? {} : { inputProps: { 级别 } } } });

describe('最近同级别（film --允许过期）', () => {
  it('只取同级别、文件还在的最近一份；读不出级别的不用；报出别的级别有哪些', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-母版-'));
    try {
      const 文件 = (h: string) => path.join(d, `${h}.mkv`);
      for (const h of ['a', 'b', 'c', 'e']) fs.writeFileSync(文件(h), '');
      // 新的在前：a 预览、b 不明、c 视频、d 视频（文件没了）、e 视频
      const 历史 = [记('a', '预览'), 记('b'), 记('d', '视频'), 记('c', '视频'), 记('e', '视频')];
      expect(指纹级别(历史[1]!)).toBeNull();
      expect(最近同级别(历史, '视频', 文件)).toEqual({ 旧: 历史[3], 别的级别: ['预览', '级别不明'] });
      expect(最近同级别(历史, '预览', 文件).旧).toBe(历史[0]);
      expect(最近同级别([记('a', '预览')], '视频', 文件)).toEqual({ 旧: undefined, 别的级别: ['预览'] });
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });
});
