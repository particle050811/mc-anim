// 本作品像素字：文案里的字都已取进字形表（改了文案忘了重取会在这里挂），几条颜文字和聊天行的宽照原版规则算出来对得上。数据根里没有这张表就跳过。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 做像素字 } from '@库/界面/像素字表.ts';
import { 字节路径, 读作品资产锁 } from '../../../pipeline/资产/资产锁.ts';

const 作品根 = path.resolve(import.meta.dirname, '..');
const 条目 = 读作品资产锁(作品根)['字体/把回忆拼好给你/像素字'];
const 有表 = !!条目 && fs.existsSync(字节路径(条目));

describe.skipIf(!有表)('本作品像素字', () => {
  const 表 = JSON.parse(fs.readFileSync(字节路径(条目!), 'utf8')) as Record<string, unknown>;
  const 字 = 做像素字(表, '字体/把回忆拼好给你/像素字');

  it('像素字文案.txt 里的字都在表里', () => {
    const 文案 = fs.readFileSync(path.join(作品根, '界面', '像素字文案.txt'), 'utf8');
    const 缺 = new Set<string>();
    for (const 行 of 文案.split('\n')) if (行.trim() && !行.startsWith('#')) for (const ch of 行) if (!字.有字(ch)) 缺.add(ch);
    expect([...缺], '文案改了要重取：anim --作品 把回忆拼好给你 extract 把回忆拼好给你像素字').toEqual([]);
  });

  it('宽：组合附加符号单占步进（unihex 宽 4 → 3），空格 4，汉字和全角逗号 9，[ ] 4', () => {
    expect(字.字宽('˃ʍ˂')).toBe(3 + 6 + 3);
    expect(字.字宽('( •́ _ •̀)')).toBe(4 + 4 + 3 + 3 + 4 + 6 + 4 + 3 + 3 + 4);
    expect(字.字宽('(✿◠‿◠)')).toBe(4 + 8 + 4 + 4 + 4 + 4);
    expect(字.字宽('您的手艺，一如既往呢')).toBe(90);
    expect(字.字宽([{ text: 'Steve达成了目标' }, { text: '[欢迎回家，主人]', color: '#55FF55' }])).toBe(28 + 45 + 71);
  });

  it('折行：有空格断在最后一个空格，没有就按字断', () => {
    expect(字.折行('六月樱 June Sakura 1.20.1', 70)).toEqual(['六月樱 June', 'Sakura 1.20.1']);
    expect(字.折行('您的手艺，一如既往呢', 40)).toEqual(['您的手艺', '，一如既', '往呢']);
  });
});
