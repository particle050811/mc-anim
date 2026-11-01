// anim cache 改后缀：默认只打印；就地改名字节和修改时间不变；目标已存在不覆盖；旁文件、临时文件不动。改完 gc 认得新后缀，没改的旧名报不认识、不删。数据根是临时目录。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { 运行记录 } from '../运行记录/记录.ts';

const 数据根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-改后缀测试-'));
process.env.ANIM_DATA = 数据根;
vi.mock('../闸/闸.ts', async (原) => ({ ...(await 原<typeof import('../闸/闸.ts')>()), 过渲染闸: <T>(fn: () => Promise<T>) => fn() }));

const { 迁移改名 } = await import('./迁移改名.ts');
const { 扫媒体 } = await import('./回收.ts');
const { 压缩母版路径 } = await import('../渲/母版.ts');

const 指16 = 'a'.repeat(16);
const 根 = path.join(数据根, 'cache', '母版');
const 段 = path.join(根, '甲', '段一');
const 旧 = path.join(段, `${指16}.crf12.mkv`);
const 新 = path.join(段, `${指16}.x264.mkv`);
const 记录 = () => ({ 记: vi.fn() }) as unknown as 运行记录;

beforeEach(() => {
  fs.rmSync(根, { recursive: true, force: true });
  fs.mkdirSync(段, { recursive: true });
  fs.writeFileSync(旧, '旧字节');
  fs.utimesSync(旧, 1000, 1000);
  for (const n of ['.用过', '.检出-12345678', '.指纹.json', '.转码中-99.crf12.mkv', '.mkv']) fs.writeFileSync(path.join(段, `${指16}${n}`), 'x');
});
afterAll(() => fs.rmSync(数据根, { recursive: true, force: true }));

describe('anim cache 改后缀', () => {
  it('默认只打印，不改', async () => {
    expect(await 迁移改名(null, { 执行: false, 记录: 记录() })).toBe(0);
    expect(fs.existsSync(旧)).toBe(true);
    expect(fs.existsSync(新)).toBe(false);
  });

  it('--执行：字节、修改时间不变；旁文件、临时文件、CRF1 不动；新名和代码算的路径一致；重跑没事做', async () => {
    const 前 = fs.readdirSync(段).filter((n) => n !== path.basename(旧)).sort();
    expect(await 迁移改名(null, { 执行: true, 记录: 记录() })).toBe(0);
    expect(fs.existsSync(旧)).toBe(false);
    expect(fs.readFileSync(新, 'utf8')).toBe('旧字节');
    expect(fs.statSync(新).mtimeMs).toBe(1000e3);
    expect(fs.statSync(新).nlink).toBe(1);
    expect(fs.readdirSync(段).filter((n) => n !== path.basename(新)).sort()).toEqual(前);
    expect(压缩母版路径('段一', 'a'.repeat(64), '甲')).toBe(新);
    expect(await 迁移改名(null, { 执行: true, 记录: 记录() })).toBe(0);
  });

  it('目标已存在：报错返回 1，两份都不动；别的照改', async () => {
    fs.writeFileSync(新, '新字节');
    const 乙 = path.join(根, '甲', '段二');
    fs.mkdirSync(乙);
    fs.writeFileSync(path.join(乙, `${'b'.repeat(16)}.crf12.mkv`), '乙');
    const r = 记录();
    expect(await 迁移改名(null, { 执行: true, 记录: r })).toBe(1);
    expect(fs.readFileSync(旧, 'utf8')).toBe('旧字节');
    expect(fs.readFileSync(新, 'utf8')).toBe('新字节');
    expect(r.记).toHaveBeenCalledWith('错误', expect.stringContaining('已存在'));
    expect(fs.existsSync(path.join(乙, `${'b'.repeat(16)}.x264.mkv`))).toBe(true);
  });

  it('只打印也报目标已存在', async () => {
    fs.writeFileSync(新, '新字节');
    expect(await 迁移改名(null, { 执行: false, 记录: 记录() })).toBe(1);
  });

  it('指定作品只改这部', async () => {
    const 丙 = path.join(根, '丙', '段');
    fs.mkdirSync(丙, { recursive: true });
    const 丙旧 = path.join(丙, `${'c'.repeat(16)}.crf12.mkv`);
    fs.writeFileSync(丙旧, '丙');
    await 迁移改名('甲', { 执行: true, 记录: 记录() });
    expect(fs.existsSync(新)).toBe(true);
    expect(fs.existsSync(丙旧)).toBe(true);
  });

  it('gc 扫描：新后缀算压缩母版；没改名的旧后缀是不认识（只报告不删）', () => {
    const 扫前 = 扫媒体(path.join(根, '甲'), '母版', '甲');
    expect(扫前.不认识.map((f) => path.basename(f.路径))).toEqual([path.basename(旧)]);
    expect(扫前.媒体.map((f) => f.存法)).toEqual(['crf1']);
    fs.renameSync(旧, 新);
    expect(扫媒体(path.join(根, '甲'), '母版', '甲').媒体.map((f) => f.存法).sort()).toEqual(['crf1', 'x264']);
  });
});
