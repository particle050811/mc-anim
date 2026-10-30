import { describe, expect, it } from 'vitest';
import type { 台词句 } from '../../engine/audio/台词句.ts';
import { 写句模块文本, 解析句模块 } from './句模块.ts';
import { 改台词字段, 文本哈希, 解析作品台词, 默认配音 } from './台词表.ts';
import { 句问题, 拼句, 手修可用, wav秒数 } from './配音.ts';
import type { 资产锁 } from '../资产/资产锁.ts';

const 表文本 = [
  '# 注释留着',
  '["配音"]',
  '"种子" = [7]',
  '',
  '["音色"."李樱"]',
  '"参考" = "音色/李樱/参考音频"',
  '"逐字稿" = "在拔刀剑迅冲斩面前"',
  '',
  '[["台词"]]',
  'id = "7-李樱-五万血"',
  '"角色" = "李樱"',
  '"文本" = "五万血？"',
  '"开口" = 0.03',
  '',
  '["台词"."口型手修"]',
  '"成品sha" = "bbbbbbbbbbbb"',
  '"字" = [',
  '  ["五", 0.1, 0.2],',
  ']',
  '',
  '[["台词"]]',
  'id = "7-李樱-溜了"',
  '"角色" = "李樱"',
  '"文本" = "溜了"',
  '',
].join('\n');

const sha = 'b'.repeat(64);
const 锁: 资产锁 = { '配音/7-李樱-五万血': { sha256: sha, 大小: 1, 库: '私有', 后缀: '.wav' } };

const 造wav = (采样率: number, 帧数: number, 声道 = 1, 前置块 = false) => {
  const 块对齐 = 声道 * 2;
  const 数据 = Buffer.alloc(帧数 * 块对齐);
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(声道, 10);
  fmt.writeUInt32LE(采样率, 12);
  fmt.writeUInt32LE(采样率 * 块对齐, 16);
  fmt.writeUInt16LE(块对齐, 20);
  fmt.writeUInt16LE(16, 22);
  // 奇数长的 LIST 块要补一个字节（RIFF 的对齐规则）
  const list = 前置块 ? Buffer.concat([Buffer.from('LIST', 'ascii'), Buffer.from([3, 0, 0, 0]), Buffer.from('abc\0', 'ascii')]) : Buffer.alloc(0);
  const 头 = Buffer.alloc(8);
  头.write('data', 0, 'ascii');
  头.writeUInt32LE(数据.length, 4);
  const 体 = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, list, 头, 数据]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(体.length, 4);
  return Buffer.concat([riff, 体]);
};

describe('台词表', () => {
  it('解析：[配音] 补默认，[音色]、口型手修照写的', () => {
    const t = 解析作品台词(表文本);
    expect(t.配音).toEqual({ ...默认配音, 种子: [7] });
    expect(t.音色.李樱!.参考).toBe('音色/李樱/参考音频');
    expect(t.台词[0]!.口型手修).toEqual({ 成品sha: 'bbbbbbbbbbbb', 字: [['五', 0.1, 0.2]] });
  });

  it('写回只动那一句的那几行：改已有的、在子表前插新的、删掉、整数写成 x.0，注释和别的句子不动', () => {
    const 新 = 改台词字段(表文本, '7-李樱-五万血', { 开口: 0, 配音: '配音/7-李樱-五万血', 口型: { 成品sha: 'bbbbbbbbbbbb' } });
    expect(新).toContain('"开口" = 0.0\n"配音" = "配音/7-李樱-五万血"\n"口型" = { "成品sha" = "bbbbbbbbbbbb" }\n\n["台词"."口型手修"]');
    expect(新.startsWith('# 注释留着\n')).toBe(true);
    const t = 解析作品台词(新);
    expect(t.台词[0]!.口型手修?.字).toEqual([['五', 0.1, 0.2]]);
    expect(t.台词[1]).toEqual({ id: '7-李樱-溜了', 角色: '李樱', 文本: '溜了' });
    const 删 = 改台词字段(新, '7-李樱-五万血', { 配音: undefined });
    expect(删).not.toContain('"配音" =');
    const 末句 = 改台词字段(表文本, '7-李樱-溜了', { 开口: 0.03 });
    expect(解析作品台词(末句).台词[1]!.开口).toBe(0.03);
    expect(() => 改台词字段(表文本, '7-李樱-没有', { 开口: 0 })).toThrow(/没有 id = "7-李樱-没有"/);
  });
});

