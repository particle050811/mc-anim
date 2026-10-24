// 告示牌上的字：牌上写的词都在 告示牌字文案.txt 里、文案里的字都已取进字形表（换了字忘了重取会在这里挂）。数据根里没有这张表就跳过。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 做像素字 } from '@库/界面/像素字表.ts';
import { 字节路径, 读作品资产锁 } from '../../../pipeline/资产/资产锁.ts';
import { 告示牌词们 } from '../场/2-门口/参数.ts';

const 作品根 = path.resolve(import.meta.dirname, '..');
const 文案 = fs.readFileSync(path.join(作品根, '地点', '告示牌字文案.txt'), 'utf8');
const 文案字 = new Set([...文案.split('\n').filter((行) => 行.trim() && !行.startsWith('#'))].flatMap((行) => [...行]));
const 条目 = 读作品资产锁(作品根)['字体/把回忆拼好给你/告示牌字'];
const 有表 = !!条目 && fs.existsSync(字节路径(条目));

describe('告示牌上的字', () => {
  it('牌上写的词都在 告示牌字文案.txt 里', () => {
    const 缺 = 告示牌词们.flat().flatMap((词) => [...词]).filter((ch) => !文案字.has(ch));
    expect(缺, '换了牌上的字要把新字加进 地点/告示牌字文案.txt').toEqual([]);
  });

  it.skipIf(!有表)('文案里的字都在字形表里', () => {
    const 字 = 做像素字(JSON.parse(fs.readFileSync(字节路径(条目!), 'utf8')), '字体/把回忆拼好给你/告示牌字');
    expect([...文案字].filter((ch) => !字.有字(ch)), '文案改了要重取：anim --作品 把回忆拼好给你 extract 告示牌像素字').toEqual([]);
  });
});
