// 告示牌上的字：牌上写的词都在 告示牌字文案.txt 里、文案里的字都已取进字形表（换了字忘了重取会在这里挂）。字形表由 vitest 按资产锁读（pipeline/资产/vitest插件.ts）。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { signWords } from '../场/2-门口/参数.ts';
import { signGlyphTable } from './告示牌字表.ts';

const workRoot = path.resolve(import.meta.dirname, '..');
const copyText = fs.readFileSync(path.join(workRoot, '地点', '告示牌字文案.txt'), 'utf8');
const copyChars = new Set([...copyText.split('\n').filter((line) => line.trim() && !line.startsWith('#'))].flatMap((line) => [...line]));

describe('告示牌上的字', () => {
  it('牌上写的词都在 告示牌字文案.txt 里', () => {
    const missing = signWords.flat().flatMap((word) => [...word]).filter((ch) => !copyChars.has(ch));
    expect(missing, '换了牌上的字要把新字加进 地点/告示牌字文案.txt').toEqual([]);
  });

  it('文案里的字都在字形表里', () => {
    expect([...copyChars].filter((ch) => !signGlyphTable.hasGlyph(ch)), '文案改了要重取：anim --work 把回忆拼好给你 extract 告示牌像素字').toEqual([]);
  });
});
