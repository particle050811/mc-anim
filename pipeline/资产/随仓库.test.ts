import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 比对字节, 补字节, 写随仓库, 字节目录, 读随仓库表, type 随仓库集合 } from './随仓库.ts';
import type { 锁条目 } from './资产锁.ts';

const tmp = (名: string) => fs.mkdtempSync(path.join(os.tmpdir(), `anim-${名}-`));
const sha = (b: string | Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const 放 = (根: string, 库: 'store' | '私有', 内容: string): 锁条目 => {
  const h = sha(内容);
  fs.mkdirSync(path.join(根, 库, h.slice(0, 2)), { recursive: true });
  fs.writeFileSync(path.join(根, 库, h.slice(0, 2), h), 内容);
  return { sha256: h, 后缀: '.ogg', 大小: Buffer.byteLength(内容), 库 };
};

describe('随仓库', () => {
  const 集合 = (...条们: [string, 锁条目][]): 随仓库集合 => ({ 件: new Map(条们.map(([id, e]) => [e.sha256, { 条目: e, ids: [id] }])), 私有: [], 段们: ['2-甲'], 问题: [] });

  it('随仓库.toml 只认非空的字符串数组', () => {
    expect(读随仓库表('"段" = ["2", "核对-封面帧"]').段).toEqual(['2', '核对-封面帧']);
    expect(() => 读随仓库表('"段" = [2]')).toThrow(/章也写成字符串/);
    expect(() => 读随仓库表('')).toThrow(/段/);
  });

  it('vendor：从数据根拷进 字节/、核源 sha；再跑一遍没有改动；多余的、改坏的、放错位置的都报出来并修好', () => {
    const 根 = tmp('随仓库数据根');
    const 作品 = tmp('随仓库作品');
    const 甲 = 放(根, 'store', '甲的字节');
    const 乙 = 放(根, 'store', '乙的字节');
    const c = 集合(['贴图/甲', 甲], ['音效/乙', 乙]);
    expect(写随仓库(c, 作品, 根)).toMatchObject({ 添: [`${甲.sha256.slice(0, 2)}/${甲.sha256}`, `${乙.sha256.slice(0, 2)}/${乙.sha256}`], 改: [], 删: [], 件数: 2 });
    const 甲文件 = path.join(字节目录(作品), 甲.sha256.slice(0, 2), 甲.sha256);
    expect(fs.readFileSync(甲文件, 'utf8')).toBe('甲的字节');
    expect(fs.statSync(甲文件).mode & 0o200).toBeTruthy();
    expect(比对字节(c, 作品)).toMatchObject({ 添: [], 改: [], 删: [] });

    fs.writeFileSync(甲文件, '改坏了');
    fs.writeFileSync(path.join(字节目录(作品), 'readme.txt'), 'x');
    fs.mkdirSync(path.join(字节目录(作品), 'ff'));
    fs.writeFileSync(path.join(字节目录(作品), 'ff', 乙.sha256), '乙的字节');
    const r = 比对字节(c, 作品);
    expect(r.改).toEqual([`${甲.sha256.slice(0, 2)}/${甲.sha256}`]);
    expect(r.删.sort()).toEqual([`ff/${乙.sha256}`, 'readme.txt'].sort());
    写随仓库(c, 作品, 根);
    expect(比对字节(c, 作品)).toMatchObject({ 添: [], 改: [], 删: [] });
    expect(fs.existsSync(path.join(字节目录(作品), 'ff'))).toBe(false);
    expect(fs.readFileSync(甲文件, 'utf8')).toBe('甲的字节');
  });

  it('vendor：数据根里缺字节或字节不对就报错，不写半截', () => {
    const 根 = tmp('随仓库数据根');
    const 作品 = tmp('随仓库作品');
    const 甲 = 放(根, 'store', '甲的字节');
    const 缺: 锁条目 = { sha256: 'c'.repeat(64), 后缀: '.png', 大小: 1, 库: 'store' };
    expect(() => 写随仓库(集合(['贴图/甲', 甲], ['贴图/缺', 缺]), 作品, 根)).toThrow(/贴图\/缺/);
    expect(fs.existsSync(字节目录(作品))).toBe(false);
    fs.writeFileSync(path.join(根, 'store', 甲.sha256.slice(0, 2), 甲.sha256), '被改了');
    expect(() => 写随仓库(集合(['贴图/甲', 甲]), 作品, 根)).toThrow(/sha256 是/);
  });

  it('seed：字节/ 里数据根没有的核过 sha 补进 store（只读），已有的不动；内容和文件名对不上、布局不对就报错', () => {
    const 源根 = tmp('随仓库数据根');
    const 作品 = tmp('随仓库作品');
    const 甲 = 放(源根, 'store', '甲的字节');
    const 乙 = 放(源根, 'store', '乙的字节');
    写随仓库(集合(['贴图/甲', 甲], ['音效/乙', 乙]), 作品, 源根);

    const 根 = tmp('空数据根');
    const 已有 = path.join(根, 'store', 乙.sha256.slice(0, 2), 乙.sha256);
    fs.mkdirSync(path.dirname(已有), { recursive: true });
    fs.writeFileSync(已有, '乙的字节');
    const 时间 = fs.statSync(已有).mtimeMs;
    expect(补字节(作品, 根)).toEqual({ 补: 1, 共: 2 });
    const 补进 = path.join(根, 'store', 甲.sha256.slice(0, 2), 甲.sha256);
    expect(fs.readFileSync(补进, 'utf8')).toBe('甲的字节');
    if (process.platform !== 'win32') expect(fs.statSync(补进).mode & 0o222).toBe(0);
    expect(fs.statSync(已有).mtimeMs).toBe(时间);
    expect(fs.readdirSync(path.dirname(补进))).toEqual([甲.sha256]);
    expect(补字节(作品, 根)).toEqual({ 补: 0, 共: 2 });

    // 换行被 git 改过这类：内容 sha 和文件名对不上
    const 根2 = tmp('空数据根');
    fs.writeFileSync(path.join(字节目录(作品), 甲.sha256.slice(0, 2), 甲.sha256), '甲的字节\r\n');
    expect(() => 补字节(作品, 根2)).toThrow(/和文件名对不上/);
    fs.writeFileSync(path.join(字节目录(作品), 'x.txt'), '');
    expect(() => 补字节(作品, 根2)).toThrow(/只放/);
    // 没有 字节/ 的作品什么都不做
    expect(补字节(tmp('无字节作品'), 根2)).toEqual({ 补: 0, 共: 0 });
  });
});
