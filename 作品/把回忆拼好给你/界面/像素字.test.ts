// 本作品像素字：文案里的字都已取进字形表（改了文案忘了重取会在这里挂），几条颜文字和聊天行的宽照原版规则算出来对得上。数据根里没有这张表就跳过。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makePixelFont } from '@库/界面/像素字表.ts';
import { bytesPath, readWorkAssetLock } from '../../../pipeline/资产/资产锁.ts';

const workRoot = path.resolve(import.meta.dirname, '..');
const entry = readWorkAssetLock(workRoot)['字体/把回忆拼好给你/像素字'];
const hasTable = !!entry && fs.existsSync(bytesPath(entry));

describe.skipIf(!hasTable)('本作品像素字', () => {
  const fontTable = JSON.parse(fs.readFileSync(bytesPath(entry!), 'utf8')) as Record<string, unknown>;
  const pixelFont = makePixelFont(fontTable, '字体/把回忆拼好给你/像素字');

  it('像素字文案.txt 里的字都在表里', () => {
    const copyText = fs.readFileSync(path.join(workRoot, '界面', '像素字文案.txt'), 'utf8');
    const missing = new Set<string>();
    for (const line of copyText.split('\n')) if (line.trim() && !line.startsWith('#')) for (const ch of line) if (!pixelFont.hasGlyph(ch)) missing.add(ch);
    expect([...missing], '文案改了要重取：anim --作品 把回忆拼好给你 extract 把回忆拼好给你像素字').toEqual([]);
  });

  it('宽：组合附加符号单占步进（unihex 宽 4 → 3），空格 4，汉字和全角逗号 9，[ ] 4', () => {
    expect(pixelFont.textWidth('˃ʍ˂')).toBe(3 + 6 + 3);
    expect(pixelFont.textWidth('( •́ _ •̀)')).toBe(4 + 4 + 3 + 3 + 4 + 6 + 4 + 3 + 3 + 4);
    expect(pixelFont.textWidth('(✿◠‿◠)')).toBe(4 + 8 + 4 + 4 + 4 + 4);
    expect(pixelFont.textWidth('您的手艺，一如既往呢')).toBe(90);
    expect(pixelFont.textWidth([{ text: 'Steve达成了目标' }, { text: '[欢迎回家，主人]', color: '#55FF55' }])).toBe(28 + 45 + 71);
  });

  it('折行：有空格断在最后一个空格，没有就按字断', () => {
    expect(pixelFont.wrapText('六月樱 June Sakura 1.20.1', 70)).toEqual(['六月樱 June', 'Sakura 1.20.1']);
    expect(pixelFont.wrapText('您的手艺，一如既往呢', 40)).toEqual(['您的手艺', '，一如既', '往呢']);
  });
});