describe('句模块', () => {
  const 句: 台词句 = {
    id: '7-李樱-五万血', 角色: '李樱', 念: '五万血？', 配音: '配音/7-李樱-五万血', 成品sha: sha.slice(0, 12),
    开口: 0.03, 有声长: 0.5, 时长: 0.68, 文件秒数: 0.681, 手修: true, 字: [['五', 0.1, 0.2]], 嘴: [[0, 'X'], [0.1, 'B'], [0.5, 'X']],
  };

  it('写出来读得回、同样的数据同样的字节；数据手改了校验码对不上', () => {
    const 文本 = 写句模块文本(句);
    expect(解析句模块(文本)).toEqual(句);
    expect(写句模块文本(解析句模块(文本))).toBe(文本);
    expect(文本).toMatch(/^\/\/ 由 anim voice 生成（校验 [0-9a-f]{12}）/);
    const 改 = 文本.replace('"有声长": 0.5,', '"有声长": 0.6,');
    expect(写句模块文本(解析句模块(改))).not.toBe(改);
    expect(() => 解析句模块('export default {};')).toThrow(/不是 anim voice 写的句模块/);
  });

  it('句问题：表、锁、句模块对不上的都列出来', () => {
    const 行 = 解析作品台词(表文本).台词[0]!;
    expect(句问题({ ...行, 配音: undefined }, 锁, null)).toEqual([]);
    expect(句问题({ ...行, 配音: '配音/没有' }, 锁, null)).toEqual(['配音「配音/没有」不在资产锁里']);
    const 齐 = { ...行, 配音: '配音/7-李樱-五万血', 文本哈希: 文本哈希('五万血？'), 成品sha: sha.slice(0, 12), 口型: { 成品sha: sha.slice(0, 12) } };
    expect(句问题(齐, 锁, 句)).toEqual([]);
    expect(句问题(齐, 锁, null)).toEqual(['没有句模块（anim voice lip）']);
    const 问题 = 句问题({ ...齐, 文本: '五万血！', 口型手修: { 成品sha: 'cccccccccccc', 字: [['五', 0, 1]] } }, 锁, { ...句, 念: '五万血？', 开口: 0 });
    expect(问题.join('\n')).toMatch(/念的字改过、配音没重出/);
    expect(问题.join('\n')).toMatch(/口型手修 是对着成品 cccccccccccc 标的/);
    expect(问题.join('\n')).toMatch(/念的字改了/);
    expect(问题.join('\n')).toMatch(/句模块的 开口 0 和 台词.toml 的 0.03 不同/);
    expect(问题.join('\n')).toMatch(/句模块用的手修已经不能用了/);
  });

  it('手修只认绑着现在这版成品的；拼句只在用了手修时写 手修', () => {
    const 行 = 解析作品台词(表文本).台词[0]!;
    expect(手修可用(行, sha.slice(0, 12))).toBe(true);
    expect(手修可用(行, 'c'.repeat(12))).toBe(false);
    expect(手修可用({ ...行, 口型手修: { 成品sha: sha.slice(0, 12) } }, sha.slice(0, 12))).toBe(false);
    const 拼 = (手修: boolean) => 拼句({ ...行, 配音: '配音/7-李樱-五万血' }, { 成品sha: sha.slice(0, 12), 测量: { 开口: 0.03, 有声长: 0.5, 时长: 0.68 }, 文件秒数: 0.681, 字: [['五', 0.1, 0.2]], 手修, 嘴: [[0, 'X']] });
    expect(拼(true).手修).toBe(true);
    expect('手修' in 拼(false)).toBe(false);
  });
});

describe('wav秒数', () => {
  it('帧数 ÷ 采样率，3 位；跳过 data 前的别的块（含奇数长补齐）', () => {
    expect(wav秒数(造wav(48000, 48000))).toBe(1);
    expect(wav秒数(造wav(48000, 32688))).toBe(0.681);
    expect(wav秒数(造wav(44100, 22050, 2, true))).toBe(0.5);
    expect(() => wav秒数(Buffer.from('not a wav file at all'))).toThrow(/不是 wav/);
  });
});
