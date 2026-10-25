import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 备好私有配乐, 段私有配乐, 私有配乐目录, 缺字节, 静音wav } from './私有配乐.ts';
import type { 资产锁, 锁条目 } from './资产锁.ts';

const tmp = (名: string) => fs.mkdtempSync(path.join(os.tmpdir(), `anim-${名}-`));
const sha = (b: string | Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const 放 = (根: string, 库: 'store' | '私有', 内容: string) => {
  const h = sha(内容);
  fs.mkdirSync(path.join(根, 库, h.slice(0, 2)), { recursive: true });
  fs.writeFileSync(path.join(根, 库, h.slice(0, 2), h), 内容);
};

describe('私有配乐', () => {
  const id = '配乐/某歌';
  const 段 = (帧数: number, 入点秒 = 0) => ({ 段: { fps: 30, 声音: [{ 帧: 0, 资产: id, 名: '歌', 帧数, 入点秒 }, { 帧: 3, 资产: '音效/甲', 名: '甲', 帧数: 9 }] } });

  it('静音 wav：48 kHz 单声道 16 位，秒数向上取整，数据全零', () => {
    const b = 静音wav(1.2);
    expect(b.toString('ascii', 0, 4)).toBe('RIFF');
    expect(b.readUInt32LE(24)).toBe(48000);
    expect(b.readUInt16LE(22)).toBe(1);
    expect(b.readUInt32LE(40)).toBe(2 * 48000 * 2);
    expect(b.length).toBe(44 + 2 * 48000 * 2);
    expect(b.subarray(44).every((x) => x === 0)).toBe(true);
  });

  it('数据根里没有：写一份盖住所有 cue 的静音并报出来；补上字节后换成原样字节；只认私有库里 配乐/ 开头的', () => {
    const 根 = tmp('私有配乐');
    const 条目: 锁条目 = { sha256: sha('歌的字节'), 后缀: '.m4a', 大小: 12, 库: '私有' };
    const 锁: 资产锁 = { [id]: 条目, '音效/甲': { sha256: 'a'.repeat(64), 后缀: '.ogg', 大小: 1, 库: 'store' } };
    const 目标 = path.join(私有配乐目录(根), '配乐', '某歌');

    expect(段私有配乐(段(60).段, 锁, 根)).toEqual({ [id]: 缺字节 });
    // 两段：60 帧从 0 秒起、30 帧从 2.5 秒起 → 盖到 3.5 秒，多留 1 秒取整 = 5 秒
    const 缺 = 备好私有配乐([段(60), 段(30, 2.5)], 锁, 根);
    expect(缺).toEqual([{ id, 秒: 5, 应在: path.join(根, '私有', 条目.sha256.slice(0, 2), 条目.sha256) }]);
    expect(fs.readFileSync(目标).equals(静音wav(4.5))).toBe(true);
    const 修改时间 = fs.statSync(目标).mtimeMs;
    expect(备好私有配乐([段(60), 段(30, 2.5)], 锁, 根)).toHaveLength(1);
    expect(fs.statSync(目标).mtimeMs).toBe(修改时间);

    放(根, '私有', '歌的字节');
    fs.chmodSync(path.join(根, '私有', 条目.sha256.slice(0, 2), 条目.sha256), 0o444);
    expect(段私有配乐(段(60).段, 锁, 根)).toEqual({ [id]: 条目.sha256 });
    expect(备好私有配乐([段(60)], 锁, 根)).toEqual([]);
    expect(fs.readFileSync(目标, 'utf8')).toBe('歌的字节');
    // 公开的配乐不走这里（照常打进包）
    expect(段私有配乐(段(60).段, { ...锁, [id]: { ...条目, 库: 'store' } }, 根)).toEqual({});
  });
});
